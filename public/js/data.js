// =======================================================
// MODULE: data.js
// =======================================================

async function loadDD(){
  const endpoints = [
    ['/api/sedi',       'sedi'],
    ['/api/subs',       'subs'],
    ['/api/fornitori',  'fornitori'],
    ['/api/inquilini',  'inquilini'],
    ['/api/categorie',  'categorie'],
  ];
  const results = await Promise.allSettled(endpoints.map(([url]) => api(url)));

  let anyFailed = false;
  const data = {};
  results.forEach((r, i) => {
    const [url, key] = endpoints[i];
    if (r.status === 'fulfilled' && r.value) {
      data[key] = r.value;
    } else {
      anyFailed = true;
      data[key] = [];
      toast('Errore caricamento ' + url, 'error');
    }
  });

  DB = data;

  const setEl = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const opt   = (arr, lbl) => `<option value="">${lbl}</option>` +
    arr.map(x => `<option value="${x.id}">${x.nome||x.ragione_sociale||x.codice}</option>`).join('');

  setEl('ff-sede', opt(data.sedi,     'Tutte le sedi'));
  setEl('ff-sub',  '<option value="">Tutti i SUB</option>' +
    data.subs.map(s => `<option value="${s.id}">${s.codice}${s.ex_sub?' (ex '+s.ex_sub+')':''}</option>`).join(''));
  setEl('ff-forn', '<option value="">Tutti i fornitori</option>' +
    data.fornitori.map(f => `<option value="${f.id}">${f.ragione_sociale}</option>`).join(''));
  setEl('ff-cat',  '<option value="">Tutte</option>' +
    data.categorie.map(c => `<option value="${c.id}">${c.icona} ${c.nome}</option>`).join(''));

  // Wrap in try/catch: un errore in un render non blocca gli altri
  for (const [fn, name] of [[renderTbSubs,'subs'],[renderTbForn,'forn'],[renderTbInq,'inq'],[renderTbSedi,'sedi'],[renderTbCat,'cat']]) {
    try { fn(); } catch(err) {
      console.error('Render error [' + name + ']:', err);
      const tbId = { subs:'tb-subs-ana', forn:'tb-fornitori', inq:'tb-inquilini', sedi:'tb-sedi', cat:'tb-cat' }[name];
      const tb = tbId && document.getElementById(tbId);
      if (tb) tb.innerHTML = '<tr><td colspan="11" class="empty" style="color:var(--danger);">⚠ Errore render [' + name + '] — <a href="#" onclick="loadDD();return false;">Riprova</a></td></tr>';
    }
  }

  if (anyFailed) {
    // Mostra pulsante "Riprova" nelle tabelle che usano dati mancanti
    const tbSubs = document.getElementById('tb-subs-ana') || document.getElementById('tb-subs');
    if (tbSubs && !data.subs.length) {
      tbSubs.innerHTML = '<tr><td colspan="11" class="empty" style="color:var(--danger);">' +
        '⚠ Errore caricamento SUB — <a href="#" onclick="loadDD();return false;" style="color:var(--primary);">Riprova</a></td></tr>';
    }
  }
}

