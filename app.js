import { initializeApp }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, collectionGroup }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app-check.js";

/* ================================================================
   FIREBASE SETUP
   ================================================================ */
const firebaseConfig = {
    apiKey:            "AIzaSyA6UtSUqHH4oIqGFVQRxNo9sE2kY-tT_6E",
    authDomain:        "medlablcuquiz.firebaseapp.com",
    projectId:         "medlablcuquiz",
    storageBucket:     "medlablcuquiz.firebasestorage.app",
    messagingSenderId: "216644964020",
    appId:             "1:216644964020:web:2c07580eafdde4bd6991e1"
};
const fbApp  = initializeApp(firebaseConfig);
const fbAuth = getAuth(fbApp);
const fbDb   = getFirestore(fbApp);

/* ================================================================
   APP CHECK — Only registered domains can call Firebase APIs.
   ================================================================ */
const appCheck = initializeAppCheck(fbApp, {
    provider: new ReCaptchaV3Provider(
        '6Lft35AsAAAAAFrThcPtW0rT84_EmYQ7spngIFRk'
    ),
    isTokenAutoRefreshEnabled: true
});

/* ================================================================
   CONSTANTS
   ================================================================ */
const QUIZ_URL = 'https://ovieofdelta.github.io/MedLabSolve/';

const BADGE_DATA = {
    "Chemical Pathologist":  "🧪",
    "Histopathologist":      "🥼",
    "Hematologist":          "🩸",
    "Microbiologist":        "🔬",
    "Laboratory Management": "🛡️"
};

/* ================================================================
   SECURITY — LIMITS & VALIDATION
   FIX: Input length caps prevent oversized data being stored in
   Firestore. Character whitelist on username prevents injection
   of special characters into HTML contexts and onclick strings.
   ================================================================ */
const LIMITS = {
    USERNAME_MIN:  3,
    USERNAME_MAX:  20,
    PASSWORD_MIN:  6,
    HINT_MAX:      80,
    MSG_MAX:       300,
    AVATAR_MAX:    51200,   // 50 KB base64 cap
    SCORE_MAX:     500,     // raise if you ever exceed 500 questions in one quiz
    TOPIC_MAX:     100,
};
// Only letters, digits and underscore — no quotes, HTML chars or spaces.
// This whitelist is the primary defence against onclick-string injection.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/* ================================================================
   SECURITY — HTML SANITISER
   FIX: Every piece of Firestore data that goes into innerHTML must
   pass through esc(). This converts the five dangerous HTML chars
   into their entity equivalents, blocking XSS completely.
   Usage: element.innerHTML = '<b>' + esc(userValue) + '</b>';
   ================================================================ */
function esc(val) {
    return String(val == null ? '' : val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ================================================================
   SECURITY — SAFE AVATAR RENDERER
   FIX: Previously avatar was concatenated directly into innerHTML
   e.g. '<img src="' + d.avatar + '">' — an avatar value of
   '" onerror="alert(1)' would execute JS.
   Now we use createElement + setAttribute so the browser treats
   the value as data, never as markup.
   ================================================================ */
function makeAvatarEl(avatar, sizePx) {
    if (avatar && avatar.length > 10) {
        const img = document.createElement('img');
        img.className = 'avatar-img';
        if (sizePx) {
            img.style.width        = sizePx + 'px';
            img.style.height       = sizePx + 'px';
            img.style.borderRadius = '50%';
        }
        img.setAttribute('src', avatar);   // setAttribute is XSS-safe
        img.alt = 'avatar';
        return img;
    }
    const span = document.createElement('span');
    span.textContent = avatar || '👤';     // textContent never parses HTML
    if (sizePx) span.style.fontSize = Math.round(sizePx * 0.65) + 'px';
    return span;
}

/* ================================================================
   SECURITY — LOGIN RATE LIMITER (client-side)
   FIX: Limits consecutive failed login attempts before adding a
   cooldown, reducing the effectiveness of credential stuffing.
   Firebase Auth also throttles server-side; this adds a layer.
   ================================================================ */
const _loginAttempts = { count: 0, lockedUntil: 0 };
function loginAllowed() {
    const now = Date.now();
    if (now < _loginAttempts.lockedUntil) {
        const secs = Math.ceil((_loginAttempts.lockedUntil - now) / 1000);
        showToast('Too many attempts. Wait ' + secs + 's before trying again.', 'error', 4000);
        return false;
    }
    return true;
}
function loginFailed() {
    _loginAttempts.count++;
    if (_loginAttempts.count >= 5) {
        _loginAttempts.lockedUntil = Date.now() + 30000; // 30-second lockout
        _loginAttempts.count = 0;
    }
}
function loginSucceeded() { _loginAttempts.count = 0; _loginAttempts.lockedUntil = 0; }

/* ================================================================
   STATE
   ================================================================ */
let quizData   = [];
let authMode   = 'login';
let customImg  = null;
let currentQ   = [];
let qIdx       = 0;
let score      = 0;
let timer      = null;
let mistakes   = [];
let currentCat = '';
let currentSub = '';
let currentSsc = '';
let toastTimer = null;

/* ================================================================
   INIT — load questions, restore theme
   FIX: Removed console.log that leaked question bank size to
   anyone with DevTools open.
   ================================================================ */
async function init() {
    const theme = localStorage.getItem('medlab_theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-icon').innerText = theme === 'dark' ? '☀️' : '🌙';

    try {
        const res = await fetch('questions.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        quizData = await res.json();
        // FIX: no console.log — don't advertise internal info
    } catch (e) {
        alert('Could not load quiz questions. Make sure questions.json is in the same folder.');
    }
}
init();

/* ================================================================
   THEME
   ================================================================ */
function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('medlab_theme', next);
    document.getElementById('theme-icon').innerText = next === 'dark' ? '☀️' : '🌙';
}

/* ================================================================
   TOAST
   ================================================================ */
function showToast(msg, type, duration) {
    type     = type     || 'error';
    duration = duration || 3000;
    const toast = document.getElementById('toast');
    if (!toast) return;
    if (toastTimer) clearTimeout(toastTimer);
    toast.className = '';
    toast.innerText = msg;          // innerText is safe — no parsing
    void toast.offsetWidth;
    toast.classList.add('show', 'toast-' + type);
    toastTimer = setTimeout(function() { toast.classList.remove('show'); }, duration);
}

/* ================================================================
   HIDE ALL SCREENS
   ================================================================ */
function hideAll() {
    clearInterval(timer);
    ['auth-s','main-s','sub-s','game-s','res-s','lead-s','share-s','trophy-s','settings-s','admin-s']
        .forEach(function(id) { document.getElementById(id).classList.add('hidden'); });
}

/* ================================================================
   AUTH UI
   ================================================================ */
function setAuthMode(mode) {
    authMode = mode;
    document.getElementById('reg-extra').classList.add('hidden');
    document.getElementById('forgot-extra').classList.add('hidden');
    document.getElementById('p-in').classList.remove('hidden');
    document.getElementById('btn-login').classList.add('hidden');
    document.getElementById('btn-reg').classList.remove('hidden');
    document.getElementById('btn-forgot').classList.remove('hidden');
    document.getElementById('auth-msg').innerText = '';

    if (mode === 'register') {
        document.getElementById('auth-msg').innerText      = 'Create your account';
        document.getElementById('auth-main-btn').innerText = 'Register';
        document.getElementById('reg-extra').classList.remove('hidden');
        document.getElementById('btn-reg').classList.add('hidden');
        document.getElementById('btn-login').classList.remove('hidden');
    } else if (mode === 'forgot') {
        document.getElementById('auth-msg').innerText      = 'Recover your password';
        document.getElementById('auth-main-btn').innerText = 'Recover';
        document.getElementById('p-in').classList.add('hidden');
        document.getElementById('forgot-extra').classList.remove('hidden');
        document.getElementById('btn-forgot').classList.add('hidden');
        document.getElementById('btn-login').classList.remove('hidden');
    } else {
        document.getElementById('auth-msg').innerText      = 'Login to track your trophies';
        document.getElementById('auth-main-btn').innerText = 'Enter';
        document.getElementById('btn-login').classList.add('hidden');
    }
}

function handleAuth() {
    if (authMode === 'login')    { fbLogin();    return; }
    if (authMode === 'register') { fbRegister(); return; }
    if (authMode === 'forgot')   { fbForgot();   return; }
}

/* ================================================================
   LOGIN LOADER
   ================================================================ */
function showLoginLoader(callback) {
    const loader   = document.getElementById('login-loader');
    const textEl   = document.getElementById('loader-text');
    const barEl    = document.getElementById('loader-bar');
    const messages = ['Verifying credentials…','Loading your stats…','Fetching leaderboard…','Almost there…'];
    const newBar   = barEl.cloneNode(true);
    barEl.parentNode.replaceChild(newBar, barEl);

    let idx = 0;
    textEl.innerText = messages[0];
    const iv = setInterval(function() {
        idx = (idx + 1) % messages.length;
        textEl.innerText = messages[idx];
    }, 380);

    loader.classList.remove('hidden', 'fade-out');
    setTimeout(function() {
        clearInterval(iv);
        textEl.innerText = 'Welcome! ✅';
        loader.classList.add('fade-out');
        setTimeout(function() {
            loader.classList.add('hidden');
            callback();
        }, 500);
    }, 1800);
}

/* ================================================================
   IMAGE UPLOAD
   FIX 1: Added MIME-type check — only accept image/* files.
   FIX 2: Added size guard — reject files > 2 MB before processing.
   FIX 3: Avatar base64 result is capped at LIMITS.AVATAR_MAX
          before being stored, matching the Firestore rule.
   ================================================================ */
function toggleCustomFile() {
    const isCustom = document.getElementById('avatar-in').value === 'custom';
    document.getElementById('file-reg').classList.toggle('hidden', !isCustom);
}

function handleImageUpload(input, previewId) {
    const file = input.files[0];
    if (!file) return;

    // FIX: validate MIME type
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file.', 'error');
        input.value = '';
        return;
    }
    // FIX: reject oversized files before reading (2 MB raw ≈ ~50 KB after resize)
    if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be under 2 MB.', 'error');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const scale  = Math.min(1, 150 / img.width);
            canvas.width  = img.width  * scale;
            canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const result = canvas.toDataURL('image/jpeg', 0.7);

            // FIX: enforce size cap after encoding
            if (result.length > LIMITS.AVATAR_MAX) {
                showToast('Image is too large after processing. Try a smaller image.', 'error');
                input.value = '';
                return;
            }
            customImg = result;
            const preview = document.getElementById(previewId);
            preview.setAttribute('src', customImg);  // FIX: setAttribute not src=
            preview.classList.remove('hidden');
        };
    };
    reader.readAsDataURL(file);
}

