/* ========================================
   NutriTrack v2 — App Logic
   Dynamic TDEE calculation · Food images
   Inline search · Rich animations
   ======================================== */

// ==========================================
// STORAGE
// ==========================================
const KEYS = {
    FOODS: 'nt_foods_v3',
    PROFILES: 'nt_profiles',
    ACTIVE_PROFILE: 'nt_active_profile',
};

// Profile-scoped keys (computed dynamically)
function profileKey(base) {
    const pid = getActiveProfileId();
    return `nt_p_${pid}_${base}`;
}

function load(key, fallback) {
    try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : fallback; }
    catch { return fallback; }
}
function save(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

// ==========================================
// PROFILE MANAGEMENT
// ==========================================
const AVATAR_COLORS = ['ff6b6b', '6c5ce7', '00b894', 'fdcb6e', 'e17055', '0984e3', 'e84393', '00cec9', 'fab1a0', 'a29bfe'];

function getInitials(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function getAvatarUrl(profile) {
    if (profile.image && profile.image.trim() !== '') {
        return profile.image.trim();
    }
    return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'></path><circle cx='12' cy='7' r='4'></circle></svg>";
}

function getProfiles() {
    return load(KEYS.PROFILES, []);
}

function saveProfiles(profiles) {
    save(KEYS.PROFILES, profiles);
}

function getActiveProfileId() {
    return localStorage.getItem(KEYS.ACTIVE_PROFILE) || '';
}

function setActiveProfileId(id) {
    localStorage.setItem(KEYS.ACTIVE_PROFILE, id);
}

function getActiveProfile() {
    const profiles = getProfiles();
    const id = getActiveProfileId();
    return profiles.find(p => p.id === id) || null;
}

function createProfile(data) {
    const profiles = getProfiles();
    const profile = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: data.name,
        tagline: data.tagline || '',
        image: data.image || '',
        avatarColor: AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
        createdAt: Date.now(),
    };
    profiles.push(profile);
    saveProfiles(profiles);

    // Initialize profile-scoped goals from setup data
    const profileGoals = {
        age: data.age || 18,
        gender: data.gender || 'male',
        height: data.height || 170,
        activityFactor: data.activityFactor || 1.375,
        currentWeight: data.currentWeight || 65,
        targetWeight: data.targetWeight || 70,
        targetDate: '',
        manualCalories: null,
        manualProtein: null,
    };
    save(`nt_p_${profile.id}_goals`, profileGoals);
    save(`nt_p_${profile.id}_log`, {});
    save(`nt_p_${profile.id}_history`, {});

    return profile;
}

function updateProfile(id, data) {
    const profiles = getProfiles();
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) return null;
    profiles[idx] = { ...profiles[idx], ...data };
    saveProfiles(profiles);

    // Also update goals if body stats changed
    const goalKey = `nt_p_${id}_goals`;
    const currentGoals = load(goalKey, { ...DEFAULT_GOALS });
    if (data.age) currentGoals.age = data.age;
    if (data.gender) currentGoals.gender = data.gender;
    if (data.height) currentGoals.height = data.height;
    if (data.currentWeight) currentGoals.currentWeight = data.currentWeight;
    if (data.targetWeight) currentGoals.targetWeight = data.targetWeight;
    if (data.activityFactor) currentGoals.activityFactor = data.activityFactor;
    save(goalKey, currentGoals);

    return profiles[idx];
}

function deleteProfile(id) {
    let profiles = getProfiles();
    profiles = profiles.filter(p => p.id !== id);
    saveProfiles(profiles);

    // Clean up profile-scoped data
    localStorage.removeItem(`nt_p_${id}_goals`);
    localStorage.removeItem(`nt_p_${id}_log`);
    localStorage.removeItem(`nt_p_${id}_history`);

    // If deleted profile was active, switch to first remaining or clear
    if (getActiveProfileId() === id) {
        if (profiles.length > 0) {
            setActiveProfileId(profiles[0].id);
        } else {
            localStorage.removeItem(KEYS.ACTIVE_PROFILE);
        }
    }
    return profiles;
}

function switchProfile(id) {
    setActiveProfileId(id);
    // Reload data for new profile
    initData();
    switchPage('dashboard');
    updateUIForProfile();
}

function updateUIForProfile() {
    const profile = getActiveProfile();
    if (!profile) return;

    const avatarUrl = getAvatarUrl(profile);

    // Sidebar
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarName = document.getElementById('sidebar-user-name');
    const sidebarRole = document.getElementById('sidebar-user-role');
    if (sidebarAvatar) {
        sidebarAvatar.src = avatarUrl;
        if (!profile.image) sidebarAvatar.style.padding = '4px';
        else sidebarAvatar.style.padding = '0';
    }
    if (sidebarName) sidebarName.textContent = profile.name;
    if (sidebarRole) sidebarRole.textContent = profile.tagline || 'NutriTrack User';

    // Mobile
    const mobileAvatar = document.getElementById('mobile-avatar-btn');
    if (mobileAvatar) {
        mobileAvatar.src = avatarUrl;
        if (!profile.image) mobileAvatar.style.padding = '4px';
        else mobileAvatar.style.padding = '0';
    }
}

function readImageFile(input, callback) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            callback(e.target.result);
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        callback(null);
    }
}

