/* ================================================================
   FIREBASE.JS — All Firebase operations for Medical Lab Quiz
   Loaded as <script type="module"> in index.html
   ================================================================ */

import { initializeApp }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

/* ================================================================
   APP.JS — Medical Lab Quiz
   All code in one ES module — fixes loading order issues
   ================================================================ */

/* ================================================================
   QUIZ DATA
   ================================================================ */
let quizData = [];

const badgeData = {
    "Chemical Pathologist": "🧪",
    "Histopathologist":     "🥼",
    "Hematologist":         "🩸",
    "Microbiologist":       "🔬",
    "Laboratory Management":"🛡️"
};

/* ================================================================
   GLOBAL STATE
   ================================================================ */
let user       = null;
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

/* ================================================================
   INITIALIZATION
   ================================================================ */
async function init() {
    const savedTheme = localStorage.getItem('medlab_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-icon').innerText = savedTheme === 'dark' ? '☀️' : '🌙';

    try {
        const response = await fetch('questions.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        quizData = await response.json();
        console.log('questions.json loaded — ' + quizData.length + ' questions ready.');
    } catch (err) {
        console.error('Failed to load questions.json:', err);
        alert('Could not load quiz questions.\n\nMake sure questions.json is in the same folder and refresh.');
        return;
    }
    // Auth state handled by Firebase onAuthStateChanged in firebase.js
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
   TOAST NOTIFICATION
   ================================================================ */
let toastTimer = null;

function showToast(msg, type = 'error', duration = 3000) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }

    // Clear any running timer
    if (toastTimer) clearTimeout(toastTimer);

    // Reset classes
    toast.className = '';
    toast.innerText = msg;

    // Force reflow so animation restarts if called twice quickly
    void toast.offsetWidth;

    toast.classList.add('show', 'toast-' + type);

    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

/* ================================================================
   AUTH UI
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

    regExtra.classList.add('hidden');
    forgotExtra.classList.add('hidden');
    passIn.classList.remove('hidden');
    btnLogin.classList.add('hidden');
    btnReg.classList.remove('hidden');
    btnForgot.classList.remove('hidden');
    msg.innerText = '';

    if (mode === 'register') {
        msg.innerText     = 'Create your account';
        mainBtn.innerText = 'Register';
        regExtra.classList.remove('hidden');
        btnReg.classList.add('hidden');
        btnLogin.classList.remove('hidden');
    } else if (mode === 'forgot') {
        msg.innerText     = 'Recover your password';
        mainBtn.innerText = 'Recover';
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

function handleAuth() {
    if (authMode === 'login')    { window.fbLogin();    return; }
    if (authMode === 'register') { window.fbRegister(); return; }
    if (authMode === 'forgot')   { window.fbForgot();   return; }
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
    const loader = document.getElementById('login-loader');
    const textEl = document.getElementById('loader-text');
    const barEl  = document.getElementById('loader-bar');

    const newBar = barEl.cloneNode(true);
    barEl.parentNode.replaceChild(newBar, barEl);

    let msgIdx = 0;
    textEl.innerText = loaderMessages[msgIdx];
    const msgInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % loaderMessages.length;
        textEl.innerText = loaderMessages[msgIdx];
    }, 380);

    loader.classList.remove('hidden', 'fade-out');

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
function showMain() { window.fbShowMain(); }

/* ================================================================
   NAVIGATION
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
        item.innerHTML = '<div class="sub-item-title"><span>' + sub + '</span><span>➔</span></div>';
        item.onclick = () => showSubSubMenu(cat, sub);
        list.appendChild(item);
    });
}

function showSubSubMenu(cat, sub) {
    currentSub = sub;
    hideAll();
    document.getElementById('sub-s').classList.remove('hidden');
    document.getElementById('sub-title').innerText = cat + ' › ' + sub;

    const list = document.getElementById('sub-list-dynamic');
    list.innerHTML = '';

    const sscs = [...new Set(quizData.filter(q => q.c === cat && q.sc === sub).map(q => q.ssc))];
    const d    = window.userDoc || {};

    sscs.forEach(ssc => {
        const total    = quizData.filter(q => q.ssc === ssc).length;
        const mastered = (d.mastery && d.mastery[ssc]) ? d.mastery[ssc].length : 0;
        const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0;

        const item = document.createElement('div');
        item.className = 'sub-item';
        item.innerHTML =
            '<div class="sub-item-title">' +
                '<span>' + ssc + '</span>' +
                '<span style="color:var(--accent); font-size:0.85rem;">' + pct + '%</span>' +
            '</div>' +
            '<div class="progress-container" style="margin-top:8px;">' +
                '<div class="progress-fill" style="width:' + pct + '%;"></div>' +
            '</div>';
        item.onclick = () => startQuiz(cat, sub, ssc);
        list.appendChild(item);
    });

    const backBtn = document.createElement('button');
    backBtn.className = 'btn secondary sm';
    backBtn.style.marginTop = '4px';
    backBtn.innerText = '← Back to ' + cat;
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

    document.getElementById('q-text').innerText     = q.q;
    document.getElementById('game-stats').innerText = 'Q ' + (qIdx + 1) + ' / ' + currentQ.length;
    document.getElementById('game-progress').style.width = ((qIdx) / currentQ.length * 100) + '%';

    const opts = document.getElementById('opt-container');
    opts.innerHTML = '';
    q.o.forEach(o => {
        const b = document.createElement('button');
        b.className = 'btn secondary animate-pop';
        b.innerText = o;
        b.onclick   = () => handleAnswer(o);
        opts.appendChild(b);
    });

    const timeVal = parseInt(document.getElementById('diff-select').value);
    const timerEl = document.getElementById('timer-disp');

    if (timeVal > 0) {
        let t = timeVal;
        timerEl.innerText = t + 's';
        timer = setInterval(() => {
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
    qIdx < currentQ.length ? showQ() : endQuiz();
}

function endQuiz() {
    clearInterval(timer);
    hideAll();
    document.getElementById('res-s').classList.remove('hidden');

    const total    = currentQ.length;
    const answered = score + mistakes.length;
    const skipped  = total - answered;
    let fullyCompleted = false;

    if (answered === 0) {
        document.getElementById('res-score').innerText = '—';
        document.getElementById('res-sub').innerText   = 'No questions were answered.';
        document.getElementById('mistake-list').innerHTML =
            '<p style="text-align:center; color:var(--muted); padding:10px;">Start answering questions to see your results here.</p>';
        return;
    }

    const isZenResult = parseInt(document.getElementById('diff-select').value) === 0;

    if (isZenResult) {
        document.getElementById('res-score').innerText = '🧘';
        document.getElementById('res-sub').innerText   =
            'Zen Practice — ' + answered + ' of ' + total + ' completed · Not scored';
    } else {
        document.getElementById('res-score').innerText = score + ' / ' + total;
        fullyCompleted = answered === total;
        let subMsg = '';
        if (fullyCompleted) {
            if (score === total)                      subMsg = 'Perfect Score! 🎉';
            else if (score >= Math.ceil(total * 0.7)) subMsg = 'Great work! 👏';
            else                                      subMsg = 'Keep practising! 💪';
        } else {
            subMsg = answered + ' of ' + total + ' answered · ' + skipped + ' skipped';
        }
        document.getElementById('res-sub').innerText = subMsg;
    }

    if (!isZenResult) {
        window.fbSaveHighScore(score);
        window.fbCheckChallengeResult(score); // check if active challenge was beaten
    }

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
            div.innerHTML =
                '<span>' + m.q + '</span><br>' +
                '<b>✅ ' + m.a + '</b>' +
                (m.ex ? '<div class="explanation">' + m.ex + '</div>' : '');
            list.appendChild(div);
        });
    }
}

function finishAndReturn() { showSubSubMenu(currentCat, currentSub); }

/* ================================================================
   MASTERY / LEADERBOARD / TROPHIES / SETTINGS
   — All delegate to Firebase functions in firebase.js
   ================================================================ */
function updateMastery(q)  { window.fbUpdateMastery(q); }
function showLeaderboard()  { window.fbShowLeaderboard(); }
function showTrophies()     { window.fbShowTrophies(); }
function updateSettings()   { window.fbUpdateSettings(); }
function resetData()        { window.fbResetData(); }

function showSettings() {
    hideAll();
    document.getElementById('settings-s').classList.remove('hidden');
    const d = window.userDoc || {};
    if (d.avatar && d.avatar.length <= 10) {
        const sel = document.getElementById('set-avatar');
        for (let opt of sel.options) {
            if (opt.value === d.avatar) { sel.value = d.avatar; break; }
        }
    }
}


/* ================================================================
   SHARE & INVITE
   ================================================================ */
const QUIZ_URL = 'https://ovieofDelta.github.io/OvieOfDelta_website';

function showShare() { window.fbShowShare(); }

function copyInviteCode() {
    const code = document.getElementById('invite-code-display').innerText;
    if (!code || code === '——') { showToast('No invite code yet.', 'error'); return; }
    navigator.clipboard.writeText(code)
        .then(() => showToast('Invite code copied! 📋', 'success'))
        .catch(() => showToast('Could not copy. Please copy manually.', 'error'));
}

function copyQuizLink() {
    navigator.clipboard.writeText(QUIZ_URL)
        .then(() => showToast('Quiz link copied! 📋', 'success'))
        .catch(() => showToast('Could not copy. Please copy manually.', 'error'));
}

function nativeShare() {
    const d = window.userDoc || {};
    const shareData = {
        title: 'Med Lab Quiz — NIMELSSA LCU',
        text: 'I've been using this quiz to prepare for MCQs — try it out! 🧪',
        url:  QUIZ_URL
    };
    if (navigator.share) {
        navigator.share(shareData).catch(() => copyQuizLink());
    } else {
        copyQuizLink();
    }
}

function shareScore() {
    const scoreEl = document.getElementById('res-score');
    const subEl   = document.getElementById('res-sub');
    const score   = scoreEl ? scoreEl.innerText : '?';
    const topic   = window.currentSsc || window.currentSub || 'Medical Lab';
    const d       = window.userDoc || {};
    const rank    = d.high >= 20 ? '💎 Diamond' : d.high >= 10 ? '🥇 Gold' :
                    d.high >= 5  ? '🥈 Silver'  : d.high >= 1  ? '🥉 Bronze' : '🎯 Unranked';

    const text =
        '🧪 Med Lab Quiz — NIMELSSA LCU
' +
        'I scored ' + score + ' on ' + topic + '!
' +
        rank + ' | 🔥 ' + (d.streak || 0) + ' day streak
' +
        'Challenge me → ' + QUIZ_URL;

    if (navigator.share) {
        navigator.share({ title: 'My Med Lab Score', text, url: QUIZ_URL })
            .catch(() => {
                navigator.clipboard.writeText(text)
                    .then(() => showToast('Score card copied! Paste anywhere to share 📋', 'success', 4000));
            });
    } else {
        navigator.clipboard.writeText(text)
            .then(() => showToast('Score card copied! Paste anywhere to share 📋', 'success', 4000))
            .catch(() => showToast('Could not copy automatically.', 'error'));
    }
}

function challengeFromResult() {
    window.fbShowChallengeModal();
}

/* ================================================================
   UTILITY
   ================================================================ */
function hideAll() {
    clearInterval(timer);
    ['auth-s','main-s','sub-s','game-s','res-s','lead-s','trophy-s','settings-s','share-s']
        .forEach(id => document.getElementById(id).classList.add('hidden'));
}

function backToMain() { showMain(); }

/* ================================================================
   LOGOUT
   ================================================================ */
function logout() {
    clearInterval(timer);

    const loader  = document.getElementById('logout-loader');
    const textEl  = document.getElementById('logout-text');
    const barEl   = document.getElementById('logout-bar');

    const messages = ['Signing you out…', 'Clearing session…', 'See you soon! 👋'];
    let msgIdx = 0;
    textEl.innerText = messages[0];

    loader.classList.add('active');
    setTimeout(() => barEl.classList.add('draining'), 50);

    const msgInterval = setInterval(() => {
        msgIdx = Math.min(msgIdx + 1, messages.length - 1);
        textEl.innerText = messages[msgIdx];
    }, 400);

    setTimeout(() => {
        clearInterval(msgInterval);
        textEl.innerText = 'Logged out ✅';

        setTimeout(() => {
            user           = null;
            window.userDoc = null;
            customImg      = null;
            if (window.firebase_auth) window.firebase_auth.signOut();

            hideAll();
            document.getElementById('auth-s').classList.remove('hidden');
            setAuthMode('login');
            document.getElementById('u-in').value = '';
            document.getElementById('p-in').value = '';

            loader.classList.remove('active');
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.classList.remove('fade-out');
                barEl.classList.remove('draining');
            }, 400);
        }, 500);
    }, 1200);
}

