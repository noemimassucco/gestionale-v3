// =======================================================
// MODULE: data.js
// =======================================================

async function loadDD(){
  const [sedi,subs,forn,inq,cat]=await Promise.all([api('/api/sedi'),api('/api/subs'),api('/api/fornitori'),api('/api/inquilini'),api('/api/categorie')]);
  if(!sedi)return;
  DB={sedi,subs,fornitori:forn,inquilini:inq,categorie:cat};
  const setEl=(id,html)=>{const el=document.getElementById(id);if(el)el.innerHTML=html;};
  const opt=(arr,lbl)=>`<option value="">${lbl}</option>`+arr.map(x=>`<option value="${x.id}">${x.nome||x.ragione_sociale||x.codice}</option>`).join('');
  setEl('ff-sede',opt(sedi,'Tutte le sedi'));
  setEl('ff-sub','<option value="">Tutti i SUB</option>'+subs.map(s=>`<option value="${s.id}">${s.codice}${s.ex_sub?' (ex '+s.ex_sub+')':''}</option>`).join(''));
  setEl('ff-forn','<option value="">Tutti i fornitori</option>'+forn.map(f=>`<option value="${f.id}">${f.ragione_sociale}</option>`).join(''));
  setEl('ff-cat','<option value="">Tutte</option>'+cat.map(c=>`<option value="${c.id}">${c.icona} ${c.nome}</option>`).join(''));
  renderTbSubs();renderTbForn();renderTbInq();renderTbSedi();renderTbCat();
}

function renderTbSubs() {
  const tb = document.getElementById('tb-subs');
  if (!DB.subs.length) { tb.innerHTML = '<tr><td colspan="10" class="empty">Nessun SUB. Aggiungili da "+ Nuovo SUB".</td></tr>'; return; }
  tb.innerHTML = DB.subs.map(s => {
    const sede = DB.sedi.find(sd => sd.id == s.sede_id);
    const sal = parseInt(s.manutenzioni_aperte)>0?'🟡':s.stato_occupazione==='libero'?'⚪':'🟢';
    const spese = s.totale_spese ? '€ ' + parseFloat(s.totale_spese).toLocaleString('it-IT', {maximumFractionDigits:0}) : '—';
    const mqTot = s.mq_commerciali ? parseFloat(s.mq_commerciali).toFixed(0) + ' mq' : (s.mq_calpestabili ? parseFloat(s.mq_calpestabili).toFixed(0) + ' mq' : '—');
    const statoOcc = s.stato_occupazione ? `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:${s.stato_occupazione==='occupato'?'rgba(16,185,129,.15)':'rgba(100,116,139,.15)'};color:${s.stato_occupazione==='occupato'?'var(--green)':'var(--muted)'};">${esc(s.stato_occupazione)}</span>` : '<span class="td-muted">—</span>';
    const chk = subSelMode ? `<td><input type="checkbox" class="sel-check" ${subSelIds.has(s.id)?'checked':''} onclick="event.stopPropagation();subToggle(${s.id},this)"></td>` : '<td></td>';
    return `<tr class="sub-row-click" onclick="openSubDetail(${s.id})">
      ${chk}
      <td style="font-size:15px;text-align:center;">${sal}</td>
      <td><strong style="color:#fff;font-size:13px;">${esc(s.codice)}</strong>${s.ex_sub?`<br><span class="ex-sub" style="font-size:9px;">${esc(s.ex_sub)}</span>`:''}</td>
      <td><span class="badge badge-sede">${esc(sede?.nome||'—')}</span>${s.piano?`<br><span style="font-size:10px;color:var(--muted);">P. ${esc(s.piano)}</span>`:''}</td>
      <td>${statoOcc}</td>
      <td style="font-size:12px;">${esc(s.inquilino_nome||'—')}</td>
      <td style="font-size:12px;color:var(--muted);">${mqTot}</td>
      <td style="text-align:center;font-size:12px;">${s.num_interventi||0}</td>
      <td class="td-price" style="font-size:12px;">${spese}</td>
      <td onclick="event.stopPropagation();">
        <button class="ctx-btn" title="Azioni rapide" onclick="showSubCtx(event,${s.id},'${esc(s.codice||'')}')">⋮</button>
      </td>
    </tr>`;
  }).join('');
  const tb2=document.getElementById('tb-subs-ana');
  if(tb2) tb2.innerHTML=document.getElementById('tb-subs')?.innerHTML||'';
}

