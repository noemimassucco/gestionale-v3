// =======================================================
// MODULE: controllo-fatturazione.js
// Ogni uscita (bolletta/intervento/manutenzione/documento) entra qui automaticamente:
// decidi se e come va rifatturata, senza che nulla si perda per strada.
// =======================================================

let _cfEditId = null;
let _cfCache = [];

async function loadControlloFatt(){
  const p = new URLSearchParams();
  const v = id => document.getElementById(id)?.value || '';
  if (v('cf-f-rifatt')) p.set('rifatturabile', v('cf-f-rifatt'));
  if (v('cf-f-stato')) p.set('stato_decisione', v('cf-f-stato'));
  if (v('cf-f-origine')) p.set('origine_tipo', v('cf-f-origine'));
  if (v('cf-f-search')) p.set('search', v('cf-f-search'));

  const [data, riep] = await Promise.all([
    api('/api/controllo-fatturazione?' + p),
    api('/api/controllo-fatturazione/riepilogo'),
  ]);
  if (data) _cfCache = data;
  _cfRenderRiepilogo(riep);
  _cfRenderList(data || []);
}

function _cfRenderRiepilogo(r){
  const el = document.getElementById('cf-riepilogo');
  if (!el || !r) return;
  const chips = [];
  if (r.da_decidere) chips.push({label: r.da_decidere + ' da decidere', color: 'warning'});
  if (r.senza_attribuzione) chips.push({label: r.senza_attribuzione + ' rifatturabili senza attribuzione', color: 'danger'});
  if (r.senza_protocollo) chips.push({label: r.senza_protocollo + ' senza protocollo', color: 'muted'});
  if (r.possibili_duplicati?.length) chips.push({label: r.possibili_duplicati.length + ' possibili duplicati', color: 'danger'});
  if (r.sospese) chips.push({label: r.sospese + ' sospese', color: 'warning'});
  if (r.importo_non_attribuito) chips.push({label: '€ ' + r.importo_non_attribuito.toLocaleString('it-IT',{minimumFractionDigits:2}) + ' non attribuiti', color: 'danger'});

  if (!chips.length) {
    el.innerHTML = `<div class="card" style="background:var(--success-bg);border-color:var(--success);"><div style="font-size:12.5px;color:var(--success);">✅ Tutto in ordine su ${r.totale_uscite} uscite registrate. Nessuna verifica in sospeso.</div></div>`;
    return;
  }
  const colorMap = { warning:'var(--warning)', danger:'var(--danger)', muted:'var(--muted)' };
  const bgMap = { warning:'var(--warning-bg)', danger:'var(--danger-bg)', muted:'var(--bg2)' };
  el.innerHTML = `<div class="card">
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;">⚠️ Da verificare prima di esportare <span style="font-weight:400;color:var(--muted);">— non blocca l'esportazione, ti aiuta solo a non dimenticare nulla</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${chips.map(c=>`<span class="pill-stato" style="background:${bgMap[c.color]};color:${colorMap[c.color]};">${c.label}</span>`).join('')}
    </div>
    ${r.possibili_duplicati?.length ? `<div style="margin-top:10px;font-size:11.5px;color:var(--muted);">Possibili duplicati: ${r.possibili_duplicati.map(d=>esc(d.fornitore_nome)+' € '+parseFloat(d.importo).toFixed(2)+' ('+fmt(d.data_documento)+')').join(' · ')}</div>` : ''}
  </div>`;
}

const CF_ORIGINE_LABEL = { bolletta:'⚡ Bolletta', intervento:'🛠️ Intervento', manutenzione:'🔨 Manutenzione', documento:'📄 Documento' };
const CF_STATO_LABEL = { da_decidere:'Da decidere', da_fatturare:'Da fatturare', fatturata:'Fatturata', sospesa:'Sospesa', non_rifatturabile:'Non rifatturabile' };
const CF_STATO_COLOR = { da_decidere:'var(--muted)', da_fatturare:'var(--warning)', fatturata:'var(--success)', sospesa:'var(--orange)', non_rifatturabile:'var(--muted-2)' };