/* ================================================================
   SHARE & INVITE SYSTEM
   ================================================================ */

const QUIZ_URL = 'https://ovieofDelta.github.io/OvieOfDelta_website/medlabquiz.html';

/* ── Show Share screen ─────────────────────────────────────── */
function showShare() {
    hideAll();
    document.getElementById('share-s').classList.remove('hidden');

    // Show quiz URL
    document.getElementById('share-url-display').innerText = QUIZ_URL;

    // Show invite code
    const d = window.userDoc || {};
    document.getElementById('my-invite-code').innerText = d.inviteCode || '—';

    // Load active challenges
    loadActiveChallenges();
}

/* ── Copy quiz link to clipboard ───────────────────────────── */
function copyQuizLink() {
    navigator.clipboard.writeText(QUIZ_URL).then(() => {
        showToast('Quiz link copied! 📋', 'success');
    }).catch(() => {
        showToast('Could not copy. Long-press the link to copy manually.', 'info', 4000);
    });
}

/* ── Copy invite code ──────────────────────────────────────── */
function copyInviteCode() {
    const code = (window.userDoc || {}).inviteCode;
    if (!code || code === '—') {
        showToast('No invite code yet. Try refreshing.', 'info');
        return;
    }
    const text = 'Join me on MedLab Quiz! Use my invite code: ' + code + '\n\nPlay here: ' + QUIZ_URL;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Invite message copied! 📋', 'success');
    }).catch(() => {
        showToast('Copy failed. Your code is: ' + code, 'info', 5000);
    });
}