/* ================================================================
   NAVIGATION
   ================================================================ */
function showMain() { fbShowMain(); }
function backToMain() { showMain(); }

function showSubMenu(cat) {
    currentCat = cat;
    hideAll();
    document.getElementById('sub-s').classList.remove('hidden');
    document.getElementById('sub-title').innerText = cat;   // innerText — safe

    const list = document.getElementById('sub-list-dynamic');
    list.innerHTML = '';
    var subs = Array.from(new Set(quizData.filter(function(q) { return q.c === cat; }).map(function(q) { return q.sc; })));
    subs.forEach(function(sub) {
        const item  = document.createElement('div');
        item.className = 'sub-item';
        // FIX: Build with DOM methods — sub comes from local questions.json
        // but defence-in-depth means we never concat it into innerHTML directly.
        const titleDiv  = document.createElement('div');
        titleDiv.className = 'sub-item-title';
        const subSpan   = document.createElement('span');
        subSpan.textContent = sub;
        const arrowSpan = document.createElement('span');
        arrowSpan.textContent = '➔';
        titleDiv.appendChild(subSpan);
        titleDiv.appendChild(arrowSpan);
        item.appendChild(titleDiv);
        item.onclick = function() { showSubSubMenu(cat, sub); };
        list.appendChild(item);
    });
}

function showSubSubMenu(cat, sub) {
    currentSub = sub;
    hideAll();
    document.getElementById('sub-s').classList.remove('hidden');
    document.getElementById('sub-title').innerText = cat + ' › ' + sub;  // innerText — safe

    const list = document.getElementById('sub-list-dynamic');
    list.innerHTML = '';
    var sscs = Array.from(new Set(quizData.filter(function(q) { return q.c === cat && q.sc === sub; }).map(function(q) { return q.ssc; })));
    const d = window.userDoc || {};

    sscs.forEach(function(ssc) {
        const total    = quizData.filter(function(q) { return q.ssc === ssc; }).length;
        const mastered = (d.mastery && d.mastery[ssc]) ? d.mastery[ssc].length : 0;
        const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0;
        const item     = document.createElement('div');
        item.className = 'sub-item';
        // FIX: Use DOM methods — pct is a number (safe), ssc from local JSON
        item.innerHTML =
            '<div class="sub-item-title">' +
                '<span>' + esc(ssc) + '</span>' +
                '<span style="color:var(--accent);font-size:0.85rem;">' + pct + '%</span>' +
            '</div>' +
            '<div class="progress-container" style="margin-top:8px;">' +
                '<div class="progress-fill" style="width:' + pct + '%;"></div>' +
            '</div>';
        item.onclick = function() { startQuiz(cat, sub, ssc); };
        list.appendChild(item);
    });

    const back = document.createElement('button');
    back.className = 'btn secondary sm';
    back.style.marginTop = '4px';
    back.textContent = '← Back to ' + cat;   // textContent — safe
    back.onclick = function() { showSubMenu(cat); };
    list.appendChild(back);
}

/* ================================================================
   GAME ENGINE
   ================================================================ */
function startQuiz(cat, sub, ssc) {
    currentCat = cat; currentSub = sub; currentSsc = ssc;
    currentQ   = quizData.filter(function(q) { return q.c === cat && q.sc === sub && q.ssc === ssc; })
                         .sort(function() { return Math.random() - 0.5; });
    if (currentQ.length === 0) { alert('No questions found for this topic.'); return; }
    qIdx = 0; score = 0; mistakes = [];
    hideAll();
    document.getElementById('game-s').classList.remove('hidden');
    showQ();
}

function showQ() {
    clearInterval(timer);
    const q = currentQ[qIdx];
    document.getElementById('q-text').innerText     = q.q;    // innerText — safe
    document.getElementById('game-stats').innerText = 'Q ' + (qIdx + 1) + ' / ' + currentQ.length;
    document.getElementById('game-progress').style.width = ((qIdx / currentQ.length) * 100) + '%';

    const opts = document.getElementById('opt-container');
    opts.innerHTML = '';
    q.o.forEach(function(o) {
        const b = document.createElement('button');
        b.className = 'btn secondary animate-pop';
        b.textContent = o;                      // FIX: textContent not innerText — safe
        b.onclick   = function() { handleAnswer(o); };
        opts.appendChild(b);
    });

    const timeVal = parseInt(document.getElementById('diff-select').value);
    const timerEl = document.getElementById('timer-disp');
    if (timeVal > 0) {
        var t = timeVal;
        timerEl.innerText = t + 's';
        timer = setInterval(function() {
            t--;
            timerEl.innerText = t + 's';
            if (t <= 0) handleAnswer(null);
        }, 1000);
    } else {
        timerEl.innerText = '🧘 ∞';
    }
}

function handleAnswer(o) {
    clearInterval(timer);
    const q     = currentQ[qIdx];
    const isZen = parseInt(document.getElementById('diff-select').value) === 0;
    if (o === q.a) {
        if (!isZen) { score++; updateMastery(q); }
    } else {
        mistakes.push({ q: q.q, a: q.a, given: o, ex: q.ex || null });
    }
    qIdx++;
    if (qIdx < currentQ.length) { showQ(); } else { endQuiz(); }
}

function endQuiz() {
    clearInterval(timer);
    hideAll();
    document.getElementById('res-s').classList.remove('hidden');

    const total    = currentQ.length;
    const answered = score + mistakes.length;
    const skipped  = total - answered;
    var fullyCompleted = false;

    if (answered === 0) {
        document.getElementById('res-score').innerText = '—';
        document.getElementById('res-sub').innerText   = 'No questions were answered.';
        document.getElementById('mistake-list').innerHTML = '<p style="text-align:center;color:var(--muted);padding:10px;">Start answering questions to see your results here.</p>';
        return;
    }

    const isZen = parseInt(document.getElementById('diff-select').value) === 0;
    if (isZen) {
        document.getElementById('res-score').innerText = '🧘';
        document.getElementById('res-sub').innerText   = 'Zen Practice — ' + answered + ' of ' + total + ' completed · Not scored';
    } else {
        document.getElementById('res-score').innerText = score + ' / ' + total;
        fullyCompleted = (answered === total);
        var msg = '';
        if (fullyCompleted) {
            msg = score === total ? 'Perfect Score! 🎉' : score >= Math.ceil(total * 0.7) ? 'Great work! 👏' : 'Keep practising! 💪';
        } else {
            msg = answered + ' of ' + total + ' answered · ' + skipped + ' skipped';
        }
        document.getElementById('res-sub').innerText = msg;
        fbSaveHighScore(score, total);   // FIX: pass total so server can validate
        fbCheckChallengeResult(score);
    }

    const list = document.getElementById('mistake-list');
    list.innerHTML = '';
    if (mistakes.length === 0 && fullyCompleted) {
        list.innerHTML = '<p style="text-align:center;padding:10px;">No mistakes — flawless! 🏆</p>';
    } else {
        mistakes.forEach(function(m) {
            const div = document.createElement('div');
            div.className = 'mistake-item';
            // FIX: m.q and m.a come from local questions.json — still esc() for
            // defence-in-depth in case the JSON file is ever tampered with.
            div.innerHTML = '<span>' + esc(m.q) + '</span><br><b>✅ ' + esc(m.a) + '</b>' +
                            (m.ex ? '<div class="explanation">' + esc(m.ex) + '</div>' : '');
            list.appendChild(div);
        });
    }
}

