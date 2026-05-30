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
    return `<tr style="${rowBg}cursor:pointer;" ondblclick="openEditFatt(${o.id})">
      <td><input type="checkbox" class="sel-check fatt-chk" data-id="${o.id}" onchange="fattChkChange(${o.id},this)"></td>
      <td>
        <div style="font-size:13px;font-weight:600;color:#fff;">${esc(o.cliente_nome||'—')}</div>
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
          ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(245,158,11,.15);color:var(--gold2);">⚠️ Parziale</span>`
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
    { label: 'Totale ordini', val: rows.length, color: 'var(--teal2)' },
    { label: 'Totale importi', val: '€ ' + totale.toLocaleString('it-IT', {maximumFractionDigits: 0}), color: 'var(--gold)' },
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
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(245,158,11,.06);border-radius:7px;">
      <span style="font-size:11px;font-weight:600;color:var(--gold);">${esc(s.codice)}</span>
      <span style="font-size:11px;color:var(--muted);">${esc(s.inquilino||'—')}</span>
      <span style="font-size:11px;color:var(--muted);">€ ${parseFloat(s.canone_annuo||0).toLocaleString('it-IT',{maximumFractionDigits:0})}/anno</span>
      <span style="font-size:10px;font-weight:700;color:${gg<0?'var(--red)':'var(--gold)'};">${label}</span>
      <button class="btn btn-xs" style="background:rgba(245,158,11,.15);color:var(--gold2);margin-left:auto;" onclick="openIstatCfg(${s.id})">⚙️ Configura</button>
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
  if (editId) {
    await api('/api/fatturazione/' + editId, { method: 'PUT', body: JSON.stringify(payload) });
    toast('Ordine aggiornato ✓');
  } else {
    await api('/api/fatturazione', { method: 'POST', body: JSON.stringify(payload) });
    toast('Ordine creato ✓');
  }
  closeM('modal-fatt');
  loadFatturazione();
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
  // Build CSV (XLSX not available server-side without dependency)
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(';'), ...rows.map(r => headers.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(';'))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `fatturazione_${anno||'tutto'}_${mese||'tutti'}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('✅ Export scaricato');
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