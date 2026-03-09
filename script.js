/* ================================================================
   QUIZ DATA
   ================================================================ */
// quizData is loaded asynchronously from questions.json
let quizData = [];

const badgeData = { "Chemical Pathologist": "🧪", "Histopathologist": "🥼", "Hematologist": "🩸", "Microbiologist": "🔬", "Laboratory Management": "🛡️" };

/* ================================================================
   GLOBAL STATE
   ================================================================ */
let user        = null;
let authMode    = 'login';       // 'login' | 'register' | 'forgot'
let customImg   = null;          // Base64 string from image upload
let currentQ    = [];
let qIdx        = 0;
let score       = 0;
let timer       = null;
let mistakes    = [];
let currentCat  = '';
let currentSub  = '';
let currentSsc  = '';

/* ================================================================
   INITIALIZATION — loads questions.json first, then boots the app
   ================================================================ */
async function init() {
    // 1. Restore theme immediately (no data needed)
    const savedTheme = localStorage.getItem('quiz_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-icon').innerText = savedTheme === 'dark' ? '☀️' : '🌙';

    // 2. Load quiz questions from external JSON file
    try {
        const response = await fetch('questions.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        quizData = await response.json();
        console.log(`✅ questions.json loaded — ${quizData.length} questions ready.`);
    } catch (err) {
        console.error('❌ Failed to load questions.json:', err);
        alert('Could not load quiz questions.\n\nMake sure questions.json is in the same folder as quiz-master.html, then refresh the page.');
        return; // Stop — cannot run without data
    }

    // 3. Check for remembered session — auto-login if valid
    const rememberedUser = localStorage.getItem('quiz_session');
    if (rememberedUser) {
        const db = JSON.parse(localStorage.getItem('quiz_db') || '{}');
        if (db[rememberedUser]) {
            user = rememberedUser;
            showLoginLoader(() => showMain());
            return;
        }
        // Stale entry — clean it up
        localStorage.removeItem('quiz_session');
    }
    // 4. No remembered session — show login screen normally
}

// Boot the app
init();

/* ================================================================
   THEME
   ================================================================ */
function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('quiz_theme', next);
    document.getElementById('theme-icon').innerText = next === 'dark' ? '☀️' : '🌙';
}

/* ================================================================
   AUTH
   ================================================================ */
function setAuthMode(mode) {
    authMode = mode;

    const regExtra    = document.getElementById('reg-extra');
    const forgotExtra = document.getElementById('forgot-extra');
    const passIn      = document.getElementById('p-in');
    const msg         = document.getElementById('auth-msg');
    const mainBtn     = document.getElementById('auth-main-btn');
    const btnReg      = document.getElementById('btn-reg');
    const btnForgot   = document.getElementById('btn-forgot');
    const btnLogin    = document.getElementById('btn-login');

    // Reset all conditional panels
    regExtra.classList.add('hidden');
    forgotExtra.classList.add('hidden');
    passIn.classList.remove('hidden');
    btnLogin.classList.add('hidden');
    btnReg.classList.remove('hidden');
    btnForgot.classList.remove('hidden');

    if (mode === 'register') {
        msg.innerText      = 'Create your account';
        mainBtn.innerText  = 'Register';
        regExtra.classList.remove('hidden');
        btnReg.classList.add('hidden');
        btnLogin.classList.remove('hidden');
    } else if (mode === 'forgot') {
        msg.innerText       = 'Recover your password';
        mainBtn.innerText   = 'Recover';
        passIn.classList.add('hidden');
        forgotExtra.classList.remove('hidden');
        btnForgot.classList.add('hidden');
        btnLogin.classList.remove('hidden');
    } else {
        msg.innerText     = 'Login to track your trophies';
        mainBtn.innerText = 'Enter';
        btnLogin.classList.add('hidden');
    }
}

/* ================================================================
   LOGIN LOADER
   ================================================================ */
const loaderMessages = [
    'Verifying credentials…',
    'Loading your stats…',
    'Fetching leaderboard…',
    'Preparing dashboard…',
    'Almost there…'
];