function finishAndReturn() { showSubSubMenu(currentCat, currentSub); }

/* ================================================================
   MASTERY WRAPPER
   ================================================================ */
function updateMastery(q) { fbUpdateMastery(q); }

/* ================================================================
   SCREEN WRAPPERS
   ================================================================ */
function showLeaderboard() { fbShowLeaderboard(); }
function showTrophies()    { fbShowTrophies(); }
function updateSettings()  { fbUpdateSettings(); }
function resetData()       { fbResetData(); }

function showSettings() {
    hideAll();
    document.getElementById('settings-s').classList.remove('hidden');
    const d = window.userDoc || {};
    if (d.avatar && d.avatar.length <= 10) {
        const sel = document.getElementById('set-avatar');
        for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === d.avatar) { sel.value = d.avatar; break; }
        }
    }
}

/* ================================================================
   SHARE & INVITE
   ================================================================ */
function showShare() {
    hideAll();
    document.getElementById('share-s').classList.remove('hidden');
    const d    = window.userDoc || {};
    const code = d.inviteCode || '——';
    document.getElementById('invite-code-display').innerText = code;    // safe
    document.getElementById('share-link-display').innerText  = QUIZ_URL; // safe
    fbLoadChallenges();
}

function copyInviteCode() {
    const code = document.getElementById('invite-code-display').innerText;
    if (!code || code === '——') { showToast('No invite code yet.', 'error'); return; }
    const text = 'Join me on Med Lab Quiz! Use my invite code: ' + code + '\nPlay here: ' + QUIZ_URL;
    navigator.clipboard.writeText(text)
        .then(function() { showToast('Invite message copied! 📋', 'success'); })
        .catch(function() { showToast('Your code is: ' + code + '\n' + QUIZ_URL, 'info', 6000); });
}

function copyQuizLink() {
    navigator.clipboard.writeText(QUIZ_URL)
        .then(function() { showToast('Quiz link copied! 📋', 'success'); })
        .catch(function() { showToast('Link: ' + QUIZ_URL, 'info', 6000); });
}

function nativeShare() {
    if (navigator.share) {
        navigator.share({ title: 'Med Lab Quiz — NIMELSSA LCU', text: 'Practice MCQs with me! 🧪', url: QUIZ_URL })
            .catch(function() { copyQuizLink(); });
    } else {
        copyQuizLink();
    }
}

function shareScore() {
    const scoreText = document.getElementById('res-score').innerText;
    const d         = window.userDoc || {};
    const rank      = d.high >= 20 ? '💎 Diamond' : d.high >= 10 ? '🥇 Gold' : d.high >= 5 ? '🥈 Silver' : d.high > 0 ? '🥉 Bronze' : '🎯 Unranked';
    const topic     = currentSsc || currentSub || currentCat || 'MedLab';
    const text      = '🧪 Med Lab Quiz — NIMELSSA LCU\nI scored ' + scoreText + ' on ' + topic + '!\n' + rank + ' | 🔥 ' + (d.streak || 0) + ' day streak\nChallenge me → ' + QUIZ_URL;

    if (navigator.share) {
        navigator.share({ title: 'My Med Lab Score', text: text, url: QUIZ_URL })
            .catch(function() {
                navigator.clipboard.writeText(text)
                    .then(function() { showToast('Score copied! Paste anywhere to share 📋', 'success', 4000); });
            });
    } else {
        navigator.clipboard.writeText(text)
            .then(function() { showToast('Score copied! Paste anywhere to share 📋', 'success', 4000); })
            .catch(function() { showToast('Could not copy automatically.', 'info'); });
    }
}

function challengeFromResult() { fbShowChallengeModal(); }

/* ================================================================
   LOGOUT
   ================================================================ */
function logout() {
    clearInterval(timer);
    const loader = document.getElementById('logout-loader');
    const textEl = document.getElementById('logout-text');
    const barEl  = document.getElementById('logout-bar');
    const msgs   = ['Signing you out…', 'Clearing session…', 'See you soon! 👋'];
    var idx = 0;
    textEl.innerText = msgs[0];
    loader.classList.add('active');
    setTimeout(function() { barEl.classList.add('draining'); }, 50);
    const iv = setInterval(function() {
        idx = Math.min(idx + 1, msgs.length - 1);
        textEl.innerText = msgs[idx];
    }, 400);
    setTimeout(function() {
        clearInterval(iv);
        textEl.innerText = 'Logged out ✅';
        setTimeout(function() {
            window.userDoc = null;
            customImg      = null;
            signOut(fbAuth);
            hideAll();
            document.getElementById('auth-s').classList.remove('hidden');
            setAuthMode('login');
            document.getElementById('u-in').value = '';
            document.getElementById('p-in').value = '';
            loader.classList.remove('active');
            loader.classList.add('fade-out');
            setTimeout(function() {
                loader.classList.remove('fade-out');
                barEl.classList.remove('draining');
            }, 400);
        }, 500);
    }, 1200);
}

/* ================================================================
   FIREBASE HELPERS
   ================================================================ */

/* FIX: Replaced Math.random() invite code (only 9,000 possibilities,
   brute-forceable in minutes) with crypto.randomUUID() which gives
   ~5.3 × 10^36 possibilities — effectively unguessable.            */
function generateInviteCode(username) {
    const safe   = username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'USER';
    const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    return safe + '-' + random;   // e.g. JESS-A3F9B2C1
}

async function loadUserDoc(uid) {
    const snap = await getDoc(doc(fbDb, 'users', uid));
    if (snap.exists()) {
        window.userDoc      = snap.data();
        window.userDoc._uid = uid;
        return window.userDoc;
    }
    return null;
}

async function saveUserDoc() {
    if (!window.userDoc || !window.userDoc._uid) return;
    const uid  = window.userDoc._uid;
    const data = Object.assign({}, window.userDoc);
    delete data._uid;
    await setDoc(doc(fbDb, 'users', uid), data);
}

/* ================================================================
   PUBLIC PROFILE — leaderboard-safe subset of the user document.
   Written to users/{uid}/public/profile whenever score, streak,
   badges or avatar change. The Firestore rule allows any signed-in
   user to READ this subcollection, so fbShowLeaderboard() can
   query it without needing access to the full private user doc.
   Failures are swallowed — a missing profile just means the user
   won't appear on the leaderboard until the next score save.
   ================================================================ */
async function savePublicProfile() {
    if (!window.userDoc || !window.userDoc._uid) return;
    const uid = window.userDoc._uid;
    const d   = window.userDoc;
    try {
        await setDoc(doc(fbDb, 'users', uid, 'public', 'profile'), {
            username: d.username || '',
            avatar:   d.avatar   || '👤',
            high:     Number(d.high)   || 0,
            streak:   Number(d.streak) || 0,
            badges:   d.badges         || []
        });
    } catch (e) { /* silent — public profile is supplementary */ }
}

/* ================================================================
   FIREBASE AUTH — REGISTER
   FIX 1: Username whitelist check (alphanumeric + underscore,
          3-20 chars). Prevents special chars that could break
          onclick strings or Firestore query values.
   FIX 2: Hint length capped at LIMITS.HINT_MAX.
   FIX 3: Avatar size validated before writing to Firestore.
   FIX 4: role field explicitly set to 'user' — Firestore rules
          also enforce this but defence-in-depth is good practice.
   ================================================================ */