/* ── Share result after quiz ───────────────────────────────── */
function shareResult() {
    const scoreEl  = document.getElementById('res-score').innerText;
    const d        = window.userDoc || {};
    const rank     = d.high >= 20 ? '💎 Diamond'
                   : d.high >= 10 ? '🥇 Gold'
                   : d.high >= 5  ? '🥈 Silver'
                   : d.high > 0   ? '🥉 Bronze'
                   : '🎯 Unranked';
    const streak   = d.streak || 0;
    const topic    = currentSsc || currentSub || currentCat || 'MedLab';

    const text =
        '🧪 Med Lab Quiz — NIMELSSA LCU\n' +
        'I just scored ' + scoreEl + ' on ' + topic + '!\n' +
        rank + ' | 🔥 ' + streak + ' day streak\n\n' +
        '👉 Play here: ' + QUIZ_URL;

    // Try native share sheet (mobile) first, fall back to clipboard
    if (navigator.share) {
        navigator.share({
            title: 'Med Lab Quiz Score',
            text:  text,
            url:   QUIZ_URL
        }).catch(() => {}); // user dismissed — no error needed
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Score copied to clipboard! Paste anywhere to share 📋', 'success', 4000);
        }).catch(() => {
            showToast('Could not copy automatically.', 'info');
        });
    }
}

/* ── Show challenge modal from results screen ──────────────── */
function showChallengeModal() {
    if (!currentSsc && !currentSub) {
        showToast('Finish a quiz first to issue a challenge.', 'info');
        return;
    }
    const topic = currentSsc || currentSub;
    document.getElementById('challenge-topic').innerText = topic;
    document.getElementById('challenge-modal').classList.remove('hidden');
    loadChallengePlayerList(topic);
}

function closeChallengeModal() {
    document.getElementById('challenge-modal').classList.add('hidden');
}

/* ── Load player list in challenge modal ───────────────────── */
async function loadChallengePlayerList(topic) {
    const list = document.getElementById('challenge-player-list');
    list.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem;">Loading players…</p>';
    await window.fbLoadChallengeablePlayers(topic);
}

/* ── Load active challenges on share screen ────────────────── */
async function loadActiveChallenges() {
    const el = document.getElementById('challenges-list');
    el.innerHTML = '<p style="font-size:0.85rem; color:var(--muted); text-align:center; padding:10px;">Loading…</p>';
    await window.fbLoadChallenges();
}

/* ── Challenge buttons on leaderboard (called from firebase.js) */
function challengeFromLeaderboard(targetUsername, topic) {
    currentSsc = topic;
    currentSub = topic;
    document.getElementById('challenge-topic').innerText = topic || 'General';
    document.getElementById('challenge-modal').classList.remove('hidden');
    window.fbSendChallenge(targetUsername, topic || 'General', 0);
}

// acceptChallenge is defined in firebase.js and exposed via window.acceptChallenge
function acceptChallenge(id, topic) { window.acceptChallenge(id, topic); }

/* ── Config ──────────────────────────────────────────────────── */
const firebaseConfig = {
    apiKey:            "AIzaSyA6UtSUqHH4oIqGFVQRxNo9sE2kY-tT_6E",
    authDomain:        "medlablcuquiz.firebaseapp.com",
    projectId:         "medlablcuquiz",
    storageBucket:     "medlablcuquiz.firebasestorage.app",
    messagingSenderId: "216644964020",
    appId:             "1:216644964020:web:2c07580eafdde4bd6991e1"
};

const app           = initializeApp(firebaseConfig);
const firebase_auth = getAuth(app);
const db_fire       = getFirestore(app);

/* Expose auth instance so logout() in script.js can sign out */
window.firebase_auth = firebase_auth;

/* ================================================================
   LOAD & SAVE USER DOCUMENT
   ================================================================ */
window.loadUserDoc = async function(uid) {
    const snap = await getDoc(doc(db_fire, 'users', uid));
    if (snap.exists()) {
        window.userDoc      = snap.data();
        window.userDoc._uid = uid;
        return window.userDoc;
    }
    return null;
};

window.saveUserDoc = async function() {
    if (!window.userDoc || !window.userDoc._uid) return;
    const uid  = window.userDoc._uid;
    const data = { ...window.userDoc };
    delete data._uid;
    await setDoc(doc(db_fire, 'users', uid), data);
};

/* ================================================================
   AUTH — REGISTER
   ================================================================ */
