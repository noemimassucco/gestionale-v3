// =======================================================
// MODULE: notifications.js
// =======================================================

function markNotifRead(id) {
  _readNotifs.add(id);
  localStorage.setItem('notif_read', JSON.stringify([..._readNotifs]));
}

function markAllNotifRead() {
  _notifSAAll.forEach(n => markNotifRead(n._uid||n.titolo+n.tipo));
  renderNotifSAList();
  updateNotifBadge(0);
  toast('✅ Tutte le notifiche segnate come lette');
}

function updateNotifBadge(n) {
  ['notif-badge-cnt','sb-notif-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) { el.textContent = n; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  });
}

async function loadNotificheSA() {
  _notifSAAll = await api('/api/notifiche') || [];
  // Assign unique IDs
  _notifSAAll.forEach((n, i) => { n._uid = n.tipo + '_' + (n.sub||'') + '_' + i; });
  const unread = _notifSAAll.filter(n => !_readNotifs.has(n._uid)).length;
  const cnt = document.getElementById('notif-sa-cnt');
  if (cnt) cnt.textContent = `${_notifSAAll.length} notifiche · ${unread} non lette`;
  updateNotifBadge(unread);
  renderNotifSAList();
}

function renderNotifSAList() {
  const items = _notifSAFiltro === 'tutte' ? _notifSAAll : _notifSAAll.filter(n => n.tipo === _notifSAFiltro);
  const icons = { urgente:'⚠️', scadenza_doc:'📄', scadenza_man:'🔨', istat:'📈', incompleto:'⚠️' };
  const colors = { urgente:'var(--red)', scadenza_doc:'var(--accent)', scadenza_man:'var(--orange)', istat:'#a3e635', incompleto:'var(--muted)' };
  const labels = { urgente:'Urgente', scadenza_doc:'Scadenza documento', scadenza_man:'Scadenza manutenzione', istat:'ISTAT dovuto', incompleto:'Dati incompleti' };
  const navTargets = { urgente:'interventi', scadenza_doc:'documenti', scadenza_man:'manutenzioni', istat:'subs', incompleto:'subs' };

  const container = document.getElementById('notif-sa-list');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<div class="empty">🎉 Nessuna notifica per questa categoria</div>';
    return;
  }

  // Add "mark all read" button at top
  const unread = items.filter(n => !_readNotifs.has(n._uid)).length;
  container.innerHTML = (unread > 0 ? `<div class="flex-between" style="margin-bottom:12px;"><span style="font-size:12px;color:var(--muted);">${unread} non lette</span><button class="btn btn-sm btn-gray" onclick="markAllNotifRead()">✓ Segna tutte come lette</button></div>` : '') +
    items.map(n => {
      const isRead = _readNotifs.has(n._uid);
      const nav = navTargets[n.tipo] || 'notifiche';
      return `<div class="notif-item${isRead?' read':''}" onclick="markNotifRead('${n._uid}');renderNotifSAList();updateNotifBadge(document.querySelectorAll('.notif-item:not(.read)').length);showSection('${nav}')">
        <div class="notif-dot" style="background:${isRead?'var(--border)':colors[n.tipo]||'var(--muted)'};"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:${isRead?400:600};color:${isRead?'var(--muted)':'#fff'};margin-bottom:2px;">${esc(n.titolo||labels[n.tipo]||'Notifica')}</div>
          <div style="font-size:11px;color:var(--muted);">${labels[n.tipo]||n.tipo}${n.sub?' · SUB '+esc(n.sub):''}${n.sede?' · '+esc(n.sede):''}${n.descrizione?' — '+esc(n.descrizione.slice(0,60)):''}</div>
        </div>
        <div class="notif-actions">
          ${n.giorni!==undefined && n.giorni!==null?`<span style="font-size:10px;font-weight:700;color:${colors[n.tipo]||'var(--muted)'};white-space:nowrap;">${parseInt(n.giorni)<0?'Scaduto':''+parseInt(n.giorni)+'gg'}</span>`:''}
          <span style="font-size:10px;color:var(--muted);margin-left:6px;">→ ${nav}</span>
        </div>
      </div>`;
    }).join('');
}

function filterNotifSA(tipo, btn) {
  _notifSAFiltro = tipo;
  document.querySelectorAll('#sec-notifiche .tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderNotifSAList();
}