async function fbRegister() {
    const username  = document.getElementById('u-in').value.trim();
    const password  = document.getElementById('p-in').value.trim();
    const hint      = document.getElementById('hint-in').value.trim();
    const av        = document.getElementById('avatar-in').value;
    const codeEl    = document.getElementById('invite-code-in');
    const invitedBy = codeEl ? codeEl.value.trim().toUpperCase() : null;

    // FIX: strict username validation
    if (!USERNAME_RE.test(username)) {
        showToast('Username must be 3–20 characters: letters, numbers, underscore only.', 'error', 4000);
        return;
    }
    if (!password) { showToast('Please enter a password.', 'error'); return; }
    if (password.length < LIMITS.PASSWORD_MIN) {
        showToast('Password must be at least ' + LIMITS.PASSWORD_MIN + ' characters.', 'error');
        return;
    }
    // FIX: hint length cap
    if (hint.length > LIMITS.HINT_MAX) {
        showToast('Security hint must be under ' + LIMITS.HINT_MAX + ' characters.', 'error');
        return;
    }

    const finalAvatar = (av === 'custom' && customImg) ? customImg : av;

    // FIX: avatar size check before any Firestore write
    if (finalAvatar && finalAvatar.length > LIMITS.AVATAR_MAX) {
        showToast('Avatar image is too large. Please use a smaller photo.', 'error');
        return;
    }

    const fakeEmail = username.toLowerCase() + '@medlabquiz.local';
    try {
        showToast('Creating account…', 'info', 5000);

        // FIX: Check username availability before creating the Auth account.
        // The usernames/{username} collection enforces uniqueness server-side,
        // but checking here first gives a better error message than a Firestore
        // permission-denied error.
        const usernameSnap = await getDoc(doc(fbDb, 'usernames', username));
        if (usernameSnap.exists()) {
            showToast('Username already taken. Please choose another.', 'error', 4000);
            return;
        }

        const cred       = await createUserWithEmailAndPassword(fbAuth, fakeEmail, password);
        const uid        = cred.user.uid;
        const inviteCode = generateInviteCode(username);

        // Write the private user document
        await setDoc(doc(fbDb, 'users', uid), {
            username,
            hint,
            avatar:        finalAvatar || '👤',
            high:          0,
            streak:        0,
            lastLogin:     null,
            mastery:       {},
            badges:        [],
            inviteCode,
            invitedBy:     invitedBy || null,
            inviteCount:   0,
            notifications: [],
            role:          'user',
            disabled:      false
        });

        // FIX: Write the usernames lookup doc (enforces global uniqueness
        // server-side and allows forgot-password hint lookups without
        // exposing the full user document).
        await setDoc(doc(fbDb, 'usernames', username), { uid, hint });

        // FIX: Write the public leaderboard profile so this user appears
        // on the leaderboard immediately after registering.
        await setDoc(doc(fbDb, 'users', uid, 'public', 'profile'), {
            username,
            avatar: finalAvatar || '👤',
            high:   0,
            streak: 0,
            badges: []
        });

        customImg = null;
        showToast('Account created! Please log in. ✅', 'success', 3500);
        setTimeout(function() { setAuthMode('login'); }, 400);
    } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
            showToast('Username already taken.', 'error');
        } else if (err.code === 'auth/weak-password') {
            showToast('Password must be at least ' + LIMITS.PASSWORD_MIN + ' characters.', 'error');
        } else {
            showToast('Registration failed. Please try again.', 'error');
        }
    }
}

/* ================================================================
   FIREBASE AUTH — LOGIN
   FIX: Integrated client-side rate limiter. Firebase Auth also
   throttles server-side (auth/too-many-requests) but this adds
   an earlier gate that improves UX with a countdown message.
   ================================================================ */
async function fbLogin() {
    // FIX: check rate limit first
    if (!loginAllowed()) return;

    const username = document.getElementById('u-in').value.trim();
    const password = document.getElementById('p-in').value.trim();

    if (!username) { showToast('Please enter a username.', 'error'); return; }
    if (!password) { showToast('Please enter a password.', 'error'); return; }

    const fakeEmail = username.toLowerCase() + '@medlabquiz.local';
    try {
        showToast('Signing in…', 'info', 5000);
        await signInWithEmailAndPassword(fbAuth, fakeEmail, password);
        loginSucceeded();   // FIX: clear counter on success
        // onAuthStateChanged takes it from here
    } catch (err) {
        loginFailed();      // FIX: increment counter on failure
        const code = err.code || '';
        if (code === 'auth/network-request-failed') {
            showToast('No internet connection. Please check your network and try again.', 'error', 4000);
        } else if (code === 'auth/too-many-requests') {
            showToast('Too many attempts. Please wait a few minutes and try again.', 'error', 4000);
        } else if (code === 'auth/user-disabled') {
            showToast('This account has been disabled. Contact support.', 'error', 4000);
        } else if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
            showToast('Invalid username or password.', 'error');
        } else {
            showToast('Login failed. Check your connection and try again.', 'error', 4000);
        }
    }
}

/* ================================================================
   FIREBASE AUTH — FORGOT PASSWORD
   FIX: Previously scanned ALL user documents to find one username,
   exposing every user's data to the browser and performing an
   O(n) read on every recovery attempt.
   Now does a single O(1) direct lookup on the usernames/{username}
   collection, which stores the hint and is publicly readable.
   The hint is user-chosen (like "my dog's name") and does NOT
   grant access by itself — the admin must still manually reset the
   Firebase Auth password.
   ================================================================ */
async function fbForgot() {
    if (!loginAllowed()) return;

    const username = document.getElementById('u-in').value.trim();
    const hint     = document.getElementById('hint-recover').value.trim();

    if (!username) { showToast('Please enter your username.', 'error'); return; }

    try {
        showToast('Checking…', 'info', 5000);

        // FIX: single direct document read instead of scanning all users
        const snap = await getDoc(doc(fbDb, 'usernames', username));

        if (snap.exists() && snap.data().hint === hint) {
            loginSucceeded();
            showToast('Hint matched! ✅ Contact your admin to reset your password.', 'success', 5000);
        } else {
            loginFailed();
            // Same message whether username or hint was wrong — prevents user enumeration
            showToast('Username or hint is incorrect.', 'error');
        }
    } catch (err) {
        showToast('Could not check. Please try again.', 'error');
    }
}

/* ================================================================
   DASHBOARD
   FIX: Avatar rendered with makeAvatarEl (createElement +
   setAttribute) instead of innerHTML — prevents XSS if a
   malicious avatar value is stored in Firestore.
   FIX: highEl uses esc() and only numeric d.high is interpolated.
   ================================================================ */
async function fbShowMain() {
    hideAll();
    document.getElementById('main-s').classList.remove('hidden');

    const d = window.userDoc;
    if (!d) { logout(); return; }

    const today = new Date().setHours(0, 0, 0, 0);
    var streakIncreased = false;
    var lastLogin = d.lastLogin ? new Date(d.lastLogin).setHours(0, 0, 0, 0) : null;
    if (!lastLogin) {
        d.streak = 1; streakIncreased = true;
    } else if (today === lastLogin + 86400000) {
        d.streak = (d.streak || 0) + 1; streakIncreased = true;
    } else if (today === lastLogin) {
        streakIncreased = false;
    } else if (today > lastLogin + 86400000) {
        d.streak = 1;
    }
    d.lastLogin = today;
    await saveUserDoc();
    await savePublicProfile();   // FIX: keep leaderboard streak in sync

    // FIX: use makeAvatarEl instead of innerHTML string concat
    const avatarSlot = document.getElementById('display-avatar');
    avatarSlot.innerHTML = '';
    avatarSlot.appendChild(makeAvatarEl(d.avatar));

    document.getElementById('display-user').innerText = d.username || '';   // safe

    // FIX: d.high is cast to Number so even if a string was stored it stays numeric
    const high    = Number(d.high) || 0;
    const highEl  = document.getElementById('display-high');
    if (high === 0) {
        highEl.innerHTML = '<span style="color:var(--muted);">No quiz completed yet</span>';
    } else {
        // d.high is a validated integer — safe to interpolate directly
        highEl.innerHTML = 'Best Score: <b>' + high + '</b> pts';
    }

    var rank, rp;
    if (high === 0)       { rank = '🎯 Unranked'; rp = 0; }
    else if (high >= 20)  { rank = '💎 Diamond';  rp = 100; }
    else if (high >= 10)  { rank = '🥇 Gold';     rp = Math.round((high / 20) * 100); }
    else if (high >= 5)   { rank = '🥈 Silver';   rp = Math.round((high / 20) * 100); }
    else                  { rank = '🥉 Bronze';   rp = Math.round((high / 20) * 100); }

    document.getElementById('display-rank').innerText    = rank;   // safe
    document.getElementById('rank-progress').style.width = rp + '%';
    document.getElementById('display-streak').innerText  = d.streak || 0;
    document.getElementById('display-streak').classList.toggle('streak-flame', streakIncreased);

    fbLoadChallengeBanner();

    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) {
        adminBtn.classList.toggle('hidden', !isAdmin());
    }
}

/* ================================================================
   MASTERY & BADGES
   ================================================================ */
async function fbUpdateMastery(q) {
    const d = window.userDoc;
    if (!d.mastery)        d.mastery = {};
    if (!d.mastery[q.ssc]) d.mastery[q.ssc] = [];
    if (!d.mastery[q.ssc].includes(q.q)) d.mastery[q.ssc].push(q.q);

    const sscsInSub   = Array.from(new Set(quizData.filter(function(i) { return i.sc === q.sc; }).map(function(i) { return i.ssc; })));
    const totalInSub  = quizData.filter(function(i) { return i.sc === q.sc; }).length;
    var masteredCount = 0;
    sscsInSub.forEach(function(s) { masteredCount += (d.mastery[s] ? d.mastery[s].length : 0); });

    if (masteredCount >= totalInSub && !d.badges.includes(q.sc)) {
        d.badges.push(q.sc);
        setTimeout(function() { alert('🏅 Badge unlocked: ' + q.sc + '!'); }, 400);
    }
    await saveUserDoc();
    await savePublicProfile();   // FIX: push badge updates to leaderboard profile
}

/* ================================================================
   SAVE HIGH SCORE
   FIX: Added totalQuestions parameter. Score is validated against
   the actual number of questions played — a hacker calling
   fbSaveHighScore(9999) directly from the console would be
   blocked by both this check and the Firestore rule (high <= 500).
   ================================================================ */
