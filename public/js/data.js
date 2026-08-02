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
    data.subs.map(s => `<option value="${s.id}">${esc(subLabel(s))}</option>`).join(''));
  setEl('ff-forn', '<option value="">Tutti i fornitori</option>' +
    data.fornitori.map(f => `<option value="${f.id}">${f.ragione_sociale}</option>`).join(''));
  setEl('ff-cat',  '<option value="">Tutte</option>' +
    data.categorie.map(c => `<option value="${c.id}">${c.icona} ${c.nome}</option>`).join(''));

  // Wrap in try/catch: un errore in un render non blocca gli altri
  for (const [fn, name] of [[renderTbForn,'forn'],[renderTbInq,'inq'],[renderTbSedi,'sedi'],[renderTbCat,'cat']]) {
    try { fn(); } catch(err) {
      console.error('Render error [' + name + ']:', err);
      const tbId = { forn:'tb-fornitori', inq:'tb-inquilini', sedi:'tb-sedi', cat:'tb-cat' }[name];
      const tb = tbId && document.getElementById(tbId);
      if (tb) tb.innerHTML = '<tr><td colspan="10" class="empty" style="color:var(--danger);">⚠ Errore render [' + name + '] — <a href="#" onclick="loadDD();return false;">Riprova</a></td></tr>';
    }
  }
  // SUB ha il suo loader dedicato che fa fetch diretto
  try { renderTbSubs(); } catch(err) { console.error('Render error [subs]:', err); }

  if (anyFailed) {
    // Mostra pulsante "Riprova" nelle tabelle che usano dati mancanti
    const tbSubs = document.getElementById('tb-subs-ana') || document.getElementById('tb-subs');
    if (tbSubs && !data.subs.length) {
      tbSubs.innerHTML = '<tr><td colspan="10" class="empty" style="color:var(--danger);">' +
        '⚠ Errore caricamento SUB — <a href="#" onclick="loadDD();return false;" style="color:var(--primary);">Riprova</a></td></tr>';
    }
  }
}

async function loadSubs() {
  const tb = document.getElementById('tb-subs-ana') || document.getElementById('tb-subs');
  if (tb) tb.innerHTML = '<tr><td colspan="10" class="empty">Caricamento SUB…</td></tr>';

  const subs = await api('/api/subs');
  if (!subs) {
    if (tb) tb.innerHTML =
      '<tr><td colspan="10" class="empty" style="color:var(--danger);">' +
      '⚠ Errore caricamento SUB — ' +
      '<a href="#" onclick="loadSubs();return false;" style="color:var(--primary);">Riprova</a>' +
      '</td></tr>';
    return;
  }

  DB.subs = subs;

  // Aggiorna anche i select che dipendono da DB.subs
  const subOpts = '<option value="">Tutti i SUB</option>' +
    subs.map(s => '<option value="' + s.id + '">' + esc(subLabel(s)) + '</option>').join('');
  ['ff-sub','df-sub','mf-sub','bf-sub','tf-sub','af-sub'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = subOpts;
  });

  renderTbSubs();
  if(typeof renderSubsCards==='function')renderSubsCards();
}