window.fbRegister = async function() {
    const username   = document.getElementById('u-in').value.trim();
    const password   = document.getElementById('p-in').value.trim();
    const hint       = document.getElementById('hint-in').value.trim();
    const av         = document.getElementById('avatar-in').value;
    const codeInput  = document.getElementById('invite-code-in');
    window._pendingInviteCode = codeInput ? codeInput.value.trim().toUpperCase() : null;
    if (!username) { showToast('Please enter a username.', 'error'); return; }
    if (!password) { showToast('Please enter a password.', 'error'); return; }
    if (password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }

    const fakeEmail = username.toLowerCase().replace(/\s+/g, '_') + '@medlabquiz.local';

    try {
        showToast('Creating account…', 'info', 5000);
        const cred = await createUserWithEmailAndPassword(firebase_auth, fakeEmail, password);
        const uid  = cred.user.uid;
        const finalAvatar = (av === 'custom' && window.customImg) ? window.customImg : av;

        const inviteCode = generateInviteCode(username);
        await setDoc(doc(db_fire, 'users', uid), {
            username,
            hint,
            avatar:      finalAvatar || '👤',
            high:        0,
            streak:      0,
            lastLogin:   null,
            mastery:     {},
            badges:      [],
            inviteCode,
            invitedBy:   window._pendingInviteCode || null,
            inviteCount: 0,
            notifications: []
        });

        window.customImg = null;
        showToast('Account created! Please log in. ✅', 'success', 3500);
        setTimeout(() => setAuthMode('login'), 400);

    } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
            showToast('Username already taken. Try a different one.', 'error');
        } else if (err.code === 'auth/weak-password') {
            showToast('Password must be at least 6 characters.', 'error');
        } else {
            showToast('Registration failed. Please try again.', 'error');
        }
    }
};

/* ================================================================
   AUTH — LOGIN
   ================================================================ */
window.fbLogin = async function() {
    const username = document.getElementById('u-in').value.trim();
    const password = document.getElementById('p-in').value.trim();


    if (!username) { showToast('Please enter a username.', 'error'); return; }
    if (!password) { showToast('Please enter a password.', 'error'); return; }

    const fakeEmail = username.toLowerCase().replace(/\s+/g, '_') + '@medlabquiz.local';

    try {
        showToast('Signing in…', 'info', 5000);
        await signInWithEmailAndPassword(firebase_auth, fakeEmail, password);
        // onAuthStateChanged fires automatically after this
    } catch (err) {
        showToast('Invalid username or password.', 'error');
    }
};

/* ================================================================
   AUTH — FORGOT PASSWORD (hint check)
   ================================================================ */
window.fbForgot = async function() {
    const username = document.getElementById('u-in').value.trim();
    const hintR    = document.getElementById('hint-recover').value.trim();


    if (!username) { showToast('Please enter your username.', 'error'); return; }

    try {
        showToast('Checking…', 'info', 5000);
        const snap = await getDocs(collection(db_fire, 'users'));
        let found  = null;
        snap.forEach(d => { if (d.data().username === username) found = d.data(); });

        if (found && found.hint === hintR) {
            showToast('Hint matched! ✅ Contact your admin to reset your password.', 'success', 5000);
        } else {
            showToast('Username or security hint is incorrect.', 'error');
        }
    } catch (err) {
        showToast('Could not check. Please try again.', 'error');
    }
};

/* ================================================================
   DASHBOARD — show main with streak & rank
   ================================================================ */
window.fbShowMain = async function() {
    hideAll();
    document.getElementById('main-s').classList.remove('hidden');

    const d = window.userDoc;
    if (!d) { logout(); return; }

    // Streak
    const today = new Date().setHours(0, 0, 0, 0);
    let streakIncreased = false;
    if (!d.lastLogin) {
        d.streak = 1; streakIncreased = true;
    } else if (today === d.lastLogin + 86400000) {
        d.streak++; streakIncreased = true;
    } else if (today > d.lastLogin) {
        d.streak = 1; streakIncreased = false;
    }
    d.lastLogin = today;
    await window.saveUserDoc();

    // Avatar
    const avatarSlot = document.getElementById('display-avatar');
    if (d.avatar && d.avatar.length > 10) {
        avatarSlot.innerHTML = '<img src="' + d.avatar + '" class="avatar-img">';
    } else {
        avatarSlot.innerText = d.avatar || '👤';
    }

    document.getElementById('display-user').innerText = d.username || window.user;

    // High score
    const highEl = document.getElementById('display-high');
    if (!d.high || d.high === 0) {
        highEl.innerHTML = '<span style="color:var(--muted);">No quiz completed yet</span>';
    } else {
        highEl.innerHTML = 'High: <b>' + d.high + '</b> pts';
    }

    // Rank
    let rank, rankProgress;
    if (!d.high || d.high === 0) {
        rank = '🎯 Unranked'; rankProgress = 0;
    } else if (d.high >= 20) {
        rank = '💎 Diamond'; rankProgress = 100;
    } else if (d.high >= 10) {
        rank = '🥇 Gold'; rankProgress = Math.round((d.high / 20) * 100);
    } else if (d.high >= 5) {
        rank = '🥈 Silver'; rankProgress = Math.round((d.high / 20) * 100);
    } else {
        rank = '🥉 Bronze'; rankProgress = Math.round((d.high / 20) * 100);
    }
    document.getElementById('display-rank').innerText     = rank;
    document.getElementById('rank-progress').style.width  = rankProgress + '%';

    // Streak flame
    const streakEl = document.getElementById('display-streak');
    streakEl.innerText = d.streak || 0;
    streakEl.classList.toggle('streak-flame', streakIncreased);

    // Load challenge notifications
    window.fbLoadChallengeBanner();
};

/* ================================================================
   MASTERY & BADGES
   ================================================================ */
window.fbUpdateMastery = async function(q) {
    const d = window.userDoc;
    if (!d.mastery)        d.mastery = {};
    if (!d.mastery[q.ssc]) d.mastery[q.ssc] = [];

    if (!d.mastery[q.ssc].includes(q.q)) {
        d.mastery[q.ssc].push(q.q);
    }

    const totalInSub  = quizData.filter(i => i.sc === q.sc).length;
    const sscsInSub   = [...new Set(quizData.filter(i => i.sc === q.sc).map(i => i.ssc))];
    let masteredCount = 0;
    sscsInSub.forEach(s => masteredCount += (d.mastery[s] ? d.mastery[s].length : 0));

    if (masteredCount >= totalInSub && !d.badges.includes(q.sc)) {
        d.badges.push(q.sc);
        setTimeout(() => alert('🏅 Badge unlocked: ' + q.sc + '!'), 400);
    }

    await window.saveUserDoc();
};

/* ================================================================
   SAVE HIGH SCORE
   ================================================================ */
window.fbSaveHighScore = async function(score) {
    const d = window.userDoc;
    if (score > (d.high || 0)) {
        d.high = score;
        await window.saveUserDoc();
    }
};

/* ================================================================
   LEADERBOARD — reads all users from Firestore
   ================================================================ */