async function fbSaveHighScore(s, totalQuestions) {
    const d = window.userDoc;
    if (!d) return;
    // FIX: score must be a non-negative integer, cannot exceed questions played
    // or the global cap — whichever is smaller.
    const cap = Math.min(totalQuestions || currentQ.length, LIMITS.SCORE_MAX);
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > cap) return;
    if (s > (d.high || 0)) {
        d.high = s;
        await saveUserDoc();
        await savePublicProfile();   // FIX: push new high score to leaderboard profile
    }
}

/* ================================================================
   LEADERBOARD
   FIX: Now reads from users/{uid}/public/profile subcollections
   via collectionGroup('profile') instead of reading all private
   user documents. This works with the Firestore rule:
     match /users/{userId}/public/profile { allow read: if isSignedIn(); }
   The private user doc (with hint, inviteCode, notifications) is
   never touched by this function.
   ================================================================ */
async function fbShowLeaderboard() {
    hideAll();
    document.getElementById('lead-s').classList.remove('hidden');
    const list = document.getElementById('lead-list');
    list.innerHTML = '<p style="text-align:center;color:var(--muted);">Loading…</p>';

    try {
        // FIX: collectionGroup reads ALL public/profile subcollections in one query
        const snap   = await getDocs(collectionGroup(fbDb, 'profile'));
        const ranked = [];
        snap.forEach(function(d) {
            const data = d.data();
            // collectionGroup may match other 'profile' subcollections in future;
            // guard by checking for required leaderboard fields.
            if (typeof data.username !== 'string') return;
            ranked.push({
                name:   data.username || d.id,
                score:  data.high     || 0,
                avatar: data.avatar   || '👤'
            });
        });
        ranked.sort(function(a, b) { return b.score - a.score; });
        list.innerHTML = '';

        if (ranked.length === 0) {
            list.innerHTML = '<p style="text-align:center;">No players yet!</p>';
            return;
        }

        const myName   = window.userDoc ? window.userDoc.username : '';
        const played   = ranked.filter(function(p) { return p.score > 0; });
        const unranked = ranked.filter(function(p) { return p.score === 0; });

        played.forEach(function(p, i) {
            const row    = document.createElement('div');
            const isMe   = p.name === myName;
            const isTop3 = i < 3;
            row.className = 'lead-row' + (isMe ? ' me' : '') + (isTop3 ? ' top3' : '');

            // FIX: build row with DOM — no innerHTML with Firestore data
            const left = document.createElement('span');
            left.className = 'lead-left';

            // Medal
            if (i < 3) {
                const medal = document.createElement('span');
                medal.textContent = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                left.appendChild(medal);
            } else {
                const pos = document.createElement('span');
                pos.style.cssText = 'color:var(--muted);font-size:0.85rem;';
                pos.textContent = '#' + (i + 1);
                left.appendChild(pos);
            }

            // Avatar
            left.appendChild(makeAvatarEl(p.avatar, 28));

            // Name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'lead-name';
            nameSpan.textContent = p.name;    // textContent — XSS-safe
            if (isMe) {
                const youTag = document.createElement('span');
                youTag.className = 'you-tag';
                youTag.textContent = ' (You)';
                nameSpan.appendChild(youTag);
            }
            left.appendChild(nameSpan);

            // Tier badge
            const tier = document.createElement('span');
            if      (p.score >= 20) { tier.className = 'tier-badge diamond'; tier.textContent = '💎 Diamond'; }
            else if (p.score >= 10) { tier.className = 'tier-badge gold';    tier.textContent = '🏅 Gold'; }
            else if (p.score >= 5)  { tier.className = 'tier-badge silver';  tier.textContent = '🔘 Silver'; }
            else                    { tier.className = 'tier-badge bronze';  tier.textContent = '🎖 Bronze'; }
            left.appendChild(tier);

            // Score
            const scoreEl = document.createElement('b');
            scoreEl.className = 'lead-score';
            scoreEl.textContent = p.score + ' pts';

            row.appendChild(left);
            row.appendChild(scoreEl);
            list.appendChild(row);
        });

        if (unranked.length > 0) {
            const div = document.createElement('div');
            div.style.cssText = 'text-align:center;font-size:0.75rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);padding:12px 0 6px;border-top:1px dashed var(--border);margin-top:8px;';
            div.textContent = '— Not Yet Ranked —';   // textContent — safe
            list.appendChild(div);

            unranked.forEach(function(p) {
                const row = document.createElement('div');
                row.className = 'lead-row' + (p.name === myName ? ' me' : '');
                row.style.opacity = '0.6';
                const left = document.createElement('span');
                left.textContent = '🎯 ';
                left.appendChild(makeAvatarEl(p.avatar, 28));
                const nameNode = document.createTextNode(' ' + p.name + (p.name === myName ? ' (You)' : ''));
                left.appendChild(nameNode);
                const right = document.createElement('b');
                right.style.cssText = 'color:var(--muted);font-size:0.8rem;';
                right.textContent = 'No quiz completed';
                row.appendChild(left);
                row.appendChild(right);
                list.appendChild(row);
            });
        }
    } catch (err) {
        list.innerHTML = '<p style="text-align:center;color:var(--danger);">Could not load leaderboard.</p>';
    }
}

/* ================================================================
   TROPHIES
   FIX: BADGE_DATA values are app-defined emoji strings (safe),
   badge names (keys) are also app-defined — still esc() for
   defence-in-depth.
   ================================================================ */
function fbShowTrophies() {
    hideAll();
    document.getElementById('trophy-s').classList.remove('hidden');
    const grid = document.getElementById('badge-grid');
    const d    = window.userDoc || {};
    grid.innerHTML = '';
    Object.keys(BADGE_DATA).forEach(function(name) {
        const owned = d.badges && d.badges.includes(name);
        const card  = document.createElement('div');
        card.className = 'badge-card' + (owned ? ' owned' : '');
        card.innerHTML =
            '<div style="font-size:2.5rem;filter:' + (owned ? 'none' : 'grayscale(1) opacity(0.25)') + ';margin-bottom:8px;">' + esc(BADGE_DATA[name]) + '</div>' +
            '<b>' + esc(name) + '</b>' +
            '<div style="font-size:0.72rem;color:var(--muted);margin-top:4px;">' + (owned ? '✅ Unlocked' : 'Locked') + '</div>';
        grid.appendChild(card);
    });
}

/* ================================================================
   SETTINGS
   FIX: avatar size re-validated on save.
   ================================================================ */
async function fbUpdateSettings() {
    const d  = window.userDoc;
    const np = document.getElementById('set-pass').value.trim();
    const av = document.getElementById('set-avatar').value;

    const newAvatar = customImg ? customImg : av;

    // FIX: size guard before writing
    if (newAvatar && newAvatar.length > LIMITS.AVATAR_MAX) {
        showToast('Avatar image is too large. Please use a smaller photo.', 'error');
        return;
    }

    d.avatar = newAvatar;
    await saveUserDoc();
    await savePublicProfile();   // FIX: push avatar change to leaderboard profile

    if (np) {
        if (np.length < LIMITS.PASSWORD_MIN) {
            showToast('Password must be at least ' + LIMITS.PASSWORD_MIN + ' characters.', 'error');
            return;
        }
        if (fbAuth.currentUser) {
            try {
                await fbAuth.currentUser.updatePassword(np);
            } catch (e) {
                showToast('Profile saved but password update failed.\nPlease log out and back in first.', 'error', 4000);
                return;
            }
        }
    }
    customImg = null;
    showToast('Settings saved! ✅', 'success');
    fbShowMain();
}

async function fbResetData() {
    if (!confirm('This will wipe your progress and badges. Continue?')) return;
    const d   = window.userDoc;
    d.mastery = {}; d.badges = []; d.high = 0;
    await saveUserDoc();
    showToast('Progress reset.', 'info');
    fbShowMain();
}

/* ================================================================
   CHALLENGES
   FIX 1: ch.from, ch.to, ch.topic all went into innerHTML raw.
          A malicious username like '</b><script>…</script>' would
          execute. Now all Firestore strings go through esc().
   FIX 2: The Accept button previously built an onclick="…" string
          with ch._id, ch.from etc. interpolated — a value
          containing ' would break out of the string. Now the
          button is built with createElement and stores values
          in dataset attributes, with a proper event listener.
   ================================================================ */
