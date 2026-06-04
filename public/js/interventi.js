// =======================================================
// MODULE: interventi.js
// =======================================================

// TODO: saveDet, closeDet, openEditInt, fillIntForm

async function loadInt(){
  if (_cache.interventi) { const _e=document.getElementById("int-lbl"); if(_e)_e.textContent=_cache.interventi.length+" interventi"; }
  const p=new URLSearchParams();
  const v=id=>document.getElementById(id)?.value||'';
  if(v('ff-sede'))p.set('sede_id',v('ff-sede'));
  if(v('ff-sub'))p.set('sub_id',v('ff-sub'));
  if(v('ff-forn'))p.set('fornitore_id',v('ff-forn'));
  if(v('ff-cat'))p.set('categoria_id',v('ff-cat'));
  if(v('ff-anno'))p.set('anno',v('ff-anno'));
  if(v('ff-da'))p.set('data_da',v('ff-da'));
  if(v('ff-a'))p.set('data_a',v('ff-a'));
  if(v('ff-min'))p.set('importo_min',v('ff-min'));
  if(v('ff-max'))p.set('importo_max',v('ff-max'));
  const items=await api('/api/interventi?'+p);
  if (items) _cache.interventi = items;
  if(!items)return;
  const tot=items.reduce((s,x)=>s+(parseFloat(x.prezzo)||0),0);
  document.getElementById('int-lbl').textContent=`${items.length} interventi — Totale: € ${tot.toLocaleString('it-IT',{minimumFractionDigits:2})}`;
  const el=document.getElementById('int-list');
  if(!items.length){el.innerHTML='<div class="empty">Nessun intervento trovato.</div>';return;}
  el.innerHTML=items.map(inv=>renderCard(inv)).join('');
}