function showLoginLoader(callback) {
    const loader  = document.getElementById('login-loader');
    const textEl  = document.getElementById('loader-text');
    const barEl   = document.getElementById('loader-bar');

    // Reset animation by replacing the bar element clone
    const newBar = barEl.cloneNode(true);
    barEl.parentNode.replaceChild(newBar, barEl);

    // Cycle through status messages
    let msgIdx = 0;
    textEl.innerText = loaderMessages[msgIdx];
    const msgInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % loaderMessages.length;
        textEl.innerText = loaderMessages[msgIdx];
    }, 380);

    // Show loader
    loader.classList.remove('hidden', 'fade-out');

    // After 1.8s — fade out, then run callback
    setTimeout(() => {
        clearInterval(msgInterval);
        textEl.innerText = 'Welcome! ✅';
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.classList.add('hidden');
            callback();
        }, 500);
    }, 1800);
}

function handleAuth() {
    const u     = document.getElementById('u-in').value.trim();
    const p     = document.getElementById('p-in').value.trim();
    const hint  = document.getElementById('hint-in').value.trim();
    const hintR = document.getElementById('hint-recover').value.trim();
    const av    = document.getElementById('avatar-in').value;
    const remember = document.getElementById('remember-me').checked;
    let db = JSON.parse(localStorage.getItem('quiz_db') || '{}');

    if (!u) { alert('Please enter a username.'); return; }

    if (authMode === 'login') {
        if (db[u] && db[u].p === p) {
            user = u;
            if (remember) localStorage.setItem('quiz_session', u);
            showLoginLoader(() => showMain());
        } else {
            alert('Invalid username or password.');
        }

    } else if (authMode === 'register') {
        if (!p)     { alert('Please enter a password.'); return; }
        if (db[u])  { alert('Username already taken.'); return; }

        const finalAvatar = (av === 'custom' && customImg) ? customImg : av;
        db[u] = {
            p,
            hint,
            avatar:    finalAvatar,
            high:      0,
            streak:    0,
            lastLogin: null,
            mastery:   {},
            badges:    []
        };
        localStorage.setItem('quiz_db', JSON.stringify(db));
        customImg = null;
        alert('Account created! Please log in.');
        setAuthMode('login');

    } else if (authMode === 'forgot') {
        if (db[u] && db[u].hint === hintR) {
            alert('Your password is: ' + db[u].p);
        } else {
            alert('Username or security hint is incorrect.');
        }
    }
}

/* ================================================================
   IMAGE UPLOAD & COMPRESSION
   ================================================================ */
function toggleCustomFile() {
    const isCustom = document.getElementById('avatar-in').value === 'custom';
    document.getElementById('file-reg').classList.toggle('hidden', !isCustom);
}

