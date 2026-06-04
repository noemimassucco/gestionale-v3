// ═══════════════════════════════════════════════════════════
// PROMEMORIA — frontend logic
// Gestisce: modal, dashboard card, badge campanella, 60s poll
// ═══════════════════════════════════════════════════════════

let _promIntervalId = null;

// ── Apri modal promemoria (generico o pre-compilato) ────────
function openNuovoPromemoria(opts = {}) {
  // opts: { data, entita_tipo, entita_id, entita_nome }
  const today = new Date().toISOString().split('T')[0];

  // Reset form
  document.getElementById('prom-titolo').value = '';
  document.getElementById('prom-data').value   = opts.data || today;
  document.getElementById('prom-ora').value    = '';
  document.getElementById('prom-desc').value   = '';
  document.getElementById('prom-entita-tipo').value = opts.entita_tipo || '';
  document.getElementById('alert-2g').checked  = false;
  document.getElementById('alert-1g').checked  = true;   // default: 1 gg prima
  document.getElementById('alert-2h').checked  = false;

  // Pre-compila entità se fornita
  if (opts.entita_tipo && opts.entita_id) {
    onChangePromEntita(opts.entita_tipo, opts.entita_id);
    if (opts.entita_nome) {
      document.getElementById('prom-titolo').value =
        `Promemoria — ${opts.entita_nome}`;
    }
  } else {
    document.getElementById('prom-entita-id').style.display = 'none';
  }

  document.getElementById('modal-promemoria').classList.add('open');
}

// P17-4: chiamato dalla card lead
function openNuovoPromemoriaLead(id, nome) {
  openNuovoPromemoria({ entita_tipo: 'cliente', entita_id: id, entita_nome: nome });
}

// ── Cambia tipo entità → popola select ─────────────────────
async function onChangePromEntita(tipo, preselect) {
  tipo = tipo || document.getElementById('prom-entita-tipo').value;
  const sel = document.getElementById('prom-entita-id');

  if (!tipo || tipo === 'generico') {
    sel.style.display = 'none';
    sel.innerHTML = '';
    return;
  }

  sel.style.display = '';
  sel.innerHTML = '<option value="">— Seleziona —</option>';

  let items = [];
  if (tipo === 'cliente') {
    items = (DB.inquilini || []).map(i => ({ id: i.id, label: i.ragione_sociale }));
  } else if (tipo === 'sub') {
    items = (DB.subs || []).map(s => ({ id: s.id, label: `${s.codice} — ${s.sede_nome || ''}` }));
  }

  items.forEach(({ id, label }) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    sel.appendChild(opt);
  });

  if (preselect) sel.value = preselect;
}

// ── Salva promemoria ───────────────────────────────────────
async function savePromemoria() {
  const titolo     = document.getElementById('prom-titolo').value.trim();
  const data_evento = document.getElementById('prom-data').value;
  const ora_evento  = document.getElementById('prom-ora').value || null;
  const descrizione = document.getElementById('prom-desc').value.trim() || null;
  const entita_tipo = document.getElementById('prom-entita-tipo').value || null;
  const entita_id   = document.getElementById('prom-entita-id').value || null;

  if (!titolo)      { toast('Inserisci il titolo', 'error'); return; }
  if (!data_evento) { toast('Inserisci la data', 'error');   return; }

  const alert_giorni_prima = [];
  if (document.getElementById('alert-2g').checked) alert_giorni_prima.push(2);
  if (document.getElementById('alert-1g').checked) alert_giorni_prima.push(1);
  const alert_ore_prima = [];
  if (document.getElementById('alert-2h').checked) alert_ore_prima.push(2);

  const r = await api('/api/promemoria', {
    method: 'POST',
    body: JSON.stringify({
      titolo, descrizione, data_evento, ora_evento,
      entita_tipo, entita_id: entita_id ? parseInt(entita_id) : null,
      alert_giorni_prima, alert_ore_prima,
    }),
  });

  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }

  closeM('modal-promemoria');
  toast('📅 Promemoria salvato');
  await loadPromemoriaAttivi();

  // Se siamo nel calendario ricaricalo
  if (document.getElementById('sec-calendario')?.classList.contains('active')) {
    if (typeof loadCalendario === 'function') loadCalendario();
  }
}

