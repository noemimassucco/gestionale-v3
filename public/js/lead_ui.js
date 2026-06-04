// ═══════════════════════════════════════════════════════════
// LEAD UI — card, dettaglio, filtri, pipeline (P16 rivisto)
// ═══════════════════════════════════════════════════════════

let currentLeadId   = null;
let currentLeadNome = '';

const PIPELINE_BADGE = {
  nuovo:                {bg:'var(--info-bg)',      color:'var(--info)',         icon:'🆕'},
  contattato:           {bg:'var(--bg2)',           color:'var(--muted)',        icon:'📞'},
  appuntamento_fissato: {bg:'var(--warning-bg)',    color:'var(--warning)',      icon:'📅'},
  visita_fatta:         {bg:'var(--primary-bg)',    color:'var(--primary-dark)', icon:'🏠'},
  in_trattativa:        {bg:'var(--accent-bg)',     color:'var(--accent)',       icon:'💬'},
  convertito:           {bg:'var(--success-bg)',    color:'var(--success)',      icon:'✅'},
  perso:                {bg:'var(--danger-bg)',     color:'var(--danger)',       icon:'❌'},
};

const FONTE_LABEL = {
  passaparola:'👥 Passaparola', idealista:'🏠 Idealista', immobiliare_it:'🌐 Immobiliare.it',
  subito:'📱 Subito', facebook:'📘 Facebook', sito_proprio:'💻 Sito',
  agenzia:'🤝 Agenzia', cartello_finestra:'🪟 Cartello', altro:'💡 Altro',
};

const TIPO_AZIONE_ICON = { chiamata:'📞', email:'✉️', visita:'🏠', appuntamento:'📋', altro:'💬' };

// ── auto-titolo promemoria nel modal nuovo lead ─────────────
function autoTitoloLead() {
  const nome    = (document.getElementById('lead-nome')?.value    || '').trim();
  const cognome = (document.getElementById('lead-cognome')?.value || '').trim();
  const note    = (document.getElementById('lead-prom-note-brevi')?.value || '').trim();
  const tipo    = document.getElementById('lead-prom-tipo')?.value || 'chiamata';
  const LABELS  = { chiamata:'Richiamare', email:'Scrivere email a', visita:'Visita con',
                    appuntamento:'Appuntamento con', altro:'Azione con' };
  const nomeFull = [nome, cognome].filter(Boolean).join(' ');
  if (!nomeFull) return;
  const titoloEl = document.getElementById('lead-prom-titolo');
  if (titoloEl && !titoloEl.dataset.modified) {
    const parts = [LABELS[tipo] || 'Azione con', nomeFull];
    if (note) parts.push('— ' + note);
    titoloEl.value = parts.join(' ');
  }
  // Imposta domani come default
  const dataEl = document.getElementById('lead-prom-data');
  if (dataEl && !dataEl.value) {
    const t = new Date(); t.setDate(t.getDate() + 1);
    dataEl.value = t.toISOString().split('T')[0];
  }
}

// ── populateLeadRicSubSelect ────────────────────────────────
function populateLeadRicSub() {
  const sel = document.getElementById('lead-ric-sub');
  if (!sel) return;
  const liberi = (DB.subs || []).filter(s => s.stato_occupazione === 'libero' && (!s.stato_sub || s.stato_sub === 'attivo'));
  sel.innerHTML = '<option value="">— Nessun SUB specifico —</option>' +
    liberi.map(s => '<option value="' + s.id + '">' + esc(s.codice) + ' — ' + esc(s.sede_nome || '') + '</option>').join('');
}