function handleImageUpload(input, previewId) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
            const canvas    = document.createElement('canvas');
            const MAX_WIDTH = 150;
            const scale     = Math.min(1, MAX_WIDTH / img.width);
            canvas.width    = img.width  * scale;
            canvas.height   = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            // 70% quality JPEG — keeps localStorage lean
            customImg = canvas.toDataURL('image/jpeg', 0.7);
            const preview = document.getElementById(previewId);
            preview.src = customImg;
            preview.classList.remove('hidden');
        };
    };
    reader.readAsDataURL(file);
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function showMain() {
    hideAll();
    document.getElementById('main-s').classList.remove('hidden');

    let db = JSON.parse(localStorage.getItem('quiz_db') || '{}');
    let d  = db[user];
    if (!d) { logout(); return; } // Corrupt state guard

    // Streak logic
    const today = new Date().setHours(0, 0, 0, 0);
    let streakIncreased = false;
    if (!d.lastLogin) {
        d.streak = 1;
        streakIncreased = true;   // First ever login counts as a new streak
    } else if (today === d.lastLogin + 86400000) {
        d.streak++;
        streakIncreased = true;   // Consecutive day — streak went up
    } else if (today > d.lastLogin) {
        d.streak = 1;
        streakIncreased = false;  // Reset — no glow, streak didn't increase
    }
    d.lastLogin = today;
    localStorage.setItem('quiz_db', JSON.stringify(db));

    // Avatar — emoji or Base64 image
    const avatarSlot = document.getElementById('display-avatar');
    if (d.avatar && d.avatar.length > 10) {
        avatarSlot.innerHTML = `<img src="${d.avatar}" class="avatar-img">`;
    } else {
        avatarSlot.innerText = d.avatar || '👤';
    }

    document.getElementById('display-user').innerText  = user;
    const highEl = document.getElementById('display-high');
    if (!d.high || d.high === 0) {
        highEl.innerHTML = '<span style="color:var(--muted);">No quiz completed yet</span>';
    } else {
        highEl.innerHTML = `High: <b>${d.high}</b> pts`;
    }
    const streakEl = document.getElementById('display-streak');
    streakEl.innerText = d.streak || 0;
    // Glow only when streak just increased (streakIncreased flag set above)
    streakEl.classList.toggle('streak-flame', streakIncreased);

    // Rank
    // Rank is only assigned after at least one quiz has been completed (high > 0)
    let rank, rankProgress;
    if (d.high === 0 || d.high == null) {
        rank         = '🎯 Unranked';
        rankProgress = 0;
    } else if (d.high >= 20) {
        rank         = '💎 Diamond';
        rankProgress = 100;
    } else if (d.high >= 10) {
        rank         = '🥇 Gold';
        rankProgress = Math.round((d.high / 20) * 100);
    } else if (d.high >= 5) {
        rank         = '🥈 Silver';
        rankProgress = Math.round((d.high / 20) * 100);
    } else {
        rank         = '🥉 Bronze';
        rankProgress = Math.round((d.high / 20) * 100);
    }
    document.getElementById('display-rank').innerText = rank;
    document.getElementById('rank-progress').style.width = rankProgress + '%';
}

/* ================================================================
   NAVIGATION: CATEGORY → SUBCATEGORY → TOPIC
   ================================================================ */
function showSubMenu(cat) {
    currentCat = cat;
    hideAll();
    document.getElementById('sub-s').classList.remove('hidden');
    document.getElementById('sub-title').innerText = cat;

    const list = document.getElementById('sub-list-dynamic');
    list.innerHTML = '';

    const subs = [...new Set(quizData.filter(q => q.c === cat).map(q => q.sc))];
    subs.forEach(sub => {
        const item = document.createElement('div');
        item.className = 'sub-item';
        item.innerHTML = `<div class="sub-item-title"><span>${sub}</span><span>➔</span></div>`;
        item.onclick = () => showSubSubMenu(cat, sub);
        list.appendChild(item);
    });
}

function showSubSubMenu(cat, sub) {
    currentSub = sub;
    hideAll();
    document.getElementById('sub-s').classList.remove('hidden');
    document.getElementById('sub-title').innerText = `${cat} › ${sub}`;

    const list = document.getElementById('sub-list-dynamic');
    list.innerHTML = '';

    const sscs = [...new Set(quizData.filter(q => q.c === cat && q.sc === sub).map(q => q.ssc))];
    const db   = JSON.parse(localStorage.getItem('quiz_db') || '{}')[user] || {};

    sscs.forEach(ssc => {
        const total    = quizData.filter(q => q.ssc === ssc).length;
        const mastered = (db.mastery && db.mastery[ssc]) ? db.mastery[ssc].length : 0;
        const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0;

        const item = document.createElement('div');
        item.className = 'sub-item';
        item.innerHTML = `
            <div class="sub-item-title">
                <span>${ssc}</span>
                <span style="color:var(--accent); font-size:0.85rem;">${pct}%</span>
            </div>
            <div class="progress-container" style="margin-top:8px;">
                <div class="progress-fill" style="width:${pct}%;"></div>
            </div>`;
        item.onclick = () => startQuiz(cat, sub, ssc);
        list.appendChild(item);
    });

    // Back button to parent category
    const backBtn = document.createElement('button');
    backBtn.className = 'btn secondary sm';
    backBtn.style.marginTop = '4px';
    backBtn.innerText = `← Back to ${cat}`;
    backBtn.onclick = () => showSubMenu(cat);
    list.appendChild(backBtn);
}

/* ================================================================
   GAME ENGINE
   ================================================================ */