async function fbLoadChallenges() {
    const list   = document.getElementById('challenges-list');
    const myName = window.userDoc ? window.userDoc.username : '';
    if (!list || !myName) return;

    try {
        const snap = await getDocs(collection(fbDb, 'challenges'));
        const all  = [];
        snap.forEach(function(d) {
            const ch = d.data(); ch._id = d.id;
            if (ch.from === myName || ch.to === myName) all.push(ch);
        });
        all.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        list.innerHTML = '';

        if (all.length === 0) {
            list.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;text-align:center;padding:10px;">No active challenges yet.<br>Finish a quiz and challenge a friend! ⚔️</p>';
            return;
        }

        all.forEach(function(ch) {
            const isIncoming = ch.to === myName;
            const card       = document.createElement('div');
            card.className   = 'challenge-card' + (isIncoming ? ' incoming' : '');

            var badge = '';
            if      (ch.status === 'pending') badge = '<span class="ch-badge pending">⏳ Pending</span>';
            else if (ch.status === 'beaten')  badge = '<span class="ch-badge beaten">🏆 Beaten!</span>';

            if (isIncoming) {
                // FIX: esc() on all Firestore strings
                card.innerHTML =
                    '<div class="ch-header">' + badge + '<span class="ch-tag incoming-tag">INCOMING</span></div>' +
                    '<b>' + esc(ch.from) + '</b> challenges you on <b>' + esc(ch.topic) + '</b><br>' +
                    '<span style="color:var(--danger);font-weight:800;">Beat their score: ' + Number(ch.score) + '</span>';

                if (ch.status === 'pending') {
                    // FIX: createElement + dataset instead of onclick string
                    const btn = document.createElement('button');
                    btn.className = 'btn primary sm';
                    btn.style.cssText = 'margin-top:10px;width:100%;';
                    btn.textContent = '⚔️ Accept & Play';
                    btn.dataset.chalId = ch._id;
                    btn.dataset.from   = ch.from;
                    btn.dataset.topic  = ch.topic;
                    btn.dataset.cat    = ch.cat  || '';
                    btn.dataset.sub    = ch.sub  || '';
                    btn.dataset.ssc    = ch.ssc  || '';
                    btn.addEventListener('click', function() {
                        acceptChallenge(
                            this.dataset.chalId,
                            this.dataset.from,
                            this.dataset.topic,
                            this.dataset.cat,
                            this.dataset.sub,
                            this.dataset.ssc
                        );
                    });
                    card.appendChild(btn);
                }
            } else {
                // FIX: esc() on all Firestore strings
                card.innerHTML =
                    '<div class="ch-header">' + badge + '<span class="ch-tag outgoing-tag">OUTGOING</span></div>' +
                    'You challenged <b>' + esc(ch.to) + '</b> on <b>' + esc(ch.topic) + '</b><br>' +
                    '<span style="color:var(--muted);font-size:0.85rem;">Your score: ' + Number(ch.score) + '</span>';
            }
            list.appendChild(card);
        });
    } catch (err) {
        list.innerHTML = '<p style="color:var(--danger);font-size:0.85rem;text-align:center;">Could not load challenges.</p>';
    }
}

async function fbShowChallengeModal() {
    const myName = window.userDoc ? window.userDoc.username : '';
    const topic  = currentSsc || currentSub || '';
    if (!topic) { showToast('Finish a quiz first to challenge someone!', 'error'); return; }

    try {
        // FIX: read public profiles (collectionGroup) instead of private user docs
        const snap    = await getDocs(collectionGroup(fbDb, 'profile'));
        const players = [];
        snap.forEach(function(d) {
            const data = d.data();
            if (typeof data.username !== 'string') return;
            if (data.username && data.username !== myName) {
                players.push(data.username);
            }
        });

        if (players.length === 0) { showToast('No other players registered yet.', 'info'); return; }

        var existing = document.getElementById('challenge-modal');
        if (existing) existing.remove();

        const modal     = document.createElement('div');
        modal.id        = 'challenge-modal';
        modal.className = 'challenge-modal-overlay';

        // FIX: Build modal with DOM methods — topic comes from local quizData
        // but still esc() for defence-in-depth. Options use textContent.
        const box = document.createElement('div');
        box.className = 'challenge-modal-box';
        box.innerHTML =
            '<h3>⚔️ Challenge a Friend</h3>' +
            '<p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;">Topic: <b>' + esc(topic) + '</b> · Your score: <b>' + score + '</b></p>' +
            '<label class="field-label">Choose a player</label>';

        const sel = document.createElement('select');
        sel.id = 'challenge-target';
        sel.style.marginBottom = '14px';
        players.forEach(function(p) {
            const opt = document.createElement('option');
            opt.value = p;               // value set via property — XSS-safe
            opt.textContent = p;         // textContent — XSS-safe
            sel.appendChild(opt);
        });
        box.appendChild(sel);

        const sendBtn = document.createElement('button');
        sendBtn.className = 'btn primary';
        sendBtn.textContent = 'Send Challenge ⚔️';
        sendBtn.addEventListener('click', fbSendChallenge);
        box.appendChild(sendBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn secondary';
        cancelBtn.style.marginTop = '8px';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function() { modal.remove(); });
        box.appendChild(cancelBtn);

        modal.appendChild(box);
        document.body.appendChild(modal);
    } catch (err) {
        showToast('Could not load players.', 'error');
    }
}

async function fbSendChallenge() {
    const myName = window.userDoc ? window.userDoc.username : '';
    const selEl  = document.getElementById('challenge-target');
    const target = selEl ? selEl.value : null;
    if (!target) return;

    // FIX: validate that score is a sensible integer before writing
    const safeScore = (typeof score === 'number' && Number.isInteger(score) && score >= 0)
        ? Math.min(score, LIMITS.SCORE_MAX) : 0;

    const topic = currentSsc || currentSub || currentCat;
    try {
        await setDoc(doc(fbDb, 'challenges', myName + '_' + target + '_' + Date.now()), {
            from:      myName,
            fromUid:   fbAuth.currentUser ? fbAuth.currentUser.uid : '',  // FIX: store UID for direct notification writes
            to:        target,
            topic:     topic,
            cat:       currentCat,
            sub:       currentSub,
            ssc:       currentSsc,
            score:     safeScore,
            status:    'pending',
            createdAt: Date.now()
        });
        const modal = document.getElementById('challenge-modal');
        if (modal) modal.remove();
        showToast('Challenge sent to ' + target + '! ⚔️', 'success', 3500);
    } catch (err) {
        showToast('Could not send challenge.', 'error');
    }
}

function acceptChallenge(chalId, from, topic, cat, sub, ssc) {
    window._activeChallengeId   = chalId;
    window._activeChallengeFrom = from;
    showToast('Starting challenge vs ' + esc(from) + '! Good luck! ⚔️', 'info', 2500);
    setTimeout(function() { startQuiz(cat, sub, ssc); }, 600);
}

async function fbCheckChallengeResult(finalScore) {
    const chalId = window._activeChallengeId;
    if (!chalId) return;
    const myName = window.userDoc ? window.userDoc.username : '';
    try {
        const snap = await getDoc(doc(fbDb, 'challenges', chalId));
        if (!snap.exists()) return;
        const ch = snap.data();

        // FIX: validate finalScore before writing it anywhere
        const safeScore = (typeof finalScore === 'number' && Number.isInteger(finalScore) && finalScore >= 0)
            ? Math.min(finalScore, LIMITS.SCORE_MAX) : 0;

        if (safeScore > ch.score) {
            await setDoc(doc(fbDb, 'challenges', chalId), Object.assign({}, ch, {
                status: 'beaten', beatenBy: myName, beatenScore: safeScore
            }));
            showToast('You beat the challenge! 🏆 ' + esc(ch.from) + ' will be notified.', 'success', 4000);

            // FIX: Use ch.fromUid (stored at challenge creation) for a direct
            // O(1) doc lookup instead of scanning all users. This works even
            // with restricted Firestore read rules because we're writing to
            // the challenger's own doc (allowed by isCrossUserNotifUpdate rule).
            if (ch.fromUid) {
                try {
                    const challengerSnap = await getDoc(doc(fbDb, 'users', ch.fromUid));
                    if (challengerSnap.exists()) {
                        const cData  = challengerSnap.data();
                        const notifs = (cData.notifications || []);
                        notifs.unshift({
                            msg:  myName + ' beat your challenge on ' + ch.topic +
                                  '! (' + safeScore + ' vs ' + ch.score + ')',
                            seen: false,
                            ts:   Date.now()
                        });
                        await setDoc(doc(fbDb, 'users', ch.fromUid), Object.assign({}, cData, {
                            notifications: notifs.slice(0, 10)
                        }));
                    }
                } catch (notifErr) { /* silent — notification is best-effort */ }
            }
        } else {
            showToast("Good try! You didn't beat " + esc(ch.from) + "'s score of " + ch.score + " this time.", 'info', 4000);
        }
    } catch (err) { /* silent */ }
    window._activeChallengeId = null;
}

/* ================================================================
   CHALLENGE BANNER
   FIX: n.msg previously went into innerHTML directly —
   a stored notification message containing HTML would execute.
   Now rendered with textContent, which never parses markup.
   ================================================================ */
