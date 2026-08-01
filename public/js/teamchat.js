// =======================================================
// MODULE: teamchat.js — chat interna tra dipendenti
// =======================================================

let _tcLastId = 0;
let _tcPollId = null;
let _tcMessages = [];
let _tcUsers = [];          // cache utenti per @menzioni
let _tcMenzPollId = null;   // polling globale menzioni (badge)
let _tcMenzCount = 0;

function _tcMyId() { return currentUser?.id; }

// Evidenzia le @menzioni nel testo già escapato (le mie in arancio pieno)
function _tcHighlightMentions(escaped) {
  let out = escaped;
  const io = currentUser;
  _tcUsers.forEach(u => {
    const nomi = [];
    if (u.nome) { nomi.push(u.nome); nomi.push(u.nome.split(/\s+/)[0]); }
    if (u.email) nomi.push(u.email.split('@')[0]);
    nomi.filter(Boolean).sort((a,b)=>b.length-a.length).forEach(n => {
      const rx = new RegExp('@(' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      const mine = io && u.id === io.id;
      out = out.replace(rx, `<span style="background:${mine?'var(--terra,#c2542e)':'var(--terra-bg,#f7e5dc)'};color:${mine?'#fff':'var(--terra-dark,#a03f1e)'};border-radius:5px;padding:0 5px;font-weight:700;">@$1</span>`);
    });
  });
  return out;
}

async function _tcLoadUsers() {
  if (_tcUsers.length) return;
  const u = await api('/api/users');
  if (Array.isArray(u)) _tcUsers = u.filter(x => x.attivo !== false);
}

// ── AUTOCOMPLETE @: mentre scrivo "@mar" propone gli utenti ──
function _tcMentionBox() {
  let box = document.getElementById('tc-mention-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'tc-mention-box';
    box.style.cssText = 'position:absolute;bottom:100%;left:0;margin-bottom:6px;background:var(--card);border:1px solid var(--border-2);border-radius:10px;box-shadow:0 8px 24px rgba(20,25,20,.15);z-index:60;display:none;min-width:220px;max-height:200px;overflow-y:auto;';
    const inp = document.getElementById('teamchat-input');
    if (inp && inp.parentElement) {
      inp.parentElement.style.position = 'relative';
      inp.parentElement.appendChild(box);
    }
  }
  return box;
}

function _tcCheckMentionTyping() {
  const inp = document.getElementById('teamchat-input');
  const box = _tcMentionBox();
  if (!inp || !box) return;
  const pos = inp.selectionStart ?? inp.value.length;
  const before = inp.value.slice(0, pos);
  const m = before.match(/@([\wÀ-ú]*)$/);
  if (!m) { box.style.display = 'none'; return; }
  const q = m[1].toLowerCase();
  const match = _tcUsers.filter(u => u.id !== _tcMyId() && (
    (u.nome || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().startsWith(q)
  )).slice(0, 6);
  if (!match.length) { box.style.display = 'none'; return; }
  box.innerHTML = match.map(u => `
    <div onclick="_tcInsertMention(${u.id})" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <span style="width:24px;height:24px;border-radius:50%;background:var(--terra-bg,#f7e5dc);color:var(--terra-dark,#a03f1e);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${esc((u.nome||u.email||'?').slice(0,1).toUpperCase())}</span>
      <span style="font-weight:600;">${esc(u.nome || u.email)}</span>
    </div>`).join('');
  box.style.display = 'block';
}

function _tcInsertMention(userId) {
  const u = _tcUsers.find(x => x.id === userId);
  const inp = document.getElementById('teamchat-input');
  const box = _tcMentionBox();
  if (!u || !inp) return;
  const pos = inp.selectionStart ?? inp.value.length;
  const before = inp.value.slice(0, pos).replace(/@[\wÀ-ú]*$/, '@' + (u.nome || u.email.split('@')[0]) + ' ');
  inp.value = before + inp.value.slice(pos);
  box.style.display = 'none';
  inp.focus();
  inp.selectionStart = inp.selectionEnd = before.length;
}

// ── BADGE MENZIONI (polling globale, anche fuori dalla chat) ──
async function checkMenzioni() {
  if (typeof token === 'undefined' || !token) return;
  const r = await api('/api/team-chat/menzioni');
  if (!r || r.error) return;
  const badge = document.getElementById('sb-teamchat-badge');
  if (badge) {
    badge.textContent = r.count;
    badge.classList.toggle('hidden', !r.count);
  }
  // Nuove menzioni rispetto all'ultimo controllo → toast + notifica desktop
  if (r.count > _tcMenzCount && r.menzioni?.length) {
    const ultima = r.menzioni[0];
    const inChat = document.getElementById('sec-teamchat')?.classList.contains('active');
    if (!inChat) {
      toast('💬 ' + ultima.autore + ' ti ha menzionato nella Chat Team', 'warning');
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try { new Notification('Chat Team — ' + ultima.autore, { body: ultima.testo.slice(0, 120), icon: 'icon-192.png' }); } catch(e) {}
      }
    } else {
      tcSegnaMenzioniLette();
    }
  }
  _tcMenzCount = r.count;
}

function startMenzioniPolling() {
  if (_tcMenzPollId) clearInterval(_tcMenzPollId);
  checkMenzioni();
  _tcMenzPollId = setInterval(checkMenzioni, 30000);
}

async function tcSegnaMenzioniLette() {
  await api('/api/team-chat/menzioni/lette', { method: 'POST' });
  _tcMenzCount = 0;
  const badge = document.getElementById('sb-teamchat-badge');
  if (badge) badge.classList.add('hidden');
}

function _tcRender() {
  const el = document.getElementById('teamchat-list');
  if (!el) return;
  if (!_tcMessages.length) {
    el.innerHTML = '<div class="empty">Nessun messaggio. Scrivi il primo!</div>';
    return;
  }
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  let lastDay = '';
  el.innerHTML = _tcMessages.map(m => {
    const mine = m.user_id === _tcMyId();
    const d = new Date(m.created_at);
    const day = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long' });
    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    let sep = '';
    if (day !== lastDay) { lastDay = day; sep = `<div style="text-align:center;margin:14px 0 8px;"><span style="font-size:10px;color:var(--muted);background:var(--bg2);border-radius:10px;padding:2px 10px;">${day}</span></div>`; }
    return sep + `
      <div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin-bottom:8px;">
        <div style="max-width:72%;background:${mine ? 'var(--primary-bg)' : 'var(--card)'};border:1px solid ${mine ? 'var(--primary-2)' : 'var(--border)'};border-radius:${mine ? '12px 12px 3px 12px' : '12px 12px 12px 3px'};padding:8px 12px;box-shadow:var(--shadow-sm);">
          ${!mine ? `<div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:2px;">${esc(m.autore)}</div>` : ''}
          <div style="font-size:13px;color:var(--text);white-space:pre-wrap;word-break:break-word;">${_tcHighlightMentions(esc(m.testo))}</div>
          <div style="font-size:9px;color:var(--muted-2);text-align:right;margin-top:3px;display:flex;gap:8px;justify-content:flex-end;align-items:center;">
            ${mine ? `<span onclick="tcDelete(${m.id})" style="cursor:pointer;" title="Elimina">🗑</span>` : ''}
            <span>${time}</span>
          </div>
        </div>
      </div>`;
  }).join('');
  if (nearBottom || el.dataset.first !== '0') { el.scrollTop = el.scrollHeight; el.dataset.first = '0'; }
}

async function loadTeamChat() {
  await _tcLoadUsers();
  const msgs = await api('/api/team-chat');
  if (!msgs) return;
  _tcMessages = msgs;
  _tcLastId = msgs.length ? msgs[msgs.length - 1].id : 0;
  _tcRender();
  tcSegnaMenzioniLette();
  // Autocomplete @ + permesso notifiche desktop (solo la prima volta)
  const inp = document.getElementById('teamchat-input');
  if (inp && !inp.dataset.mentionsInit) {
    inp.dataset.mentionsInit = '1';
    inp.addEventListener('input', _tcCheckMentionTyping);
    inp.addEventListener('blur', () => setTimeout(() => { const b = document.getElementById('tc-mention-box'); if (b) b.style.display = 'none'; }, 250));
  }
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch(e) {}
  }
}

async function _tcPoll() {
  if (!document.getElementById('sec-teamchat')?.classList.contains('active')) return;
  const news = await api('/api/team-chat?after=' + _tcLastId);
  if (news && news.length) {
    _tcMessages.push(...news);
    if (_tcMessages.length > 300) _tcMessages = _tcMessages.slice(-300);
    _tcLastId = news[news.length - 1].id;
    _tcRender();
  }
}

function startTeamChatPolling() {
  stopTeamChatPolling();
  _tcPollId = setInterval(_tcPoll, 4000);
}
function stopTeamChatPolling() {
  if (_tcPollId) { clearInterval(_tcPollId); _tcPollId = null; }
}

async function tcSend() {
  const inp = document.getElementById('teamchat-input');
  const testo = (inp?.value || '').trim();
  if (!testo) return;
  inp.value = '';
  const r = await api('/api/team-chat', { method: 'POST', body: JSON.stringify({ testo }) });
  if (!r || r.error) { toast('Errore invio: ' + (r?.error || 'server non raggiungibile'), 'error'); inp.value = testo; return; }
  await _tcPoll();
  inp.focus();
}

async function tcDelete(id) {
  if (!await appConfirm('Eliminare questo messaggio?')) return;
  await api('/api/team-chat/' + id, { method: 'DELETE' });
  _tcMessages = _tcMessages.filter(m => m.id !== id);
  _tcRender();
}