function startQuiz(cat, sub, ssc) {
    currentCat = cat; currentSub = sub; currentSsc = ssc;
    currentQ   = quizData
        .filter(q => q.c === cat && q.sc === sub && q.ssc === ssc)
        .sort(() => Math.random() - 0.5);

    if (currentQ.length === 0) { alert('No questions found for this topic.'); return; }

    qIdx = 0; score = 0; mistakes = [];
    hideAll();
    document.getElementById('game-s').classList.remove('hidden');
    showQ();
}

function showQ() {
    clearInterval(timer);
    const q = currentQ[qIdx];

    document.getElementById('q-text').innerText      = q.q;
    document.getElementById('game-stats').innerText  = `Q ${qIdx + 1} / ${currentQ.length}`;
    document.getElementById('game-progress').style.width = ((qIdx) / currentQ.length * 100) + '%';

    // Render options
    const opts = document.getElementById('opt-container');
    opts.innerHTML = '';
    q.o.forEach(o => {
        const b = document.createElement('button');
        b.className = 'btn secondary animate-pop';
        b.innerText = o;
        b.onclick   = () => handleAnswer(o);
        opts.appendChild(b);
    });

    // Timer / Zen Mode
    const timeVal = parseInt(document.getElementById('diff-select').value);
    const timerEl = document.getElementById('timer-disp');

    if (timeVal > 0) {
        let t = timeVal;
        timerEl.innerText = t + 's';
        timer = setInterval(() => {
            t--;
            timerEl.innerText = t + 's';
            if (t <= 0) handleAnswer(null); // Time expired — count as wrong
        }, 1000);
    } else {
        timerEl.innerText = '🧘 ∞';
    }
}

function handleAnswer(o) {
    clearInterval(timer);
    const q      = currentQ[qIdx];
    const isZen  = parseInt(document.getElementById('diff-select').value) === 0;

    if (o === q.a) {
        // Zen Mode: correct answers are acknowledged but never scored or saved
        if (!isZen) {
            score++;
            updateMastery(q);
        }
    } else {
        mistakes.push({ q: q.q, a: q.a, given: o, ex: q.ex || null });
    }

    qIdx++;
    qIdx < currentQ.length ? showQ() : endQuiz();
}

function endQuiz() {
    clearInterval(timer);
    hideAll();
    document.getElementById('res-s').classList.remove('hidden');

    // Total is always the full question set, not just answered ones
    const total     = currentQ.length;
    const answered  = score + mistakes.length; // questions actually attempted
    const skipped   = total - answered;        // questions stopped before answering

    // Guard: nothing was attempted at all (e.g. Stop pressed immediately)
    if (answered === 0) {
        document.getElementById('res-score').innerText = '—';
        document.getElementById('res-sub').innerText   = 'No questions were answered.';
        document.getElementById('mistake-list').innerHTML =
            '<p style="text-align:center; color:var(--muted); padding:10px;">Start answering questions to see your results here.</p>';
        return;
    }

    const isZenResult = parseInt(document.getElementById('diff-select').value) === 0;

    // Zen Mode: show practice summary, no score shown
    if (isZenResult) {
        document.getElementById('res-score').innerText = '🧘';
        document.getElementById('res-sub').innerText   =
            `Zen Practice — ${answered} of ${total} completed · Not scored`;
    } else {
        document.getElementById('res-score').innerText = `${score} / ${total}`;

        // Only show congratulations messages when all questions were actually completed
        const fullyCompleted = answered === total;
        let subMsg = '';
        if (fullyCompleted) {
            if (score === total)                       subMsg = 'Perfect Score! 🎉';
            else if (score >= Math.ceil(total * 0.7))  subMsg = 'Great work! 👏';
            else                                       subMsg = 'Keep practising! 💪';
        } else {
            subMsg = `${answered} of ${total} answered · ${skipped} skipped`;
        }
        document.getElementById('res-sub').innerText = subMsg;
    }

    // Save high score — blocked in Zen Mode to protect leaderboard integrity
    if (!isZenResult) {
        let db = JSON.parse(localStorage.getItem('quiz_db') || '{}');
        if (score > (db[user].high || 0)) db[user].high = score;
        localStorage.setItem('quiz_db', JSON.stringify(db));
    }

    // Mistakes / review list
    const list = document.getElementById('mistake-list');
    list.innerHTML = '';

    if (mistakes.length === 0 && fullyCompleted) {
        list.innerHTML = '<p style="text-align:center; padding:10px;">No mistakes — flawless! 🏆</p>';
    } else if (mistakes.length > 0) {
        const heading = document.createElement('h3');
        heading.style.marginBottom = '10px';
        heading.innerText = 'Review Incorrect Answers:';
        list.appendChild(heading);

        mistakes.forEach(m => {
            const div = document.createElement('div');
            div.className = 'mistake-item';
            div.innerHTML = `
                <span>${m.q}</span><br>
                <b>✅ ${m.a}</b>
                ${m.ex ? `<div class="explanation">${m.ex}</div>` : ''}`;
            list.appendChild(div);
        });
    }
}

