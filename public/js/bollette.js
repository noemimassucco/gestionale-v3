// =======================================================
// MODULE: bollette.js
// =======================================================

async function loadBollette(){
  if (_cache.bollette) { const _e=document.getElementById("boll-lbl"); if(_e)_e.textContent=_cache.bollette.length+" bollette"; }
  const p=new URLSearchParams();
  const v=id=>document.getElementById(id)?.value||'';
  if(v('bf-tipo'))p.set('tipo',v('bf-tipo'));
  if(v('bf-stato'))p.set('stato',v('bf-stato'));
  if(v('bf-sub'))p.set('sub_id',v('bf-sub'));
  const data=await api('/api/bollette?'+p);
  if (data) _cache.bollette = data;if(!data)return;
  document.getElementById('boll-lbl').textContent=`${data.length} bollette`;
  const el=document.getElementById('boll-list');
  if(!data.length){el.innerHTML='<div class="empty">Nessuna bolletta.</div>';return;}
  const urgenti=data.filter(b=>b.stato==='da_pagare'&&b.giorni_scadenza!==null&&parseInt(b.giorni_scadenza)<=30);
  if(urgenti.length){
    document.getElementById('boll-scad-banner').classList.remove('hidden');
    document.getElementById('boll-scad-list').innerHTML=urgenti.map(b=>`<div style="font-size:12px;padding:3px 0;display:flex;justify-content:space-between;"><span>${BOLL_ICONS[b.tipo]||'📄'} <strong>${esc(b.tipo)}</strong>${b.fornitore_nome?' - '+esc(b.fornitore_nome):''}${b.sub_codice?' · SUB '+esc(b.sub_codice):''}</span><span style="color:var(--red);">${fmt(b.scadenza)} (${b.giorni_scadenza}gg)</span></div>`).join('');
  } else document.getElementById('boll-scad-banner').classList.add('hidden');
  el.innerHTML=data.map(b=>{
    const gg=parseInt(b.giorni_scadenza);
    const scadColor=b.stato==='pagato'?'var(--green)':(!isNaN(gg)&&gg<0?'var(--red)':!isNaN(gg)&&gg<30?'var(--orange)':'var(--muted)');
    const statoLabel={da_pagare:'Da pagare',pagato:'Pagato',scaduto:'Scaduto'}[b.stato]||b.stato;
    return`<div class="boll-card">
      <div class="boll-icon">${BOLL_ICONS[b.tipo]||'📄'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#fff;">${esc(b.tipo.charAt(0).toUpperCase()+b.tipo.slice(1))} ${b.fornitore_nome?'— '+esc(b.fornitore_nome):''}</div>
        <div class="doc-meta">${b.sub_codice?'SUB '+esc(b.sub_codice)+' · ':''}${b.sede_nome?esc(b.sede_nome)+' · ':''}${b.periodo_dal?fmt(b.periodo_dal)+' → '+fmt(b.periodo_al):''}${b.numero?' · n.'+esc(b.numero):''}</div>
        ${b.note?`<div style="font-size:11px;color:var(--muted);margin-top:2px;">${esc(b.note.slice(0,60))}</div>`:''}
      </div>
      <div style="text-align:right;flex-shrink:0;">
        ${b.importo?`<div class="td-price" style="font-size:14px;">€ ${parseFloat(b.importo).toLocaleString('it-IT',{minimumFractionDigits:2})}</div>`:''}
        <div style="font-size:10px;color:${scadColor};font-weight:600;margin-top:2px;">${b.scadenza?fmt(b.scadenza):''}</div>
        <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${b.stato==='pagato'?'rgba(16,185,129,.15)':'rgba(239,68,68,.15)'};color:${b.stato==='pagato'?'var(--green)':'var(--red)'};">${statoLabel}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-left:8px;">
        ${b.url?`<a href="${b.url}" target="_blank" class="btn btn-edit btn-sm">👁</a>`:''}
        ${b.stato==='da_pagare'?`<button class="btn btn-success btn-sm" onclick="pagaBolletta(${b.id})">✓ Paga</button>`:''}
        <button class="btn btn-edit btn-xs" onclick="openEditBolletta({b.id})" style="flex-shrink:0;">✏️</button><button class="btn btn-danger btn-sm" onclick="delBolletta(${b.id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

function openModalBoll(subId=null){
  document.getElementById('boll-sub').innerHTML='<option value="">— Nessuno —</option>'+DB.subs.map(s=>`<option value="${s.id}"${subId==s.id?' selected':''}>${s.codice}</option>`).join('');
  document.getElementById('modal-boll').classList.add('open');
}

async function saveBolletta(){
  const editId=document.getElementById('modal-boll').__editId;
  if(editId){
    const v=id=>document.getElementById(id)?.value||'';
    const r=await api('/api/bollette/'+editId,{method:'PUT',body:JSON.stringify({tipo:v('boll-tipo'),fornitore_nome:v('boll-forn')||null,numero:v('boll-num')||null,importo:v('boll-imp')||null,periodo_dal:v('boll-pdal')||null,periodo_al:v('boll-pal')||null,scadenza:v('boll-scad')||null,data_pagamento:v('boll-dpag')||null,stato:v('boll-stato'),note:v('boll-note')||null})});
    document.getElementById('modal-boll').__editId=null;
    closeM('modal-boll');loadBollette();toast('Bolletta aggiornata ✓');return;
  }
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('boll-tipo')){toast('Tipo obbligatorio','error');return;}
  const fd=new FormData();
  const fields={sub_id:'boll-sub',tipo:'boll-tipo',fornitore_nome:'boll-forn',numero:'boll-num',importo:'boll-imp',periodo_dal:'boll-pdal',periodo_al:'boll-pal',scadenza:'boll-scad',data_pagamento:'boll-dpag',stato:'boll-stato',note:'boll-note'};
  Object.entries(fields).forEach(([k,id])=>{const val=v(id);if(val)fd.append(k,val);});
  const f=document.getElementById('boll-file');if(f?.files[0])fd.append('file',f.files[0]);
  const r=await apiUp('/api/bollette',fd);
  if(r?.error){toast('Errore: '+r.error,'error');return;}
  closeM('modal-boll');loadBollette();toast('Bolletta salvata ✓');
}

async function delBolletta(id){if(!confirm('Eliminare?'))return;
  // Rimuovi subito dalla cache e rirender (UI istantanea)
  if (_cache.bollette) {
    _cache.bollette = _cache.bollette.filter(x => Number(x.id) !== Number(id));
  }
  loadBollette();await api('/api/bollette/'+id,{method:'DELETE'});loadBollette();toast('Eliminata','error');}

async function openEditBolletta(id){
  const allB=await api('/api/bollette');
  const b=(allB||[]).find(x=>x.id==id);
  if(!b){toast('Bolletta non trovata','error');return;}
  openModalBoll(b.sub_id);
  setTimeout(()=>{
    const sv=(elId,val)=>{const el=document.getElementById(elId);if(el)el.value=val||'';};
    sv('boll-sub',b.sub_id);sv('boll-tipo',b.tipo);sv('boll-forn',b.fornitore_nome||'');
    sv('boll-num',b.numero||'');sv('boll-imp',b.importo||'');
    sv('boll-pdal',b.periodo_dal?.split('T')[0]||'');sv('boll-pal',b.periodo_al?.split('T')[0]||'');
    sv('boll-scad',b.scadenza?.split('T')[0]||'');sv('boll-dpag',b.data_pagamento?.split('T')[0]||'');
    sv('boll-stato',b.stato||'da_pagare');sv('boll-note',b.note||'');
    document.getElementById('modal-boll').__editId=id;
  },100);
}