function renderTbSubs() {
  const tb = document.getElementById('tb-subs') || document.getElementById('tb-subs-ana');
  if (!tb) return;
  if (!DB.subs || !DB.subs.length) {
    tb.innerHTML = '<tr><td colspan="11" class="empty">Nessun SUB trovato.</td></tr>';
    return;
  }

  const STATO_BADGE = {
    attivo:        '<span style="background:var(--success-bg);color:var(--success);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Attivo</span>',
    fuso:          '<span style="background:var(--bg2);color:var(--muted);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Fuso</span>',
    scisso:        '<span style="background:var(--info-bg);color:var(--info);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Scisso</span>',
    riaccatastato: '<span style="background:var(--warning-bg);color:var(--warning);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Riacc.</span>',
    cessato:       '<span style="background:var(--danger-bg);color:var(--danger);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Cessato</span>',
  };

  tb.innerHTML = DB.subs.map(function(s) {
    const stato  = s.stato_sub || 'attivo';
    const attivo = stato === 'attivo';
    const sal    = parseInt(s.manutenzioni_aperte) > 0 ? '🟡'
                 : s.stato_occupazione === 'libero' ? '⚪' : '🟢';
    const spese  = parseFloat(s.totale_spese||0);
    const speseFmt = spese > 0 ? '€ ' + spese.toLocaleString('it-IT', {maximumFractionDigits:0}) : '—';
    const rowOp  = attivo ? '' : ' style="opacity:.7;"';

    const checkCell = attivo
      ? '<input type="checkbox" class="sel-check subs-chk" data-id="' + s.id + '" onchange="toggleSel(' + s.id + ',this)">'
      : '';

    const destLink = s.sub_destinazione_codice
      ? (' <span style="font-size:10px;color:var(--primary);">→ ' + esc(s.sub_destinazione_codice) + '</span>')
      : '';

    const statoBadge = (STATO_BADGE[stato] || STATO_BADGE.attivo) + destLink;

    return '<tr' + rowOp + '>' +
      '<td>' + checkCell + '</td>' +
      '<td style="font-size:16px;">' + sal + '</td>' +
      '<td class="td-bold" style="cursor:pointer;" onclick="openSubDetail(' + s.id + ')">' + esc(s.codice||'—') + '</td>' +
      '<td>' + esc(s.sede_nome||'—') + '</td>' +
      '<td style="font-size:12px;color:var(--muted);">' + esc(s.stato_occupazione||'—') + '</td>' +
      '<td style="font-size:12px;">' + esc(s.inquilino_nome||'—') + '</td>' +
      '<td>' + statoBadge + '</td>' +
      '<td style="font-size:12px;color:var(--muted);">' + (s.mq_commerciali ? s.mq_commerciali + ' mq' : '—') + '</td>' +
      '<td style="font-size:12px;">' + (s.num_interventi||0) + '</td>' +
      '<td style="font-size:12px;font-family:monospace;">' + speseFmt + '</td>' +
      '<td>' +
        '<button class="btn btn-xs btn-gray" onclick="openSubDetail(' + s.id + ')" title="Scheda">📋</button>' +
        (attivo ? ' <button class="btn btn-xs btn-gray" onclick="openAna(\'sub\',' + s.id + ')" title="Modifica">✏️</button>' : '') +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderTbForn(){
  const rows=DB.fornitori.length?DB.fornitori.map(f=>`<tr><td><input type="checkbox" class="sel-check fornitori-chk" data-id="${f.id}" onchange="genToggle('fornitori',${f.id},this)"></td><td class="td-bold">${esc(f.ragione_sociale)}</td><td class="td-mono" style="font-size:11px;">${esc(f.piva||f.cf||'—')}</td><td>${esc(f.citta||'—')}</td><td>${esc(f.tel||'—')}</td><td style="font-size:11px;">${esc(f.spec||'—')}</td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit btn-sm" onclick="openAnaById('fornitore',${f.id})">✏️</button><button class="btn btn-danger btn-sm" onclick="delAna('fornitori',${f.id})">✕</button></div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nessun fornitore</td></tr>';
  ['tb-forn','tb-fornitori'].forEach(tid=>{const tb=document.getElementById(tid);if(tb)tb.innerHTML=rows;});
}

function renderTbInq(){
  const rows=DB.inquilini.length?DB.inquilini.map(i=>{const sub=DB.subs.find(s=>s.inquilino_id==i.id);return`<tr><td><input type="checkbox" class="sel-check inquilini-chk" data-id="${i.id}" onchange="genToggle('inquilini',${i.id},this)"></td><td class="td-bold">${esc(i.ragione_sociale)}</td><td class="td-mono" style="font-size:11px;">${esc(i.piva||i.cf||'—')}</td><td>${esc(i.citta||'—')}</td><td>${esc(i.tel||'—')}</td><td style="font-size:11px;">${esc(i.email||'—')}</td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit btn-sm" onclick="openAnaById('inquilino',${i.id})">✏️</button><button class="btn btn-danger btn-sm" onclick="delAna('inquilini',${i.id})">✕</button></div></td></tr>`;}).join(''):'<tr><td colspan="7" class="empty">Nessun inquilino</td></tr>';
  ['tb-inq','tb-inquilini'].forEach(tid=>{const tb=document.getElementById(tid);if(tb)tb.innerHTML=rows;});
}

function renderTbSedi(){const tb=document.getElementById('tb-sedi');if(!DB.sedi.length){tb.innerHTML='<tr><td colspan="5" class="empty">Nessuna sede</td></tr>';return;}tb.innerHTML=DB.sedi.map(s=>`<tr><td class="td-bold">${esc(s.nome)}</td><td>${esc(s.indirizzo||'—')}</td><td>${esc(s.citta||'—')}</td><td class="td-muted">${esc(s.note||'—')}</td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit" onclick="openAnaById('sede',${s.id})">✏️</button><button class="btn btn-danger" onclick="delAna('sedi',${s.id})">✕</button></div></td></tr>`).join('');}

function renderTbCat(){const tb=document.getElementById('tb-cat');if(!DB.categorie.length){tb.innerHTML='<tr><td colspan="4" class="empty">—</td></tr>';return;}tb.innerHTML=DB.categorie.map(c=>`<tr><td style="font-size:18px;">${c.icona||''}</td><td class="td-bold">${esc(c.nome)}</td><td><span style="background:${c.colore};border-radius:4px;padding:2px 9px;font-size:10px;color:#0f172a;">${c.colore}</span></td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit" onclick="openAnaById('categoria',${c.id})">✏️</button><button class="btn btn-danger" onclick="delAna('categorie',${c.id})">✕</button></div></td></tr>`).join('');}

function renderTbByType(t) { if(t==="fornitori")renderTbForn(); else if(t==="inquilini")renderTbInq(); }

function subToggle(id,chk) { if(chk.checked)subSelIds.add(id);else subSelIds.delete(id); document.getElementById('sub-mass-cnt').textContent=`${subSelIds.size} selezionati`; }

function toggleSubSel() {
  subSelMode = !subSelMode; subSelIds.clear();
  document.getElementById('sub-mass-bar').classList.toggle('hidden', !subSelMode);
  document.getElementById('sub-sel-btn').style.background = subSelMode ? 'rgba(107,142,107,.2)' : '';
  renderTbSubs();
}

function genToggle(type, id, chk) {
  const set = getSelSet(type);
  if (chk.checked) set.add(Number(id)); else set.delete(Number(id));

  // Update counter
  const cnt = document.getElementById(type + '-mass-cnt');
  if (cnt) {
    cnt.textContent = set.size + ' sel.';
    cnt.style.display = set.size > 0 ? '' : 'none';
  }

  // Show/hide Elimina button
  const delBtn = document.getElementById('btn-del-' + type);
  if (delBtn) delBtn.style.display = set.size > 0 ? '' : 'none';

  // Legacy: also toggle the old mass-bar if it exists and has content
  const bar = document.getElementById(type + '-mass-bar');
  if (bar && bar.children.length > 0) bar.classList.toggle('hidden', set.size === 0);
}

// ── SELECTION SETS — one per table ──
const _selSets = {};
function getSelSet(type) {
  if (!_selSets[type]) _selSets[type] = new Set();
  return _selSets[type];
}

async function bulkDelete(table, cntId, reloadFn) {
  // Each table uses its own selection system
  let ids;
  if (table === 'subs') {
    ids = Array.from(subSelIds).map(Number);
  } else if (table === 'interventi') {
    // Interventi has legacy selIds AND getSelSet — merge both
    ids = [...new Set([...selIds, ...getSelSet('interventi')])].map(Number);
  } else if (table === 'ordini_fatturazione') {
    ids = Array.from(_fattSel).map(Number);
  } else {
    ids = Array.from(getSelSet(table)).map(Number);
  }

  if (!ids.length) {
    toast('Seleziona almeno un elemento con le ☑ checkbox', 'error');
    return;
  }
  if (!confirm('Eliminare ' + ids.length + ' elementi?\nQuesta operazione NON può essere annullata.')) return;

  // ── Rimuovi dalla cache locale SUBITO (UI istantanea) ──
  if (_cache[table]) {
    _cache[table] = _cache[table].filter(x => !ids.includes(Number(x.id)));
  }

  const r = await api('/api/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ table, ids })
  });

  if (!r || r.error) { toast('Errore: ' + (r?.error || 'risposta nulla'), 'error'); return; }

  // Reset selection for this table
  if (table === 'subs') {
    subSelIds.clear(); subSelMode = false;
    document.getElementById('sub-mass-bar')?.classList.add('hidden');
    document.querySelectorAll('#sec-subs .sel-check').forEach(el => el.checked = false);
  } else if (table === 'interventi') {
    selIds.clear(); getSelSet('interventi').clear();
    document.getElementById('mass-bar')?.classList.add('hidden');
    document.querySelectorAll('.int-chk').forEach(el => el.checked = false);
  } else if (table === 'ordini_fatturazione') {
    _fattSel.clear();
    document.getElementById('fatt-bulk-bar')?.classList.add('hidden');
    document.querySelectorAll('.fatt-chk').forEach(el => el.checked = false);
    updateFattBulkBar();
  } else {
    getSelSet(table).clear();
    document.querySelectorAll('.' + table + '-chk').forEach(el => { el.checked = false; el.style.display = 'none'; });
    document.getElementById(table + '-mass-bar')?.classList.add('hidden');
    // Hide new-style Elimina button
    const dBtn = document.getElementById('btn-del-' + table);
    if (dBtn) dBtn.style.display = 'none';
    const cEl = document.getElementById(table + '-mass-cnt');
    if (cEl) cEl.style.display = 'none';
  }
  const cnt = document.getElementById(cntId);
  if (cnt) cnt.textContent = '0 sel.';
  _resetHeaderChk(table);

  if (typeof reloadFn === 'function') await reloadFn();
  else await loadDD();

  toast(`✅ ${r?.deleted || ids.length} ${table} eliminati`);
}

function toggleGenSel(type) {
  const bar = document.getElementById(type + '-mass-bar');
  const isActive = bar && !bar.classList.contains('hidden');
  if (isActive) {
    // Disattiva selezione
    getSelSet(type).clear();
    bar.classList.add('hidden');
    document.querySelectorAll('.' + type + '-chk').forEach(el => { el.checked = false; });
    const cnt = document.getElementById(type + '-mass-cnt');
    if (cnt) cnt.textContent = '0 selezionati';
  } else {
    // Attiva selezione — mostra bar
    bar?.classList.remove('hidden');
  }
}

function genSelAll(type) {
  // Seleziona tutti i checkbox visibili nella sezione
  const chks = document.querySelectorAll('.' + type + '-chk');
  const set = getSelSet(type);
  set.clear();
  chks.forEach(el => {
    el.checked = true;
    const id = parseInt(el.dataset.id || el.getAttribute('data-id') || 0);
    if (id) set.add(id);
  });
  // Fallback: se nessun checkbox trovato, usa DB direttamente
  if (set.size === 0) {
    const arr = type === 'fornitori' ? DB.fornitori
              : type === 'inquilini' ? DB.inquilini : [];
    arr.forEach(x => set.add(Number(x.id)));
  }

  // Update counter + show Elimina button
  const cnt = document.getElementById(type + '-mass-cnt');
  if (cnt) { cnt.textContent = set.size + ' sel.'; cnt.style.display = set.size > 0 ? '' : 'none'; }
  const delBtn = document.getElementById('btn-del-' + type);
  if (delBtn) delBtn.style.display = set.size > 0 ? '' : 'none';

  // Legacy mass-bar
  document.getElementById(type + '-mass-bar')?.classList.remove('hidden');
}

function genDeselAll(type) {
  getSelSet(type).clear();
  document.querySelectorAll('.' + type + '-chk').forEach(el => { el.checked = false; });
  const cnt = document.getElementById(type + '-mass-cnt');
  if (cnt) cnt.textContent = '0 selezionati';
}

function fornSelAll(chk) {
  if (chk.checked) {
    genSelAll('fornitori');
  } else {
    genDeselAll('fornitori');
  }
}

function inqSelAll(chk) {
  if (chk.checked) {
    genSelAll('inquilini');
  } else {
    genDeselAll('inquilini');
  }
}

// After bulk delete, also reset the header checkboxes
function _resetHeaderChk(type) {
  const id = type === 'fornitori' ? 'forn-sel-all' : type === 'inquilini' ? 'inq-sel-all' : null;
  if (id) { const el = document.getElementById(id); if (el) el.checked = false; }
}



function fattSelAll(chk) {
  document.querySelectorAll('.fatt-chk').forEach(c => {
    c.checked = chk.checked;
    const id = parseInt(c.dataset.id);
    if (chk.checked) _fattSel.add(id); else _fattSel.delete(id);
  });
  updateFattBulkBar();
}

function fattChkChange(id, chk) {
  if (chk.checked) _fattSel.add(id); else _fattSel.delete(id);
  updateFattBulkBar();
}

function updateFattBulkBar() {
  const bar = document.getElementById('fatt-bulk-bar');
  const cnt = document.getElementById('fatt-bulk-cnt');
  const n = _fattSel.size;
  bar?.classList.toggle('hidden', n === 0);
  if (cnt) cnt.textContent = n + ' selezionati';
}
// ═══════════════════════════════════════════════════════════
// CLIENTI — tab switching, render lead cards, nuovo lead
// ═══════════════════════════════════════════════════════════

let _clientiTabAttivo = 'attivo'; // stato corrente tab

async function switchClienteTab(stato, btn) {
  _clientiTabAttivo = stato;

  // Aggiorna stile tab buttons
  document.querySelectorAll('.clienti-tab-btn').forEach(b => {
    const active = b.dataset.stato === stato;
    b.style.color       = active ? 'var(--primary-dark)' : 'var(--muted)';
    b.style.fontWeight  = active ? '600' : '500';
    b.style.borderBottom = active ? '2px solid var(--primary)' : '2px solid transparent';
  });

  // Mostra wrapper corretto
  const tableWrap = document.getElementById('clienti-table-wrap');
  const leadWrap  = document.getElementById('lead-cards-wrap');
  // Mostra/nascondi filtri lead
  const filtriEl = document.getElementById('lead-filtri');
  if (filtriEl) filtriEl.style.display = stato === 'lead' ? 'flex' : 'none';

  if (stato === 'lead') {
    tableWrap.style.display = 'none';
    leadWrap.style.display  = '';
    await loadLeadCards();
  } else {
    tableWrap.style.display = '';
    leadWrap.style.display  = 'none';
    await loadClienti(stato);
  }
}

async function loadClienti(stato = 'attivo') {
  const data = await api(`/api/clienti?stato=${stato}`);
  if (!data) return;

  const lbl = document.getElementById('cnt-' + (stato === 'attivo' ? 'attivi' : stato));
  if (lbl) lbl.textContent = data.length;

  const BADGE = {
    attivo: '<span style="background:var(--success-bg);color:var(--success);border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;">Attivo</span>',
    ex:     '<span style="background:var(--bg2);color:var(--muted);border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;">Ex cliente</span>',
    lead:   '<span style="background:var(--accent-bg);color:var(--accent);border-radius:4px;padding:1px 7px;font-size:10px;font-weight:600;">Lead</span>',
  };

  const tbody = document.getElementById('tb-inquilini');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Nessun ${stato === 'attivo' ? 'cliente attivo' : stato === 'ex' ? 'ex cliente' : 'lead'} trovato.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(i => `
    <tr>
      <td><input type="checkbox" class="sel-check inquilini-chk" data-id="${i.id}" onchange="genToggle('inquilini',${i.id},this)"></td>
      <td class="td-bold">${esc(i.ragione_sociale)}</td>
      <td style="font-size:12px;color:var(--muted);">${esc(i.cf||i.piva||'—')}</td>
      <td>${esc(i.citta||'—')}</td>
      <td>${esc(i.tel||'—')}</td>
      <td>${esc(i.email||'—')}</td>
      <td>${BADGE[i.stato_calcolato] || BADGE.ex}</td>
      <td>
        <button class="btn btn-xs btn-gray" onclick="openAna('inquilino',${i.id})">✏️</button>
        <button class="btn btn-xs btn-gray" onclick="delAna('inquilini',${i.id})">🗑</button>
      </td>
    </tr>`).join('');
}



// Filtri live
function applyLeadFilter() { loadLeadCards(); }

async function convertiLead(id) {
  if (!confirm('Convertire questo lead in cliente attivo?')) return;
  const r = await api(`/api/clienti/${id}/converti-lead`, { method: 'PUT' });
  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  toast('✅ Lead convertito in cliente attivo');
  await loadDD();
  switchClienteTab('attivo', document.querySelector('[data-stato="attivo"]'));
}

// ── Crea accesso portale inquilino (solo admin) ─────────────
async function creaAccessoPortale(inquilinoId, nomeInquilino) {
  const email = prompt('Email accesso per ' + nomeInquilino + ':');
  if (!email) return;
  const pwd = prompt('Password (min 6 caratteri):');
  if (!pwd || pwd.length < 6) { toast('Password troppo corta', 'error'); return; }

  const r = await api('/api/inquilini/' + inquilinoId + '/crea-accesso', {
    method: 'POST',
    body: JSON.stringify({ email, password: pwd }),
  });
  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  toast('✅ Accesso creato — portale: /portale.html');
}


function openModalNuovoLead() {
  // Set today's date
  const oggi = new Date().toLocaleDateString('it-IT');
  const lbl = document.getElementById('lead-data-oggi');
  if (lbl) lbl.textContent = oggi;
  // Clear fields
  ['lead-nome','lead-cognome','lead-tel','lead-email','lead-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('modal-nuovo-lead').classList.add('open');
}

async function saveNewLead() {
  const nome    = (document.getElementById('lead-nome')?.value || '').trim();
  const cognome = (document.getElementById('lead-cognome')?.value || '').trim();
  const tel     = (document.getElementById('lead-tel')?.value || '').trim();
  const telAlt  = (document.getElementById('lead-tel-alt')?.value || '').trim();
  const email   = (document.getElementById('lead-email')?.value || '').trim();
  const fonte   = document.getElementById('lead-fonte')?.value || '';

  if (!nome && !cognome) { toast('Inserisci almeno il nome', 'error'); return; }
  if (!tel && !email)    { toast('Telefono o email obbligatorio', 'error'); return; }

  // Ricerca immobile
  const ricTipo    = document.getElementById('lead-ric-tipo')?.value    || null;
  const ricCat     = document.getElementById('lead-ric-cat')?.value     || null;
  const ricZona    = document.getElementById('lead-ric-zona')?.value    || null;
  const ricMqMin   = parseInt(document.getElementById('lead-ric-mq-min')?.value) || null;
  const ricMqMax   = parseInt(document.getElementById('lead-ric-mq-max')?.value) || null;
  const ricStanze  = parseInt(document.getElementById('lead-ric-stanze')?.value) || null;
  const ricBudget  = parseFloat(document.getElementById('lead-ric-budget')?.value) || null;
  const ricDal     = document.getElementById('lead-ric-dal')?.value     || null;
  const ricSubId   = document.getElementById('lead-ric-sub')?.value     || null;

  // Promemoria inline
  const promData   = document.getElementById('lead-prom-data')?.value;
  const promOra    = document.getElementById('lead-prom-ora')?.value    || null;
  const promTipo   = document.getElementById('lead-prom-tipo')?.value   || 'chiamata';
  const promTitolo = document.getElementById('lead-prom-titolo')?.value?.trim();
  const promNote   = document.getElementById('lead-prom-note-brevi')?.value?.trim() || null;
  const alertGiorni = [];
  if (document.getElementById('lead-alert-2g')?.checked) alertGiorni.push(2);
  if (document.getElementById('lead-alert-1g')?.checked) alertGiorni.push(1);
  const alertOre = [];
  if (document.getElementById('lead-alert-2h')?.checked) alertOre.push(2);

  const body = {
    nome, cognome, tel, tel_alt: telAlt||null, email: email||null, lead_fonte: fonte||null,
    ricerca_tipologia: ricTipo, ricerca_categoria: ricCat, ricerca_zona: ricZona,
    ricerca_mq_min: ricMqMin, ricerca_mq_max: ricMqMax, ricerca_stanze: ricStanze,
    ricerca_budget_max: ricBudget, ricerca_disponibilita_da: ricDal,
    ricerca_sub_interesse_id: ricSubId ? parseInt(ricSubId) : null,
    note_lead: document.getElementById('lead-note')?.value?.trim() || null,
  };

  // Aggiungi promemoria solo se ha data e titolo
  if (promData && promTitolo) {
    body.promemoria = {
      titolo: promTitolo,
      data_evento: promData,
      ora_evento:  promOra,
      tipo_azione: promTipo,
      descrizione: promNote,
      alert_giorni_prima: alertGiorni.length ? alertGiorni : [1],
      alert_ore_prima:    alertOre.length    ? alertOre    : [],
    };
  }

  const r = await api('/api/clienti/lead', { method:'POST', body: JSON.stringify(body) });
  if (!r || r.error) { toast('Errore: ' + (r?.error||'?'), 'error'); return; }

  closeM('modal-nuovo-lead');
  const promMsg = r.promemoria
    ? ` + promemoria del ${new Date(r.promemoria.data_evento).toLocaleDateString('it-IT')}`
    : '';
  toast('💡 Lead creato' + promMsg);
  await loadDD();
  const leadBtn = document.querySelector('[data-stato="lead"]');
  if (leadBtn) switchClienteTab('lead', leadBtn);
}

function autoTitoloLead() {
  const nome    = (document.getElementById('lead-nome')?.value||'').trim();
  const cognome = (document.getElementById('lead-cognome')?.value||'').trim();
  const note    = (document.getElementById('lead-prom-note-brevi')?.value||'').trim();
  const tipo    = document.getElementById('lead-prom-tipo')?.value || 'chiamata';
  const TIPO_LABELS = { chiamata:'Richiamare', email:'Scrivere email a', visita:'Visita con', appuntamento:'Appuntamento con', altro:'Azione con' };
  const label   = TIPO_LABELS[tipo] || 'Azione con';
  const nomeFull = [nome, cognome].filter(Boolean).join(' ');
  if (!nomeFull) return;
  const titoloEl = document.getElementById('lead-prom-titolo');
  if (titoloEl && !titoloEl.dataset.modified) {
    titoloEl.value = [label, nomeFull, note ? '— '+note : ''].filter(Boolean).join(' ');
  }
  // Set tomorrow as default date
  const dataEl = document.getElementById('lead-prom-data');
  if (dataEl && !dataEl.value) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    dataEl.value = tomorrow.toISOString().split('T')[0];
  }
}


// Placeholder per P17 — apre modal promemoria con entità lead pre-compilata
function openNuovoPromemoriaLead(id, nome) {
  // Implementato in P17-4
  toast('📅 Promemoria in arrivo con P17!', 'info');
}

// Aggiorna i badge contatori di tutti e 3 i tab in background
async function _updateClienteTabCounts() {
  try {
    const all = await api('/api/clienti?stato=all');
    if (!all) return;
    const counts = { attivi: 0, ex: 0, lead: 0 };
    all.forEach(c => {
      if (c.stato_calcolato === 'attivo') counts.attivi++;
      else if (c.stato_calcolato === 'lead') counts.lead++;
      else counts.ex++;
    });
    const ea = document.getElementById('cnt-attivi');
    const ee = document.getElementById('cnt-ex');
    const el = document.getElementById('cnt-lead');
    if (ea) ea.textContent = counts.attivi;
    if (ee) ee.textContent = counts.ex;
    if (el) el.textContent = counts.lead;
  } catch(_) {}
}