function finishAndReturn() { showSubSubMenu(currentCat, currentSub); }

/* ================================================================
   MASTERY & BADGES
   ================================================================ */
function updateMastery(q) {
    let db = JSON.parse(localStorage.getItem('quiz_db') || '{}');
    if (!db[user].mastery)       db[user].mastery = {};
    if (!db[user].mastery[q.ssc]) db[user].mastery[q.ssc] = [];

    if (!db[user].mastery[q.ssc].includes(q.q)) {
        db[user].mastery[q.ssc].push(q.q);
    }

    // Badge check: award badge if entire sub-category is mastered
    const totalInSub   = quizData.filter(i => i.sc === q.sc).length;
    const sscsInSub    = [...new Set(quizData.filter(i => i.sc === q.sc).map(i => i.ssc))];
    let masteredCount  = 0;
    sscsInSub.forEach(s => masteredCount += (db[user].mastery[s]?.length || 0));

    if (masteredCount >= totalInSub && !db[user].badges.includes(q.sc)) {
        db[user].badges.push(q.sc);
        setTimeout(() => alert(`🏅 Badge unlocked: ${q.sc}!`), 400);
    }

    localStorage.setItem('quiz_db', JSON.stringify(db));
}

/* ================================================================
   LEADERBOARD
   ================================================================ */
function showLeaderboard() {
    hideAll();
    document.getElementById('lead-s').classList.remove('hidden');

    const list = document.getElementById('lead-list');
    const db   = JSON.parse(localStorage.getItem('quiz_db') || '{}');
    list.innerHTML = '';

    const ranked = Object.keys(db)
        .map(u => ({ name: u, score: db[u].high || 0, avatar: db[u].avatar || '👤' }))
        .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
        list.innerHTML = '<p style="text-align:center;">No players yet!</p>';
        return;
    }

    // Split into two groups: played and unranked
    const played   = ranked.filter(p => p.score > 0);
    const unranked = ranked.filter(p => p.score === 0);

    // --- Ranked players with medals ---
    played.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'lead-row' + (p.name === user ? ' me' : '');

        const medal      = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        const avatarHtml = p.avatar.length > 10
            ? `<img src="${p.avatar}" class="avatar-img" style="width:28px;height:28px;">`
            : p.avatar;

        row.innerHTML = `<span>${medal} ${avatarHtml} ${p.name}${p.name === user ? ' (You)' : ''}</span><b>${p.score} pts</b>`;
        list.appendChild(row);
    });

    // --- Unranked section divider (only shown if there are unranked users) ---
    if (unranked.length > 0) {
        const divider = document.createElement('div');
        divider.style.cssText = 'text-align:center; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--muted); padding:12px 0 6px; border-top:1px dashed var(--border); margin-top:8px;';
        divider.innerText = '— Not Yet Ranked —';
        list.appendChild(divider);

        unranked.forEach(p => {
            const row = document.createElement('div');
            row.className = 'lead-row' + (p.name === user ? ' me' : '');
            row.style.opacity = '0.6';

            const avatarHtml = p.avatar.length > 10
                ? `<img src="${p.avatar}" class="avatar-img" style="width:28px;height:28px;">`
                : p.avatar;

            row.innerHTML = `<span>🎯 ${avatarHtml} ${p.name}${p.name === user ? ' (You)' : ''}</span><b style="color:var(--muted); font-size:0.8rem;">No quiz completed</b>`;
            list.appendChild(row);
        });
    }
}