window.fbShowLeaderboard = async function() {
    hideAll();
    document.getElementById('lead-s').classList.remove('hidden');

    const list = document.getElementById('lead-list');
    list.innerHTML = '<p style="text-align:center; color:var(--muted);">Loading leaderboard…</p>';

    try {
        const snap   = await getDocs(collection(db_fire, 'users'));
        const ranked = [];
        snap.forEach(d => {
            const data = d.data();
            ranked.push({ name: data.username || d.id, score: data.high || 0, avatar: data.avatar || '👤' });
        });
        ranked.sort((a, b) => b.score - a.score);
        list.innerHTML = '';

        if (ranked.length === 0) {
            list.innerHTML = '<p style="text-align:center;">No players yet!</p>';
            return;
        }

        const myName   = window.userDoc ? window.userDoc.username : '';
        const played   = ranked.filter(p => p.score > 0);
        const unranked = ranked.filter(p => p.score === 0);

        played.forEach((p, i) => {
            const row        = document.createElement('div');
            row.className    = 'lead-row' + (p.name === myName ? ' me' : '');
            const medal      = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
            const avatarHtml = p.avatar.length > 10
                ? '<img src="' + p.avatar + '" class="avatar-img" style="width:28px;height:28px;">'
                : p.avatar;
            row.innerHTML = '<span>' + medal + ' ' + avatarHtml + ' ' + p.name + (p.name === myName ? ' (You)' : '') + '</span><b>' + p.score + ' pts</b>';
            list.appendChild(row);
        });

        if (unranked.length > 0) {
            const divider = document.createElement('div');
            divider.style.cssText = 'text-align:center; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--muted); padding:12px 0 6px; border-top:1px dashed var(--border); margin-top:8px;';
            divider.innerText = '— Not Yet Ranked —';
            list.appendChild(divider);

            unranked.forEach(p => {
                const row        = document.createElement('div');
                row.className    = 'lead-row' + (p.name === myName ? ' me' : '');
                row.style.opacity = '0.6';
                const avatarHtml = p.avatar.length > 10
                    ? '<img src="' + p.avatar + '" class="avatar-img" style="width:28px;height:28px;">'
                    : p.avatar;
                row.innerHTML = '<span>🎯 ' + avatarHtml + ' ' + p.name + (p.name === myName ? ' (You)' : '') + '</span><b style="color:var(--muted); font-size:0.8rem;">No quiz completed</b>';
                list.appendChild(row);
            });
        }

    } catch (err) {
        list.innerHTML = '<p style="text-align:center; color:var(--danger);">Could not load leaderboard: ' + err.message + '</p>';
    }
};

/* ================================================================
   TROPHIES
   ================================================================ */
window.fbShowTrophies = async function() {
    hideAll();
    document.getElementById('trophy-s').classList.remove('hidden');

    const grid = document.getElementById('badge-grid');
    const d    = window.userDoc || {};
    grid.innerHTML = '';

    Object.keys(badgeData).forEach(name => {
        const owned = d.badges && d.badges.includes(name);
        const card  = document.createElement('div');
        card.className = 'badge-card' + (owned ? ' owned' : '');
        card.innerHTML =
            '<div style="font-size:2.5rem; filter:' + (owned ? 'none' : 'grayscale(1) opacity(0.25)') + '; margin-bottom:8px;">' + badgeData[name] + '</div>' +
            '<b>' + name + '</b>' +
            '<div style="font-size:0.72rem; color:var(--muted); margin-top:4px;">' + (owned ? '✅ Unlocked' : 'Locked') + '</div>';
        grid.appendChild(card);
    });
};

/* ================================================================
   SETTINGS — save avatar & password
   ================================================================ */
window.fbUpdateSettings = async function() {
    const d  = window.userDoc;
    const np = document.getElementById('set-pass').value.trim();
    const av = document.getElementById('set-avatar').value;

    if (window.customImg) d.avatar = window.customImg;
    else                  d.avatar = av;

    await window.saveUserDoc();

    if (np) {
        if (np.length < 6) {
            showToast('New password must be at least 6 characters.', 'error');
            return;
        }
        if (firebase_auth.currentUser) {
            try {
                await firebase_auth.currentUser.updatePassword(np);
            } catch (e) {
                showToast('Profile saved but password update failed.\nPlease log out and back in first.', 'error', 4000);
                return;
            }
        }
    }

    window.customImg = null;
    showToast('Settings saved! ✅', 'success');
    window.fbShowMain();
};

/* ================================================================
   RESET PROGRESS
   ================================================================ */
window.fbResetData = async function() {
    if (!confirm('This will wipe your mastery progress and badges. Continue?')) return;
    const d   = window.userDoc;
    d.mastery = {};
    d.badges  = [];
    d.high    = 0;
    await window.saveUserDoc();
    showToast('Progress reset.', 'info');
    window.fbShowMain();
};

/* ================================================================
   AUTH STATE OBSERVER
   Fires on every page load — if user is already signed in,
   loads their data and goes straight to dashboard
   ================================================================ */
onAuthStateChanged(firebase_auth, async (fbUser) => {
    if (fbUser) {
        const data = await window.loadUserDoc(fbUser.uid);
        if (data) {
            window.user = data.username;
            showLoginLoader(() => window.fbShowMain());
        }
    }
    // Not signed in — auth screen is shown by default in HTML
});

/* ================================================================
   SHARING & CHALLENGES — Firebase Functions
   ================================================================ */

/* ── Generate a unique invite code for new users ─────────────
   Format: USERNAME-XXXX (4 random digits)
   Stored on the user's Firestore document
   ──────────────────────────────────────────────────────────── */
async function generateInviteCode(username) {
    const digits = Math.floor(1000 + Math.random() * 9000);
    const code   = username.toUpperCase().replace(/\s+/g,'').slice(0,6) + '-' + digits;
    return code;
}

/* ── Ensure every user has an invite code (called on register) */
async function ensureInviteCode(uid, username) {
    const d = window.userDoc;
    if (!d.inviteCode) {
        d.inviteCode     = await generateInviteCode(username);
        d.inviteCount    = 0;     // how many people used their code
        d.invitedBy      = null;  // who invited them
        await window.saveUserDoc();
    }
}