// ==========================================
// DEFAULT FOOD DATABASE
// with real Unsplash image URLs where available
// ==========================================
const DEFAULT_FOODS = [
    { id: 'whole_egg', name: 'Whole Eggs', unit: 'nos', serving: 1, cal: 70, pro: 6.0,
      image: 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=80&h=80&fit=crop', emoji: '🥚' },
    { id: 'amul_milk_200', name: 'Amul Taaza Milk', unit: 'ml', serving: 200, cal: 116, pro: 6.0,
      image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=80&h=80&fit=crop', emoji: '🥛' },
    { id: 'toned_milk_500', name: 'Milk (Toned/Cow)', unit: 'ml', serving: 500, cal: 295, pro: 16.0,
      image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=80&h=80&fit=crop', emoji: '🥛' },
    { id: 'toned_milk_650', name: 'Milk (Toned/Cow)', unit: 'ml', serving: 650, cal: 384, pro: 20.8,
      image: 'https://images.unsplash.com/photo-1528750711917-4d7a8d511745?w=80&h=80&fit=crop', emoji: '🥛' },
    { id: 'toned_milk_750', name: 'Milk (Toned/Cow)', unit: 'ml', serving: 750, cal: 443, pro: 24.0,
      image: 'https://images.unsplash.com/photo-1596803244618-8dcb44f05310?w=80&h=80&fit=crop', emoji: '🥛' },
    { id: 'nendran', name: 'Nendran Pazham', unit: 'nos', serving: 1, cal: 135, pro: 1.5,
      image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=80&h=80&fit=crop', emoji: '🍌' },
    { id: 'robusta', name: 'Robusta / Regular Banana', unit: 'nos', serving: 1, cal: 100, pro: 1.2,
      image: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=80&h=80&fit=crop', emoji: '🍌' },
    { id: 'dosa', name: 'Dosa (small Trivandrum style)', unit: 'nos', serving: 1, cal: 90, pro: 2.2,
      image: 'https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?w=80&h=80&fit=crop', emoji: '🫓' },
    { id: 'vellappam', name: 'Vellappam', unit: 'nos', serving: 1, cal: 90, pro: 2.0,
      image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=80&h=80&fit=crop', emoji: '🫓' },
    { id: 'idli', name: 'Idli', unit: 'nos', serving: 1, cal: 60, pro: 1.5,
      image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=80&h=80&fit=crop', emoji: '🫓' },
    { id: 'upma', name: 'Upma', unit: 'serving', serving: 1, cal: 175, pro: 4.0,
      image: 'https://images.unsplash.com/photo-1626779836792-5654ef245053?w=80&h=80&fit=crop', emoji: '🥣' },
    { id: 'jaya_rice', name: 'Jaya Rice (cooked)', unit: 'serving', serving: 1, cal: 350, pro: 7.0,
      image: 'https://images.unsplash.com/photo-1516684732162-798a0062be99?w=80&h=80&fit=crop', emoji: '🍚' },
    { id: 'kabsa_200', name: 'Kabsa Rice', unit: 'g', serving: 200, cal: 320, pro: 6.5,
      image: 'https://images.unsplash.com/photo-1563379091339-03b2184f4f4d?w=80&h=80&fit=crop', emoji: '🍛' },
    { id: 'kabsa_250', name: 'Kabsa Rice', unit: 'g', serving: 250, cal: 390, pro: 7.0,
      image: 'https://images.unsplash.com/photo-1563379091339-03b2184f4f4d?w=80&h=80&fit=crop', emoji: '🍛' },
    { id: 'curd', name: 'Curd', unit: 'g', serving: 85, cal: 55, pro: 3.0,
      image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=80&h=80&fit=crop', emoji: '🥣' },
    { id: 'upperi', name: 'Upperi (Cabbage / Cherupayar)', unit: 'serving', serving: 1, cal: 50, pro: 2.5,
      image: 'https://images.unsplash.com/photo-1615486171448-47c35593845b?w=80&h=80&fit=crop', emoji: '🥗' },
    { id: 'tea', name: 'Tea (watery, droplet milk)', unit: 'cup', serving: 1, cal: 20, pro: 0.0,
      image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=80&h=80&fit=crop', emoji: '☕' },
    { id: 'brownie', name: 'Elite Brownie', unit: 'nos', serving: 1, cal: 180, pro: 3.5,
      image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=80&h=80&fit=crop', emoji: '🍫' },
    { id: 'pb_32', name: 'Peanut Butter', unit: 'g', serving: 32, cal: 200, pro: 9.0,
      image: 'https://images.unsplash.com/photo-1598887142487-3c854d51eabb?w=80&h=80&fit=crop', emoji: '🥜' },
    { id: 'pb_40', name: 'Peanut Butter', unit: 'g', serving: 40, cal: 250, pro: 11.2,
      image: 'https://images.unsplash.com/photo-1588195538326-c5b1e9f80a1b?w=80&h=80&fit=crop', emoji: '🥜' },
    { id: 'chapati', name: 'Chapati (thin/small)', unit: 'nos', serving: 1, cal: 75, pro: 2.5,
      image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=80&h=80&fit=crop', emoji: '🫓' },
    { id: 'egg_curry', name: 'Egg Curry (with 1 whole egg)', unit: 'serving', serving: 1, cal: 130, pro: 7.0,
      image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=80&h=80&fit=crop', emoji: '🍛' },
    { id: 'soya_curry', name: 'Soya Chunks Curry', unit: 'serving', serving: 1, cal: 220, pro: 32.0,
      image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=80&h=80&fit=crop', emoji: '🍛' },
    { id: 'hostel_curry', name: 'Hostel Curry / Water Dip', unit: 'serving', serving: 1, cal: 40, pro: 1.5,
      image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=80&h=80&fit=crop', emoji: '🍲' },
    { id: 'fried_chicken', name: 'Fried Chicken', unit: 'serving', serving: 1, cal: 190, pro: 18.0,
      image: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=80&h=80&fit=crop', emoji: '🍗' },
];

const DEFAULT_GOALS = {
    age: 18,
    gender: 'male',
    height: 162,
    activityFactor: 1.375,  // lightly active
    currentWeight: 43,
    targetWeight: 60,
    targetDate: '',
    manualCalories: null,
    manualProtein: null,
};

// ==========================================
// UTILS
// ==========================================
const today = () => new Date().toISOString().split('T')[0];

function fmtDate(s) {
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateShort(s) {
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
}

function daysLeft(from, to) {
    return Math.ceil((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 864e5);
}

// ==========================================
// TDEE CALCULATION (Mifflin-St Jeor)
// ==========================================
function calcBMR(weight, height, age, gender) {
    // Mifflin-St Jeor equation
    const base = 10 * weight + 6.25 * height - 5 * age;
    return gender === 'male' ? base + 5 : base - 161;
}

function calcTDEE(bmr, activityFactor) {
    return bmr * activityFactor;
}

function calcDailySurplus(currentWeight, targetWeight, targetDate) {
    if (!targetDate) return 0;
    const days = daysLeft(today(), targetDate);
    if (days <= 0) return 0;
    const weightDiff = targetWeight - currentWeight;
    // ~7700 kcal per kg of body weight gain
    return Math.round((weightDiff * 7700) / days);
}

function getAutoCalories(goals) {
    const bmr = calcBMR(goals.currentWeight, goals.height, goals.age, goals.gender);
    const tdee = calcTDEE(bmr, goals.activityFactor);
    const surplus = calcDailySurplus(goals.currentWeight, goals.targetWeight, goals.targetDate);
    return Math.round(tdee + surplus);
}

function getAutoProtein(goals) {
    // 1.8g per kg of current body weight
    return Math.round(goals.currentWeight * 1.8);
}

function getEffectiveCalories(goals) {
    return goals.manualCalories || getAutoCalories(goals);
}

function getEffectiveProtein(goals) {
    return goals.manualProtein || getAutoProtein(goals);
}

// ==========================================
// APP STATE
// ==========================================
let foods = [];
let dailyLog = {};
let goals = {};
let history = {};
let selectedFood = null;
let currentActiveMeal = 'Snacks'; // Default meal for logging

function initData() {
    foods = load(KEYS.FOODS, null);
    if (!foods) {
        foods = [...DEFAULT_FOODS];
        save(KEYS.FOODS, foods);
    }
    dailyLog = load(profileKey('log'), {});
    goals = load(profileKey('goals'), { ...DEFAULT_GOALS });
    history = load(profileKey('history'), {});
    archiveOldDays();
}

function archiveOldDays() {
    const t = today();
    let changed = false;
    for (const d of Object.keys(dailyLog)) {
        if (d < t) {
            history[d] = dailyLog[d];
            delete dailyLog[d];
            changed = true;
        }
    }
    if (changed) {
        save(profileKey('log'), dailyLog);
        save(profileKey('history'), history);
    }
}

function getTodayLog() { return dailyLog[today()] || []; }

function addToLog(foodId, qty) {
    const t = today();
    if (!dailyLog[t]) dailyLog[t] = [];
    dailyLog[t].push({ id: genId(), foodId, quantity: qty, ts: Date.now(), meal: currentActiveMeal });
    save(profileKey('log'), dailyLog);
}

function removeFromLog(entryId) {
    const t = today();
    if (!dailyLog[t]) return;
    dailyLog[t] = dailyLog[t].filter(e => e.id !== entryId);
    save(profileKey('log'), dailyLog);
}

function getFood(id) { return foods.find(f => f.id === id); }

function entryNutrition(entry) {
    const f = getFood(entry.foodId);
    if (!f) return { cal: 0, pro: 0 };
    const m = entry.quantity / f.serving;
    return { cal: +(f.cal * m).toFixed(1), pro: +(f.pro * m).toFixed(1) };
}

function dayTotals(entries) {
    let cal = 0, pro = 0;
    for (const e of entries) { const n = entryNutrition(e); cal += n.cal; pro += n.pro; }
    return { cal: +cal.toFixed(1), pro: +pro.toFixed(1) };
}

function calcStreak() {
    let streak = 0;
    const calTarget = getEffectiveCalories(goals);
    const proTarget = getEffectiveProtein(goals);
    const t = today();
    let d = new Date(t + 'T00:00:00');

    // Check today
    const todayTotals = dayTotals(getTodayLog());
    if (todayTotals.cal >= calTarget && todayTotals.pro >= proTarget) streak++;

    // Check past days
    for (let i = 1; i <= 365; i++) {
        d.setDate(d.getDate() - 1);
        const ds = d.toISOString().split('T')[0];
        const entries = history[ds] || dailyLog[ds];
        if (!entries || entries.length === 0) break;
        const tot = dayTotals(entries);
        if (tot.cal >= calTarget && tot.pro >= proTarget) streak++;
        else break;
    }
    return streak;
}

// ==========================================
// FOOD THUMBNAIL HELPER
// ==========================================
function foodThumbHTML(food, size = 42) {
    // Color gradients for emoji fallback based on food category
    const gradients = [
        'linear-gradient(135deg, #ff9a9e, #fad0c4)',
        'linear-gradient(135deg, #a18cd1, #fbc2eb)',
        'linear-gradient(135deg, #fad0c4, #ffd1ff)',
        'linear-gradient(135deg, #ffecd2, #fcb69f)',
        'linear-gradient(135deg, #a1c4fd, #c2e9fb)',
        'linear-gradient(135deg, #d4fc79, #96e6a1)',
        'linear-gradient(135deg, #667eea, #764ba2)',
        'linear-gradient(135deg, #f093fb, #f5576c)',
    ];
    const hash = food.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const grad = gradients[hash % gradients.length];

    if (food.image) {
        return `<img src="${food.image}" alt="${food.name}" class="food-thumb-img" 
                style="width:${size}px;height:${size}px;border-radius:8px;object-fit:cover;" 
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="food-thumb-emoji" style="display:none;width:${size}px;height:${size}px;border-radius:8px;
                background:${grad};align-items:center;justify-content:center;font-size:${size * 0.5}px;">${food.emoji || '🍽️'}</div>`;
    }
    return `<div class="food-thumb-emoji" style="width:${size}px;height:${size}px;border-radius:8px;
            background:${grad};display:flex;align-items:center;justify-content:center;
            font-size:${size * 0.5}px;">${food.emoji || '🍽️'}</div>`;
}

// ==========================================
// FLOATING FOOD DECORATIONS
// ==========================================
function initFloatingFoods() {
    const container = document.getElementById('floating-foods');
    const emojis = ['🥚', '🍌', '🍗', '🥛', '🍎', '🍚', '🍞', '🥣', '💪', '🫓', '🐟', '🍲'];
    for (let i = 0; i < 15; i++) {
        const el = document.createElement('div');
        el.className = 'floating-food-item';
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.left = Math.random() * 100 + '%';
        el.style.animationDuration = (15 + Math.random() * 20) + 's';
        el.style.animationDelay = -(Math.random() * 30) + 's';
        el.style.fontSize = (1 + Math.random() * 1.5) + 'rem';
        container.appendChild(el);
    }
}

// ==========================================
// REVEAL ON SCROLL ANIMATION
// ==========================================
function initRevealAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ==========================================
// ANIMATED NUMBER COUNTER
// ==========================================
function animateNumber(el, target, duration = 800) {
    const start = parseInt(el.textContent) || 0;
    if (start === target) return;
    const range = target - start;
    const startTime = performance.now();

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + range * ease);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ==========================================
// CONFETTI
// ==========================================
let confettiParticles = [];
let confettiRunning = false;

function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#00ff41', '#00e5ff', '#ff9f43', '#33ff66', '#00ffcc', '#ff6e27', '#88ff88'];

    for (let i = 0; i < 100; i++) {
        confettiParticles.push({
            x: Math.random() * canvas.width,
            y: -10 - Math.random() * canvas.height * 0.5,
            w: 4 + Math.random() * 6,
            h: 4 + Math.random() * 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 4,
            vy: 2 + Math.random() * 4,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            opacity: 1,
        });
    }

    if (!confettiRunning) {
        confettiRunning = true;
        animateConfetti(canvas, ctx);
    }
}

function animateConfetti(canvas, ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    confettiParticles = confettiParticles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.003;

        if (p.opacity <= 0 || p.y > canvas.height + 20) return false;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        return true;
    });

    if (confettiParticles.length > 0) {
        requestAnimationFrame(() => animateConfetti(canvas, ctx));
    } else {
        confettiRunning = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// ==========================================
// RENDER: DASHBOARD
// ==========================================
let previousGoalHit = false;

function renderDashboard() {
    // Greeting
    const profile = getActiveProfile();
    const firstName = profile ? profile.name.split(' ')[0] : 'User';
    document.getElementById('greeting-text').textContent = `${greeting()}, ${firstName}`;
    
    // Live date and time
    const updateTime = () => {
        const d = new Date();
        const dateStr = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById('today-date').textContent = `${dateStr} • ${timeStr}`;
    };
    updateTime();
    if (!window.timeInterval) {
        window.timeInterval = setInterval(updateTime, 1000);
    }

    // Motivational text
    const motivations = [
        '"Discipline is doing what you hate to do, but doing it like you love it." — Mike Tyson',
        "Every meal counts. Let's fuel your gains today!",
        "Consistency is key. You've got this! 💪",
        "One rep at a time, one meal at a time.",
        "Feed the machine. Build the body.",
        "Your future self will thank you for today.",
        "Eat big, lift big, get big. Simple.",
    ];
    document.getElementById('hero-motivation-text').textContent =
        motivations[Math.floor(Math.random() * motivations.length)];

    const entries = getTodayLog();
    const totals = dayTotals(entries);
    const calTarget = getEffectiveCalories(goals);
    const proTarget = getEffectiveProtein(goals);

    // Calorie ring
    const calPct = Math.min(totals.cal / calTarget, 1);
    document.getElementById('cal-ring').style.strokeDashoffset = 314.16 * (1 - calPct);
    animateNumber(document.getElementById('cal-consumed'), Math.round(totals.cal));
    document.getElementById('cal-remaining').textContent = Math.max(0, Math.round(calTarget - totals.cal));
    document.getElementById('cal-target').textContent = calTarget;
    
    // Update hero badges
    const heroCalBadge = document.getElementById('hero-cal-badge');
    if (heroCalBadge) heroCalBadge.textContent = `${Math.round(totals.cal)} / ${calTarget}`;

    // Protein ring
    const proPct = Math.min(totals.pro / proTarget, 1);
    document.getElementById('pro-ring').style.strokeDashoffset = 314.16 * (1 - proPct);
    animateNumber(document.getElementById('pro-consumed'), Math.round(totals.pro));
    document.getElementById('pro-remaining').textContent = Math.max(0, Math.round((proTarget - totals.pro) * 10) / 10);
    document.getElementById('pro-target').textContent = proTarget;

    // Auto-badge visibility
    document.getElementById('cal-auto-badge').classList.toggle('show', !goals.manualCalories);
    document.getElementById('pro-auto-badge').classList.toggle('show', !goals.manualProtein);

    // Weight card
    document.getElementById('current-weight-display').textContent = goals.currentWeight || 43;
    document.getElementById('target-weight-display').textContent = goals.targetWeight || 60;

    if (goals.targetDate) {
        const days = daysLeft(today(), goals.targetDate);
        document.getElementById('weight-days-left').textContent =
            days > 0 ? `${days} days remaining` : 'Target date passed!';
        // Progress would need actual weight logging — for now show 0%
        document.getElementById('weight-progress-fill').style.width = '0%';
        document.getElementById('weight-bar-label').textContent = '0%';
    } else {
        document.getElementById('weight-days-left').textContent = 'Set target date in Goals →';
        document.getElementById('weight-progress-fill').style.width = '0%';
        document.getElementById('weight-bar-label').textContent = '';
    }

    // Streak
    const streak = calcStreak();
    animateNumber(document.getElementById('streak-count'), streak);
    const heroStreakBadge = document.getElementById('hero-streak-badge');
    if (heroStreakBadge) heroStreakBadge.textContent = streak;

    // Streak dots (last 7 days)
    const dotsContainer = document.getElementById('streak-dots');
    dotsContainer.innerHTML = '';
    const d = new Date(today() + 'T00:00:00');
    for (let i = 6; i >= 0; i--) {
        const date = new Date(d);
        date.setDate(date.getDate() - i);
        const ds = date.toISOString().split('T')[0];
        const ents = ds === today() ? getTodayLog() : (history[ds] || dailyLog[ds] || []);
        const tot = dayTotals(ents);
        const hit = ents.length > 0 && tot.cal >= calTarget && tot.pro >= proTarget;
        const miss = ents.length > 0 && !hit;
        const dot = document.createElement('div');
        dot.className = `streak-dot ${hit ? 'hit' : miss ? 'miss' : ''}`;
        dot.title = ds === today() ? 'Today' : fmtDateShort(ds);
        dotsContainer.appendChild(dot);
    }

    // Goal banner
    const banner = document.getElementById('goal-banner');
    const calHit = totals.cal >= calTarget;
    const proHit = totals.pro >= proTarget;
    const allHit = calHit && proHit;

    if (allHit) {
        banner.className = 'goal-banner goal-hit reveal visible';
        document.getElementById('goal-banner-icon').textContent = '🎉';
        document.getElementById('goal-banner-title').textContent = 'Goals Achieved!';
        document.getElementById('goal-banner-subtitle').textContent = "You've crushed both targets today. Keep it up!";

        // Fire confetti once when goals are first hit
        if (!previousGoalHit) {
            launchConfetti();
            previousGoalHit = true;
        }
    } else {
        previousGoalHit = false;
        banner.className = 'goal-banner reveal visible';
        if (calHit) {
            document.getElementById('goal-banner-icon').textContent = '💪';
            document.getElementById('goal-banner-title').textContent = 'Calories ✓ — Need more protein!';
            document.getElementById('goal-banner-subtitle').textContent = `${Math.round((proTarget - totals.pro) * 10) / 10}g protein to go.`;
        } else if (proHit) {
            document.getElementById('goal-banner-icon').textContent = '💪';
            document.getElementById('goal-banner-title').textContent = 'Protein ✓ — Need more calories!';
            document.getElementById('goal-banner-subtitle').textContent = `${Math.round(calTarget - totals.cal)} kcal to go.`;
        } else {
            document.getElementById('goal-banner-icon').textContent = '⏳';
            document.getElementById('goal-banner-title').textContent = 'Keep going!';
            document.getElementById('goal-banner-subtitle').textContent = `${Math.round(calTarget - totals.cal)} kcal and ${Math.round((proTarget - totals.pro) * 10) / 10}g protein to go.`;
        }
    }

    // Mini rings on banner
    document.getElementById('banner-cal-ring').style.strokeDashoffset = 94.25 * (1 - calPct);
    document.getElementById('banner-pro-ring').style.strokeDashoffset = 94.25 * (1 - proPct);

    // Macro progress bars (new layout)
    const macroCalFill = document.getElementById('macro-cal-fill');
    const macroProFill = document.getElementById('macro-pro-fill');
    const macroCalCurrent = document.getElementById('macro-cal-current');
    const macroProCurrent = document.getElementById('macro-pro-current');
    const macroCalTarget = document.getElementById('macro-cal-target');
    const macroProTarget = document.getElementById('macro-pro-target');

    if (macroCalFill) {
        macroCalFill.style.width = (calPct * 100) + '%';
        macroCalCurrent.textContent = Math.round(totals.cal);
        macroCalTarget.textContent = calTarget;
    }
    if (macroProFill) {
        macroProFill.style.width = (proPct * 100) + '%';
        macroProCurrent.textContent = Math.round(totals.pro);
        macroProTarget.textContent = proTarget;
    }

    // Food log
    renderFoodLog(entries);

    // Quick picks
    renderQuickPicks();
}

function renderFoodLog(entries) {
    const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

    meals.forEach(meal => {
        const container = document.getElementById(`log-${meal.toLowerCase()}`);
        if (!container) return;

        const mealEntries = entries.filter(e => (e.meal || 'Snacks') === meal);
        container.innerHTML = '';

        if (mealEntries.length === 0) {
            container.innerHTML = '<div class="empty-meal">Add food</div>';
            document.getElementById(`${meal.toLowerCase()}-cal`).textContent = '0';
            document.getElementById(`${meal.toLowerCase()}-pro`).textContent = '0';
            return;
        }

        const mealTotals = dayTotals(mealEntries);
        document.getElementById(`${meal.toLowerCase()}-cal`).textContent = Math.round(mealTotals.cal);
        document.getElementById(`${meal.toLowerCase()}-pro`).textContent = +(mealTotals.pro).toFixed(1);

        for (const entry of mealEntries) {
            const food = getFood(entry.foodId);
            if (!food) continue;
            const n = entryNutrition(entry);

            const item = document.createElement('div');
            item.className = 'log-item';
            item.innerHTML = `
                ${foodThumbHTML(food, 42)}
                <div class="log-item-info">
                    <div class="log-item-name">${food.name}</div>
                    <div class="log-item-qty">${entry.quantity} ${food.unit}</div>
                </div>
                <div class="log-item-macros">
                    <span class="macro-tag cal-tag">${Math.round(n.cal)} kcal</span>
                    <span class="macro-tag pro-tag">${+(n.pro).toFixed(1)}g</span>
                </div>
                <button class="log-item-delete" title="Remove" data-id="${entry.id}">✕</button>
            `;

            item.querySelector('.log-item-delete').addEventListener('click', () => {
                removeFromLog(entry.id);
                renderDashboard();
                showToast('Removed', 'success');
            });

            container.appendChild(item);
        }
    });
}

function renderQuickPicks() {
    const container = document.getElementById('quick-pick-chips');
    container.innerHTML = '';

    // Show top 8 most commonly logged foods, or first 8 if no history
    const freqMap = {};
    const allEntries = [...getTodayLog()];
    for (const dateEntries of Object.values(history)) {
        allEntries.push(...dateEntries);
    }
    for (const e of allEntries) {
        freqMap[e.foodId] = (freqMap[e.foodId] || 0) + 1;
    }

    let quickFoods;
    if (Object.keys(freqMap).length >= 3) {
        quickFoods = Object.entries(freqMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([id]) => getFood(id))
            .filter(Boolean);
    } else {
        quickFoods = foods.slice(0, 8);
    }

    for (const food of quickFoods) {
        const chip = document.createElement('button');
        chip.className = 'quick-chip';
        chip.innerHTML = `<span class="quick-chip-emoji">${food.emoji || '🍽️'}</span> ${food.name}`;
        chip.addEventListener('click', () => openAddModal(food));
        container.appendChild(chip);
    }
}

// ==========================================
// RENDER: FOOD DATABASE
// ==========================================
function renderFoodDB(filter = '') {
    const container = document.getElementById('food-database-list');
    const empty = document.getElementById('empty-db');
    container.querySelectorAll('.food-card').forEach(el => el.remove());

    const filtered = foods.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));

    if (filtered.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    for (const food of filtered) {
        const card = document.createElement('div');
        card.className = 'food-card';
        card.innerHTML = `
            <div class="food-card-top">
                ${foodThumbHTML(food, 44)}
                <span class="food-card-name">${food.name}</span>
                <span class="food-card-unit">${food.unit}</span>
            </div>
            <div class="food-card-macros">
                <span class="macro-tag cal-tag">${food.cal} kcal / ${food.serving} ${food.unit}</span>
                <span class="macro-tag pro-tag">${food.pro}g / ${food.serving} ${food.unit}</span>
            </div>
            <div class="food-card-actions">
                <button class="btn-sm-danger" data-id="${food.id}">Delete</button>
            </div>
        `;

        card.querySelector('.btn-sm-danger').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete "${food.name}"?`)) {
                foods = foods.filter(f => f.id !== food.id);
                save(KEYS.FOODS, foods);
                renderFoodDB(document.getElementById('food-search-input').value);
                showToast(`"${food.name}" deleted`, 'success');
            }
        });

        container.appendChild(card);
    }
}

// ==========================================
// RENDER: GOALS
// ==========================================
function renderGoals() {
    document.getElementById('goal-age').value = goals.age || '';
    document.getElementById('goal-gender').value = goals.gender || 'male';
    document.getElementById('goal-height').value = goals.height || '';
    document.getElementById('goal-activity').value = goals.activityFactor || '1.375';
    document.getElementById('goal-current-weight').value = goals.currentWeight || '';
    document.getElementById('goal-target-weight').value = goals.targetWeight || '';
    document.getElementById('goal-target-date').value = goals.targetDate || '';
    document.getElementById('goal-manual-calories').value = goals.manualCalories || '';
    document.getElementById('goal-manual-protein').value = goals.manualProtein || '';

    updateCalcDisplay();
}

function updateCalcDisplay() {
    const age = parseFloat(document.getElementById('goal-age').value) || goals.age || 18;
    const gender = document.getElementById('goal-gender').value || 'male';
    const height = parseFloat(document.getElementById('goal-height').value) || goals.height || 162;
    const activity = parseFloat(document.getElementById('goal-activity').value) || 1.375;
    const cw = parseFloat(document.getElementById('goal-current-weight').value) || goals.currentWeight || 43;
    const tw = parseFloat(document.getElementById('goal-target-weight').value) || goals.targetWeight || 60;
    const td = document.getElementById('goal-target-date').value || '';

    const bmr = calcBMR(cw, height, age, gender);
    const tdee = calcTDEE(bmr, activity);
    const surplus = calcDailySurplus(cw, tw, td);
    const dailyCal = Math.round(tdee + surplus);
    const dailyPro = Math.round(cw * 1.8);

    document.getElementById('calc-bmr').textContent = `${Math.round(bmr)} kcal`;
    document.getElementById('calc-tdee').textContent = `${Math.round(tdee)} kcal`;
    document.getElementById('calc-daily-cal').textContent = `${dailyCal} kcal`;
    document.getElementById('calc-daily-pro').textContent = `${dailyPro} g`;

    if (surplus > 0) {
        document.getElementById('calc-cal-desc').textContent = `TDEE (${Math.round(tdee)}) + ${surplus} kcal surplus/day`;
    } else if (surplus < 0) {
        document.getElementById('calc-cal-desc').textContent = `TDEE (${Math.round(tdee)}) ${surplus} kcal deficit/day`;
    } else {
        document.getElementById('calc-cal-desc').textContent = td ? 'TDEE + surplus for weight gain' : 'Set a target date to calculate surplus';
    }

    // BMI
    if (cw && height) {
        const hm = height / 100;
        const bmi = cw / (hm * hm);
        document.getElementById('bmi-value').textContent = bmi.toFixed(1);

        let label = '';
        if (bmi < 18.5) label = 'Underweight';
        else if (bmi < 25) label = 'Normal';
        else if (bmi < 30) label = 'Overweight';
        else label = 'Obese';
        document.getElementById('bmi-label').textContent = label;

        const indicator = document.getElementById('bmi-indicator');
        const pct = Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100));
        indicator.style.display = 'block';
        indicator.style.left = pct + '%';
    }
}

// ==========================================
// RENDER: HISTORY
// ==========================================
function renderHistory() {
    const container = document.getElementById('history-list');
    const empty = document.getElementById('empty-history');
    container.querySelectorAll('.history-card').forEach(el => el.remove());

    const allDates = [...new Set([...Object.keys(history), ...Object.keys(dailyLog)])];
    allDates.sort((a, b) => b.localeCompare(a));

    if (allDates.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    const calTarget = getEffectiveCalories(goals);
    const proTarget = getEffectiveProtein(goals);

    for (const ds of allDates) {
        const entries = history[ds] || dailyLog[ds] || [];
        const tot = dayTotals(entries);
        const allHit = tot.cal >= calTarget && tot.pro >= proTarget;

        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-header">
                <div class="history-left">
                    <div class="history-dot ${allHit ? 'hit' : 'miss'}"></div>
                    <span class="history-date-text">${ds === today() ? 'Today' : fmtDateShort(ds)}</span>
                </div>
                <div class="history-tags">
                    <span class="macro-tag cal-tag">${Math.round(tot.cal)} kcal</span>
                    <span class="macro-tag pro-tag">${+(tot.pro).toFixed(1)}g</span>
                </div>
            </div>
            <div class="history-body" id="hb-${ds}">
                ${entries.map(e => {
                    const f = getFood(e.foodId);
                    if (!f) return '';
                    const n = entryNutrition(e);
                    return `<div class="log-item" style="border:none;padding:6px 0;">
                        ${foodThumbHTML(f, 30)}
                        <div class="log-item-info">
                            <div class="log-item-name" style="font-size:0.82rem">${f.name}</div>
                            <div class="log-item-qty">${e.quantity} ${f.unit}</div>
                        </div>
                        <div class="log-item-macros">
                            <span class="macro-tag cal-tag">${Math.round(n.cal)} kcal</span>
                            <span class="macro-tag pro-tag">${+(n.pro).toFixed(1)}g</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;

        card.querySelector('.history-header').addEventListener('click', () => {
            card.querySelector('.history-body').classList.toggle('open');
        });

        container.appendChild(card);
    }
}

// ==========================================
// INLINE SEARCH
// ==========================================
function initInlineSearch() {
    const input = document.getElementById('inline-food-search');
    const results = document.getElementById('inline-search-results');

    input.addEventListener('focus', () => {
        renderInlineResults(input.value);
    });

    input.addEventListener('input', () => {
        renderInlineResults(input.value);
    });

    // Close results on click outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !results.contains(e.target)) {
            results.classList.remove('show');
        }
    });

    // Keyboard shortcut Ctrl+K / Cmd+K
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            input.focus();
        }
    });
}

function renderInlineResults(query) {
    const results = document.getElementById('inline-search-results');
    results.innerHTML = '';

    const filtered = foods.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));

    if (filtered.length === 0 && query) {
        results.innerHTML = `
            <div style="text-align:center;padding:16px;color:var(--text-3);font-size:0.82rem;">
                No foods found. 
                <button class="btn-icon" id="inline-create-btn" style="margin-top:8px;">
                    <span>+</span> Create "${query}"
                </button>
            </div>
        `;
        results.classList.add('show');
        document.getElementById('inline-create-btn')?.addEventListener('click', () => {
            results.classList.remove('show');
            openNewFoodModal(query);
        });
        return;
    }

    if (filtered.length === 0) {
        results.classList.remove('show');
        return;
    }

    for (const food of filtered.slice(0, 10)) {
        const item = document.createElement('div');
        item.className = 'search-result';
        item.innerHTML = `
            ${foodThumbHTML(food, 40)}
            <div class="result-info">
                <div class="result-name">${food.name}</div>
                <div class="result-meta">${food.cal} kcal, ${food.pro}g protein per ${food.serving} ${food.unit}</div>
            </div>
        `;
        item.addEventListener('click', () => {
            results.classList.remove('show');
            document.getElementById('inline-food-search').value = '';
            openAddModal(food);
        });
        results.appendChild(item);
    }

    results.classList.add('show');
}

// ==========================================
// ADD MODAL
// ==========================================
function openAddModal(food) {
    selectedFood = food;
    const preview = document.getElementById('modal-food-preview');

    // Set thumbnail
    const imgEl = document.getElementById('modal-food-img');
    if (food.image) {
        imgEl.src = food.image;
        imgEl.style.display = 'block';
        imgEl.onerror = () => { imgEl.style.display = 'none'; };
    } else {
        imgEl.style.display = 'none';
    }

    document.getElementById('modal-food-name').textContent = `${food.emoji || '🍽️'} ${food.name}`;
    document.getElementById('modal-food-meta').textContent =
        `${food.cal} kcal, ${food.pro}g protein per ${food.serving} ${food.unit}`;

    document.getElementById('modal-quantity').value = food.serving;
    document.getElementById('modal-quantity-unit').textContent = food.unit;

    updatePreview();
    openModal('modal-add-food');
    setTimeout(() => document.getElementById('modal-quantity').focus(), 100);
}

function updatePreview() {
    if (!selectedFood) return;
    const qty = parseFloat(document.getElementById('modal-quantity').value) || 0;
    const m = qty / selectedFood.serving;
    document.getElementById('preview-calories').textContent = Math.round(selectedFood.cal * m);
    document.getElementById('preview-protein').textContent = +(selectedFood.pro * m).toFixed(1);
}

// ==========================================
// NEW FOOD MODAL
// ==========================================
function openNewFoodModal(prefillName = '') {
    document.getElementById('new-food-name').value = prefillName;
    document.getElementById('new-food-unit').value = 'nos';
    document.getElementById('new-food-serving').value = 1;
    document.getElementById('new-food-calories').value = '';
    document.getElementById('new-food-protein').value = '';
    document.getElementById('new-food-image').value = '';
    updateServingHint();
    openModal('modal-new-food');
}

function updateServingHint() {
    const unit = document.getElementById('new-food-unit').value;
    document.getElementById('serving-hint').textContent = `(per ${document.getElementById('new-food-serving').value || 1} ${unit})`;
}

// ==========================================
// MODAL HELPERS
// ==========================================
function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

// ==========================================
// TOAST
// ==========================================
function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-emoji">${type === 'success' ? '✅' : '❌'}</span><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// NAVIGATION
// ==========================================
function switchPage(page) {
    const currentPage = document.querySelector('.page.active');
    const targetPage = document.getElementById(`page-${page}`);

    // Reset reveal animations on target page
    targetPage.querySelectorAll('.reveal').forEach(el => el.classList.remove('visible'));

    // Fade out current page, then switch
    if (currentPage && currentPage !== targetPage) {
        currentPage.style.animation = 'pageGlitchOut 0.25s ease forwards';
        setTimeout(() => {
            document.querySelectorAll('.page').forEach(p => {
                p.classList.remove('active');
                p.style.animation = '';
            });
            document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
            targetPage.classList.add('active');
            document.querySelector(`.nav-link[data-page="${page}"]`).classList.add('active');
            document.getElementById('sidebar').classList.remove('open');

            switch (page) {
                case 'dashboard': renderDashboard(); break;
                case 'foods': renderFoodDB(); break;
                case 'goals': renderGoals(); break;
                case 'history': renderHistory(); break;
            }

            // Staggered reveal of elements
            const reveals = targetPage.querySelectorAll('.reveal');
            reveals.forEach((el, i) => {
                setTimeout(() => el.classList.add('visible'), 80 + i * 60);
            });

            // Scroll to top of main content
            document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
        }, 250);
    } else {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
        targetPage.classList.add('active');
        document.querySelector(`.nav-link[data-page="${page}"]`).classList.add('active');
        document.getElementById('sidebar').classList.remove('open');

        switch (page) {
            case 'dashboard': renderDashboard(); break;
            case 'foods': renderFoodDB(); break;
            case 'goals': renderGoals(); break;
            case 'history': renderHistory(); break;
        }

        const reveals = targetPage.querySelectorAll('.reveal');
        reveals.forEach((el, i) => {
            setTimeout(() => el.classList.add('visible'), 80 + i * 60);
        });
    }
}

// ==========================================
// PROFILE UI LOGIC
// ==========================================
function renderProfileList() {
    const list = document.getElementById('profile-list');
    list.innerHTML = '';
    const profiles = getProfiles();
    const activeId = getActiveProfileId();

    profiles.forEach(p => {
        const item = document.createElement('div');
        item.className = `profile-item ${p.id === activeId ? 'active' : ''}`;
        
        const avatarUrl = getAvatarUrl(p);
        
        item.innerHTML = `
            <img src="${avatarUrl}" class="profile-item-avatar" alt="${p.name}" style="${!p.image ? 'padding:4px;background:var(--bg-input);' : ''}">
            <div class="profile-item-info" style="cursor:pointer;" onclick="switchProfile('${p.id}')">
                <span class="profile-item-name">${p.name}</span>
                <span class="profile-item-tagline">${p.tagline || 'No tagline'}</span>
            </div>
            <div class="profile-item-actions">
                <button class="profile-btn-edit" title="Edit" onclick="openProfileEditModal('${p.id}')">✏️</button>
                <button class="profile-btn-delete" title="Delete" onclick="deleteProfileHandler('${p.id}', '${p.name}')">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

window.deleteProfileHandler = function(id, name) {
    if (getProfiles().length <= 1) {
        showToast('Cannot delete the only profile', 'error');
        return;
    }
    if (confirm(`Delete profile "${name}"? All data will be lost.`)) {
        deleteProfile(id);
        renderProfileList();
        if (getActiveProfileId() !== id) {
            updateUIForProfile(); // if we didn't switch
        } else {
            // switched in deleteProfile
            initData();
            switchPage('dashboard');
            updateUIForProfile();
        }
        showToast(`Deleted ${name}`, 'success');
    }
};

window.openProfileEditModal = function(id) {
    const profile = getProfiles().find(p => p.id === id);
    if (!profile) return;
    
    document.getElementById('profile-edit-id').value = id;
    document.getElementById('profile-name').value = profile.name;
    document.getElementById('profile-tagline').value = profile.tagline || '';
    document.getElementById('profile-image').value = ''; // Cannot programmatically set file input
    document.getElementById('profile-image').dataset.existing = profile.image || '';
    
    const goalKey = `nt_p_${id}_goals`;
    const g = load(goalKey, { ...DEFAULT_GOALS });
    document.getElementById('profile-age').value = g.age || 18;
    document.getElementById('profile-gender').value = g.gender || 'male';
    document.getElementById('profile-height').value = g.height || 170;
    document.getElementById('profile-weight').value = g.currentWeight || 65;
    document.getElementById('profile-target-weight').value = g.targetWeight || 70;
    document.getElementById('profile-activity').value = g.activityFactor || 1.375;
    
    document.getElementById('profile-form-title').textContent = 'Edit Profile';
    closeModal('modal-profile-picker');
    openModal('modal-profile-form');
};

// ==========================================
// EVENT LISTENERS
// ==========================================
function initEvents() {
    // Set minimum date for target date picker
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('goal-target-date');
    if (dateInput) dateInput.min = todayStr;
    // Theme toggle
    const themeBtns = document.querySelectorAll('.theme-toggle');
    const savedTheme = localStorage.getItem('nt_theme');
    
    if (savedTheme === 'light') document.body.classList.add('light-mode');

    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('nt_theme', isLight ? 'light' : 'dark');
        });
    });

    // Meal column add buttons
    document.querySelectorAll('.meal-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentActiveMeal = btn.dataset.meal;
            const searchInput = document.getElementById('inline-food-search');
            searchInput.placeholder = `Search to add to ${currentActiveMeal}...`;
            searchInput.focus();
            window.scrollTo({ top: document.querySelector('.add-food-section').offsetTop - 20, behavior: 'smooth' });
        });
    });

    // Nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); switchPage(link.dataset.page); });
    });

    // Mobile hamburger
    document.getElementById('hamburger-btn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Close sidebar on outside click
    document.addEventListener('click', (e) => {
        const sb = document.getElementById('sidebar');
        const hb = document.getElementById('hamburger-btn');
        if (sb.classList.contains('open') && !sb.contains(e.target) && !hb.contains(e.target)) {
            sb.classList.remove('open');
        }
    });

    // Inline search
    initInlineSearch();

    // New Food button from dashboard
    document.getElementById('btn-new-food-from-dash').addEventListener('click', () => openNewFoodModal());

    // Add modal — quantity change
    document.getElementById('modal-quantity').addEventListener('input', updatePreview);

    // Add modal — confirm
    document.getElementById('btn-confirm-add').addEventListener('click', () => {
        if (!selectedFood) return;
        const qty = parseFloat(document.getElementById('modal-quantity').value);
        if (!qty || qty <= 0) { showToast('Enter a valid quantity', 'error'); return; }
        addToLog(selectedFood.id, qty);
        closeModal('modal-add-food');
        renderDashboard();
        showToast(`Added ${selectedFood.name}`, 'success');
    });

    // Add modal — close
    document.getElementById('modal-add-close').addEventListener('click', () => closeModal('modal-add-food'));

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', (e) => {
            if (e.target === o) { o.classList.remove('active'); document.body.style.overflow = ''; }
        });
    });

    // New Food button (database page)
    document.getElementById('btn-add-new-food').addEventListener('click', () => openNewFoodModal());

    // New Food modal — close
    document.getElementById('modal-new-close').addEventListener('click', () => closeModal('modal-new-food'));

    // New Food modal — unit/serving hint
    document.getElementById('new-food-unit').addEventListener('change', updateServingHint);
    document.getElementById('new-food-serving').addEventListener('input', updateServingHint);

    // New Food modal — save
    document.getElementById('btn-save-new-food').addEventListener('click', () => {
        const name = document.getElementById('new-food-name').value.trim();
        const unit = document.getElementById('new-food-unit').value;
        const serving = parseFloat(document.getElementById('new-food-serving').value) || 1;
        const cal = parseFloat(document.getElementById('new-food-calories').value);
        const pro = parseFloat(document.getElementById('new-food-protein').value);
        const image = document.getElementById('new-food-image').value.trim();

        if (!name) { showToast('Enter a food name', 'error'); return; }
        if (isNaN(cal) || cal < 0) { showToast('Enter valid calories', 'error'); return; }
        if (isNaN(pro) || pro < 0) { showToast('Enter valid protein', 'error'); return; }

        foods.push({ id: genId(), name, unit, serving, cal, pro, image, emoji: '🍽️' });
        save(KEYS.FOODS, foods);
        closeModal('modal-new-food');
        renderFoodDB();
        showToast(`"${name}" added!`, 'success');
    });

    // Food search (database page)
    document.getElementById('food-search-input').addEventListener('input', (e) => {
        renderFoodDB(e.target.value);
    });

    // Goals — live calc update
    ['goal-age', 'goal-gender', 'goal-height', 'goal-activity',
     'goal-current-weight', 'goal-target-weight', 'goal-target-date'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateCalcDisplay);
        document.getElementById(id).addEventListener('change', updateCalcDisplay);
    });

    // Goals — save
    document.getElementById('btn-save-goals').addEventListener('click', () => {
        const age = parseInt(document.getElementById('goal-age').value);
        const gender = document.getElementById('goal-gender').value;
        const height = parseFloat(document.getElementById('goal-height').value);
        const activity = parseFloat(document.getElementById('goal-activity').value);
        const cw = parseFloat(document.getElementById('goal-current-weight').value);
        const tw = parseFloat(document.getElementById('goal-target-weight').value);
        const td = document.getElementById('goal-target-date').value;
        const mc = parseInt(document.getElementById('goal-manual-calories').value) || null;
        const mp = parseInt(document.getElementById('goal-manual-protein').value) || null;

        if (age) goals.age = age;
        if (gender) goals.gender = gender;
        if (height) goals.height = height;
        if (activity) goals.activityFactor = activity;
        if (cw) goals.currentWeight = cw;
        if (tw) goals.targetWeight = tw;
        goals.targetDate = td || '';
        goals.manualCalories = mc;
        goals.manualProtein = mp;

        save(profileKey('goals'), goals);
        showToast('Goals saved!', 'success');
        renderGoals();
    });

    // Escape to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(o => {
                o.classList.remove('active');
                document.body.style.overflow = '';
            });
        }
    });

    // Profile UI listeners
    document.getElementById('sidebar-profile-btn')?.addEventListener('click', () => {
        renderProfileList();
        openModal('modal-profile-picker');
    });

    document.getElementById('mobile-avatar-btn')?.addEventListener('click', () => {
        renderProfileList();
        openModal('modal-profile-picker');
        document.getElementById('sidebar').classList.remove('open');
    });

    document.getElementById('modal-profile-close')?.addEventListener('click', () => {
        closeModal('modal-profile-picker');
    });

    document.getElementById('btn-create-profile')?.addEventListener('click', () => {
        document.getElementById('profile-edit-id').value = '';
        document.getElementById('profile-name').value = '';
        document.getElementById('profile-tagline').value = '';
        document.getElementById('profile-image').value = '';
        document.getElementById('profile-image').dataset.existing = '';
        document.getElementById('profile-age').value = '18';
        document.getElementById('profile-height').value = '170';
        document.getElementById('profile-weight').value = '65';
        document.getElementById('profile-target-weight').value = '70';
        document.getElementById('profile-form-title').textContent = 'Create Profile';
        closeModal('modal-profile-picker');
        openModal('modal-profile-form');
    });

    document.getElementById('modal-profile-form-close')?.addEventListener('click', () => {
        closeModal('modal-profile-form');
    });

    document.getElementById('btn-save-profile')?.addEventListener('click', () => {
        const id = document.getElementById('profile-edit-id').value;
        const name = document.getElementById('profile-name').value.trim();
        if (!name) return showToast('Name is required', 'error');

        const saveHandler = (base64Image) => {
            const fileInput = document.getElementById('profile-image');
            const image = base64Image || fileInput.dataset.existing || '';

            const data = {
                name,
                tagline: document.getElementById('profile-tagline').value.trim(),
                image: image,
                age: parseInt(document.getElementById('profile-age').value) || 18,
                gender: document.getElementById('profile-gender').value,
                height: parseFloat(document.getElementById('profile-height').value) || 170,
                currentWeight: parseFloat(document.getElementById('profile-weight').value) || 65,
                targetWeight: parseFloat(document.getElementById('profile-target-weight').value) || 70,
                activityFactor: parseFloat(document.getElementById('profile-activity').value) || 1.375
            };

            if (id) {
                updateProfile(id, data);
                showToast('Profile updated', 'success');
            } else {
                const newP = createProfile(data);
                switchProfile(newP.id);
                showToast('Profile created', 'success');
            }
            
            closeModal('modal-profile-form');
            updateUIForProfile();
            // If we are currently on goals page, re-render it to show updated stats
            if (document.getElementById('page-goals').classList.contains('active')) {
                renderGoals();
            } else {
                // Also update dashboard if active
                if (document.getElementById('page-dashboard').classList.contains('active')) {
                    renderDashboard();
                }
            }
        };

        readImageFile(document.getElementById('profile-image'), saveHandler);
    });

    // First time setup
    document.getElementById('btn-setup-start')?.addEventListener('click', () => {
        const name = document.getElementById('setup-name').value.trim();
        if (!name) return showToast('Please enter your name', 'error');

        const saveHandler = (base64Image) => {
            const data = {
                name,
                image: base64Image || '',
                age: parseInt(document.getElementById('setup-age').value) || 18,
                gender: document.getElementById('setup-gender').value,
                height: parseFloat(document.getElementById('setup-height').value) || 170,
                currentWeight: parseFloat(document.getElementById('setup-weight').value) || 65,
                targetWeight: 70,
                activityFactor: 1.375
            };

            const newP = createProfile(data);
            switchProfile(newP.id);
            
            document.getElementById('first-time-overlay').style.display = 'none';
            showToast(`Welcome, ${name}!`, 'success');
            renderDashboard(); // re-render the dashboard to apply everything cleanly
        };

        readImageFile(document.getElementById('setup-image'), saveHandler);
    });
}

// ==========================================
// INIT
// ==========================================
// ==========================================
// CURSOR GLOW TRACKER
// ==========================================
function initCursorGlow() {
    const glow = document.getElementById('cursor-glow');
    if (!glow) return;
    let mouseX = 0, mouseY = 0;
    let glowX = 0, glowY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function animateGlow() {
        // Smooth follow with lerp
        glowX += (mouseX - glowX) * 0.08;
        glowY += (mouseY - glowY) * 0.08;
        glow.style.left = glowX + 'px';
        glow.style.top = glowY + 'px';
        requestAnimationFrame(animateGlow);
    }
    animateGlow();
}

// ==========================================
// INTERACTIVE CARD TILT
// ==========================================
function initCardTilt() {
    const cards = document.querySelectorAll('.stat-card, .goal-section-card, .food-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -3;
            const rotateY = ((x - centerX) / centerX) * 3;
            card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.transition = 'all 0.5s var(--ease-out)';
            setTimeout(() => card.style.transition = '', 500);
        });
    });
}

// ==========================================
// TYPING EFFECT FOR MOTIVATION TEXT
// ==========================================
function typeText(element, text, speed = 30) {
    element.textContent = '';
    element.style.borderRight = '2px solid var(--accent)';
    let i = 0;
    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        } else {
            // Blink cursor then remove
            setTimeout(() => {
                element.style.borderRight = 'none';
            }, 1500);
        }
    }
    type();
}

// ==========================================
// PAGE-OUT ANIMATION (injected as CSS)
// ==========================================
function injectPageOutAnimation() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pageGlitchOut {
            0% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0) brightness(1); }
            50% { opacity: 0.5; filter: blur(2px) brightness(1.3); }
            100% { opacity: 0; transform: translateY(-10px) scale(0.98); filter: blur(4px) brightness(0.8); }
        }
    `;
    document.head.appendChild(style);
}

function init() {
    injectPageOutAnimation();
    
    const profiles = getProfiles();
    if (profiles.length === 0) {
        // Show first time setup
        document.getElementById('first-time-overlay').style.display = 'flex';
        // Initialize empty state variables just in case
        foods = load(KEYS.FOODS, [...DEFAULT_FOODS]);
    } else {
        // Verify active profile exists
        if (!getActiveProfileId() || !profiles.find(p => p.id === getActiveProfileId())) {
            setActiveProfileId(profiles[0].id);
        }
        initData();
        updateUIForProfile();
    }
    
    initEvents();
    initFloatingFoods();
    initCursorGlow();
    switchPage('dashboard');
    initRevealAnimations();

    // Trigger initial reveals with stagger
    setTimeout(() => {
        const reveals = document.querySelectorAll('#page-dashboard .reveal');
        reveals.forEach((el, i) => {
            setTimeout(() => el.classList.add('visible'), 100 + i * 80);
        });
    }, 100);

    // Init card tilt after short delay to allow DOM to settle
    setTimeout(initCardTilt, 500);

    // Type the motivation text on load
    setTimeout(() => {
        const motEl = document.getElementById('hero-motivation-text');
        if (motEl) typeText(motEl, motEl.textContent);
    }, 800);
}

document.addEventListener('DOMContentLoaded', init);

// Return to Alfred logic
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isFromAlfred = urlParams.get('from') === 'alfred' || window.parent !== window;
    
    if (isFromAlfred) {
        const returnBtn = document.getElementById('returnToAlfredBtn');
        if (returnBtn) {
            returnBtn.style.display = 'block';
            returnBtn.addEventListener('click', () => {
                window.parent.postMessage('closeNutritrack', '*');
            });
            
            // Optional: add a neat hover effect
            returnBtn.addEventListener('mouseenter', () => {
                returnBtn.style.transform = 'scale(1.05) translateY(-2px)';
                returnBtn.style.boxShadow = '0 6px 20px rgba(255, 170, 0, 0.6)';
            });
            returnBtn.addEventListener('mouseleave', () => {
                returnBtn.style.transform = 'scale(1) translateY(0)';
                returnBtn.style.boxShadow = '0 4px 15px rgba(255, 170, 0, 0.4)';
            });
        }
    }
});