/* ================================================================
   TROPHIES
   ================================================================ */
function showTrophies() {
    hideAll();
    document.getElementById('trophy-s').classList.remove('hidden');

    const grid = document.getElementById('badge-grid');
    const db   = JSON.parse(localStorage.getItem('quiz_db') || '{}')[user] || {};
    grid.innerHTML = '';

    Object.keys(badgeData).forEach(name => {
        const owned = db.badges && db.badges.includes(name);
        const card  = document.createElement('div');
        card.className = 'badge-card' + (owned ? ' owned' : '');
        card.innerHTML = `
            <div style="font-size:2.5rem; filter:${owned ? 'none' : 'grayscale(1) opacity(0.25)'}; margin-bottom:8px;">${badgeData[name]}</div>
            <b>${name}</b>
            <div style="font-size:0.72rem; color:var(--muted); margin-top:4px;">${owned ? '✅ Unlocked' : 'Locked'}</div>`;
        grid.appendChild(card);
    });
}

/* ================================================================
   SETTINGS
   ================================================================ */
function showSettings() {
    hideAll();
    document.getElementById('settings-s').classList.remove('hidden');
    // Pre-select current emoji avatar if applicable
    const db = JSON.parse(localStorage.getItem('quiz_db') || '{}')[user] || {};
    if (db.avatar && db.avatar.length <= 10) {
        const sel = document.getElementById('set-avatar');
        for (let opt of sel.options) {
            if (opt.value === db.avatar) { sel.value = db.avatar; break; }
        }
    }
}

function updateSettings() {
    let db = JSON.parse(localStorage.getItem('quiz_db') || '{}');
    const np = document.getElementById('set-pass').value.trim();
    const av = document.getElementById('set-avatar').value;

    if (np)       db[user].p      = np;
    if (customImg) db[user].avatar = customImg;
    else           db[user].avatar = av;

    localStorage.setItem('quiz_db', JSON.stringify(db));
    customImg = null;
    alert('Settings saved!');
    showMain();
}

function resetData() {
    if (!confirm('This will wipe your mastery progress and badges. Continue?')) return;
    let db = JSON.parse(localStorage.getItem('quiz_db') || '{}');
    db[user].mastery = {};
    db[user].badges  = [];
    db[user].high    = 0;
    localStorage.setItem('quiz_db', JSON.stringify(db));
    alert('Progress reset.');
    showMain();
}

/* ================================================================
   UTILITY
   ================================================================ */
function hideAll() {
    clearInterval(timer);
    ['auth-s','main-s','sub-s','game-s','res-s','lead-s','trophy-s','settings-s']
        .forEach(id => document.getElementById(id).classList.add('hidden'));
}

function backToMain() { showMain(); }

function logout() {
    clearInterval(timer);

    const loader  = document.getElementById('logout-loader');
    const textEl  = document.getElementById('logout-text');
    const barEl   = document.getElementById('logout-bar');

    const messages = ['Signing you out…', 'Clearing session…', 'See you soon! 👋'];
    let msgIdx = 0;
    textEl.innerText = messages[0];

    // Show loader and start bar draining
    loader.classList.add('active');
    setTimeout(() => barEl.classList.add('draining'), 50);

    // Cycle messages
    const msgInterval = setInterval(() => {
        msgIdx = Math.min(msgIdx + 1, messages.length - 1);
        textEl.innerText = messages[msgIdx];
    }, 400);

    // After 1.2s — clear data, fade out, show login screen
    setTimeout(() => {
        clearInterval(msgInterval);
        textEl.innerText = 'Logged out ✅';

        setTimeout(() => {
            // Clear user state
            user = null;
            customImg = null;
            localStorage.removeItem('quiz_session');

            // Reset auth screen
            hideAll();
            document.getElementById('auth-s').classList.remove('hidden');
            setAuthMode('login');
            document.getElementById('u-in').value = '';
            document.getElementById('p-in').value = '';

            // Hide loader
            loader.classList.remove('active');
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.classList.remove('fade-out');
                barEl.classList.remove('draining');
            }, 400);
        }, 500);
    }, 1200);
}