function _cfRenderList(data){
  const el = document.getElementById('cf-list');
  if (!el) return;
  if (!data.length) { el.innerHTML = '<div class="empty">Nessuna uscita trovata con questi filtri.</div>'; return; }
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Origine</th><th>Data</th><th>Fornitore</th><th>Descrizione</th><th>Importo</th><th>Rifatturabile</th><th>Attribuita a</th><th>Stato</th><th></th></tr></thead>
    <tbody>
    ${data.map(r=>`<tr class="row-click" onclick="cfApriDecisione(${r.id})">
      <td style="font-size:12px;">${CF_ORIGINE_LABEL[r.origine_tipo]||r.origine_tipo}</td>
      <td style="font-size:12px;">${r.data_documento?fmt(r.data_documento):'—'}</td>
      <td style="font-size:12px;">${esc(r.fornitore_nome||'—')}</td>
      <td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.descrizione||'—')}${r.sub_codice?' · SUB '+esc(r.sub_codice):''}</td>
      <td class="td-price">€ ${parseFloat(r.importo||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</td>
      <td style="font-size:12px;">${r.rifatturabile==='si'?'✅ Sì'+(r.modalita?' ('+r.modalita+')':''):r.rifatturabile==='no'?'❌ No':'❓ Da decidere'}</td>
      <td style="font-size:12px;">${esc(r.attribuito_a_nome||'—')}</td>
      <td><span class="pill-stato" style="background:${CF_STATO_COLOR[r.stato_decisione]||'var(--bg2)'}22;color:${CF_STATO_COLOR[r.stato_decisione]||'var(--muted)'};">${CF_STATO_LABEL[r.stato_decisione]||r.stato_decisione}</span></td>
      <td onclick="event.stopPropagation()"><button class="btn btn-xs btn-gray" onclick="cfApriDecisione(${r.id})">✏️</button></td>
    </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function cfApriDecisione(id){
  const r = _cfCache.find(x => x.id === id);
  if (!r) return;
  _cfEditId = id;
  document.getElementById('cf-modal-info').innerHTML =
    `${CF_ORIGINE_LABEL[r.origine_tipo]||r.origine_tipo} · <strong>${esc(r.fornitore_nome||'—')}</strong> · € ${parseFloat(r.importo||0).toLocaleString('it-IT',{minimumFractionDigits:2})}
     ${r.data_documento?' · '+fmt(r.data_documento):''} ${r.sub_codice?' · SUB '+esc(r.sub_codice):''}${r.sede_nome?' · '+esc(r.sede_nome):''}
     <br>${esc(r.descrizione||'')}`;
  const sv = (id,val) => { const e = document.getElementById(id); if (e) e.value = val || ''; };
  sv('cf-rifatturabile', r.rifatturabile || 'da_decidere');
  sv('cf-modalita', r.modalita);
  sv('cf-quota', r.quota_rifatturabile);
  sv('cf-attrib-tipo', r.attribuito_a_tipo);
  sv('cf-criterio', r.criterio_riparto);
  sv('cf-stato', r.stato_decisione || 'da_decidere');
  sv('cf-note', r.note);
  cfToggleCampi();
  cfToggleAttrib();
  sv('cf-attrib-id', r.attribuito_a_id);
  sv('cf-attrib-testo', r.attribuito_a_testo);
  document.getElementById('modal-cf').classList.add('open');
}

function cfToggleCampi(){
  const rif = document.getElementById('cf-rifatturabile')?.value;
  const show = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none'; };
  const isSi = rif === 'si';
  show('cf-campo-modalita', isSi);
  show('cf-campo-quota', isSi);
  show('cf-campo-attrib-tipo', isSi);
  show('cf-campo-criterio', isSi);
  if (!isSi) { show('cf-campo-attrib-select', false); show('cf-campo-attrib-testo', false); }
  else cfToggleAttrib();
}

function cfToggleAttrib(){
  const tipo = document.getElementById('cf-attrib-tipo')?.value;
  const selWrap = document.getElementById('cf-campo-attrib-select');
  const testoWrap = document.getElementById('cf-campo-attrib-testo');
  if (!selWrap || !testoWrap) return;
  if (tipo === 'cliente' || tipo === 'sub' || tipo === 'condominio') {
    selWrap.style.display = ''; testoWrap.style.display = 'none';
    const sel = document.getElementById('cf-attrib-id');
    const opts = tipo === 'cliente' ? (DB.inquilini||[]).map(x=>({id:x.id,label:x.ragione_sociale}))
      : tipo === 'sub' ? (DB.subs||[]).map(x=>({id:x.id,label:x.codice}))
      : (DB.sedi||[]).map(x=>({id:x.id,label:x.nome}));
    sel.innerHTML = '<option value="">—</option>' + opts.map(o=>`<option value="${o.id}">${esc(o.label)}</option>`).join('');
  } else if (tipo === 'commessa' || tipo === 'centro_costo') {
    selWrap.style.display = 'none'; testoWrap.style.display = '';
  } else {
    selWrap.style.display = 'none'; testoWrap.style.display = 'none';
  }
}

async function cfSalvaDecisione(){
  if (!_cfEditId) return;
  const v = id => document.getElementById(id)?.value || '';
  const tipo = v('cf-attrib-tipo');
  const body = {
    rifatturabile: v('cf-rifatturabile'),
    modalita: v('cf-rifatturabile')==='si' ? (v('cf-modalita')||null) : null,
    quota_rifatturabile: v('cf-rifatturabile')==='si' && v('cf-modalita')==='parziale' ? (v('cf-quota')||null) : null,
    attribuito_a_tipo: v('cf-rifatturabile')==='si' ? (tipo||null) : null,
    attribuito_a_id: (tipo==='cliente'||tipo==='sub'||tipo==='condominio') ? (parseInt(v('cf-attrib-id'))||null) : null,
    attribuito_a_testo: (tipo==='commessa'||tipo==='centro_costo') ? (v('cf-attrib-testo')||null) : null,
    criterio_riparto: v('cf-rifatturabile')==='si' ? (v('cf-criterio')||null) : null,
    stato_decisione: v('cf-stato'),
    note: v('cf-note')||null,
  };
  const r = await api('/api/controllo-fatturazione/' + _cfEditId, { method:'PUT', body: JSON.stringify(body) });
  if (!r || r.error) { toast('Errore: ' + (r?.error||'salvataggio fallito'), 'error'); return; }
  closeM('modal-cf');
  toast('🔄 Decisione salvata ✓');
  loadControlloFatt();
}

// ═══ Export per la contabilità ═══
async function cfExport(){
  const rows = await api('/api/controllo-fatturazione/export');
  if (!rows?.length) { toast('Nessuna uscita da esportare', 'error'); return; }

  if (typeof XLSX === 'undefined') {
    // Fallback CSV se la libreria Excel non è disponibile (es. rete assente)
    const csvRows = rows.map(r => ({
      id: r.id, data_documento: r.data_documento ? String(r.data_documento).slice(0,10) : '',
      protocollo: r.protocollo || '', fornitore: r.fornitore_nome || '',
      attribuzione: r.attribuito_a_nome || r.sub_codice || r.sede_nome || '',
      descrizione: r.descrizione || '', importo: r.importo || '',
      quota_da_rifatturare: r.rifatturabile==='si' ? (r.modalita==='parziale' ? r.quota_rifatturabile : r.importo) : '',
      criterio_riparto: r.criterio_riparto || '', stato_fatturazione: '', note: r.note || '',
    }));
    exportCSV(csvRows, 'controllo_fatturazione');
    return;
  }

  const wb = XLSX.utils.book_new();
  const headers = ['ID','Data documento','N° Protocollo','Fornitore','Cliente/SUB/Condominio','Descrizione',
    'Importo €','Quota da rifatturare €','Criterio di ripartizione','Stato fatturazione (a cura contabile)','Note / anomalie'];
  const wsData = [headers];
  rows.forEach(r => {
    const attribuzione = r.attribuito_a_nome || r.sub_codice || r.sede_nome || '—';
    const quota = r.rifatturabile==='si' ? (r.modalita==='parziale' ? r.quota_rifatturabile : r.importo) : '';
    wsData.push([
      r.id, r.data_documento ? String(r.data_documento).slice(0,10) : '',
      r.protocollo || '', r.fornitore_nome || '', attribuzione, r.descrizione || '',
      parseFloat(r.importo||0), quota || '', r.criterio_riparto || '', '', r.note || '',
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:6},{wch:13},{wch:14},{wch:24},{wch:22},{wch:30},{wch:12},{wch:14},{wch:16},{wch:20},{wch:30}];
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r:0, c });
    if (!ws[addr]) ws[addr] = { v: headers[c], t:'s' };
    ws[addr].s = { fill:{patternType:'solid',fgColor:{rgb:'1E3A5F'}}, font:{bold:true,color:{rgb:'FFFFFF'}} };
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Controllo Fatturazione');
  const filename = 'controllo_fatturazione_' + new Date().toISOString().slice(0,10) + '.xlsx';
  XLSX.writeFile(wb, filename);
  toast('✅ Excel esportato: ' + filename + ' — la colonna "Stato fatturazione" la completa la contabile');
}

async function cfReimport(input){
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval:'' });
      const rows = raw.map(x => ({
        id: x.ID || x.id,
        protocollo: x['N° Protocollo'] || x.protocollo || '',
        stato_decisione: _cfMapStatoImport(x['Stato fatturazione (a cura contabile)'] || x.stato_decisione || ''),
        note_contabili: x['Note / anomalie'] || '',
      })).filter(x => x.id);
      const result = await api('/api/controllo-fatturazione/reimport', { method:'POST', body: JSON.stringify({ rows }) });
      toast(`✅ ${result?.updated||0} righe aggiornate dal file della contabile` + (result?.errors?.length?` · ${result.errors.length} errori`:''));
      loadControlloFatt();
    } catch(err) { toast('❌ Errore lettura file: ' + err.message, 'error'); }
  };
  r.readAsArrayBuffer(file);
  input.value = '';
}

function _cfMapStatoImport(txt){
  const t = String(txt).toLowerCase().trim();
  if (!t) return '';
  if (t.includes('fatturat')) return 'fatturata';
  if (t.includes('sospes')) return 'sospesa';
  if (t.includes('non rifattur')) return 'non_rifatturabile';
  if (t.includes('da fattur')) return 'da_fatturare';
  return '';
}