/* ── Load all players the current user can challenge ────────── */
window.fbLoadChallengeablePlayers = async function(topic) {
    const list    = document.getElementById('challenge-player-list');
    const myName  = window.userDoc ? window.userDoc.username : '';
    const myScore = score; // current game score from script.js

    try {
        const snap = await getDocs(collection(db_fire, 'users'));
        const players = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.username && data.username !== myName) {
                players.push({ uid: d.id, name: data.username, avatar: data.avatar || '👤' });
            }
        });

        list.innerHTML = '';

        if (players.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem;">No other players yet!</p>';
            return;
        }

        players.forEach(p => {
            const item = document.createElement('div');
            item.className = 'challenge-player-item';
            const avatarHtml = p.avatar.length > 10
                ? '<img src="' + p.avatar + '" class="avatar-img" style="width:28px;height:28px; margin-right:8px;">'
                : '<span style="margin-right:8px;">' + p.avatar + '</span>';
            item.innerHTML =
                '<span>' + avatarHtml + p.name + '</span>' +
                '<button class="btn primary sm" style="width:auto; margin:0; padding:8px 14px;" ' +
                'onclick="window.fbSendChallenge(\'' + p.name + '\', \'' + topic + '\', ' + myScore + '); closeChallengeModal();">' +
                'Challenge ⚔️</button>';
            list.appendChild(item);
        });

    } catch (err) {
        list.innerHTML = '<p style="color:var(--danger); font-size:0.85rem;">Could not load players: ' + err.message + '</p>';
    }
};

/* ── Send a challenge to another player ─────────────────────── */
window.fbSendChallenge = async function(targetUsername, topic, challengerScore) {
    const myName = window.userDoc ? window.userDoc.username : '';
    if (!myName) return;

    try {
        // Find the target user's document
        const snap = await getDocs(collection(db_fire, 'users'));
        let targetUid  = null;

        snap.forEach(d => {
            if (d.data().username === targetUsername) targetUid = d.id;
        });

        if (!targetUid) {
            showToast('Player not found.', 'error');
            return;
        }

        // Write challenge document to Firestore
        const challengeId = myName + '_' + targetUsername + '_' + Date.now();
        await setDoc(doc(db_fire, 'challenges', challengeId), {
            from:        myName,
            to:          targetUsername,
            toUid:       targetUid,
            topic:       topic,
            score:       challengerScore,
            status:      'pending',   // pending | accepted | beaten
            createdAt:   Date.now()
        });

        showToast('Challenge sent to ' + targetUsername + '! ⚔️', 'success', 3000);

    } catch (err) {
        showToast('Could not send challenge. Try again.', 'error');
    }
};

/* ── Load challenges for current user (sent TO them) ────────── */
window.fbLoadChallenges = async function() {
    const el     = document.getElementById('challenges-list');
    const myName = window.userDoc ? window.userDoc.username : '';
    if (!myName) return;

    try {
        // Load challenges sent to me
        const snap = await getDocs(collection(db_fire, 'challenges'));
        const mine = [];

        snap.forEach(d => {
            const data = d.data();
            if (data.to === myName && data.status === 'pending') {
                mine.push({ id: d.id, ...data });
            }
        });

        // Also load challenges I sent
        const sent = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.from === myName) {
                sent.push({ id: d.id, ...data });
            }
        });

        el.innerHTML = '';

        if (mine.length === 0 && sent.length === 0) {
            el.innerHTML = '<p style="font-size:0.85rem; color:var(--muted); text-align:center; padding:10px;">No active challenges</p>';
            return;
        }

        // ── Challenges received ──
        if (mine.length > 0) {
            const heading = document.createElement('p');
            heading.style.cssText = 'font-size:0.75rem; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin-bottom:8px;';
            heading.innerText = 'Challenges Received';
            el.appendChild(heading);

            mine.forEach(c => {
                const item = document.createElement('div');
                item.className = 'active-challenge-item';
                item.innerHTML =
                    '<b>⚔️ ' + c.from + '</b> challenged you on <b>' + c.topic + '</b>!<br>' +
                    '<span style="color:var(--muted); font-size:0.8rem;">Their score: ' + c.score + ' pts — can you beat it?</span><br>' +
                    '<button class="btn primary sm" style="margin-top:8px; width:auto; padding:8px 14px;" ' +
                    'onclick="acceptChallenge(\'' + c.id + '\', \'' + c.topic + '\')">Accept ⚔️</button>';
                el.appendChild(item);
            });
        }

        // ── Challenges sent ──
        if (sent.length > 0) {
            const heading2 = document.createElement('p');
            heading2.style.cssText = 'font-size:0.75rem; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin:12px 0 8px;';
            heading2.innerText = 'Challenges Sent';
            el.appendChild(heading2);

            sent.forEach(c => {
                const item = document.createElement('div');
                item.className = 'active-challenge-item';
                const statusIcon = c.status === 'beaten' ? '😅 Beaten by' : c.status === 'accepted' ? '🎯 Accepted by' : '⏳ Waiting for';
                item.innerHTML =
                    statusIcon + ' <b>' + c.to + '</b> on <b>' + c.topic + '</b><br>' +
                    '<span style="color:var(--muted); font-size:0.8rem;">Your score to beat: ' + c.score + ' pts</span>';
                el.appendChild(item);
            });
        }

    } catch (err) {
        el.innerHTML = '<p style="color:var(--danger); font-size:0.85rem;">Could not load challenges.</p>';
    }
};

/* ── Accept a challenge (starts the quiz on that topic) ──────── */
window.acceptChallenge = async function(challengeId, topic) {
    // Mark as accepted in Firestore
    try {
        await setDoc(doc(db_fire, 'challenges', challengeId), { status: 'accepted' }, { merge: true });
    } catch (e) {}

    closeChallengeModal();
    showToast('Challenge accepted! Find ' + topic + ' in the menu to play.', 'info', 4000);
    backToMain();
};

/* ── Check for incoming challenges on login — show dashboard banner ─ */
window.fbCheckIncomingChallenges = async function() {
    const myName = window.userDoc ? window.userDoc.username : '';
    if (!myName) return;

    try {
        const snap = await getDocs(collection(db_fire, 'challenges'));
        const pending = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.to === myName && data.status === 'pending') pending.push(data);
        });

        if (pending.length === 0) return;

        // Inject challenge banner above rank card on dashboard
        const mainScreen = document.getElementById('main-s');
        const rankCard   = mainScreen.querySelector('.rank-card');

        // Remove any old banners first
        mainScreen.querySelectorAll('.challenge-banner').forEach(b => b.remove());

        pending.forEach(c => {
            const banner = document.createElement('div');
            banner.className = 'challenge-banner';
            banner.innerHTML =
                '<div class="challenge-banner-title">⚔️ New Challenge!</div>' +
                '<p><b>' + c.from + '</b> challenged you on <b>' + c.topic + '</b> — beat their score of <b>' + c.score + ' pts!</b></p>' +
                '<button class="btn primary sm" style="margin-top:10px; width:auto; padding:8px 16px;" onclick="showShare()">View Challenge</button>';
            mainScreen.insertBefore(banner, rankCard);
        });

    } catch (e) {}
};