function renderTbForn(){
  const rows=DB.fornitori.length?DB.fornitori.map(f=>`<tr><td><input type="checkbox" class="sel-check" onchange="genToggle('fornitori',${f.id},this)"></td><td class="td-bold">${esc(f.ragione_sociale)}</td><td class="td-mono" style="font-size:11px;">${esc(f.piva||f.cf||'—')}</td><td>${esc(f.citta||'—')}</td><td>${esc(f.tel||'—')}</td><td style="font-size:11px;">${esc(f.spec||'—')}</td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit btn-sm" onclick="openAnaById('fornitore',${f.id})">✏️</button><button class="btn btn-danger btn-sm" onclick="delAna('fornitori',${f.id})">✕</button></div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nessun fornitore</td></tr>';
  ['tb-forn','tb-fornitori'].forEach(tid=>{const tb=document.getElementById(tid);if(tb)tb.innerHTML=rows;});
}

function renderTbInq(){
  const rows=DB.inquilini.length?DB.inquilini.map(i=>{const sub=DB.subs.find(s=>s.inquilino_id==i.id);return`<tr><td><input type="checkbox" class="sel-check" onchange="genToggle('inquilini',${i.id},this)"></td><td class="td-bold">${esc(i.ragione_sociale)}</td><td class="td-mono" style="font-size:11px;">${esc(i.piva||i.cf||'—')}</td><td>${esc(i.citta||'—')}</td><td>${esc(i.tel||'—')}</td><td style="font-size:11px;">${esc(i.email||'—')}</td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit btn-sm" onclick="openAnaById('inquilino',${i.id})">✏️</button><button class="btn btn-danger btn-sm" onclick="delAna('inquilini',${i.id})">✕</button></div></td></tr>`;}).join(''):'<tr><td colspan="7" class="empty">Nessun inquilino</td></tr>';
  ['tb-inq','tb-inquilini'].forEach(tid=>{const tb=document.getElementById(tid);if(tb)tb.innerHTML=rows;});
}

function renderTbSedi(){const tb=document.getElementById('tb-sedi');if(!DB.sedi.length){tb.innerHTML='<tr><td colspan="5" class="empty">Nessuna sede</td></tr>';return;}tb.innerHTML=DB.sedi.map(s=>`<tr><td class="td-bold">${esc(s.nome)}</td><td>${esc(s.indirizzo||'—')}</td><td>${esc(s.citta||'—')}</td><td class="td-muted">${esc(s.note||'—')}</td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit" onclick="openAnaById('sede',${s.id})">✏️</button><button class="btn btn-danger" onclick="delAna('sedi',${s.id})">✕</button></div></td></tr>`).join('');}

function renderTbCat(){const tb=document.getElementById('tb-cat');if(!DB.categorie.length){tb.innerHTML='<tr><td colspan="4" class="empty">—</td></tr>';return;}tb.innerHTML=DB.categorie.map(c=>`<tr><td style="font-size:18px;">${c.icona||''}</td><td class="td-bold">${esc(c.nome)}</td><td><span style="background:${c.colore};border-radius:4px;padding:2px 9px;font-size:10px;color:#fff;">${c.colore}</span></td><td><div style="display:flex;gap:4px;"><button class="btn btn-edit" onclick="openAnaById('categoria',${c.id})">✏️</button><button class="btn btn-danger" onclick="delAna('categorie',${c.id})">✕</button></div></td></tr>`).join('');}

function renderTbByType(t) { if(t==="fornitori")renderTbForn(); else if(t==="inquilini")renderTbInq(); }

function subToggle(id,chk) { if(chk.checked)subSelIds.add(id);else subSelIds.delete(id); document.getElementById('sub-mass-cnt').textContent=`${subSelIds.size} selezionati`; }

function toggleSubSel() {
  subSelMode = !subSelMode; subSelIds.clear();
  document.getElementById('sub-mass-bar').classList.toggle('hidden', !subSelMode);
  document.getElementById('sub-sel-btn').style.background = subSelMode ? 'rgba(37,99,235,.2)' : '';
  renderTbSubs();
}

function genToggle(type, id, chk) {
  const set = getSelSet(type);
  if (chk.checked) set.add(Number(id)); else set.delete(Number(id));
  const cnt = document.getElementById(type + '-mass-cnt');
  if (cnt) cnt.textContent = `${set.size} selezionati`;
  const bar = document.getElementById(type + '-mass-bar');
  if (bar) bar.classList.toggle('hidden', set.size === 0);
}

function getSelSet(type) {
  if (!genSelIds[type]) genSelIds[type] = new Set();
  return genSelIds[type];
}

async function bulkDelete(table, cntId, reloadFn) {
  const ids = table === 'subs'
    ? Array.from(subSelIds)
    : Array.from(getSelSet(table));
  if (!ids.length) { toast('Nessun elemento selezionato — usa le checkbox', 'error'); return; }
  if (!confirm(`Eliminare ${ids.length} ${table}?\nQuesta operazione NON può essere annullata.`)) return;
  if (ids.length > 1 && !confirm(`⚠️ CONFERMA FINALE: elimini davvero ${ids.length} ${table}?`)) return;

  const r = await api('/api/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ table, ids: ids.map(Number) })
  });

  if (r?.error) {
    toast('❌ Errore: ' + r.error, 'error');
    return;
  }

  // Reset selection
  if (table === 'subs') {
    subSelIds.clear(); subSelMode = false;
    document.getElementById('sub-mass-bar')?.classList.add('hidden');
  } else {
    getSelSet(table).clear();
    document.querySelectorAll('.' + table + '-chk').forEach(el => { el.checked = false; el.style.display = 'none'; });
    const bar = document.getElementById(table + '-mass-bar');
    if (bar) bar.classList.add('hidden');
    const cnt = document.getElementById(cntId);
    if (cnt) cnt.textContent = '0 selezionati';
  }

  // Reload correctly
  if (typeof reloadFn === 'function') await reloadFn();
  else await loadDD();

  toast(`✅ ${r?.deleted || ids.length} ${table} eliminati`);
}

function toggleGenSel(type) {
  const bar = document.getElementById(type + '-mass-bar');
  const active = !bar?.classList.contains('hidden');
  if (active) { getSelSet(type).clear(); bar?.classList.add('hidden'); }
  else { bar?.classList.remove('hidden'); }
}

function genSelAll(type) {
  const arr = type === 'fornitori' ? DB.fornitori : type === 'inquilini' ? DB.inquilini : [];
  arr.forEach(x => getSelSet(type).add(Number(x.id)));
  document.querySelectorAll(`[onchange*="genToggle('${type}'"]`).forEach(c => c.checked = true);
  const cnt = document.getElementById(type + '-mass-cnt');
  if (cnt) cnt.textContent = `${getSelSet(type).size} selezionati`;
}

function genDeselAll(type) {
  getSelSet(type).clear();
  document.querySelectorAll(`[onchange*="genToggle('${type}'"]`).forEach(c => c.checked = false);
  const cnt = document.getElementById(type + '-mass-cnt');
  if (cnt) cnt.textContent = '0 selezionati';
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