function renderTbSubs() {
  // Esistono DUE tabelle SUB nel DOM (#tb-subs-ana nella sezione SUB, #tb-subs
  // nella vecchia scheda Anagrafica). Scriviamo in TUTTE quelle presenti,
  // altrimenti la tabella visibile resta bloccata su "Caricamento SUB…".
  const tbs = ['tb-subs-ana', 'tb-subs']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (!tbs.length) return;
  const paint = html => tbs.forEach(el => { el.innerHTML = html; });

  if (!DB.subs || !DB.subs.length) {
    paint('<tr><td colspan="10" class="empty">Nessun SUB trovato.</td></tr>');
    return;
  }

  const STATO_BADGE = {
    attivo:        '<span style="background:var(--success-bg);color:var(--success);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Attivo</span>',
    fuso:          '<span style="background:var(--bg2);color:var(--muted);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Fuso</span>',
    scisso:        '<span style="background:var(--info-bg);color:var(--info);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Scisso</span>',
    riaccatastato: '<span style="background:var(--warning-bg);color:var(--warning);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Riacc.</span>',
    cessato:       '<span style="background:var(--danger-bg);color:var(--danger);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;">Cessato</span>',
  };

  paint(DB.subs.map(function(s) {
    const stato  = s.stato_sub || 'attivo';
    const attivo = stato === 'attivo';
    const spese  = parseFloat(s.totale_spese||0);
    const speseFmt = spese > 0 ? '€ ' + spese.toLocaleString('it-IT', {maximumFractionDigits:0}) : '—';
    const rowOp  = attivo ? '' : ' style="opacity:.7;"';

    const checkCell = attivo
      ? '<input type="checkbox" class="sel-check subs-chk" data-id="' + s.id + '" onchange="subToggle(' + s.id + ',this)">'
      : '';

    const destLink = s.sub_destinazione_codice
      ? (' <span style="font-size:10px;color:var(--primary);">→ ' + esc(s.sub_destinazione_codice) + '</span>')
      : '';

    const statoBadge = (STATO_BADGE[stato] || STATO_BADGE.attivo) + destLink;

    // Tutta la riga apre la scheda completa del SUB (pagina)
    return '<tr class="row-click"' + rowOp + ' onclick="openSubDetail(' + s.id + ')" title="Apri scheda completa">' +
      '<td onclick="event.stopPropagation()">' + checkCell + '</td>' +
      '<td class="td-bold">' + (subLabelHtml(s)||'—') + '</td>' +
      '<td>' + esc(s.sede_nome||'—') + '</td>' +
      '<td style="font-size:12px;color:var(--muted);">' + esc(s.stato_occupazione||'—') + '</td>' +
      '<td style="font-size:12px;">' + esc(s.inquilino_nome||'—') + '</td>' +
      '<td>' + statoBadge + '</td>' +
      '<td style="font-size:12px;color:var(--muted);">' + (s.mq_commerciali ? s.mq_commerciali + ' mq' : '—') + '</td>' +
      '<td style="font-size:12px;">' + (s.num_interventi||0) + '</td>' +
      '<td style="font-size:12px;font-family:monospace;">' + speseFmt + '</td>' +
      '<td onclick="event.stopPropagation()">' +
        '<button class="btn btn-xs btn-gray" onclick="openSubDetail(' + s.id + ')" title="Scheda">📋</button>' +
        (attivo ? ' <button class="btn btn-xs btn-gray" onclick="openAnaById(\'sub\',' + s.id + ')" title="Modifica">✏️</button>' : '') +
      '</td>' +
    '</tr>';
  }).join(''));
}