// ── Apri modal nuovo lead ───────────────────────────────────
function openModalNuovoLead() {
  const oggi = new Date();
  const domani = new Date(); domani.setDate(oggi.getDate() + 1);

  ['lead-nome','lead-cognome','lead-tel','lead-tel-alt','lead-email',
   'lead-note','lead-ric-zona','lead-prom-note-brevi','lead-prom-titolo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['lead-fonte','lead-ric-tipo','lead-ric-cat'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['lead-ric-mq-min','lead-ric-mq-max','lead-ric-stanze','lead-ric-budget'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const dp = document.getElementById('lead-prom-data');
  if (dp) dp.value = domani.toISOString().split('T')[0];
  const op = document.getElementById('lead-prom-ora');
  if (op) op.value = '10:00';
  const al1g = document.getElementById('lead-alert-1g');
  const al2h = document.getElementById('lead-alert-2h');
  const al2g = document.getElementById('lead-alert-2g');
  if (al1g) al1g.checked = true;
  if (al2h) al2h.checked = true;
  if (al2g) al2g.checked = false;

  populateLeadRicSub();
  document.getElementById('modal-nuovo-lead').classList.add('open');
}

// ── saveNewLead (atomico: lead + promemoria) ─────────────────
async function saveNewLead() {
  const nome    = (document.getElementById('lead-nome')?.value    || '').trim();
  const cognome = (document.getElementById('lead-cognome')?.value || '').trim();
  const tel     = (document.getElementById('lead-tel')?.value     || '').trim();
  const telAlt  = (document.getElementById('lead-tel-alt')?.value || '').trim();
  const email   = (document.getElementById('lead-email')?.value   || '').trim();
  const fonte   = document.getElementById('lead-fonte')?.value    || null;

  if (!nome && !cognome) { toast('Inserisci almeno il nome', 'error'); return; }
  if (!tel && !email)    { toast('Telefono o email obbligatorio', 'error'); return; }

  const body = {
    nome:                    nome      || null,
    cognome:                 cognome   || null,
    tel:                     tel       || null,
    tel_alt:                 telAlt    || null,
    email:                   email     || null,
    lead_fonte:              fonte,
    ricerca_tipologia:       document.getElementById('lead-ric-tipo')?.value   || null,
    ricerca_categoria:       document.getElementById('lead-ric-cat')?.value    || null,
    ricerca_zona:            document.getElementById('lead-ric-zona')?.value   || null,
    ricerca_mq_min:          parseInt(document.getElementById('lead-ric-mq-min')?.value)  || null,
    ricerca_mq_max:          parseInt(document.getElementById('lead-ric-mq-max')?.value)  || null,
    ricerca_stanze:          parseInt(document.getElementById('lead-ric-stanze')?.value)  || null,
    ricerca_budget_max:      parseFloat(document.getElementById('lead-ric-budget')?.value) || null,
    ricerca_disponibilita_da: document.getElementById('lead-ric-dal')?.value   || null,
    ricerca_sub_interesse_id: parseInt(document.getElementById('lead-ric-sub')?.value)    || null,
    note_lead:               document.getElementById('lead-note')?.value?.trim()          || null,
  };

  // Promemoria opzionale
  const promData   = document.getElementById('lead-prom-data')?.value;
  const promTitolo = document.getElementById('lead-prom-titolo')?.value?.trim();
  if (promData && promTitolo) {
    const alertGiorni = [];
    if (document.getElementById('lead-alert-2g')?.checked) alertGiorni.push(2);
    if (document.getElementById('lead-alert-1g')?.checked) alertGiorni.push(1);
    const alertOre = [];
    if (document.getElementById('lead-alert-2h')?.checked) alertOre.push(2);
    body.promemoria = {
      titolo:             promTitolo,
      data_evento:        promData,
      ora_evento:         document.getElementById('lead-prom-ora')?.value || null,
      tipo_azione:        document.getElementById('lead-prom-tipo')?.value || 'chiamata',
      descrizione:        document.getElementById('lead-prom-note-brevi')?.value?.trim() || null,
      alert_giorni_prima: alertGiorni.length ? alertGiorni : [1],
      alert_ore_prima:    alertOre,
    };
  }

  const r = await api('/api/clienti/lead', { method: 'POST', body: JSON.stringify(body) });
  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }

  closeM('modal-nuovo-lead');
  const promMsg = r.promemoria
    ? ' + promemoria del ' + new Date(r.promemoria.data_evento).toLocaleDateString('it-IT')
    : '';
  toast('💡 Lead creato' + promMsg);
  await loadDD();
  // Ricarica calendario se aperto (il promemoria deve apparire subito)
  if (typeof loadCalendario === 'function' &&
      document.getElementById('sec-calendario')?.classList.contains('active')) {
    loadCalendario();
  }
  const leadBtn = document.querySelector('[data-stato="lead"]');
  if (leadBtn) switchClienteTab('lead', leadBtn);
}

