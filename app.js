import { initializeApp }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs }
    from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

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
   CONSTANTS
   ================================================================ */
const QUIZ_URL = 'https://ovieofdelta.github.io/medlablcuquiz_website';

const BADGE_DATA = {
    "Chemical Pathologist":  "🧪",
    "Histopathologist":      "🥼",
    "Hematologist":          "🩸",
    "Microbiologist":        "🔬",
    "Laboratory Management": "🛡️"
};

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
   ================================================================ */
async function init() {
    const theme = localStorage.getItem('medlab_theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-icon').innerText = theme === 'dark' ? '☀️' : '🌙';

    try {
        const res = await fetch('questions.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        quizData = await res.json();
        console.log('Loaded ' + quizData.length + ' questions.');
    } catch (e) {
        console.error('questions.json failed:', e);
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
    toast.innerText = msg;
    void toast.offsetWidth;
    toast.classList.add('show', 'toast-' + type);
    toastTimer = setTimeout(function() { toast.classList.remove('show'); }, duration);
}

/* ================================================================
   HIDE ALL SCREENS
   ================================================================ */
function hideAll() {
    clearInterval(timer);
    ['auth-s','main-s','sub-s','game-s','res-s','lead-s','share-s','trophy-s','settings-s']
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
        document.getElementById('auth-msg').innerText     = 'Create your account';
        document.getElementById('auth-main-btn').innerText = 'Register';
        document.getElementById('reg-extra').classList.remove('hidden');
        document.getElementById('btn-reg').classList.add('hidden');
        document.getElementById('btn-login').classList.remove('hidden');
    } else if (mode === 'forgot') {
        document.getElementById('auth-msg').innerText     = 'Recover your password';
        document.getElementById('auth-main-btn').innerText = 'Recover';
        document.getElementById('p-in').classList.add('hidden');
        document.getElementById('forgot-extra').classList.remove('hidden');
        document.getElementById('btn-forgot').classList.add('hidden');
        document.getElementById('btn-login').classList.remove('hidden');
    } else {
        document.getElementById('auth-msg').innerText     = 'Login to track your trophies';
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
   ================================================================ */
function toggleCustomFile() {
    const isCustom = document.getElementById('avatar-in').value === 'custom';
    document.getElementById('file-reg').classList.toggle('hidden', !isCustom);
}

function handleImageUpload(input, previewId) {
    const file = input.files[0];
    if (!file) return;
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
            customImg = canvas.toDataURL('image/jpeg', 0.7);
            const preview = document.getElementById(previewId);
            preview.src = customImg;
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
    document.getElementById('sub-title').innerText = cat;

    const list = document.getElementById('sub-list-dynamic');
    list.innerHTML = '';
    var subs = Array.from(new Set(quizData.filter(function(q) { return q.c === cat; }).map(function(q) { return q.sc; })));
    subs.forEach(function(sub) {
        const item = document.createElement('div');
        item.className = 'sub-item';
        item.innerHTML = '<div class="sub-item-title"><span>' + sub + '</span><span>➔</span></div>';
        item.onclick = function() { showSubSubMenu(cat, sub); };
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
    var sscs = Array.from(new Set(quizData.filter(function(q) { return q.c === cat && q.sc === sub; }).map(function(q) { return q.ssc; })));
    const d = window.userDoc || {};

    sscs.forEach(function(ssc) {
        const total    = quizData.filter(function(q) { return q.ssc === ssc; }).length;
        const mastered = (d.mastery && d.mastery[ssc]) ? d.mastery[ssc].length : 0;
        const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0;
        const item     = document.createElement('div');
        item.className = 'sub-item';
        item.innerHTML =
            '<div class="sub-item-title">' +
                '<span>' + ssc + '</span>' +
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
    back.innerText = '← Back to ' + cat;
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
    document.getElementById('q-text').innerText     = q.q;
    document.getElementById('game-stats').innerText = 'Q ' + (qIdx + 1) + ' / ' + currentQ.length;
    document.getElementById('game-progress').style.width = ((qIdx / currentQ.length) * 100) + '%';

    const opts = document.getElementById('opt-container');
    opts.innerHTML = '';
    q.o.forEach(function(o) {
        const b = document.createElement('button');
        b.className = 'btn secondary animate-pop';
        b.innerText = o;
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
        fbSaveHighScore(score);
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
            div.innerHTML = '<span>' + m.q + '</span><br><b>✅ ' + m.a + '</b>' +
                            (m.ex ? '<div class="explanation">' + m.ex + '</div>' : '');
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
    document.getElementById('invite-code-display').innerText = code;
    document.getElementById('share-link-display').innerText  = QUIZ_URL;
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
function generateInviteCode(username) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) + '-' + suffix;
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
   FIREBASE AUTH — REGISTER
   ================================================================ */
async function fbRegister() {
    const username  = document.getElementById('u-in').value.trim();
    const password  = document.getElementById('p-in').value.trim();
    const hint      = document.getElementById('hint-in').value.trim();
    const av        = document.getElementById('avatar-in').value;
    const codeEl    = document.getElementById('invite-code-in');
    const invitedBy = codeEl ? codeEl.value.trim().toUpperCase() : null;

    if (!username) { showToast('Please enter a username.', 'error'); return; }
    if (!password) { showToast('Please enter a password.', 'error'); return; }
    if (password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }

    const fakeEmail = username.toLowerCase().replace(/\s+/g, '_') + '@medlabquiz.local';
    try {
        showToast('Creating account…', 'info', 5000);
        const cred        = await createUserWithEmailAndPassword(fbAuth, fakeEmail, password);
        const uid         = cred.user.uid;
        const finalAvatar = (av === 'custom' && customImg) ? customImg : av;
        const inviteCode  = generateInviteCode(username);

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
            notifications: []
        });

        customImg = null;
        showToast('Account created! Please log in. ✅', 'success', 3500);
        setTimeout(function() { setAuthMode('login'); }, 400);
    } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
            showToast('Username already taken.', 'error');
        } else if (err.code === 'auth/weak-password') {
            showToast('Password must be at least 6 characters.', 'error');
        } else {
            showToast('Registration failed. Please try again.', 'error');
            console.error(err);
        }
    }
}

/* ================================================================
   FIREBASE AUTH — LOGIN
   ================================================================ */
async function fbLogin() {
    const username = document.getElementById('u-in').value.trim();
    const password = document.getElementById('p-in').value.trim();

    if (!username) { showToast('Please enter a username.', 'error'); return; }
    if (!password) { showToast('Please enter a password.', 'error'); return; }

    const fakeEmail = username.toLowerCase().replace(/\s+/g, '_') + '@medlabquiz.local';
    try {
        showToast('Signing in…', 'info', 5000);
        await signInWithEmailAndPassword(fbAuth, fakeEmail, password);
        // onAuthStateChanged takes it from here
    } catch (err) {
        showToast('Invalid username or password.', 'error');
    }
}

/* ================================================================
   FIREBASE AUTH — FORGOT PASSWORD
   ================================================================ */
async function fbForgot() {
    const username = document.getElementById('u-in').value.trim();
    const hint     = document.getElementById('hint-recover').value.trim();

    if (!username) { showToast('Please enter your username.', 'error'); return; }

    try {
        showToast('Checking…', 'info', 5000);
        const snap = await getDocs(collection(fbDb, 'users'));
        var found  = null;
        snap.forEach(function(d) { if (d.data().username === username) found = d.data(); });

        if (found && found.hint === hint) {
            showToast('Hint matched! ✅ Contact your admin to reset your password.', 'success', 5000);
        } else {
            showToast('Username or hint is incorrect.', 'error');
        }
    } catch (err) {
        showToast('Could not check. Please try again.', 'error');
    }
}

/* ================================================================
   DASHBOARD
   ================================================================ */
async function fbShowMain() {
    hideAll();
    document.getElementById('main-s').classList.remove('hidden');

    const d = window.userDoc;
    if (!d) { logout(); return; }

    const today = new Date().setHours(0, 0, 0, 0);
    var streakIncreased = false;
    if (!d.lastLogin) {
        d.streak = 1; streakIncreased = true;
    } else if (today === d.lastLogin + 86400000) {
        d.streak++; streakIncreased = true;
    } else if (today > d.lastLogin) {
        d.streak = 1;
    }
    d.lastLogin = today;
    await saveUserDoc();

    const avatarSlot = document.getElementById('display-avatar');
    if (d.avatar && d.avatar.length > 10) {
        avatarSlot.innerHTML = '<img src="' + d.avatar + '" class="avatar-img">';
    } else {
        avatarSlot.innerText = d.avatar || '👤';
    }

    document.getElementById('display-user').innerText = d.username || '';

    const highEl = document.getElementById('display-high');
    highEl.innerHTML = (!d.high || d.high === 0)
        ? '<span style="color:var(--muted);">No quiz completed yet</span>'
        : 'High: <b>' + d.high + '</b> pts';

    var rank, rp;
    if (!d.high || d.high === 0) { rank = '🎯 Unranked'; rp = 0; }
    else if (d.high >= 20)       { rank = '💎 Diamond';  rp = 100; }
    else if (d.high >= 10)       { rank = '🥇 Gold';     rp = Math.round((d.high / 20) * 100); }
    else if (d.high >= 5)        { rank = '🥈 Silver';   rp = Math.round((d.high / 20) * 100); }
    else                         { rank = '🥉 Bronze';   rp = Math.round((d.high / 20) * 100); }

    document.getElementById('display-rank').innerText    = rank;
    document.getElementById('rank-progress').style.width = rp + '%';
    document.getElementById('display-streak').innerText  = d.streak || 0;
    document.getElementById('display-streak').classList.toggle('streak-flame', streakIncreased);

    fbLoadChallengeBanner();
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
}

/* ================================================================
   SAVE HIGH SCORE
   ================================================================ */
async function fbSaveHighScore(s) {
    const d = window.userDoc;
    if (!d) return;
    if (s > (d.high || 0)) { d.high = s; await saveUserDoc(); }
}

/* ================================================================
   LEADERBOARD
   ================================================================ */
async function fbShowLeaderboard() {
    hideAll();
    document.getElementById('lead-s').classList.remove('hidden');
    const list = document.getElementById('lead-list');
    list.innerHTML = '<p style="text-align:center;color:var(--muted);">Loading…</p>';

    try {
        const snap   = await getDocs(collection(fbDb, 'users'));
        const ranked = [];
        snap.forEach(function(d) {
            const data = d.data();
            ranked.push({ name: data.username || d.id, score: data.high || 0, avatar: data.avatar || '👤' });
        });
        ranked.sort(function(a, b) { return b.score - a.score; });
        list.innerHTML = '';

        if (ranked.length === 0) { list.innerHTML = '<p style="text-align:center;">No players yet!</p>'; return; }

        const myName   = window.userDoc ? window.userDoc.username : '';
        const played   = ranked.filter(function(p) { return p.score > 0; });
        const unranked = ranked.filter(function(p) { return p.score === 0; });

        played.forEach(function(p, i) {
            const row        = document.createElement('div');
            row.className    = 'lead-row' + (p.name === myName ? ' me' : '');
            const medal      = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
            const avatarHtml = p.avatar.length > 10 ? '<img src="' + p.avatar + '" class="avatar-img" style="width:28px;height:28px;">' : p.avatar;
            row.innerHTML    = '<span>' + medal + ' ' + avatarHtml + ' ' + p.name + (p.name === myName ? ' (You)' : '') + '</span><b>' + p.score + ' pts</b>';
            list.appendChild(row);
        });

        if (unranked.length > 0) {
            const div = document.createElement('div');
            div.style.cssText = 'text-align:center;font-size:0.75rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);padding:12px 0 6px;border-top:1px dashed var(--border);margin-top:8px;';
            div.innerText = '— Not Yet Ranked —';
            list.appendChild(div);
            unranked.forEach(function(p) {
                const row        = document.createElement('div');
                row.className    = 'lead-row' + (p.name === myName ? ' me' : '');
                row.style.opacity = '0.6';
                const avatarHtml = p.avatar.length > 10 ? '<img src="' + p.avatar + '" class="avatar-img" style="width:28px;height:28px;">' : p.avatar;
                row.innerHTML    = '<span>🎯 ' + avatarHtml + ' ' + p.name + (p.name === myName ? ' (You)' : '') + '</span><b style="color:var(--muted);font-size:0.8rem;">No quiz completed</b>';
                list.appendChild(row);
            });
        }
    } catch (err) {
        list.innerHTML = '<p style="text-align:center;color:var(--danger);">Could not load leaderboard.</p>';
    }
}

/* ================================================================
   TROPHIES
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
            '<div style="font-size:2.5rem;filter:' + (owned ? 'none' : 'grayscale(1) opacity(0.25)') + ';margin-bottom:8px;">' + BADGE_DATA[name] + '</div>' +
            '<b>' + name + '</b>' +
            '<div style="font-size:0.72rem;color:var(--muted);margin-top:4px;">' + (owned ? '✅ Unlocked' : 'Locked') + '</div>';
        grid.appendChild(card);
    });
}

/* ================================================================
   SETTINGS
   ================================================================ */
async function fbUpdateSettings() {
    const d  = window.userDoc;
    const np = document.getElementById('set-pass').value.trim();
    const av = document.getElementById('set-avatar').value;

    d.avatar = (customImg) ? customImg : av;
    await saveUserDoc();

    if (np) {
        if (np.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
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
   ================================================================ */
async function fbLoadChallenges() {
    const list   = document.getElementById('challenges-list');
    const myName = window.userDoc ? window.userDoc.username : '';
    if (!list || !myName) return;

    try {
        const snap = await getDocs(collection(fbDb, 'challenges'));
        const all  = [];
        snap.forEach(function(d) { const ch = d.data(); ch._id = d.id; if (ch.from === myName || ch.to === myName) all.push(ch); });
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
            if (ch.status === 'pending') badge = '<span class="ch-badge pending">⏳ Pending</span>';
            else if (ch.status === 'beaten') badge = '<span class="ch-badge beaten">🏆 Beaten!</span>';

            if (isIncoming) {
                card.innerHTML =
                    '<div class="ch-header">' + badge + '<span class="ch-tag incoming-tag">INCOMING</span></div>' +
                    '<b>' + ch.from + '</b> challenges you on <b>' + ch.topic + '</b><br>' +
                    '<span style="color:var(--danger);font-weight:800;">Beat their score: ' + ch.score + '</span>' +
                    (ch.status === 'pending' ? '<button class="btn primary sm" style="margin-top:10px;width:100%;" onclick="acceptChallenge(\'' + ch._id + '\',\'' + ch.from + '\',\'' + ch.topic + '\',\'' + (ch.cat||'') + '\',\'' + (ch.sub||'') + '\',\'' + (ch.ssc||'') + '\')">⚔️ Accept &amp; Play</button>' : '');
            } else {
                card.innerHTML =
                    '<div class="ch-header">' + badge + '<span class="ch-tag outgoing-tag">OUTGOING</span></div>' +
                    'You challenged <b>' + ch.to + '</b> on <b>' + ch.topic + '</b><br>' +
                    '<span style="color:var(--muted);font-size:0.85rem;">Your score: ' + ch.score + '</span>';
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
        const snap    = await getDocs(collection(fbDb, 'users'));
        const players = [];
        snap.forEach(function(d) { const data = d.data(); if (data.username && data.username !== myName) players.push(data.username); });

        if (players.length === 0) { showToast('No other players registered yet.', 'info'); return; }

        var existing = document.getElementById('challenge-modal');
        if (existing) existing.remove();

        const modal     = document.createElement('div');
        modal.id        = 'challenge-modal';
        modal.className = 'challenge-modal-overlay';
        modal.innerHTML =
            '<div class="challenge-modal-box">' +
                '<h3>⚔️ Challenge a Friend</h3>' +
                '<p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;">Topic: <b>' + topic + '</b> · Your score: <b>' + score + '</b></p>' +
                '<label class="field-label">Choose a player</label>' +
                '<select id="challenge-target" style="margin-bottom:14px;">' +
                    players.map(function(p) { return '<option value="' + p + '">' + p + '</option>'; }).join('') +
                '</select>' +
                '<button class="btn primary" onclick="fbSendChallenge()">Send Challenge ⚔️</button>' +
                '<button class="btn secondary" style="margin-top:8px;" onclick="document.getElementById(\'challenge-modal\').remove()">Cancel</button>' +
            '</div>';
        document.body.appendChild(modal);
    } catch (err) {
        showToast('Could not load players.', 'error');
    }
}

async function fbSendChallenge() {
    const myName = window.userDoc ? window.userDoc.username : '';
    const target = document.getElementById('challenge-target') ? document.getElementById('challenge-target').value : null;
    if (!target) return;
    const topic = currentSsc || currentSub || currentCat;
    try {
        await setDoc(doc(fbDb, 'challenges', myName + '_' + target + '_' + Date.now()), {
            from: myName, to: target, topic: topic,
            cat: currentCat, sub: currentSub, ssc: currentSsc,
            score: score, status: 'pending', createdAt: Date.now()
        });
        document.getElementById('challenge-modal').remove();
        showToast('Challenge sent to ' + target + '! ⚔️', 'success', 3500);
    } catch (err) {
        showToast('Could not send challenge.', 'error');
    }
}

function acceptChallenge(chalId, from, topic, cat, sub, ssc) {
    window._activeChallengeId   = chalId;
    window._activeChallengeFrom = from;
    showToast('Starting challenge vs ' + from + '! Good luck! ⚔️', 'info', 2500);
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
        if (finalScore > ch.score) {
            await setDoc(doc(fbDb, 'challenges', chalId), Object.assign({}, ch, { status: 'beaten', beatenBy: myName, beatenScore: finalScore }));
            showToast('You beat the challenge! 🏆 ' + ch.from + ' will be notified.', 'success', 4000);
            const usersSnap = await getDocs(collection(fbDb, 'users'));
            usersSnap.forEach(async function(d) {
                if (d.data().username === ch.from) {
                    const cData  = d.data();
                    const notifs = (cData.notifications || []);
                    notifs.unshift({ msg: myName + ' beat your challenge on ' + ch.topic + '! (' + finalScore + ' vs ' + ch.score + ')', seen: false, ts: Date.now() });
                    await setDoc(doc(fbDb, 'users', d.id), Object.assign({}, cData, { notifications: notifs.slice(0, 10) }));
                }
            });
        } else {
            showToast("Good try! You didn't beat " + ch.from + "'s score of " + ch.score + " this time.", 'info', 4000);
        }
    } catch (err) { /* silent */ }
    window._activeChallengeId = null;
}

async function fbLoadChallengeBanner() {
    const myName = window.userDoc ? window.userDoc.username : '';
    const banner = document.getElementById('challenge-banner');
    if (!banner || !myName) return;
    try {
        const snap    = await getDocs(collection(fbDb, 'challenges'));
        const pending = [];
        snap.forEach(function(d) { const ch = d.data(); if (ch.to === myName && ch.status === 'pending') pending.push(ch); });
        const notifs  = ((window.userDoc.notifications || []).filter(function(n) { return !n.seen; }));
        if (pending.length === 0 && notifs.length === 0) { banner.classList.add('hidden'); return; }
        banner.classList.remove('hidden');
        banner.innerHTML = '';
        notifs.forEach(function(n) {
            const el = document.createElement('div');
            el.className = 'challenge-notif';
            el.innerHTML = '🏆 ' + n.msg;
            banner.appendChild(el);
        });
        if (pending.length > 0) {
            const el = document.createElement('div');
            el.className = 'challenge-notif incoming-notif';
            el.innerHTML = '⚔️ You have <b>' + pending.length + '</b> pending challenge' + (pending.length > 1 ? 's' : '') + '! <button class="btn primary sm" style="margin-left:8px;" onclick="showShare()">View →</button>';
            banner.appendChild(el);
        }
    } catch (err) { /* silent */ }
}

/* ================================================================
   AUTH STATE OBSERVER — runs on every page load
   ================================================================ */
onAuthStateChanged(fbAuth, async function(fbUser) {
    if (fbUser) {
        const data = await loadUserDoc(fbUser.uid);
        if (data) {
            showLoginLoader(function() { fbShowMain(); });
        }
    }
    // Not signed in — auth screen is already visible by default
});

/* ================================================================
   EXPOSE EVERYTHING TO window FOR HTML onclick= HANDLERS
   ================================================================ */
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