/* ── Mark challenge as beaten when the challenged player scores higher */
window.fbCheckChallengeBeaten = async function(topic, newScore) {
    const myName = window.userDoc ? window.userDoc.username : '';
    if (!myName) return;

    try {
        const snap = await getDocs(collection(db_fire, 'challenges'));
        snap.forEach(async d => {
            const data = d.data();
            if (data.to === myName && data.topic === topic &&
                data.status === 'accepted' && newScore > data.score) {
                await setDoc(doc(db_fire, 'challenges', d.id), { status: 'beaten' }, { merge: true });
                showToast('You beat ' + data.from + "'s challenge on " + topic + '! 🏆', 'success', 4000);
            }
        });
    } catch (e) {}
};

/* ── Add Challenge button to leaderboard rows ────────────────── */
const _origFbShowLeaderboard = window.fbShowLeaderboard;
window.fbShowLeaderboard = async function() {
    await _origFbShowLeaderboard();

    // Add ⚔️ Challenge button to each ranked player row
    const myName = window.userDoc ? window.userDoc.username : '';
    document.querySelectorAll('.lead-row').forEach(row => {
        const nameSpan = row.querySelector('span');
        if (!nameSpan) return;
        const rowText  = nameSpan.innerText;
        if (rowText.includes('(You)') || rowText.includes('Not Yet')) return;

        // Extract just the username (strip medal/avatar text)
        const parts    = rowText.trim().split(' ');
        const username = parts[parts.length - 1];
        if (!username || username === myName) return;

        const btn = document.createElement('button');
        btn.className   = 'challenge-btn';
        btn.innerText   = '⚔️';
        btn.title       = 'Challenge ' + username;
        btn.onclick     = (e) => {
            e.stopPropagation();
            currentSsc = '';
            document.getElementById('challenge-topic').innerText = 'General';
            document.getElementById('challenge-modal').classList.remove('hidden');
            window.fbLoadChallengeablePlayers('General');
        };
        row.appendChild(btn);
    });
};

/* ── Hook into fbShowMain to check for challenges ────────────── */
const _origFbShowMain = window.fbShowMain;
window.fbShowMain = async function() {
    await _origFbShowMain();
    await window.fbCheckIncomingChallenges();
};

/* ── Hook into fbSaveHighScore to check if challenge beaten ──── */
const _origFbSaveHighScore = window.fbSaveHighScore;
window.fbSaveHighScore = async function(s) {
    await _origFbSaveHighScore(s);
    const topic = currentSsc || currentSub || currentCat || '';
    if (topic) await window.fbCheckChallengeBeaten(topic, s);
};

/* ── Ensure invite code is generated on register ─────────────── */
const _origFbRegister = window.fbRegister;
window.fbRegister = async function() {
    // We patch saveUserDoc to add invite code after user is created
    const _origSave = window.saveUserDoc;
    window.saveUserDoc = async function() {
        if (window.userDoc && !window.userDoc.inviteCode && window.userDoc._uid) {
            window.userDoc.inviteCode  = await generateInviteCode(window.userDoc.username || 'USER');
            window.userDoc.inviteCount = 0;
            window.userDoc.invitedBy   = null;
        }
        await _origSave();
        window.saveUserDoc = _origSave; // restore
    };
    await _origFbRegister();
};

/* ================================================================
   SHARING — Generate unique invite code on register
   ================================================================ */
function generateInviteCode(username) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) + '-' + suffix;
}

/* ================================================================
   SHARING — Show Share Screen
   ================================================================ */
window.fbShowShare = async function() {
    hideAll();
    document.getElementById('share-s').classList.remove('hidden');

    const d    = window.userDoc || {};
    const code = d.inviteCode || '——';
    document.getElementById('invite-code-display').innerText = code;
    document.getElementById('share-link-display').innerText  =
        'ovieofDelta.github.io/OvieOfDelta_website';

    await window.fbLoadChallenges();
};

/* ================================================================
   SHARING — Load all challenges for current user
   ================================================================ */
window.fbLoadChallenges = async function() {
    const list  = document.getElementById('challenges-list');
    const myName = window.userDoc ? window.userDoc.username : '';
    if (!myName) return;

    try {
        const snap = await getDocs(collection(db_fire, 'challenges'));
        const all  = [];
        snap.forEach(d => {
            const ch = d.data();
            ch._id = d.id;
            if (ch.from === myName || ch.to === myName) all.push(ch);
        });

        list.innerHTML = '';

        if (all.length === 0) {
            list.innerHTML = '<p style="color:var(--muted); font-size:0.9rem; text-align:center; padding:10px;">No active challenges yet.<br>Finish a quiz and challenge a friend! ⚔️</p>';
            return;
        }

        all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        all.forEach(ch => {
            const isIncoming = ch.to === myName;
            const card = document.createElement('div');
            card.className = 'challenge-card' + (isIncoming ? ' incoming' : '');

            let statusBadge = '';
            if (ch.status === 'pending') statusBadge = '<span class="ch-badge pending">⏳ Pending</span>';
            else if (ch.status === 'beaten') statusBadge = '<span class="ch-badge beaten">🏆 Beaten!</span>';
            else if (ch.status === 'expired') statusBadge = '<span class="ch-badge expired">💨 Expired</span>';

            if (isIncoming) {
                card.innerHTML =
                    '<div class="ch-header">' + statusBadge + '<span class="ch-tag incoming-tag">INCOMING</span></div>' +
                    '<b>' + ch.from + '</b> challenges you on <b>' + ch.topic + '</b><br>' +
                    '<span style="color:var(--danger); font-weight:800;">Beat their score: ' + ch.score + '</span>' +
                    (ch.status === 'pending'
                        ? '<button class="btn primary sm" style="margin-top:10px; width:100%;" onclick="acceptChallenge(\'' + ch._id + '\',\'' + ch.from + '\',\'' + ch.topic + '\',\'' + ch.cat + '\',\'' + ch.sub + '\',\'' + ch.ssc + '\')">⚔️ Accept &amp; Play</button>'
                        : '');
            } else {
                card.innerHTML =
                    '<div class="ch-header">' + statusBadge + '<span class="ch-tag outgoing-tag">OUTGOING</span></div>' +
                    'You challenged <b>' + ch.to + '</b> on <b>' + ch.topic + '</b><br>' +
                    '<span style="color:var(--muted); font-size:0.85rem;">Your score: ' + ch.score + '</span>';
            }

            list.appendChild(card);
        });

    } catch (err) {
        list.innerHTML = '<p style="color:var(--danger); font-size:0.85rem; text-align:center;">Could not load challenges.</p>';
    }
};