// ── Lead cards ───────────────────────────────────────────────
async function loadLeadCards() {
  const pipeline = document.getElementById('filt-pipeline')?.value || '';
  const fonte    = document.getElementById('filt-fonte')?.value    || '';
  const cerca    = document.getElementById('filt-cerca')?.value    || '';

  let url = '/api/clienti?stato=lead';
  if (pipeline) url += '&pipeline=' + encodeURIComponent(pipeline);
  if (fonte)    url += '&fonte='    + encodeURIComponent(fonte);
  if (cerca)    url += '&search='  + encodeURIComponent(cerca);

  const data = await api(url);
  if (!data) return;

  const lbl = document.getElementById('cnt-lead');
  if (lbl) lbl.textContent = data.length;

  const grid = document.getElementById('lead-cards-grid');
  if (!grid) return;
  if (!data.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1;">Nessun lead trovato.</div>'; return; }

  grid.innerHTML = data.map(l => _renderLeadCard(l)).join('');
}

function _renderLeadCard(l) {
  const pipeline = l.lead_stato_pipeline || 'nuovo';
  const pb = PIPELINE_BADGE[pipeline] || PIPELINE_BADGE.nuovo;

  // prossimo promemoria
  let promHtml = '';
  if (l.prossimo_promemoria) {
    const pp = typeof l.prossimo_promemoria === 'string'
      ? JSON.parse(l.prossimo_promemoria) : l.prossimo_promemoria;
    if (pp) {
      const ppData = new Date(pp.data_evento + 'T00:00:00');
      const oggi   = new Date(); oggi.setHours(0,0,0,0);
      const scaduto = ppData < oggi;
      const isOggi  = ppData.getTime() === oggi.getTime();
      const col = scaduto ? 'var(--danger)' : isOggi ? 'var(--warning)' : 'var(--muted)';
      const ora = pp.ora_evento ? ' ' + pp.ora_evento.slice(0,5) : '';
      const icon = TIPO_AZIONE_ICON[pp.tipo_azione] || '📅';
      const label = scaduto ? 'Scaduto: ' : isOggi ? 'Oggi: ' : 'Prossimo: ';
      promHtml = '<div style="margin-top:6px;font-size:11px;color:' + col + ';font-weight:500;">' + icon + ' ' + label + ppData.toLocaleDateString('it-IT') + ora + '</div>';
    }
  }

  const ricercaHtml = l.ricerca_zona
    ? '<div style="font-size:11px;color:var(--muted);margin-top:4px;">📍 ' + esc(l.ricerca_zona) + (l.ricerca_tipologia ? ' · ' + l.ricerca_tipologia : '') + '</div>'
    : '';

  const fonteHtml = l.lead_fonte
    ? '<span style="font-size:10px;color:var(--muted);">' + (FONTE_LABEL[l.lead_fonte] || l.lead_fonte) + '</span>'
    : '';

  const telHtml  = l.tel   ? '<div style="font-size:12px;">📞 <a href="tel:' + esc(l.tel)   + '" onclick="event.stopPropagation();" style="color:var(--primary-dark);">' + esc(l.tel)   + '</a></div>' : '';
  const emailHtml = l.email ? '<div style="font-size:12px;">✉️ <a href="mailto:' + esc(l.email) + '" onclick="event.stopPropagation();" style="color:var(--primary-dark);">' + esc(l.email) + '</a></div>' : '';

  return '<div class="card" style="border-left:3px solid ' + pb.color + ';padding:14px 16px;cursor:pointer;" onclick="openLeadDetail(' + l.id + ')">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
      '<div>' +
        '<strong style="font-size:14px;color:var(--text-strong);">' + esc(l.ragione_sociale) + '</strong>' +
        '<div style="margin-top:3px;display:flex;gap:6px;flex-wrap:wrap;">' +
          '<span style="background:' + pb.bg + ';color:' + pb.color + ';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;">' + pb.icon + ' ' + pipeline.replace(/_/g, ' ') + '</span>' +
          fonteHtml +
        '</div>' +
      '</div>' +
      '<button class="btn btn-xs btn-gray" onclick="event.stopPropagation();delAna(\'inquilini\',' + l.id + ')">🗑</button>' +
    '</div>' +
    telHtml + emailHtml + ricercaHtml + promHtml +
    '<div style="display:flex;gap:6px;margin-top:10px;">' +
      '<button class="btn btn-xs btn-primary" onclick="event.stopPropagation();convertiLead(' + l.id + ')">✅ Converti</button>' +
      '<button class="btn btn-xs btn-gray" onclick="event.stopPropagation();openNuovoPromemoriaLead(' + l.id + ',\'' + esc(l.ragione_sociale) + '\')">📅</button>' +
    '</div>' +
  '</div>';
}

function applyLeadFilter() { loadLeadCards(); }

// ── Lead detail modal ───────────────────────────────────────
async function openLeadDetail(id) {
  currentLeadId = id;
  const all = await api('/api/clienti?stato=all');
  const l = (all || []).find(x => x.id == id);
  if (!l) return;
  currentLeadNome = l.ragione_sociale || '';

  document.getElementById('modal-lead-det').classList.add('open');

  // Pipeline
  const sel = document.getElementById('lead-det-pipeline');
  if (sel) sel.value = l.lead_stato_pipeline || 'nuovo';

  // Header
  const h = document.getElementById('lead-det-header');
  if (h) {
    const fonte_label = FONTE_LABEL[l.lead_fonte] || l.lead_fonte || '';
    const dalFmt = l.lead_data_primo_contatto
      ? new Date(l.lead_data_primo_contatto).toLocaleDateString('it-IT') : '—';
    const promCount = l.promemoria_attivi > 0
      ? ' · <strong style="color:var(--accent);">' + l.promemoria_attivi + ' promemoria attivi</strong>' : '';
    h.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:14px;">' +
        '<span style="font-size:32px;">💡</span>' +
        '<div style="flex:1;">' +
          '<h3 style="margin:0;font-size:18px;color:var(--text-strong);">' + esc(l.ragione_sociale) + '</h3>' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:13px;">' +
            (l.tel   ? '<a href="tel:'    + esc(l.tel)   + '" style="color:var(--primary-dark);">📞 ' + esc(l.tel)   + '</a>' : '') +
            (l.tel_alt ? '<a href="tel:'  + esc(l.tel_alt) + '" style="color:var(--primary-dark);">📞 ' + esc(l.tel_alt) + '</a>' : '') +
            (l.email ? '<a href="mailto:' + esc(l.email) + '" style="color:var(--primary-dark);">✉️ ' + esc(l.email) + '</a>' : '') +
          '</div>' +
          '<div style="margin-top:6px;font-size:11px;color:var(--muted);">' +
            fonte_label + ' · 📅 dal ' + dalFmt + promCount +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // Ricerca immobile
  const ricEl   = document.getElementById('lead-det-ricerca');
  const ricBody = document.getElementById('lead-det-ricerca-body');
  const hasRic  = l.ricerca_tipologia || l.ricerca_zona || l.ricerca_budget_max;
  if (ricEl) ricEl.style.display = hasRic ? '' : 'none';
  if (ricBody && hasRic) {
    const rows = [];
    if (l.ricerca_tipologia) rows.push('Tipologia: <strong>' + esc(l.ricerca_tipologia) + '</strong>');
    if (l.ricerca_categoria) rows.push('Categoria: <strong>' + esc(l.ricerca_categoria) + '</strong>');
    if (l.ricerca_zona)      rows.push('Zona: <strong>' + esc(l.ricerca_zona) + '</strong>');
    if (l.ricerca_mq_min || l.ricerca_mq_max) rows.push('MQ: ' + [l.ricerca_mq_min ? 'min ' + l.ricerca_mq_min : '', l.ricerca_mq_max ? 'max ' + l.ricerca_mq_max : ''].filter(Boolean).join(' — '));
    if (l.ricerca_budget_max) rows.push('Budget max: <strong>€ ' + parseFloat(l.ricerca_budget_max).toLocaleString('it-IT') + '</strong>');
    if (l.ricerca_disponibilita_da) rows.push('Dal: ' + new Date(l.ricerca_disponibilita_da).toLocaleDateString('it-IT'));
    if (l.ricerca_sub_codice) rows.push('SUB interesse: <strong>' + esc(l.ricerca_sub_codice) + '</strong>');
    ricBody.innerHTML = rows.map(r => '<div style="margin-bottom:3px;">' + r + '</div>').join('');
  }

  loadLeadTimeline(id);
}

async function loadLeadTimeline(id) {
  const tl = document.getElementById('lead-det-timeline');
  if (!tl) return;
  tl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:12px;">Caricamento…</div>';
  const data = await api('/api/clienti/' + id + '/timeline');
  if (!data || !data.length) {
    tl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px;">Nessun evento in timeline</div>';
    return;
  }
  const TIPO_ICON = { promemoria:'📅', contratto:'📄', intervento:'🔨' };
  tl.innerHTML = data.map(function(e) {
    const icon  = TIPO_ICON[e.tipo] || '💡';
    const dFmt  = e.data ? new Date(e.data).toLocaleDateString('it-IT', {day:'2-digit',month:'short',year:'numeric'}) : '—';
    const titolo = esc(e.titolo || e.descrizione || e.codice || e.tipo || '');
    const ora   = e.ora_evento ? ' ' + e.ora_evento.slice(0,5) : '';
    const done  = e.completato ? ' <span style="color:var(--success);">✓</span>' : '';
    return '<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);">' +
      '<span style="font-size:16px;line-height:1.4;">' + icon + '</span>' +
      '<div style="flex:1;"><div style="font-size:12px;font-weight:500;color:var(--text);">' + titolo + done + '</div>' +
      '<div style="font-size:10px;color:var(--muted);">' + dFmt + ora + '</div></div>' +
    '</div>';
  }).join('');
}

async function aggiornaPipeline() {
  if (!currentLeadId) return;
  const pipeline = document.getElementById('lead-det-pipeline')?.value;
  if (!pipeline) return;
  const r = await api('/api/clienti/' + currentLeadId, {
    method: 'PUT', body: JSON.stringify({ lead_stato_pipeline: pipeline }),
  });
  if (!r || r.error) { toast('Errore', 'error'); return; }
  toast('✅ Pipeline aggiornata');
  loadLeadCards();
}

async function perdiLead(id) {
  const motivo = prompt('Motivo della perdita (opzionale):');
  if (motivo === null) return;
  const r = await api('/api/clienti/' + id + '/perdi', {
    method: 'PUT', body: JSON.stringify({ motivo }),
  });
  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  closeM('modal-lead-det');
  toast('Lead marcato come perso');
  await loadDD();
  loadLeadCards();
}