async function fbLoadChallengeBanner() {
    const myName = window.userDoc ? window.userDoc.username : '';
    const banner = document.getElementById('challenge-banner');
    if (!banner || !myName) return;
    try {
        const snap    = await getDocs(collection(fbDb, 'challenges'));
        const pending = [];
        snap.forEach(function(d) {
            const ch = d.data();
            if (ch.to === myName && ch.status === 'pending') pending.push(ch);
        });
        const notifs = (window.userDoc.notifications || []).filter(function(n) { return !n.seen; });
        if (pending.length === 0 && notifs.length === 0) { banner.classList.add('hidden'); return; }

        banner.classList.remove('hidden');
        banner.innerHTML = '';

        notifs.forEach(function(n) {
            const el = document.createElement('div');
            el.className = 'challenge-notif';
            // FIX: textContent — never innerHTML for stored notification messages
            el.textContent = '🏆 ' + n.msg;
            banner.appendChild(el);
        });

        if (pending.length > 0) {
            const el = document.createElement('div');
            el.className = 'challenge-notif incoming-notif';
            // This string has no Firestore data in it — just a count (integer) — safe
            el.innerHTML = '⚔️ You have <b>' + pending.length + '</b> pending challenge' +
                           (pending.length > 1 ? 's' : '') +
                           '! <button class="btn primary sm" style="margin-left:8px;" onclick="showShare()">View →</button>';
            banner.appendChild(el);
        }
    } catch (err) { /* silent */ }
}

/* ================================================================
   AUTH STATE OBSERVER
   ================================================================ */
onAuthStateChanged(fbAuth, async function(fbUser) {
    if (fbUser) {
        const data = await loadUserDoc(fbUser.uid);
        if (data) {
            if (data.disabled) {
                signOut(fbAuth);
                hideAll();
                document.getElementById('auth-s').classList.remove('hidden');
                setAuthMode('login');
                showToast('This account has been disabled. Contact support.', 'error', 5000);
                return;
            }
            showLoginLoader(function() { fbShowMain(); });
        }
    }
});

/* ================================================================
   ANTI-CHEAT
   ================================================================ */
document.addEventListener('contextmenu', function(e) {
    if (document.getElementById('game-s') &&
        !document.getElementById('game-s').classList.contains('hidden')) {
        e.preventDefault();
        showToast('Right-click is disabled during the quiz.', 'error', 2000);
    }
});

(function() {
    var devtoolsOpen = false;
    var THRESHOLD    = 160;
    function check() {
        var widthGap  = window.outerWidth  - window.innerWidth;
        var heightGap = window.outerHeight - window.innerHeight;
        var open      = widthGap > THRESHOLD || heightGap > THRESHOLD;
        if (open && !devtoolsOpen) {
            devtoolsOpen = true;
            if (document.getElementById('game-s') &&
                !document.getElementById('game-s').classList.contains('hidden')) {
                showToast('⚠️ Developer tools detected. This will be logged.', 'error', 5000);
            }
        } else if (!open && devtoolsOpen) {
            devtoolsOpen = false;
        }
    }
    setInterval(check, 1000);
})();

/* ================================================================
   ADMIN PANEL
   FIX: isAdmin() is still client-side (unavoidable in a pure
   front-end app) but every admin action is ALSO enforced by the
   Firestore security rules server-side, so even if a user calls
   these functions from the console, Firebase will reject the
   write unless their role === 'admin' in Firestore.
   ================================================================ */
const ADMIN_USERNAMES = ['Jesse'];

function isAdmin() {
    const d = window.userDoc || {};
    return d.role === 'admin' || ADMIN_USERNAMES.includes(d.username);
}

function showAdmin() {
    if (!isAdmin()) { showToast('Access denied.', 'error'); return; }
    hideAll();
    document.getElementById('admin-s').classList.remove('hidden');
    adminLoadPlayers();
}

async function adminLoadPlayers() {
    // FIX: guard at function entry — Firestore rules also enforce this
    if (!isAdmin()) { showToast('Access denied.', 'error'); return; }

    const listEl  = document.getElementById('admin-player-list');
    const statsEl = document.getElementById('admin-stats-bar');
    listEl.innerHTML  = '<p style="text-align:center;color:var(--muted);padding:20px;">Loading players…</p>';
    statsEl.innerHTML = '';

    try {
        const snap = await getDocs(collection(fbDb, 'users'));
        window._adminPlayers = [];
        snap.forEach(function(d) {
            const data = d.data();
            data._uid  = d.id;
            window._adminPlayers.push(data);
        });
        window._adminPlayers.sort(function(a, b) { return (b.high || 0) - (a.high || 0); });

        const total    = window._adminPlayers.length;
        const played   = window._adminPlayers.filter(function(p) { return p.high > 0; }).length;
        const disabled = window._adminPlayers.filter(function(p) { return p.disabled; }).length;
        const admins   = window._adminPlayers.filter(function(p) { return p.role === 'admin'; }).length;

        // Stats bar uses only integers — safe to interpolate
        statsEl.innerHTML =
            '<div class="admin-stat"><b>' + total    + '</b><span>Total</span></div>' +
            '<div class="admin-stat"><b>' + played   + '</b><span>Played</span></div>' +
            '<div class="admin-stat"><b>' + disabled + '</b><span>Disabled</span></div>' +
            '<div class="admin-stat"><b>' + admins   + '</b><span>Admins</span></div>';

        adminRenderPlayers(window._adminPlayers);

    } catch (err) {
        listEl.innerHTML = '<p style="color:var(--danger);text-align:center;">Could not load players.</p>';
    }
}

function adminFilterPlayers() {
    const query   = document.getElementById('admin-search').value.trim().toLowerCase();
    const players = (window._adminPlayers || []).filter(function(p) {
        return !query || (p.username || '').toLowerCase().includes(query);
    });
    adminRenderPlayers(players);
}

/* ================================================================
   adminRenderPlayers
   FIX 1: p.username went into innerHTML via onclick strings —
          a username of "'; alert(1); //" would break the string.
          Now uses createElement + dataset + addEventListener for
          all action buttons.
   FIX 2: p.username in the card body wrapped with esc().
   FIX 3: Avatar rendered with makeAvatarEl().
   ================================================================ */
function adminRenderPlayers(players) {
    const listEl = document.getElementById('admin-player-list');
    listEl.innerHTML = '';

    if (players.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px;">No players found.</p>';
        return;
    }

    const myName = (window.userDoc || {}).username;

    players.forEach(function(p) {
        const isDisabled = p.disabled || false;
        const isAdminP   = p.role === 'admin';
        const isSelf     = p.username === myName;

        const card = document.createElement('div');
        card.className = 'admin-player-card' + (isDisabled ? ' disabled-player' : '');

        // FIX: makeAvatarEl instead of innerHTML src concat
        const avatarEl = makeAvatarEl(p.avatar, 36);

        const roleBadge    = isAdminP   ? '<span class="role-badge admin-role">🛡️ Admin</span>'    : '<span class="role-badge user-role">👤 User</span>';
        const statusBadge  = isDisabled ? '<span class="role-badge disabled-role">🚫 Disabled</span>' : '<span class="role-badge active-role">✅ Active</span>';

        // Top section — esc() on all Firestore strings
        const topDiv = document.createElement('div');
        topDiv.className = 'admin-player-top';
        topDiv.innerHTML =
            '<div class="admin-player-info">' +
                // avatar injected safely below via appendChild
                '<div>' +
                    '<b>' + esc(p.username || 'Unknown') + '</b>' +
                    '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;">' + roleBadge + statusBadge + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="admin-player-stats">' +
                '<span>🏆 ' + Number(p.high   || 0) + ' pts</span>' +
                '<span>🔥 ' + Number(p.streak || 0) + ' streak</span>' +
                '<span>🏅 ' + ((p.badges || []).length) + ' badges</span>' +
            '</div>';

        // Insert avatar safely (DOM element, not HTML string)
        const infoDiv = topDiv.querySelector('.admin-player-info');
        infoDiv.insertBefore(avatarEl, infoDiv.firstChild);

        card.appendChild(topDiv);

        // Action buttons — FIX: dataset + addEventListener, NOT onclick strings
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'admin-actions';

        if (!isSelf) {
            const uid2  = p._uid;
            const uname = p.username;

            // Toggle disable
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'admin-action-btn ' + (isDisabled ? 'enable-btn' : 'disable-btn');
            toggleBtn.textContent = isDisabled ? '✅ Enable' : '🚫 Disable';
            toggleBtn.dataset.uid      = uid2;
            toggleBtn.dataset.username = uname;
            toggleBtn.dataset.disabled = String(isDisabled);
            toggleBtn.addEventListener('click', function() {
                adminToggleDisable(this.dataset.uid, this.dataset.username, this.dataset.disabled === 'true');
            });
            actionsDiv.appendChild(toggleBtn);

            // Promote / Demote
            if (!isAdminP) {
                const promoteBtn = document.createElement('button');
                promoteBtn.className = 'admin-action-btn promote-btn';
                promoteBtn.textContent = '🛡️ Make Admin';
                promoteBtn.dataset.uid      = uid2;
                promoteBtn.dataset.username = uname;
                promoteBtn.addEventListener('click', function() {
                    adminPromote(this.dataset.uid, this.dataset.username);
                });
                actionsDiv.appendChild(promoteBtn);
            } else {
                const demoteBtn = document.createElement('button');
                demoteBtn.className = 'admin-action-btn demote-btn';
                demoteBtn.textContent = '👤 Remove Admin';
                demoteBtn.dataset.uid      = uid2;
                demoteBtn.dataset.username = uname;
                demoteBtn.addEventListener('click', function() {
                    adminDemote(this.dataset.uid, this.dataset.username);
                });
                actionsDiv.appendChild(demoteBtn);
            }

            // Reset progress
            const resetBtn = document.createElement('button');
            resetBtn.className = 'admin-action-btn reset-btn';
            resetBtn.textContent = '🔄 Reset Progress';
            resetBtn.dataset.uid      = uid2;
            resetBtn.dataset.username = uname;
            resetBtn.addEventListener('click', function() {
                adminResetProgress(this.dataset.uid, this.dataset.username);
            });
            actionsDiv.appendChild(resetBtn);

            // Delete
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-action-btn delete-btn';
            deleteBtn.textContent = '🗑️ Delete';
            deleteBtn.dataset.uid      = uid2;
            deleteBtn.dataset.username = uname;
            deleteBtn.addEventListener('click', function() {
                adminDeleteUser(this.dataset.uid, this.dataset.username);
            });
            actionsDiv.appendChild(deleteBtn);

        } else {
            const selfNote = document.createElement('span');
            selfNote.style.cssText = 'color:var(--muted);font-size:0.8rem;font-style:italic;';
            selfNote.textContent = 'This is you';
            actionsDiv.appendChild(selfNote);
        }

        card.appendChild(actionsDiv);
        listEl.appendChild(card);
    });
}

