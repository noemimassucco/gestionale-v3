// =======================================================
// MODULE: calendar.js  — FullCalendar integration
// =======================================================

let _fcInstance = null;

// ── Inizializza FullCalendar ──────────────────────────────
function initFullCalendar() {
  const el = document.getElementById('fc-calendar');
  if (!el || typeof FullCalendar === 'undefined') return;
  if (_fcInstance) { _fcInstance.destroy(); _fcInstance = null; }

  _fcInstance = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    locale:      'it',
    height:      'auto',
    headerToolbar: {
      left:   'prev,next today',
      center: 'title',
      right:  'dayGridMonth,listMonth',
    },
    buttonText: { today:'Oggi', month:'Mese', list:'Lista' },
    events:     [],
    eventClick: function(info) { _onEventClick(info.event); },
    dateClick:  function(info) { onCalendarDayClick(info.dateStr); },
    eventDidMount: function(info) {
      // tooltip con dettaglio
      info.el.title = info.event.title + (info.event.extendedProps.sede ? ' — ' + info.event.extendedProps.sede : '');
    },
  });
  _fcInstance.render();
}

// ── Carica eventi dal backend e applica filtri ────────────
async function loadCalendario() {
  const mese  = document.getElementById('cal-mese')?.value  || '';
  const anno  = document.getElementById('cal-anno')?.value  || new Date().getFullYear();
  let url = '/api/calendario';
  if (mese) url += `?mese=${mese}&anno=${anno}`;

  const data = await api(url);
  if (!data) return;

  // Filtri tipo attivi
  const tipiAttivi = _getTipiFiltri();

  // Legacy lista (per compatibilità se FullCalendar non disponibile)
  const listEl = document.getElementById('cal-list');

  if (typeof FullCalendar === 'undefined') {
    // Fallback lista testuale
    _renderListaFallback(data, tipiAttivi, listEl);
    return;
  }

  if (!_fcInstance) initFullCalendar();

  // Mappa eventi → formato FullCalendar
  const COLOR_MAP = {
    documento:       { bg:'#a04848', bd:'#8b3333' },
    manutenzione:    { bg:'#b8860b', bd:'#a07009' },
    bolletta:        { bg:'#4a7fb5', bd:'#3a6fa5' },
    contratto_istat: { bg:'#4f7f4f', bd:'#3f6f3f' },
    promemoria:      { bg:'#6b8e6b', bd:'#4f6f4f' },
  };

  const fcEvents = data
    .filter(e => tipiAttivi.has(e.tipo))
    .map(e => {
      const col = COLOR_MAP[e.tipo] || { bg:'#6b7280', bd:'#555' };
      return {
        id:    e.tipo + '-' + (e.id || e.scadenza),
        title: (e.icon||'') + ' ' + (e.titolo||e.tipo),
        start: e.scadenza,
        backgroundColor: col.bg,
        borderColor:     col.bd,
        textColor:       '#fff',
        extendedProps:   e,
      };
    });

  _fcInstance.removeAllEvents();
  _fcInstance.addEventSource(fcEvents);

  // Naviga al mese selezionato
  if (mese && anno) {
    _fcInstance.gotoDate(`${anno}-${String(mese).padStart(2,'0')}-01`);
  }

  // Aggiorna anche la lista riassuntiva sotto
  const filtered = data.filter(e => tipiAttivi.has(e.tipo));
  _renderListaSottocalendario(filtered, listEl);
}

// ── Filtri tipo ───────────────────────────────────────────
function _getTipiFiltri() {
  const map = {
    'filt-promemoria':      'promemoria',
    'filt-documenti-cal':   'documento',
    'filt-manutenzioni-cal':'manutenzione',
    'filt-bollette-cal':    'bolletta',
    'filt-istat-cal':       'contratto_istat',
  };
  const active = new Set();
  Object.entries(map).forEach(([id, tipo]) => {
    const el = document.getElementById(id);
    if (!el || el.checked) active.add(tipo);  // default ON se checkbox non trovato
  });
  return active;
}

// ── Click evento → dettaglio ──────────────────────────────
function _onEventClick(event) {
  const e = event.extendedProps;
  if (e.tipo === 'promemoria') {
    _showPromemoriaDetail(e);
  } else {
    toast((e.icon||'') + ' ' + e.titolo + (e.sede ? ' — ' + e.sede : '') + ' · ' + fmtDate(e.scadenza));
  }
}

function _showPromemoriaDetail(e) {
  const dataFmt = fmtDate(e.scadenza);
  const ora = e.ora_evento ? e.ora_evento.slice(0,5) : '';
  if (confirm(`${e.icon||'📅'} ${e.titolo}\n${dataFmt}${ora?' '+ora:''}\n\nSegna come completato?`)) {
    completaPromemoria(e.id);
  }
}

// ── Lista riassuntiva sotto il calendario ─────────────────
function _renderListaSottocalendario(events, el) {
  if (!el) return;
  if (!events.length) {
    el.innerHTML = '<div class="empty">Nessuna scadenza nel periodo. 🎉</div>';
    return;
  }
  el.innerHTML = events.slice(0, 30).map(e => {
    const oggi = new Date(); oggi.setHours(0,0,0,0);
    const data = new Date(e.scadenza); data.setHours(0,0,0,0);
    const diff = Math.ceil((data - oggi) / 86400000);
    const urgCol = diff < 0 ? 'var(--danger)' : diff === 0 ? 'var(--warning)' : diff <= 7 ? 'var(--accent)' : 'var(--text)';
    const ora = e.ora_evento ? ' ' + e.ora_evento.slice(0,5) : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:16px;">${e.icon||'📅'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:500;color:var(--text-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e.titolo||'')}</div>
        <div style="font-size:11px;color:var(--muted);">${esc(e.sede||e.sub||'')}${e.sub&&e.sede?' · ':''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:12px;font-weight:600;color:${urgCol};">${fmtDate(e.scadenza)}${ora}</div>
        <div style="font-size:10px;color:var(--muted);">${diff<0?'Scaduto':diff===0?'Oggi':diff===1?'Domani':'tra '+diff+'gg'}</div>
      </div>
      ${e.tipo==='promemoria'?`<button class="btn btn-xs btn-gray" onclick="completaPromemoria(${e.id})" title="Completato">✓</button>`:''}
    </div>`;
  }).join('');
}

function _renderListaFallback(data, tipiAttivi, el) {
  if (!el) return;
  const filtered = data.filter(e => tipiAttivi.has(e.tipo));
  _renderListaSottocalendario(filtered, el);
}

// ── Click su giorno vuoto → nuovo promemoria ──────────────
function onCalendarDayClick(dateStr) {
  if (typeof openNuovoPromemoria === 'function') {
    openNuovoPromemoria({ data: dateStr });
  }
}

// Alias legacy
function calDayClick(dateStr) { onCalendarDayClick(dateStr); }

// ── Helper data ───────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).split('T')[0].split('-');
  return s.length === 3 ? s[2]+'/'+s[1]+'/'+s[0] : d;
}