/* ================================================================
   SHARING — Show challenge modal (pick a player to challenge)
   ================================================================ */
window.fbShowChallengeModal = async function() {
    const myName = window.userDoc ? window.userDoc.username : '';
    const topic  = window.currentSsc || window.currentSub || '';
    const cat    = window.currentCat || '';
    const sub    = window.currentSub || '';
    const ssc    = window.currentSsc || '';
    const score  = window.score || 0;

    if (!topic) {
        showToast('Finish a quiz first to challenge someone!', 'error');
        return;
    }

    // Build player list from Firestore
    try {
        const snap    = await getDocs(collection(db_fire, 'users'));
        const players = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.username && data.username !== myName) players.push(data.username);
        });

        if (players.length === 0) {
            showToast('No other players registered yet.', 'info');
            return;
        }

        // Build modal
        let existing = document.getElementById('challenge-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id    = 'challenge-modal';
        modal.className = 'challenge-modal-overlay';
        modal.innerHTML =
            '<div class="challenge-modal-box">' +
                '<h3>⚔️ Challenge a Friend</h3>' +
                '<p style="color:var(--muted); font-size:0.85rem; margin-bottom:14px;">Topic: <b>' + topic + '</b> · Your score: <b>' + score + '</b></p>' +
                '<label class="field-label">Choose a player</label>' +
                '<select id="challenge-target" style="margin-bottom:14px;">' +
                    players.map(p => '<option value="' + p + '">' + p + '</option>').join('') +
                '</select>' +
                '<button class="btn primary" onclick="window.fbSendChallenge(\'' + cat + '\',\'' + sub + '\',\'' + ssc + '\',' + score + ')">Send Challenge ⚔️</button>' +
                '<button class="btn secondary" style="margin-top:8px;" onclick="document.getElementById(\'challenge-modal\').remove()">Cancel</button>' +
            '</div>';

        document.body.appendChild(modal);

    } catch (err) {
        showToast('Could not load players.', 'error');
    }
};

/* ================================================================
   SHARING — Send a challenge
   ================================================================ */
window.fbSendChallenge = async function(cat, sub, ssc, score) {
    const myName = window.userDoc ? window.userDoc.username : '';
    const target = document.getElementById('challenge-target')?.value;
    if (!target) return;

    const topic = ssc || sub || cat;

    try {
        const chalId = myName + '_' + target + '_' + Date.now();
        await setDoc(doc(db_fire, 'challenges', chalId), {
            from:      myName,
            to:        target,
            topic,
            cat,
            sub,
            ssc,
            score,
            status:    'pending',
            createdAt: Date.now()
        });

        document.getElementById('challenge-modal')?.remove();
        showToast('Challenge sent to ' + target + '! ⚔️', 'success', 3500);

    } catch (err) {
        showToast('Could not send challenge.', 'error');
    }
};

/* ================================================================
   SHARING — Accept a challenge (launches the quiz on that topic)
   ================================================================ */
window.acceptChallenge = function(chalId, from, topic, cat, sub, ssc) {
    window._activeChallengeId = chalId;
    window._activeChallengeFrom = from;
    window._activeChallengeScore = null; // will be set in endQuiz via fbCheckChallengeResult
    showToast('Starting challenge vs ' + from + '! Good luck! ⚔️', 'info', 2500);
    setTimeout(() => startQuiz(cat, sub, ssc), 600);
};

/* ================================================================
   SHARING — After quiz, check if active challenge was beaten
   ================================================================ */
window.fbCheckChallengeResult = async function(finalScore) {
    const chalId = window._activeChallengeId;
    if (!chalId) return;

    const myName = window.userDoc ? window.userDoc.username : '';

    try {
        const snap = await getDoc(doc(db_fire, 'challenges', chalId));
        if (!snap.exists()) return;
        const ch = snap.data();

        if (finalScore > ch.score) {
            // Beaten — update status
            await setDoc(doc(db_fire, 'challenges', chalId), { ...ch, status: 'beaten', beatenBy: myName, beatenScore: finalScore });
            showToast('You beat the challenge! 🏆 ' + ch.from + ' will be notified.', 'success', 4000);

            // Leave a notification on the challenger's userDoc
            const challengerSnap = await getDocs(collection(db_fire, 'users'));
            challengerSnap.forEach(async d => {
                if (d.data().username === ch.from) {
                    const cData = d.data();
                    const notifs = cData.notifications || [];
                    notifs.unshift({
                        msg: myName + ' beat your challenge on ' + ch.topic + '! (' + finalScore + ' vs ' + ch.score + ')',
                        seen: false,
                        ts:   Date.now()
                    });
                    await setDoc(doc(db_fire, 'users', d.id), { ...cData, notifications: notifs.slice(0, 10) });
                }
            });
        } else {
            showToast('Good try! You didn\'t beat ' + ch.from + '\'s score of ' + ch.score + ' this time.', 'info', 4000);
        }
    } catch (err) {
        // silently fail — don't disrupt the results screen
    }

    window._activeChallengeId   = null;
    window._activeChallengeFrom = null;
};

/* ================================================================
   SHARING — Load challenge notifications on dashboard
   ================================================================ */
window.fbLoadChallengeBanner = async function() {
    const myName = window.userDoc ? window.userDoc.username : '';
    const banner = document.getElementById('challenge-banner');
    if (!banner || !myName) return;

    try {
        // Pending incoming challenges
        const snap    = await getDocs(collection(db_fire, 'challenges'));
        const pending = [];
        snap.forEach(d => {
            const ch = d.data();
            if (ch.to === myName && ch.status === 'pending') pending.push(ch);
        });

        // Unseen notifications
        const notifs = (window.userDoc.notifications || []).filter(n => !n.seen);

        if (pending.length === 0 && notifs.length === 0) {
            banner.classList.add('hidden');
            return;
        }

        banner.classList.remove('hidden');
        banner.innerHTML = '';

        notifs.forEach(n => {
            const el = document.createElement('div');
            el.className = 'challenge-notif';
            el.innerHTML = '🏆 ' + n.msg;
            banner.appendChild(el);
        });

        if (pending.length > 0) {
            const el = document.createElement('div');
            el.className = 'challenge-notif incoming-notif';
            el.innerHTML =
                '⚔️ You have <b>' + pending.length + '</b> pending challenge' + (pending.length > 1 ? 's' : '') + '! ' +
                '<button class="btn primary sm" style="margin-left:8px;" onclick="showShare()">View →</button>';
            banner.appendChild(el);
        }

    } catch (err) { /* silent */ }
};