function renderTbForn(){
  const rows=DB.fornitori.length?DB.fornitori.map(f=>`<tr><td><input type="checkbox" class="sel-check fornitori-chk" data-id="${f.id}" onchange="genToggle('fornitori',${f.id},this)"></td><td class="td-bold">${esc(f.ragione_sociale)}</td><td class="td-mono" style="font-size:11px;">${esc(f.piva||f.cf||'—')}</td><td>${esc(f.citta||'—')}</td><td>${esc(f.tel||'—')}</td><td style="font-size:11px;">${esc(f.spec||'—')}</td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit btn-sm" onclick="openAnaById('fornitore',${f.id})">✏️</button><button class="btn btn-danger btn-sm" onclick="delAna('fornitori',${f.id})">✕</button></div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nessun fornitore</td></tr>';
  ['tb-forn','tb-fornitori'].forEach(tid=>{const tb=document.getElementById(tid);if(tb)tb.innerHTML=rows;});
}

function renderTbInq(){
  const rows=DB.inquilini.length?DB.inquilini.map(i=>{const sub=DB.subs.find(s=>s.inquilino_id==i.id);return`<tr><td><input type="checkbox" class="sel-check inquilini-chk" data-id="${i.id}" onchange="genToggle('inquilini',${i.id},this)"></td><td class="td-bold">${esc(i.ragione_sociale)}</td><td class="td-mono" style="font-size:11px;">${esc(i.piva||i.cf||'—')}</td><td>${esc(i.citta||'—')}</td><td>${esc(i.tel||'—')}</td><td style="font-size:11px;">${esc(i.email||'—')}</td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit btn-sm" onclick="openAnaById('inquilino',${i.id})">✏️</button><button class="btn btn-danger btn-sm" onclick="delAna('inquilini',${i.id})">✕</button></div></td></tr>`;}).join(''):'<tr><td colspan="7" class="empty">Nessun inquilino</td></tr>';
  const tb=document.getElementById('tb-inq');if(tb)tb.innerHTML=rows; // tb-inquilini appartiene alla sezione Clienti (loadClienti)
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

  // Nell'HTML esistono ID duplicati (es. inquilini-mass-cnt sia in Anagrafiche
  // che in Clienti): aggiorna TUTTE le occorrenze, non solo la prima
  document.querySelectorAll('[id="' + type + '-mass-cnt"]').forEach(cnt => {
    cnt.textContent = set.size + ' sel.';
    cnt.style.display = set.size > 0 ? '' : 'none';
  });

  // Show/hide Elimina button
  const delBtn = document.getElementById('btn-del-' + type);
  if (delBtn) delBtn.style.display = set.size > 0 ? '' : 'none';

  // Legacy: also toggle the old mass-bar if it exists and has content
  document.querySelectorAll('[id="' + type + '-mass-bar"]').forEach(bar => {
    if (bar.children.length > 0) bar.classList.toggle('hidden', set.size === 0);
  });
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
  if(!await appConfirm('Eliminare ' + ids.length + ' elementi?\nQuesta operazione NON può essere annullata.')) return;

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

// Dopo un re-render: se la selezione è attiva, rimostra i checkbox e ripristina i flag
function restoreSelUI(table){
  const bar=document.getElementById(table+'-mass-bar');
  if(!bar||bar.classList.contains('hidden'))return;
  const set=getSelSet(table);
  document.querySelectorAll('.'+table+'-chk').forEach(el=>{
    el.style.display='';
    el.checked=set.has(parseInt(el.dataset.id));
  });
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
  const anno=new Date().getFullYear();
  const [data,pags] = await Promise.all([
    api(`/api/clienti?stato=${stato}`),
    api('/api/pagamenti-affitto?anno='+anno),
  ]);
  if (!data) return;

  // Morosità per inquilino (canoni insoluti/in ritardo dell'anno)
  const morosi={};
  (pags||[]).forEach(p=>{
    if(p.stato==='insoluto'||p.stato==='ritardo'){
      const k=p.inquilino_id; if(!k)return;
      morosi[k]=morosi[k]||{tot:0,n:0};
      morosi[k].tot+=parseFloat(p.importo)||0; morosi[k].n++;
    }
  });

  const lbl = document.getElementById('cnt-' + (stato === 'attivo' ? 'attivi' : stato));
  if (lbl) lbl.textContent = data.length;

  const tbody = document.getElementById('tb-inquilini');
  if (!tbody) return;
  // intestazioni nuove
  const thead=tbody.closest('table')?.querySelector('thead');
  if(thead)thead.innerHTML='<tr><th style="width:34px;"><input type="checkbox" id="inq-sel-all" onchange="inqSelAll(this)"></th><th>Cliente</th><th>Contatti</th><th>Unità</th><th>Situazione pagamenti</th><th>Prossima azione</th><th>Stato</th><th style="width:80px;">Azioni</th></tr>';

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Nessun ${stato === 'attivo' ? 'cliente attivo' : stato === 'ex' ? 'ex cliente' : 'lead'} trovato.</td></tr>`;
    return;
  }

  const BADGE = {
    attivo: '<span class="pill-stato" style="background:var(--success-bg);color:var(--success);">Attivo</span>',
    ex:     '<span class="pill-stato" style="background:var(--bg2);color:var(--muted);">Ex</span>',
    lead:   '<span class="pill-stato" style="background:var(--accent-bg);color:var(--accent-dark);">Lead</span>',
  };
  const iniz=n=>String(n||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();

  tbody.innerHTML = data.map(i => {
    const m=morosi[i.id];
    const prox=i.prossimo_promemoria;
    return `
    <tr class="row-click" onclick="openAnaById('inquilino',${i.id})" title="Clicca per aprire la scheda">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="sel-check inquilini-chk" data-id="${i.id}" onchange="genToggle('inquilini',${i.id},this)"></td>
      <td><div style="display:flex;align-items:center;gap:10px;">
        <span class="avatar-ini">${iniz(i.ragione_sociale)}</span>
        <div style="min-width:0;"><div style="font-weight:600;color:var(--text-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px;">${esc(i.ragione_sociale)}</div>
        <div style="font-size:10.5px;color:var(--muted);">${esc(i.citta||'')}${i.piva?' · P.IVA '+esc(i.piva):''}</div></div>
      </div></td>
      <td onclick="event.stopPropagation()"><div style="display:flex;gap:5px;">
        ${i.tel?`<a class="ct-quick" href="tel:${esc(i.tel)}" title="${esc(i.tel)}">📞</a>`:''}
        ${i.email?`<a class="ct-quick" href="#" onclick="event.preventDefault();openAiMail('${esc(i.email)}')" title="Scrivi email (AI) a ${esc(i.email)}">✉️</a>`:''}
        ${!i.tel&&!i.email?'<span style="font-size:11px;color:var(--muted-2);">—</span>':''}
      </div></td>
      <td style="font-size:12px;">${i.sub_attivi>0?'<strong>'+i.sub_attivi+'</strong> attive':'—'}</td>
      <td>${m?`<span class="pill-stato" style="background:var(--danger-bg);color:var(--danger);">⚠ € ${m.tot.toLocaleString('it-IT',{maximumFractionDigits:0})} · ${m.n} canoni</span>`
             :(i.sub_attivi>0?'<span class="pill-stato" style="background:var(--success-bg);color:var(--success);">In regola</span>':'<span style="font-size:11px;color:var(--muted-2);">—</span>')}</td>
      <td style="font-size:11px;color:var(--muted);">${prox&&prox.titolo?esc(String(prox.titolo).slice(0,26))+(prox.data_evento?' · '+fmt(prox.data_evento):''):'—'}</td>
      <td>${BADGE[i.stato_calcolato] || BADGE.ex}</td>
      <td onclick="event.stopPropagation()">
        <button class="btn btn-xs btn-gray" onclick="openAssegnaSub(${i.id})" title="Assegna SUB">🏠</button>
        <button class="btn btn-xs btn-gray" onclick="delAna('inquilini',${i.id})" title="Elimina">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

// Filtri live
// (spostata in lead_ui.js)

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


// (spostata in lead_ui.js)

// (spostata in lead_ui.js)

// (spostata in lead_ui.js)


// (placeholder rimosso: la versione vera di openNuovoPromemoriaLead è in promemoria.js)

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



// ── Assegna cliente a SUB ────────────────────────────────────
let _assegnaInquilinoId = null;

function openAssegnaSub(inquilinoId, nomeInquilino) {
  _assegnaInquilinoId = inquilinoId;
  if (!nomeInquilino) nomeInquilino = (DB.inquilini||[]).find(x=>x.id==inquilinoId)?.ragione_sociale || '';
  document.getElementById('assegna-sub-nome').textContent = 'Cliente: ' + nomeInquilino;

  // Popola SUB liberi
  const liberi = (DB.subs || []).filter(s =>
    (!s.stato_occupazione || s.stato_occupazione === 'libero') &&
    (!s.stato_sub || s.stato_sub === 'attivo')
  );
  const sel = document.getElementById('assegna-sub-sel');
  sel.innerHTML = '<option value="">— Seleziona SUB —</option>' +
    liberi.map(s =>
      '<option value="' + s.id + '">' +
      esc(s.codice) + (s.sede_nome ? ' — ' + esc(s.sede_nome) : '') +
      (s.mq_commerciali ? ' (' + s.mq_commerciali + ' mq)' : '') +
      '</option>'
    ).join('');

  // Reset campi
  document.getElementById('assegna-data-inizio').value = new Date().toISOString().split('T')[0];
  document.getElementById('assegna-canone').value = '';
  document.getElementById('assegna-tipo').value = '';
  document.getElementById('assegna-note').value = '';

  document.getElementById('modal-assegna-sub').classList.add('open');
}

async function salvaAssegnaSub() {
  const subId = document.getElementById('assegna-sub-sel').value;
  if (!subId) { toast('Seleziona un SUB', 'error'); return; }
  if (!_assegnaInquilinoId) { toast('Errore: nessun cliente selezionato', 'error'); return; }

  const r = await api('/api/subs/' + subId + '/cambia-inquilino', {
    method: 'POST',
    body: JSON.stringify({
      nuovo_inquilino_id: _assegnaInquilinoId,
      data_cambio:        document.getElementById('assegna-data-inizio').value || null,
      canone_mensile:     document.getElementById('assegna-canone').value || null,
      tipo_contratto:     document.getElementById('assegna-tipo').value || null,
      note:               document.getElementById('assegna-note').value || null,
    }),
  });

  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }

  const subCodice = DB.subs.find(s => s.id == subId)?.codice || subId;
  closeM('modal-assegna-sub');
  toast('✅ Assegnato a SUB ' + subCodice);
  await loadDD();
}


// ═══════ SUB: VISTA A SCHEDE (raggruppate per sede) ═══════
function setSubsView(v){
  localStorage.setItem('subs_view',v);
  const cards=document.getElementById('subs-cards');
  const table=document.getElementById('subs-table-wrap');
  if(cards)cards.style.display=v==='cards'?'':'none';
  if(table)table.style.display=v==='table'?'':'none';
  document.getElementById('sv-cards')?.classList.toggle('active',v==='cards');
  document.getElementById('sv-table')?.classList.toggle('active',v==='table');
  if(v==='cards')renderSubsCards();
}

function renderSubsCards(){
  const el=document.getElementById('subs-cards');
  if(!el)return;
  const subs=DB.subs||[];
  if(!subs.length){el.innerHTML='<div class="empty" style="grid-column:1/-1;">Nessun SUB.</div>';return;}
  // raggruppa per sede
  const gruppi={};
  subs.forEach(s=>{const k=s.sede_nome||'Senza sede';(gruppi[k]=gruppi[k]||[]).push(s);});
  const COLORI=['#38524a','#8c6f45','#46656e','#96742e','#8e4343','#5a5a72'];
  let ci=0;
  el.innerHTML=Object.entries(gruppi).map(([sede,list])=>{
    const col=COLORI[ci++%COLORI.length];
    return '<div class="sub-sede-title">'+esc(sede)+' <span style="letter-spacing:0;color:var(--muted);">('+list.length+')</span></div>'
      +list.map(s=>{
        const attivo=!s.stato_sub||s.stato_sub==='attivo';
        const occ=s.stato_occupazione==='occupato';
        const canone=s.canone_annuo?('€ '+(parseFloat(s.canone_annuo)/12).toLocaleString('it-IT',{maximumFractionDigits:0})+'/mese'):null;
        const isImg=u=>u&&(/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(u)||/\/image\/upload\//.test(u)||/\/api\/documenti\/\d+\/file/.test(u));
        const foto=isImg(s.foto_url)?'<div style="margin:-15px -16px 11px;height:104px;overflow:hidden;"><img src="'+esc(fileUrl(s.foto_url))+'" style="width:100%;height:100%;object-fit:cover;" loading="lazy"></div>':'';
        return '<div class="sub-card"'+(attivo?'':' style="opacity:.65;"')+' onclick="openSubDetail('+s.id+')">'
          +(foto?'':'<div class="banda" style="background:'+col+';"></div>')
          +foto
          +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">'
            +'<div class="codice">'+subLabelHtml(s)+'</div>'
            +'<span class="'+(occ?'pill-occupato':'pill-libero')+'">'+(occ?'Occupato':'Libero')+'</span>'
          +'</div>'
          +'<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">'+esc(s.indirizzo_completo||sede)+(s.piano?' · '+esc(s.piano):'')+'</div>'
          +'<div style="font-size:12px;color:var(--text);margin-bottom:10px;">👤 '+esc(s.inquilino_nome||'—')+(canone?' · <strong style="font-family:monospace;">'+canone+'</strong>':'')+'</div>'
          +'<div style="display:flex;gap:12px;padding-top:9px;border-top:1px solid var(--border);font-size:10.5px;color:var(--muted);">'
            +'<span>'+(s.mq_commerciali?parseFloat(s.mq_commerciali).toFixed(0)+' mq':'— mq')+'</span>'
            +'<span>'+(s.num_interventi||0)+' int.</span>'
            +'<span style="margin-left:auto;font-family:monospace;color:var(--accent);">'+(s.totale_spese>0?'€ '+parseFloat(s.totale_spese).toLocaleString('it-IT',{maximumFractionDigits:0}):'—')+'</span>'
            +(attivo?'':'<span style="color:var(--danger);font-weight:700;">'+esc(s.stato_sub)+'</span>')
          +'</div>'
        +'</div>';
      }).join('');
  }).join('');
}

// vista iniziale
try{ setTimeout(()=>setSubsView(localStorage.getItem('subs_view')||'cards'),50); }catch(e){}