// ── Dashboard card: promemoria attivi ──────────────────────
async function loadPromemoriaAttivi() {
  const list = document.getElementById('dash-promemoria-list');
  if (!list) return;

  const data = await api('/api/promemoria/attivi-ora');
  if (!data) { list.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px;">Errore caricamento</div>'; return; }

  // Trigger browser notifiche per eventi urgenti non ancora notificati
  (data || []).forEach(function(p) {
    if ((p.urgenza === 'oggi' || p.urgenza === 'scaduto') && !_notifiedIds.has(p.id)) {
      _notifiedIds.add(p.id);
      _triggerBrowserNotif(p);
    }
  });

  // Aggiorna badge campanella
  const badge = document.getElementById('badge-promemoria');
  if (badge) {
    if (data.length > 0) {
      badge.style.display = 'flex';
      badge.textContent = data.length > 9 ? '9+' : data.length;
    } else {
      badge.style.display = 'none';
    }
  }

  if (!data.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px;">✅ Nessun promemoria in scadenza</div>';
    return;
  }

  const URGENZA_STYLE = {
    scaduto:  { icon: '🔴', bg: 'var(--danger-bg)',  color: 'var(--danger)',  label: 'Scaduto' },
    oggi:     { icon: '🟠', bg: 'var(--warning-bg)', color: 'var(--warning)', label: 'Oggi' },
    domani:   { icon: '🟡', bg: '#fefce8',            color: '#92400e',        label: 'Domani' },
    prossimo: { icon: '🟢', bg: 'var(--success-bg)',  color: 'var(--success)', label: 'Prossimo' },
  };

  list.innerHTML = data.map(p => {
    const u = URGENZA_STYLE[p.urgenza] || URGENZA_STYLE.prossimo;
    const dataFmt = new Date(p.data_evento).toLocaleDateString('it-IT', { day:'2-digit', month:'short' });
    const ora     = p.ora_evento ? ' ' + p.ora_evento.slice(0,5) : '';
    return `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:18px;line-height:1;margin-top:2px;">${u.icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--text-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.titolo)}</div>
          <div style="font-size:11px;color:var(--muted);">
            ${dataFmt}${ora}
            ${p.entita_nome ? ' · ' + esc(p.entita_nome) : ''}
          </div>
          ${p.descrizione ? `<div style="font-size:11px;color:var(--muted);font-style:italic;margin-top:2px;">${esc(p.descrizione.slice(0,60))}${p.descrizione.length>60?'…':''}</div>` : ''}
        </div>
        <button class="btn btn-xs btn-gray" onclick="completaPromemoria(${p.id})" title="Segna completato" style="flex-shrink:0;">✓</button>
      </div>`;
  }).join('');
}

// ── Completa promemoria ────────────────────────────────────
async function completaPromemoria(id) {
  const r = await api(`/api/promemoria/${id}/completato`, { method: 'PUT' });
  if (!r || r.error) { toast('Errore', 'error'); return; }
  toast('✅ Promemoria completato');
  await loadPromemoriaAttivi();
}

// ── Notifiche browser (HTML5 Notification API) ─────────────
function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function _triggerBrowserNotif(p) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const icon = p.urgenza === 'scaduto' ? '🔴' : p.urgenza === 'oggi' ? '🟠' : '📅';
  const n = new Notification(icon + ' Promemoria: ' + p.titolo, {
    body: p.entita_nome ? 'Riguarda: ' + p.entita_nome : '',
    icon: '/favicon.ico',
    tag:  'promemoria-' + p.id,   // evita duplicati
  });
  n.onclick = function() { window.focus(); n.close(); };
  setTimeout(() => n.close(), 8000);
}

// Tiene traccia degli ID già notificati in questa sessione
const _notifiedIds = new Set();

// ── Polling 60s ────────────────────────────────────────────
function startPromemoriaPolling() {
  if (_promIntervalId) clearInterval(_promIntervalId);
  requestNotificationPermission();
  loadPromemoriaAttivi(); // caricamento immediato
  _promIntervalId = setInterval(loadPromemoriaAttivi, 60000);
}

// ── Integrazione calendario: click su giorno vuoto ──────────
// Chiamato dal calendar.js quando l'utente clicca su un giorno
function onCalendarDayClick(dateStr) {
  openNuovoPromemoria({ data: dateStr });
}
