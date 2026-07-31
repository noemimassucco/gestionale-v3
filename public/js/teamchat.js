// =======================================================
// MODULE: teamchat.js — chat interna tra dipendenti
// =======================================================

let _tcLastId = 0;
let _tcPollId = null;
let _tcMessages = [];

function _tcMyId() { return currentUser?.id; }

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
          <div style="font-size:13px;color:var(--text);white-space:pre-wrap;word-break:break-word;">${esc(m.testo)}</div>
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
  const msgs = await api('/api/team-chat');
  if (!msgs) return;
  _tcMessages = msgs;
  _tcLastId = msgs.length ? msgs[msgs.length - 1].id : 0;
  _tcRender();
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
