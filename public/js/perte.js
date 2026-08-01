'use strict';
// ═══════ "PER TE": popup notifiche personali (menzioni, account, sicurezza) ═══════

let _perteInterval = null;
let _perteMaxId = 0;      // id più alto già visto (per capire cosa è "nuovo")
let _perteFirstPoll = true;
let _perteCache = { count: 0, notifiche: [] };

const _PERTE_ICO = { menzione:'💬', account:'👋', sicurezza:'🔑', info:'🔔' };

async function checkPerTe() {
  if (typeof token === 'undefined' || !token) return;
  const r = await api('/api/mie-notifiche');
  if (!r || r.error) return;
  _perteCache = r;

  // Pallino rosso (niente numeri): notifiche non lette o promemoria urgenti
  _perteUpdateDot();

  // Toast + notifica desktop SOLO per le notifiche mai viste prima (non al primo giro)
  const nuove = (r.notifiche || []).filter(n => !n.letto && n.id > _perteMaxId);
  if (!_perteFirstPoll && nuove.length) {
    const n = nuove[0];
    toast((_PERTE_ICO[n.tipo] || '🔔') + ' ' + n.titolo, n.tipo === 'sicurezza' ? 'warning' : 'success');
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(n.titolo, { body: (n.testo || '').slice(0, 120), icon: 'icon-192.png', tag: 'perte-' + n.id }); } catch(e) {}
    }
  }
  (r.notifiche || []).forEach(n => { if (n.id > _perteMaxId) _perteMaxId = n.id; });
  _perteFirstPoll = false;

  // Se il popup è aperto, aggiornalo
  const panel = document.getElementById('perte-panel');
  if (panel && panel.style.display !== 'none') _perteRender();
}

function _perteUpdateDot() {
  const dot = document.getElementById('perte-dot');
  if (!dot) return;
  const unread = _perteCache.count || 0;
  const promUrg = (window._promAttivi || []).filter(p => p.urgenza === 'oggi' || p.urgenza === 'scaduto').length;
  dot.style.display = (unread + promUrg) > 0 ? 'block' : 'none';
}

function togglePerTe(ev) {
  if (ev) ev.stopPropagation();
  const panel = document.getElementById('perte-panel');
  if (!panel) return;
  if (panel.style.display !== 'none') { closePerTe(); return; }
  panel.style.display = 'flex';
  _perteRender();
  checkPerTe();
  setTimeout(() => document.addEventListener('click', _perteOutside), 0);
}

function closePerTe() {
  const panel = document.getElementById('perte-panel');
  if (panel) panel.style.display = 'none';
  document.removeEventListener('click', _perteOutside);
}

function _perteOutside(e) {
  const panel = document.getElementById('perte-panel');
  if (panel && !panel.contains(e.target)) closePerTe();
}

function _perteTempo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'adesso';
  if (diff < 60) return diff + ' min fa';
  const h = Math.floor(diff / 60);
  if (h < 24) return h + ' h fa';
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

function _perteRender() {
  const list = document.getElementById('perte-list');
  if (!list) return;
  const nn = _perteCache.notifiche || [];
  list.innerHTML = !nn.length
    ? '<div style="padding:26px 16px;text-align:center;font-size:12px;color:var(--muted);">Nessuna notifica per te.<br>Qui arrivano menzioni, avvisi sul tuo account e conferme.</div>'
    : nn.map(n => `
      <div onclick="perTeApri(${n.id},'${n.link || ''}')" style="display:flex;gap:11px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;background:${n.letto ? 'transparent' : 'var(--primary-bg)'};" onmouseover="this.style.filter='brightness(.97)'" onmouseout="this.style.filter=''">
        <span style="font-size:18px;flex-shrink:0;">${_PERTE_ICO[n.tipo] || '🔔'}</span>
        <div style="min-width:0;flex:1;">
          <div style="font-size:12.5px;font-weight:${n.letto ? '500' : '700'};color:var(--text-strong);line-height:1.35;">${esc(n.titolo || '')}</div>
          ${n.testo ? `<div style="font-size:11.5px;color:var(--muted);margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(n.testo)}</div>` : ''}
          <div style="font-size:10px;color:var(--muted-2);margin-top:3px;">${_perteTempo(n.created_at)}</div>
        </div>
        ${!n.letto ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--terra,#c2542e);flex-shrink:0;margin-top:5px;"></span>' : ''}
      </div>`).join('');

  // Blocco promemoria urgenti (oggi / scaduti)
  const promBlock = document.getElementById('perte-prom-block');
  const promList = document.getElementById('perte-prom');
  if (promBlock && promList) {
    const urg = (window._promAttivi || []).filter(p => p.urgenza === 'oggi' || p.urgenza === 'scaduto').slice(0, 5);
    promBlock.style.display = urg.length ? 'block' : 'none';
    promList.innerHTML = urg.map(p => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);">
        <span>${p.urgenza === 'scaduto' ? '🔴' : '🟠'}</span>
        <div style="min-width:0;flex:1;">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.titolo)}</div>
          <div style="font-size:10.5px;color:var(--muted);">${new Date(p.data_evento).toLocaleDateString('it-IT',{day:'2-digit',month:'short'})}${p.ora_evento ? ' ' + p.ora_evento.slice(0,5) : ''}${p.entita_nome ? ' · ' + esc(p.entita_nome) : ''}</div>
        </div>
        <button class="btn btn-xs btn-gray" onclick="event.stopPropagation();completaPromemoria(${p.id}).then(()=>_perteRender())" title="Completa">✓</button>
      </div>`).join('');
  }
}

async function perTeApri(id, link) {
  await api('/api/mie-notifiche/' + id + '/letta', { method: 'POST' });
  const n = (_perteCache.notifiche || []).find(x => x.id === id);
  if (n) n.letto = true;
  _perteCache.count = Math.max(0, (_perteCache.count || 1) - 1);
  _perteUpdateDot();
  if (link) { closePerTe(); showSection(link); } else _perteRender();
}

async function perTeTutteLette() {
  await api('/api/mie-notifiche/lette', { method: 'POST' });
  (_perteCache.notifiche || []).forEach(n => n.letto = true);
  _perteCache.count = 0;
  _perteUpdateDot();
  _perteRender();
}

function startPerTePolling() {
  if (_perteInterval) clearInterval(_perteInterval);
  _perteFirstPoll = true;
  checkPerTe();
  _perteInterval = setInterval(checkPerTe, 20000);
}