function renderCard(inv){
  const tags=(inv.tags||[]).map(t=>`<span class="badge badge-tag">${esc(t)}</span>`).join(' ');
  return`<div class="int-card ${selIds.has(inv.id)?'selected':''}" data-id="${inv.id}" onclick="handleCard(event,${inv.id})">
    <input type="checkbox" class="int-chk" style="display:${selMode?'block':'none'}" ${selIds.has(inv.id)?'checked':''} onclick="event.stopPropagation();toggleSel2(${inv.id})">
    <div class="int-card-hdr">
      <strong style="font-size:14px;color:#0f172a;">SUB ${esc(inv.sub_codice||'N/D')}</strong>
      ${inv.sub_ex?`<span class="ex-sub">${esc(inv.sub_ex)}</span>`:''}
      <span class="badge badge-sede">${esc(inv.sede_nome||'')}</span>
      ${inv.categoria_icona?`<span style="font-size:13px;">${inv.categoria_icona}</span>`:''}
      <span style="font-size:12px;color:var(--muted);">${esc(inv.fornitore_nome||'—')}</span>
      ${inv.ha_notifica?`<span class="badge badge-warn">⚠️</span>`:''}
      ${parseInt(inv.num_allegati)>0?`<span style="font-size:11px;color:var(--muted);">📎${inv.num_allegati}</span>`:''}
      <span class="td-price" style="margin-left:auto;">${inv.prezzo?'€ '+parseFloat(inv.prezzo).toLocaleString('it-IT',{minimumFractionDigits:2}):'—'}</span>
    </div>
    <div class="int-card-body">
      <div class="icf"><span>Protocollo</span>${esc(inv.protocollo||'—')}</div>
      <div class="icf"><span>N° Fattura</span><span style="font-family:monospace;color:#93c5fd;">${esc(inv.num_fattura||'—')}</span></div>
      <div class="icf"><span>Data intervento</span>${inv.data_intervento?fmt(inv.data_intervento):'—'}</div>
      <div class="icf"><span>Anno fattura</span>${inv.anno_fattura||'—'}</div>
    </div>
    <div style="margin-top:8px;font-size:12px;color:#cbd5e1;">${esc((inv.descrizione||'').slice(0,120))}${(inv.descrizione||'').length>120?'…':''}</div>
    ${tags?`<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:3px;">${tags}</div>`:''}
    <div style="margin-top:6px;font-size:10px;color:var(--muted);">Inserito: ${esc(inv.created_by_nome||'—')}${inv.updated_by_nome&&inv.updated_by_nome!==inv.created_by_nome?` · Modificato: ${esc(inv.updated_by_nome)}`:''}</div>
  </div>`;
}

function handleCard(e,id){if(selMode){toggleSel2(id);return;}if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON')return;openDet(id);}

function resetF(){['ff-sede','ff-sub','ff-forn','ff-cat'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});['ff-anno','ff-da','ff-a','ff-min','ff-max'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});loadInt();}

async function openDet(id){
  const inv=await api('/api/interventi/'+id);
  if(!inv)return;
  const tags=(inv.tags||[]).map(t=>`<span class="badge badge-tag">${esc(t)}</span>`).join(' ');
  const simHtml=(inv.interventi_simili||[]).length?`<div class="simili-box"><h4>⚠️ Problema già successo in questo SUB:</h4>${(inv.interventi_simili||[]).map(s=>`<div style="font-size:11px;padding:5px 0;border-bottom:1px solid rgba(184,134,11,.1);">📅 ${s.data_intervento?fmt(s.data_intervento):'?'} — ${esc((s.descrizione||'').slice(0,80))}${s.prezzo?` <strong class="text-gold">€ ${parseFloat(s.prezzo).toLocaleString('it-IT')}</strong>`:''}</div>`).join('')}</div>`:''
  const allHtml=(inv.allegati||[]).length?`<div style="margin-top:12px;"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;">Allegati</div>${(inv.allegati||[]).map(a=>`<div class="all-item"><div class="all-icon">${a.tipo==='foto'?'📷':a.tipo==='fattura'?'🧾':'📄'}</div><span class="all-nome">${esc(a.nome)}</span><span class="all-dim">${a.dimensione?Math.round(a.dimensione/1024)+' KB':''}</span><a href="${a.url}" target="_blank" style="font-size:11px;color:var(--accent);">Apri</a><button class="btn btn-danger" onclick="delAll(${a.id},${inv.id})">✕</button></div>`).join('')}</div>`:''
  document.getElementById('det-body').innerHTML=`
    <div class="modal-title">
      <span style="font-size:20px;">${inv.categoria_icona||'📋'}</span>
      <span>SUB ${esc(inv.sub_codice||'N/D')}</span>
      ${inv.sub_ex?`<span class="ex-sub">${esc(inv.sub_ex)}</span>`:''}
      <span class="badge badge-sede">${esc(inv.sede_nome||'')}</span>
      ${inv.ha_notifica?`<span class="badge badge-warn">⚠️</span>`:''}
    </div>
    <div class="det-grid">
      <div>
        <div class="det-f"><label>Fornitore</label><div class="det-bold">${esc(inv.fornitore_nome||'—')}</div>${inv.fornitore_tel?`<div style="font-size:11px;color:var(--muted);">📞 ${esc(inv.fornitore_tel)}</div>`:''}</div>
        <div class="det-f"><label>Inquilino</label><div class="det-val">${esc(inv.inquilino_nome||'—')}</div></div>
        <div class="det-f"><label>Categoria</label><div class="det-val">${inv.categoria_icona||''} ${esc(inv.categoria_nome||'—')}</div></div>
        <div class="det-f"><label>N° Protocollo</label><div class="td-mono">${esc(inv.protocollo||'—')}</div></div>
        <div class="det-f"><label>N° Fattura</label><div class="td-mono">${esc(inv.num_fattura||'—')}</div></div>
        <div class="det-f"><label>Anno fattura</label><div class="det-val">${inv.anno_fattura||'—'}</div></div>
      </div>
      <div>
        <div class="det-f"><label>Importo</label><div class="det-price">${inv.prezzo?'€ '+parseFloat(inv.prezzo).toLocaleString('it-IT',{minimumFractionDigits:2}):'—'}</div></div>
        <div class="det-f"><label>Data intervento</label><div class="det-val">${inv.data_intervento?fmt(inv.data_intervento):'—'}</div></div>
        <div class="det-f"><label>Data fattura</label><div class="det-val">${inv.data_fattura?fmt(inv.data_fattura):'—'}</div></div>
        <div class="det-f"><label>Inserito da</label><div style="font-size:12px;color:var(--muted);">${esc(inv.created_by_nome||'—')}</div></div>
        ${inv.updated_by_nome?`<div class="det-f"><label>Ultima modifica</label><div style="font-size:12px;color:var(--muted);">${esc(inv.updated_by_nome)}</div></div>`:''}
      </div>
    </div>
    <div class="det-f" style="margin-top:6px;"><label>Descrizione</label><div style="font-size:13px;color:var(--text);line-height:1.6;">${esc(inv.descrizione||'—')}</div></div>
    ${inv.note?`<div class="det-f"><label>Note</label><div style="font-size:12px;color:var(--muted);">${esc(inv.note)}</div></div>`:''}
    ${tags?`<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:3px;">${tags}</div>`:''}
    ${simHtml}
    ${allHtml}
    <div style="margin-top:14px;">
      <div class="upload-zone" onclick="document.getElementById('upf-${inv.id}').click()">📎 Aggiungi allegato (foto, PDF, fattura…)</div>
      <input type="file" id="upf-${inv.id}" multiple style="display:none" onchange="upAll(this,${inv.id})">
    </div>
    <div class="modal-footer">
      <button class="btn btn-gray" onclick="closeM('modal-det')">Chiudi</button>
      <button class="btn btn-edit" onclick="closeM('modal-det');editInt(${inv.id})">✏️ Modifica</button>
      <button class="btn btn-danger" onclick="if(confirm('Eliminare?')){delInt(${inv.id});closeM('modal-det');}">🗑 Elimina</button>
    </div>`;
  document.getElementById('modal-det').classList.add('open');
}

function openModalInt(){
  editId=null;
  document.getElementById('m-int-ttl').textContent='Nuovo Intervento';
  document.getElementById('m-int-ico').textContent='📝';
  popF();
  ['fi-sede','fi-sub','fi-inq','fi-forn','fi-cat'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['fi-prot','fi-nf','fi-anno','fi-di','fi-df','fi-pr','fi-desc','fi-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('modal-int').classList.add('open');
}

function filterSubBySede() {
  const sedeId = document.getElementById('fi-sede')?.value || '';
  const sel    = document.getElementById('fi-sub');
  if (!sel) return;
  const filtered = sedeId
    ? (DB.subs || []).filter(s => String(s.sede_id) === String(sedeId))
    : (DB.subs || []);
  const cur = sel.value;
  sel.innerHTML = '<option value="">— SUB —</option>' +
    filtered.map(s =>
      '<option value="' + s.id + '"' + (String(s.id) === String(cur) ? ' selected' : '') + '>' +
      esc(s.codice || s.id) + (s.sede_nome ? ' — ' + esc(s.sede_nome) : '') +
      '</option>'
    ).join('');
}

async function saveInt(){
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('fi-sede')||!v('fi-sub')||!v('fi-forn')||!v('fi-prot')||!v('fi-desc')){toast('Campi obbligatori mancanti (*)','error');return;}
  const data=getIntData();
  if(!data.prezzo){pending=data;closeM('modal-int');document.getElementById('pr-quick').value='';document.getElementById('modal-pr').classList.add('open');setTimeout(()=>document.getElementById('pr-quick').focus(),150);return;}
  await checkDup(data);
}

async function delInt(id){if(!confirm('Eliminare?'))return;
  // Rimuovi subito dalla cache e rirender (UI istantanea)
  if (_cache.interventi) {
    _cache.interventi = _cache.interventi.filter(x => Number(x.id) !== Number(id));
  }
  loadInt();await api('/api/interventi/'+id,{method:'DELETE'});loadInt();toast('Eliminato','error');}

function editInt(id){
  api('/api/interventi/'+id).then(inv=>{
    if(!inv)return;
    editId=id;
    document.getElementById('m-int-ttl').textContent='Modifica Intervento';
    document.getElementById('m-int-ico').textContent='✏️';
    popF();
    document.getElementById('fi-sede').value=inv.sede_id||'';
    filterSubBySede();
    document.getElementById('fi-sub').value=inv.sub_id||'';
    document.getElementById('fi-inq').value=inv.inquilino_id||'';
    document.getElementById('fi-forn').value=inv.fornitore_id||'';
    document.getElementById('fi-cat').value=inv.categoria_id||'';
    document.getElementById('fi-prot').value=inv.protocollo||'';
    document.getElementById('fi-nf').value=inv.num_fattura||'';
    document.getElementById('fi-anno').value=inv.anno_fattura||'';
    document.getElementById('fi-di').value=inv.data_intervento?String(inv.data_intervento).split('T')[0]:'';
    document.getElementById('fi-df').value=inv.data_fattura?String(inv.data_fattura).split('T')[0]:'';
    document.getElementById('fi-pr').value=inv.prezzo||'';
    document.getElementById('fi-desc').value=inv.descrizione||'';
    document.getElementById('fi-note').value=inv.note||'';
    document.getElementById('modal-int').classList.add('open');
  });
}

function popF(){
  const v=id=>document.getElementById(id)?.value||'';
  const sedeId=v('fi-sede');
  const subs=sedeId?DB.subs.filter(s=>s.sede_id==sedeId):DB.subs;
  document.getElementById('fi-sede').innerHTML='<option value="">— Sede —</option>'+DB.sedi.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
  document.getElementById('fi-sub').innerHTML='<option value="">— SUB —</option>'+subs.map(s=>`<option value="${s.id}">${s.codice}${s.ex_sub?' (ex '+s.ex_sub+')':''}</option>`).join('');
  document.getElementById('fi-inq').innerHTML='<option value="">— Nessuno —</option>'+DB.inquilini.map(i=>`<option value="${i.id}">${i.ragione_sociale}</option>`).join('');
  document.getElementById('fi-forn').innerHTML='<option value="">— Fornitore —</option>'+DB.fornitori.map(f=>`<option value="${f.id}">${f.ragione_sociale}</option>`).join('');
  document.getElementById('fi-cat').innerHTML='<option value="">— Categoria —</option>'+DB.categorie.map(c=>`<option value="${c.id}">${c.icona} ${c.nome}</option>`).join('');
}

function toggleSel(){selMode=!selMode;selIds.clear();document.getElementById('mass-bar').classList.toggle('hidden',!selMode);document.getElementById('sel-btn').style.background=selMode?'rgba(107,142,107,.2)':'';loadInt();}

function toggleSel2(id){id=parseInt(id);if(selIds.has(id)){selIds.delete(id);getSelSet('interventi').delete(id);}else{selIds.add(id);getSelSet('interventi').add(id);}document.getElementById('mass-cnt').textContent=`${selIds.size} selezionati`;document.querySelectorAll('.int-card[data-id=+id+]').forEach(el=>{el.classList.toggle('selected',selIds.has(id));const chk=el.querySelector('input[type=checkbox]');if(chk)chk.checked=selIds.has(id);});}

function selAll(){document.querySelectorAll('.int-card[data-id]').forEach(el=>{const id=parseInt(el.getAttribute('data-id'));if(id)selIds.add(id);el.classList.add('selected');const chk=el.querySelector('input[type=checkbox]');if(chk)chk.checked=true;});document.getElementById('mass-cnt').textContent=`${selIds.size} selezionati`;}

function deselAll(){selIds.clear();document.getElementById('mass-cnt').textContent='0 selezionati';loadInt();}

async function deleteMass(){
  if(!selIds.size){toast('Nessun intervento selezionato','error');return;}
  if(!confirm('Eliminare ' + selIds.size + ' interventi? Non può essere annullato.'))return;
  const ids=[...selIds].map(Number);
  const r=await api('/api/bulk-delete',{method:'POST',body:JSON.stringify({table:'interventi',ids})});
  if(r?.error){toast('Errore: '+r.error,'error');return;}
  selIds.clear();
  toggleSel();
  await loadInt();
  toast((r?.deleted||ids.length)+' interventi eliminati');
}

function getIntData(){const v=id=>document.getElementById(id)?.value||'';const anno=v('fi-anno')||(v('fi-df')?v('fi-df').split('-')[0]:null);return{sede_id:parseInt(v('fi-sede'))||null,sub_id:parseInt(v('fi-sub'))||null,inquilino_id:parseInt(v('fi-inq'))||null,fornitore_id:parseInt(v('fi-forn'))||null,categoria_id:parseInt(v('fi-cat'))||null,protocollo:v('fi-prot'),num_fattura:v('fi-nf'),anno_fattura:anno?parseInt(anno):null,data_intervento:v('fi-di')||null,data_fattura:v('fi-df')||null,prezzo:v('fi-pr')||null,descrizione:v('fi-desc'),note:v('fi-note')};}