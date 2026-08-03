// ═══════════════════════════════════════════════════════════
// auth.js — Login, logout, session management
// ═══════════════════════════════════════════════════════════

async function initApp() {
  // Controlla se c'è già una sessione salvata
  const savedToken = sessionStorage.getItem('token');
  const savedUser  = sessionStorage.getItem('user');

  if (savedToken && savedUser) {
    // Sessione valida — entra nell'app
    try {
      token = savedToken;
      currentUser = JSON.parse(savedUser);
      _showApp();
      try { await loadDD(); showSection('dashboard'); } // showSection chiama già loadDashboard()
      catch(renderErr) { console.error('Errore render iniziale:', renderErr); }
    } catch(e) {
      // Token scaduto o corrotto — torna al login
      _showLogin();
    }
  } else {
    // Nessuna sessione — mostra login
    _showLogin();
  }
}

function _showLogin() {
  const ls = document.getElementById('login-screen');
  const aw = document.getElementById('app-wrapper');
  if (ls) ls.style.display = 'flex';
  if (aw) aw.classList.remove('active');
}

function _showApp() {
  startPromemoriaPolling();
  if (typeof startMenzioniPolling === 'function') startMenzioniPolling();
  if (typeof startPerTePolling === 'function') startPerTePolling();
  const ls = document.getElementById('login-screen');
  const aw = document.getElementById('app-wrapper');
  if (ls) ls.style.display = 'none';
  if (aw) aw.classList.add('active');
  const badge = document.getElementById('user-badge');
  if (badge) badge.textContent = '👤 ' + (currentUser?.nome || currentUser?.email || '');
}

async function doLogin() {
  const emailEl = document.getElementById('login-email');
  const pwdEl   = document.getElementById('login-pwd');
  const errEl   = document.getElementById('login-err');
  const btnEl   = document.getElementById('btn-login');

  if (!emailEl || !pwdEl) return;

  const email = emailEl.value.trim();
  const pwd   = pwdEl.value;

  if (!email || !pwd) {
    if (errEl) { errEl.textContent = '❌ Inserisci email e password'; errEl.style.display = 'block'; }
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Accesso in corso…'; }

  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pwd }),
    });
    const d = await r.json();

    if (!r.ok) {
      if (errEl) { errEl.textContent = '❌ ' + (d.error || 'Email o password errati'); errEl.style.display = 'block'; }
      return;
    }

    // Salva sessione
    token = d.token;
    currentUser = d.user;
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(currentUser));

    // Entra nell'app
    _showApp();
    await loadDD();
    loadDashboard();
    showSection('dashboard');

  } catch(e) {
    if (errEl) { errEl.textContent = '❌ Errore di connessione — riprova'; errEl.style.display = 'block'; }
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Accedi al gestionale →'; }
  }
}

// ── PASSWORD DIMENTICATA ──
function toggleForgotBox() {
  const box = document.getElementById('forgot-box');
  if (!box) return;
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if (box.style.display === 'block') {
    const fe = document.getElementById('forgot-email');
    const le = document.getElementById('login-email');
    if (fe) { if (le?.value && !fe.value) fe.value = le.value; fe.focus(); }
  }
}

async function sendForgot() {
  const fe  = document.getElementById('forgot-email');
  const msg = document.getElementById('forgot-msg');
  const btn = document.getElementById('forgot-btn');
  const email = (fe?.value || '').trim();
  if (!email) { if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--danger)'; msg.textContent = 'Inserisci la tua email'; } return; }
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const r = await fetch('/api/auth/forgot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const d = await r.json().catch(() => ({}));
    if (msg) {
      msg.style.display = 'block';
      if (r.ok) { msg.style.color = 'var(--success)'; msg.textContent = '✓ ' + (d.msg || 'Controlla la tua casella email'); }
      else { msg.style.color = 'var(--danger)'; msg.textContent = d.error || 'Operazione non riuscita'; }
    }
  } catch(e) {
    if (msg) { msg.style.display = 'block'; msg.style.color = 'var(--danger)'; msg.textContent = 'Server non raggiungibile'; }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Invia'; }
}

function doLogout() {
  if(typeof _promIntervalId!=='undefined'&&_promIntervalId){clearInterval(_promIntervalId);_promIntervalId=null;}
  if(typeof _tcMenzPollId!=='undefined'&&_tcMenzPollId){clearInterval(_tcMenzPollId);_tcMenzPollId=null;}
  if(typeof _perteInterval!=='undefined'&&_perteInterval){clearInterval(_perteInterval);_perteInterval=null;}
  sessionStorage.clear();
  token = '';
  currentUser = null;
  _showLogin();
  // Reset form
  const e = document.getElementById('login-email');
  const p = document.getElementById('login-pwd');
  if (e) e.value = '';
  if (p) p.value = '';
}

// Legacy aliases (used in other modules)
function goHome()  { _showLogin(); }
function goToApp() { _showApp(); }
