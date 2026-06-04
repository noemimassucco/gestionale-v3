
// ── DETTAGLIO FATTURA (click su riga) ──
async function openFattDetail(id) {
  // Find in cached data first
  let obj = _fattData.find(o => o.id == id);
  if (!obj) {
    const all = await api('/api/fatturazione');
    obj = (all||[]).find(o => o.id == id);
  }
  if (!obj) { toast('Fattura non trovata', 'error'); return; }

  const container = document.getElementById('fatt-detail-body');
  if (!container) { openEditFatt(id); return; }

  const statusLabel = { pagato:'✅ Pagato', non_pagato:'⏳ Non pagato', parziale:'⚠️ Parziale' };
  const statusColor = { pagato:'var(--green)', non_pagato:'var(--red)', parziale:'var(--orange)' };

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">Dati principali</div>
        <div class="detail-row"><span>Cliente</span><strong>${esc(obj.cliente_nome||'—')}</strong></div>
        <div class="detail-row"><span>Servizio</span><strong>${TIPI_SERVIZIO[obj.tipo_servizio]||obj.tipo_servizio}</strong></div>
        <div class="detail-row"><span>Nome servizio</span><strong>${esc(obj.nome_servizio||'—')}</strong></div>
        <div class="detail-row"><span>SUB collegato</span><strong>${obj.sub_codice ? '<span class="badge badge-sede">'+esc(obj.sub_codice)+'</span>' : '—'}</strong></div>
        <div class="detail-row"><span>Sede</span><strong>${esc(obj.sede_nome||'—')}</strong></div>
        ${obj.descrizione ? `<div class="detail-row"><span>Descrizione</span><strong>${esc(obj.descrizione)}</strong></div>` : ''}
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">Importi e pagamento</div>
        <div class="detail-row"><span>Importo</span><strong style="font-size:18px;color:var(--accent);font-family:monospace;">€ ${parseFloat(obj.importo||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</strong></div>
        <div class="detail-row"><span>Periodicità</span><strong>${obj.periodicita||'—'}</strong></div>
        <div class="detail-row"><span>Stato pagamento</span><strong style="color:${statusColor[obj.stato_pagamento]||'var(--muted)'};">${statusLabel[obj.stato_pagamento]||obj.stato_pagamento||'—'}</strong></div>
        ${obj.data_pagamento ? `<div class="detail-row"><span>Data pagamento</span><strong>${fmt(obj.data_pagamento)}</strong></div>` : ''}
        ${obj.importo_pagato ? `<div class="detail-row"><span>Importo pagato</span><strong>€ ${parseFloat(obj.importo_pagato).toLocaleString('it-IT',{minimumFractionDigits:2})}</strong></div>` : ''}
        <div class="detail-row"><span>Contabilizzato</span><strong>${obj.flag_contabilizzato ? '✅ Sì' : '🔴 No'}</strong></div>
      </div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">Riferimento contabile</div>
        ${obj.numero_fattura ? `<div class="detail-row"><span>N° fattura</span><strong>${esc(obj.numero_fattura)}</strong></div>` : ''}
        ${obj.data_fatturazione ? `<div class="detail-row"><span>Data fatturazione</span><strong>${fmt(obj.data_fatturazione)}</strong></div>` : ''}
        <div class="detail-row"><span>Periodo</span><strong>${obj.mese_riferimento ? MESI_NOMI[obj.mese_riferimento]+' '+obj.anno_riferimento : '—'}</strong></div>
        ${obj.data_inizio ? `<div class="detail-row"><span>Dal</span><strong>${fmt(obj.data_inizio)}</strong></div>` : ''}
        ${obj.data_fine ? `<div class="detail-row"><span>Al</span><strong>${fmt(obj.data_fine)}</strong></div>` : ''}
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">Note</div>
        ${obj.note ? `<div style="font-size:12px;color:var(--text);line-height:1.6;">${esc(obj.note)}</div>` : '<div style="color:var(--muted);font-size:12px;">Nessuna nota</div>'}
        ${obj.note_contabili ? `<div style="margin-top:8px;font-size:11px;color:var(--muted);">Note contabili: ${esc(obj.note_contabili)}</div>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">
      ${obj.stato_pagamento !== 'pagato' ? `<button class="btn btn-success btn-sm" onclick="fattPaga(${obj.id});closeM('modal-fatt-detail')">💳 Segna pagato</button>` : ''}
      <button class="btn btn-sm" style="background:rgba(107,142,107,.15);color:#93c5fd;" onclick="closeM('modal-fatt-detail');openEditFatt(${obj.id})">✏️ Modifica</button>
      ${!obj.flag_contabilizzato ? `<button class="btn btn-sm btn-gray" onclick="fattToggleContabilizza(${obj.id});closeM('modal-fatt-detail');loadFatturazione()">📋 Contabilizza</button>` : ''}
    </div>`;

  document.getElementById('fatt-detail-title').textContent =
    (obj.numero_fattura ? 'Fattura '+obj.numero_fattura+' — ' : '') + esc(obj.cliente_nome||'Dettaglio');
  document.getElementById('modal-fatt-detail').classList.add('open');
}
// =======================================================
// MODULE: fatturazione.js
// =======================================================

async function loadFatturazione() {
  const p = new URLSearchParams();
  const anno = document.getElementById('fatt-f-anno')?.value;
  const mese = document.getElementById('fatt-f-mese')?.value;
  const stato = document.getElementById('fatt-f-stato')?.value;
  const cont = document.getElementById('fatt-f-cont')?.value;
  if (anno) p.set('anno', anno);
  if (mese) p.set('mese', mese);
  if (stato) p.set('stato_pagamento', stato);
  if (cont !== undefined && cont !== '') p.set('contabilizzato', cont);

  const [data, istatAlert] = await Promise.all([
    api('/api/fatturazione?' + p),
    api('/api/fatturazione/istat-alert'),
  ]);
  if (!data) return;

  // Filtra localmente per search
  const search = (document.getElementById('fatt-f-search')?.value || '').toLowerCase().trim();
  _fattData = search ? data.filter(o =>
    (o.cliente_nome||'').toLowerCase().includes(search) ||
    (o.nome_servizio||'').toLowerCase().includes(search) ||
    (o.sub_codice||'').toLowerCase().includes(search)
  ) : data;

  renderFattTable(_fattData);
  renderFattKpi(_fattData);
  renderIstatAlert(istatAlert || []);
  renderNonContabilizzati(_fattData);
}

function renderFattTable(rows) {
  const tbody = document.getElementById('fatt-tbody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty">Nessun ordine per i filtri selezionati</td></tr>'; return; }
  tbody.innerHTML = rows.map(o => {
    const isNc = !o.flag_contabilizzato;
    const isPending = o.stato_pagamento === 'non_pagato';
    const rowBg = isNc ? 'background:rgba(239,68,68,.03);' : '';
    return `<tr style="${rowBg}cursor:pointer;" onclick="openFattDetail(${o.id})" title="Clicca per aprire — doppio click per modificare" ondblclick="event.stopPropagation();openEditFatt(${o.id})">
      <td><input type="checkbox" class="sel-check fatt-chk" data-id="${o.id}" onchange="fattChkChange(${o.id},this)"></td>
      <td>
        <div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(o.cliente_nome||'—')}</div>
        ${o.sede_nome ? `<div style="font-size:10px;color:var(--muted);">${esc(o.sede_nome)}</div>` : ''}
      </td>
      <td>
        <div style="font-size:12px;">${TIPI_SERVIZIO[o.tipo_servizio]||o.tipo_servizio}</div>
        <div style="font-size:11px;color:var(--muted);">${esc(o.nome_servizio||'')}</div>
      </td>
      <td>${o.sub_codice ? `<span class="badge badge-sede">${esc(o.sub_codice)}</span>` : '—'}</td>
      <td style="font-size:11px;color:var(--muted);">
        ${o.mese_riferimento ? MESI_NOMI[o.mese_riferimento] : '—'} ${o.anno_riferimento || ''}
        ${o.numero_fattura ? `<br><span style="font-size:10px;">n.${esc(o.numero_fattura)}</span>` : ''}
      </td>
      <td class="td-price">€ ${parseFloat(o.importo||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</td>
      <td>
        ${o.stato_pagamento === 'pagato'
          ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(16,185,129,.15);color:var(--green);">✅ Pagato</span><div style="font-size:10px;color:var(--muted);">${fmt(o.data_pagamento)}</div>`
          : o.stato_pagamento === 'parziale'
          ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(184,134,11,.15);color:var(--primary-dark);">⚠️ Parziale</span>`
          : `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(239,68,68,.15);color:var(--red);">⏳ Non pagato</span>`}
      </td>
      <td>
        ${o.flag_contabilizzato
          ? `<button class="btn btn-xs" style="background:rgba(16,185,129,.1);color:var(--green);" onclick="fattToggleContabilizza(${o.id})">✅ Sì</button>`
          : `<button class="btn btn-xs btn-danger" onclick="fattToggleContabilizza(${o.id})" title="Non contabilizzato — clicca per contabilizzare">🔴 No</button>`}
      </td>
      <td>
        <div style="display:flex;gap:4px;">
          ${isPending ? `<button class="btn btn-success btn-xs" onclick="fattPaga(${o.id})" title="Segna pagato">💳</button>` : ''}
          <button class="btn btn-edit btn-xs" onclick="openEditFatt(${o.id})" title="Modifica">✏️</button>
          <button class="btn btn-danger btn-xs" onclick="delFatt(${o.id})" title="Elimina">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderFattKpi(rows) {
  const el = document.getElementById('fatt-kpi');
  if (!el) return;
  const totale = rows.reduce((s, o) => s + parseFloat(o.importo || 0), 0);
  const pagato = rows.filter(o => o.stato_pagamento === 'pagato').reduce((s, o) => s + parseFloat(o.importo || 0), 0);
  const nonPagato = rows.filter(o => o.stato_pagamento !== 'pagato').reduce((s, o) => s + parseFloat(o.importo || 0), 0);
  const nonContab = rows.filter(o => !o.flag_contabilizzato).length;
  el.innerHTML = [
    { label: 'Totale ordini', val: rows.length, color: 'var(--info)' },
    { label: 'Totale importi', val: '€ ' + totale.toLocaleString('it-IT', {maximumFractionDigits: 0}), color: 'var(--accent)' },
    { label: 'Incassato', val: '€ ' + pagato.toLocaleString('it-IT', {maximumFractionDigits: 0}), color: 'var(--green)' },
    { label: 'Da incassare', val: '€ ' + nonPagato.toLocaleString('it-IT', {maximumFractionDigits: 0}), color: nonPagato > 0 ? 'var(--red)' : 'var(--muted)' },
    { label: 'Non contabilizzati', val: nonContab, color: nonContab > 0 ? 'var(--orange)' : 'var(--muted)' },
  ].map(k => `<div class="home-kpi-card"><div class="stat-label">${k.label}</div><div style="font-size:18px;font-weight:700;color:${k.color};font-family:monospace;">${k.val}</div></div>`).join('');
}

function renderNonContabilizzati(rows) {
  const nc = rows.filter(o => !o.flag_contabilizzato);
  const banner = document.getElementById('fatt-nc-banner');
  const list = document.getElementById('fatt-nc-list');
  if (!nc.length) { banner?.classList.add('hidden'); return; }
  banner?.classList.remove('hidden');
  list.innerHTML = nc.slice(0, 5).map(o =>
    `${esc(o.cliente_nome || '—')} — ${esc(o.nome_servizio || o.tipo_servizio)} — €${parseFloat(o.importo || 0).toLocaleString('it-IT', {maximumFractionDigits: 0})}`
  ).join(' · ') + (nc.length > 5 ? ` · e altri ${nc.length - 5}` : '');
}

function renderIstatAlert(rows) {
  const banner = document.getElementById('fatt-istat-banner');
  const list = document.getElementById('fatt-istat-list');
  if (!rows.length) { banner?.classList.add('hidden'); return; }
  banner?.classList.remove('hidden');
  list.innerHTML = rows.map(s => {
    const gg = parseInt(s.giorni_revisione);
    const label = isNaN(gg) || gg < 0 ? '🔴 Scaduto' : gg === 0 ? '🟡 Oggi' : `🟡 ${gg}gg`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(184,134,11,.06);border-radius:7px;">
      <span style="font-size:11px;font-weight:600;color:var(--accent);">${esc(s.codice)}</span>
      <span style="font-size:11px;color:var(--muted);">${esc(s.inquilino||'—')}</span>
      <span style="font-size:11px;color:var(--muted);">€ ${parseFloat(s.canone_annuo||0).toLocaleString('it-IT',{maximumFractionDigits:0})}/anno</span>
      <span style="font-size:10px;font-weight:700;color:${gg<0?'var(--red)':'var(--accent)'};">${label}</span>
      <button class="btn btn-xs" style="background:rgba(184,134,11,.15);color:var(--primary-dark);margin-left:auto;" onclick="openIstatCfg(${s.id})">⚙️ Configura</button>
    </div>`;
  }).join('');
}

function openModalFatt(obj = null) {
  document.getElementById('fatt-inq').innerHTML = '<option value="">— Seleziona —</option>' + DB.inquilini.map(i => `<option value="${i.id}">${i.ragione_sociale}</option>`).join('');
  document.getElementById('fatt-sub').innerHTML = '<option value="">— Nessuno —</option>' + DB.subs.map(s => `<option value="${s.id}">${s.codice}</option>`).join('');
  const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const now = new Date();
  if (obj) {
    document.getElementById('fatt-modal-title').textContent = '✏️ Modifica ordine';
    v('fatt-tipo', obj.tipo_servizio); v('fatt-nome', obj.nome_servizio);
    v('fatt-desc', obj.descrizione); v('fatt-inq', obj.inquilino_id);
    v('fatt-sub', obj.sub_id); v('fatt-stato', obj.stato);
    v('fatt-importo', obj.importo); v('fatt-period', obj.periodicita);
    v('fatt-dinizio', obj.data_inizio?.split('T')[0]); v('fatt-dfine', obj.data_fine?.split('T')[0]);
    v('fatt-mese', obj.mese_riferimento); v('fatt-anno', obj.anno_riferimento);
    v('fatt-nfatt', obj.numero_fattura); v('fatt-dfatt', obj.data_fatturazione?.split('T')[0]);
    v('fatt-statopag', obj.stato_pagamento); v('fatt-note', obj.note);
    document.getElementById('modal-fatt').__editId = obj.id;
  } else {
    document.getElementById('fatt-modal-title').textContent = '🧾 Nuovo Ordine / Servizio';
    ['fatt-tipo','fatt-nome','fatt-desc','fatt-inq','fatt-sub','fatt-importo','fatt-dinizio',
     'fatt-dfine','fatt-nfatt','fatt-note'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    v('fatt-stato', 'attivo'); v('fatt-period', 'mensile');
    v('fatt-statopag', 'non_pagato');
    v('fatt-mese', now.getMonth() + 1);
    v('fatt-anno', now.getFullYear());
    document.getElementById('modal-fatt').__editId = null;
  }
  document.getElementById('modal-fatt').classList.add('open');
}

async function saveFatt() {
  const v = id => document.getElementById(id)?.value || '';
  const editId = document.getElementById('modal-fatt').__editId;
  if (!v('fatt-inq') || !v('fatt-importo')) { toast('Cliente e importo obbligatori', 'error'); return; }
  const payload = {
    tipo_servizio: v('fatt-tipo'), nome_servizio: v('fatt-nome') || v('fatt-tipo'),
    descrizione: v('fatt-desc') || null, inquilino_id: parseInt(v('fatt-inq')) || null,
    sub_id: parseInt(v('fatt-sub')) || null, stato: v('fatt-stato'),
    importo: v('fatt-importo'), periodicita: v('fatt-period'),
    data_inizio: v('fatt-dinizio') || null, data_fine: v('fatt-dfine') || null,
    mese_riferimento: parseInt(v('fatt-mese')) || null, anno_riferimento: parseInt(v('fatt-anno')) || null,
    numero_fattura: v('fatt-nfatt') || null, data_fatturazione: v('fatt-dfatt') || null,
    stato_pagamento: v('fatt-statopag'), note: v('fatt-note') || null,
  };
  const r = editId
    ? await api('/api/fatturazione/' + editId, { method: 'PUT', body: JSON.stringify(payload) })
    : await api('/api/fatturazione', { method: 'POST', body: JSON.stringify(payload) });
  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  closeM('modal-fatt');
  loadFatturazione();
  toast(editId ? 'Ordine aggiornato ✓' : 'Ordine creato ✓');
}

async function openEditFatt(id) {
  const obj = _fattData.find(o => o.id == id);
  if (!obj) {
    const all = await api('/api/fatturazione');
    const found = (all||[]).find(o => o.id == id);
    if (found) openModalFatt(found);
    return;
  }
  openModalFatt(obj);
}

async function fattPaga(id) {
  const dp = new Date().toISOString().split('T')[0];
  await api('/api/fatturazione/' + id + '/paga', { method: 'POST', body: JSON.stringify({ data_pagamento: dp }) });
  loadFatturazione();
  toast('✅ Segnato come pagato');
}

async function fattToggleContabilizza(id) {
  await api('/api/fatturazione/' + id + '/contabilizza', { method: 'POST' });
  loadFatturazione();
}

async function delFatt(id) {
  if (!confirm('Eliminare questo ordine?')) return;
  await api('/api/fatturazione/' + id, { method: 'DELETE' });
  loadFatturazione();
  toast('Eliminato', 'error');
}

async function fattBulkPaga() {
  if (!_fattSel.size || !confirm(`Segnare ${_fattSel.size} ordini come pagati?`)) return;
  const dp = new Date().toISOString().split('T')[0];
  await Promise.all([..._fattSel].map(id => api('/api/fatturazione/' + id + '/paga', { method: 'POST', body: JSON.stringify({ data_pagamento: dp }) })));
  _fattSel.clear(); loadFatturazione(); toast(`✅ ${_fattSel.size || 'N'} ordini segnati pagati`);
}

async function fattBulkContabilizza() {
  await Promise.all([..._fattSel].map(id => api('/api/fatturazione/' + id + '/contabilizza', { method: 'POST' })));
  _fattSel.clear(); loadFatturazione(); toast('📋 Contabilizzati');
}

async function fattBulkElimina() {
  if (!confirm(`Eliminare ${_fattSel.size} ordini?`)) return;
  await Promise.all([..._fattSel].map(id => api('/api/fatturazione/' + id, { method: 'DELETE' })));
  _fattSel.clear(); loadFatturazione(); toast('Eliminati', 'error');
}

async function exportFatturazione() {
  const p = new URLSearchParams();
  const anno = document.getElementById('fatt-f-anno')?.value;
  const mese = document.getElementById('fatt-f-mese')?.value;
  if (anno) p.set('anno', anno);
  if (mese) p.set('mese', mese);
  const rows = await api('/api/fatturazione/export?' + p);
  if (!rows?.length) { toast('Nessun dato da esportare', 'error'); return; }

  // Get ISTAT alerts for highlighting
  const istatAlert = await api('/api/fatturazione/istat-alert') || [];
  const istatSubIds = new Set(istatAlert.map(s => s.codice));

  // Build Excel with xlsx.js (available via CDN)
  if (typeof XLSX === 'undefined') {
    // Fallback to CSV if XLSX not loaded
    exportCSV(rows, 'fatturazione_' + (anno||'') + '_' + (mese||''));
    return;
  }

  const wb = XLSX.utils.book_new();

  // Headers row
  const headers = ['Cliente','Servizio','Tipo','SUB','Importo €','Periodicità',
    'Mese','Anno','N° Fattura','Data Fatturazione','Stato Pagamento',
    'Data Pagamento','Contabilizzato','Note'];

  const wsData = [headers];
  const rowStyles = [null]; // first row = header, no special style

  rows.forEach(r => {
    wsData.push([
      r.cliente||'', r.servizio||'', r.tipo_servizio||'', r.sub||'',
      r.importo ? parseFloat(r.importo) : '', r.periodicita||'',
      r.mese||'', r.anno||'', r.numero_fattura||'', r.data_fatturazione||'',
      r.stato_pagamento||'', r.data_pagamento||'', r.contabilizzato||'NO', r.note||''
    ]);
    // Mark yellow if sub has ISTAT due
    rowStyles.push(istatSubIds.has(r.sub) ? 'istat' : null);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Apply yellow fill to ISTAT rows
  const istatFill = { fgColor: { rgb: 'FFF9C4' } }; // light yellow
  const istatFont = { bold: false };

  rowStyles.forEach((style, rowIdx) => {
    if (style === 'istat') {
      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
        if (!ws[cellAddr]) ws[cellAddr] = { v: '', t: 's' };
        ws[cellAddr].s = { fill: { patternType: 'solid', fgColor: { rgb: 'FFF3CD' } },
                           font: { bold: false } };
      }
    }
  });

  // Style header row
  for (let c = 0; c < headers.length; c++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[cellAddr]) ws[cellAddr] = { v: headers[c], t: 's' };
    ws[cellAddr].s = {
      fill: { patternType: 'solid', fgColor: { rgb: '1E3A5F' } },
      font: { bold: true, color: { rgb: 'FFFFFF' } }
    };
  }

  // Column widths
  ws['!cols'] = [
    {wch:28},{wch:24},{wch:16},{wch:10},{wch:12},{wch:12},
    {wch:6},{wch:6},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:24}
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Fatturazione');

  // Add ISTAT legend sheet
  if (istatAlert.length) {
    const legendData = [['SUB','Inquilino','Canone annuo','Prossima revisione ISTAT','Giorni']];
    istatAlert.forEach(s => legendData.push([
      s.codice, s.inquilino||'—',
      s.canone_annuo ? '€ '+parseFloat(s.canone_annuo).toFixed(2) : '—',
      s.istat_data_prossima_revisione || 'Non configurata',
      s.giorni_revisione !== null ? parseInt(s.giorni_revisione) : '—'
    ]));
    const wsLegend = XLSX.utils.aoa_to_sheet(legendData);
    wsLegend['!cols'] = [{wch:12},{wch:28},{wch:14},{wch:22},{wch:8}];
    XLSX.utils.book_append_sheet(wb, wsLegend, '⚠️ ISTAT Alert');
  }

  const filename = 'fatturazione_' + (anno||'tutto') + (mese ? '_mese'+mese : '') + '.xlsx';
  XLSX.writeFile(wb, filename);
  toast('✅ Excel scaricato: ' + filename + (istatAlert.length ? ' · ' + istatAlert.length + ' righe ISTAT evidenziate in giallo' : ''));
}

async function fattReimport(input) {
  const file = input.files[0]; if (!file) return;
  const statusEl = document.getElementById('fatt-reimport-status');
  statusEl.textContent = '⏳ Elaborazione…';
  const r = new FileReader();
  r.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const result = await api('/api/fatturazione/reimport', { method: 'POST', body: JSON.stringify({ rows }) });
      statusEl.textContent = `✅ ${result?.updated || 0} aggiornati${result?.errors?.length ? `, ${result.errors.length} errori` : ''}`;
      loadFatturazione();
    } catch (e) { statusEl.textContent = '❌ Errore: ' + e.message; }
  };
  r.readAsArrayBuffer(file);
  input.value = '';
}

function fattTipoChange() {
  const tipo = document.getElementById('fatt-tipo')?.value;
  const nomeEl = document.getElementById('fatt-nome');
  if (nomeEl && !nomeEl.value) {
    const defaults = { locazione_6_6: 'Canone di locazione', domiciliazione: 'Servizio domiciliazione',
      sala_riunioni: 'Sala riunioni', day_office: 'Day office', smart_office: 'Smart office',
      box_auto: 'Box auto', posto_auto: 'Posto auto', locazione_tetto: 'Locazione porzione tetto' };
    nomeEl.value = defaults[tipo] || '';
  }
}