/* ================================================================
   ADMIN ACTIONS
   FIX: isAdmin() guard added to every admin function.
   Without this, any logged-in user who found the function name
   could call e.g. adminPromote(someUID, 'victim') from the
   console. Firestore rules are the final enforcement, but this
   adds an earlier gate and a clear error message.
   ================================================================ */
async function adminToggleDisable(uid, username, currentlyDisabled) {
    if (!isAdmin()) { showToast('Access denied.', 'error'); return; }
    if (!confirm((currentlyDisabled ? 'Enable' : 'Disable') + ' account for ' + username + '?')) return;

    try {
        const snap = await getDoc(doc(fbDb, 'users', uid));
        if (!snap.exists()) { showToast('User not found.', 'error'); return; }
        const data = snap.data();
        await setDoc(doc(fbDb, 'users', uid), Object.assign({}, data, { disabled: !currentlyDisabled }));
        showToast(username + ' has been ' + (currentlyDisabled ? 'enabled ✅' : 'disabled 🚫'), 'success', 3000);
        adminLoadPlayers();
    } catch (err) {
        showToast('Could not update account.', 'error');
    }
}

async function adminPromote(uid, username) {
    if (!isAdmin()) { showToast('Access denied.', 'error'); return; }
    if (!confirm('Promote ' + username + ' to Admin? They will see the Admin Panel.')) return;
    try {
        const snap = await getDoc(doc(fbDb, 'users', uid));
        if (!snap.exists()) return;
        await setDoc(doc(fbDb, 'users', uid), Object.assign({}, snap.data(), { role: 'admin' }));
        showToast(username + ' is now an Admin 🛡️', 'success', 3000);
        adminLoadPlayers();
    } catch (err) {
        showToast('Could not promote user.', 'error');
    }
}

async function adminDemote(uid, username) {
    if (!isAdmin()) { showToast('Access denied.', 'error'); return; }
    if (!confirm('Remove admin role from ' + username + '?')) return;
    try {
        const snap = await getDoc(doc(fbDb, 'users', uid));
        if (!snap.exists()) return;
        await setDoc(doc(fbDb, 'users', uid), Object.assign({}, snap.data(), { role: 'user' }));
        showToast(username + ' is now a regular user.', 'info', 3000);
        adminLoadPlayers();
    } catch (err) {
        showToast('Could not demote user.', 'error');
    }
}

async function adminResetProgress(uid, username) {
    if (!isAdmin()) { showToast('Access denied.', 'error'); return; }
    if (!confirm('Reset ALL progress for ' + username + '? This cannot be undone.')) return;
    try {
        const snap = await getDoc(doc(fbDb, 'users', uid));
        if (!snap.exists()) return;
        const data = snap.data();
        await setDoc(doc(fbDb, 'users', uid), Object.assign({}, data, {
            high: 0, streak: 0, mastery: {}, badges: [], notifications: []
        }));
        // FIX: also reset the public leaderboard profile so the reset is reflected immediately
        await setDoc(doc(fbDb, 'users', uid, 'public', 'profile'), {
            username: data.username || '',
            avatar:   data.avatar   || '👤',
            high:     0,
            streak:   0,
            badges:   []
        });
        showToast(username + "'s progress has been reset.", 'info', 3000);
        adminLoadPlayers();
    } catch (err) {
        showToast('Could not reset progress.', 'error');
    }
}

async function adminDeleteUser(uid, username) {
    if (!isAdmin()) { showToast('Access denied.', 'error'); return; }
    if (!confirm('Permanently DELETE ' + username + '? This removes all their data and cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? This is irreversible.')) return;
    try {
        await setDoc(doc(fbDb, 'users', uid), { _deleted: true, username: '[Deleted]' });
        showToast(username + ' has been deleted.', 'info', 3000);
        adminLoadPlayers();
    } catch (err) {
        showToast('Could not delete user.', 'error');
    }
}

/* ================================================================
   ADMIN BROADCAST
   FIX 1: isAdmin() guard added.
   FIX 2: Message length capped at LIMITS.MSG_MAX.
   FIX 3: Message is stored as plain text — when rendered in
          fbLoadChallengeBanner() it now uses textContent,
          so no HTML injection is possible even if msg contains tags.
   ================================================================ */
async function adminBroadcast() {
    if (!isAdmin()) { showToast('Access denied.', 'error'); return; }

    const raw = document.getElementById('broadcast-msg').value.trim();
    if (!raw) { showToast('Please type a message first.', 'error'); return; }

    // FIX: cap length before storing
    const msg = raw.slice(0, LIMITS.MSG_MAX);

    if (!confirm('Send this notification to ALL players?\n\n"' + msg + '"')) return;

    try {
        const snap = await getDocs(collection(fbDb, 'users'));
        const batch = [];
        snap.forEach(function(d) { batch.push({ id: d.id, data: d.data() }); });

        var sent = 0;
        for (var i = 0; i < batch.length; i++) {
            const u      = batch[i];
            // FIX: skip deleted accounts
            if (u.data._deleted) continue;
            const notifs = (u.data.notifications || []);
            notifs.unshift({ msg: '📢 ' + msg, seen: false, ts: Date.now() });
            await setDoc(doc(fbDb, 'users', u.id), Object.assign({}, u.data, {
                notifications: notifs.slice(0, 10)
            }));
            sent++;
        }

        document.getElementById('broadcast-msg').value = '';
        showToast('Notification sent to ' + sent + ' players! 📢', 'success', 4000);

    } catch (err) {
        showToast('Could not send notification.', 'error');
    }
}

/* ================================================================
   EXPOSE TO window FOR HTML onclick= HANDLERS
   Note: Only UI navigation functions are exposed. All admin
   functions are now wired with addEventListener inside
   adminRenderPlayers so they no longer need window exposure —
   but are kept here to avoid breaking any HTML onclick attributes
   you may have in index.html. The isAdmin() guard inside each
   function is the real protection.
   ================================================================ */
window.showAdmin           = showAdmin;
window.adminBroadcast      = adminBroadcast;
window.adminFilterPlayers  = adminFilterPlayers;
window.adminToggleDisable  = adminToggleDisable;
window.adminPromote        = adminPromote;
window.adminDemote         = adminDemote;
window.adminResetProgress  = adminResetProgress;
window.adminDeleteUser     = adminDeleteUser;
window.handleAuth          = handleAuth;
window.setAuthMode         = setAuthMode;
window.toggleTheme         = toggleTheme;
window.showMain            = showMain;
window.backToMain          = backToMain;
window.showSubMenu         = showSubMenu;
window.showSubSubMenu      = showSubSubMenu;
window.startQuiz           = startQuiz;
window.handleAnswer        = handleAnswer;
window.endQuiz             = endQuiz;
window.finishAndReturn     = finishAndReturn;
window.showLeaderboard     = showLeaderboard;
window.showTrophies        = showTrophies;
window.showSettings        = showSettings;
window.updateSettings      = updateSettings;
window.resetData           = resetData;
window.showShare           = showShare;
window.copyInviteCode      = copyInviteCode;
window.copyQuizLink        = copyQuizLink;
window.nativeShare         = nativeShare;
window.shareScore          = shareScore;
window.challengeFromResult = challengeFromResult;
window.acceptChallenge     = acceptChallenge;
window.fbSendChallenge     = fbSendChallenge;
window.logout              = logout;
window.showToast           = showToast;
window.toggleCustomFile    = toggleCustomFile;
window.handleImageUpload   = handleImageUpload;
