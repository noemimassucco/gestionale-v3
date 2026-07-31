// =======================================================
// MODULE: manutenzioni.js
// =======================================================

async function loadMan(){
  if (_cache.manutenzioni) { const _e=document.getElementById("man-lbl"); if(_e)_e.textContent=_cache.manutenzioni.length+" manutenzioni"; }
  const p=new URLSearchParams();
  const v=id=>document.getElementById(id)?.value||'';
  if(v('mf-stato'))p.set('stato',v('mf-stato'));
  if(v('mf-prior'))p.set('priorita',v('mf-prior'));
  if(v('mf-sub'))p.set('sub_id',v('mf-sub'));
  if(v('mf-sede'))p.set('sede_id',v('mf-sede'));
  const data=await api('/api/manutenzioni?'+p);
  if (data) _cache.manutenzioni = data;
  if(!data)return;
  document.getElementById('man-lbl').textContent=`${data.length} manutenzioni`;
  const el=document.getElementById('man-list');
  if(!data.length){el.innerHTML='<div class="empty">Nessuna manutenzione. Aggiungi caldaie, ascensori, impianti…</div>';return;}
  el.innerHTML=data.map(m=>{
    const gg=parseInt(m.giorni_scadenza);
    const scadColor=(!isNaN(gg))?(gg<0?'var(--red)':gg<30?'var(--orange)':gg<90?'var(--accent)':'var(--green)'):'var(--muted)';
    return`<div class="int-card" style="border-left:3px solid ${PRIOR_COLORS[m.priorita]||'var(--border)'};">
      <div class="int-card-hdr">
        <span>${PRIOR_ICONS[m.priorita]||'⚪'}</span>
        <strong style="font-size:14px;color:#0f172a;">${esc(m.tipo)}</strong>
        ${m.sub_codice?`<span class="badge badge-sede">SUB ${esc(m.sub_codice)}</span>`:''}
        ${m.sede_nome?`<span style="font-size:12px;color:var(--muted);">${esc(m.sede_nome)}</span>`:''}
        <span style="background:${STATO_COLORS[m.stato]||'var(--muted)'};color:#0f172a;border-radius:5px;padding:2px 9px;font-size:10px;font-weight:600;">${m.stato?.replace('_',' ')||'—'}</span>
        ${m.costo?`<span class="td-price" style="margin-left:auto;">€ ${parseFloat(m.costo).toLocaleString('it-IT')}</span>`:''}
      </div>
      <div class="int-card-body">
        <div class="icf"><span>Programmata</span>${m.data_programmata?fmt(m.data_programmata):'—'}</div>
        <div class="icf"><span>Eseguita</span>${m.data_eseguita?fmt(m.data_eseguita):'—'}</div>
        <div class="icf"><span>Ricorrenza</span>${esc(m.ricorrenza||'Una tantum')}</div>
        <div class="icf"><span>Prossima</span><span style="color:${scadColor};font-weight:600;">${m.prossima_scadenza?fmt(m.prossima_scadenza)+(!isNaN(gg)?` (${gg}gg)`:''):'—'}</span></div>
      </div>
      ${m.descrizione?`<div style="margin-top:7px;font-size:12px;color:var(--muted);">${esc(m.descrizione.slice(0,100))}</div>`:''}
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-edit btn-sm" onclick="openEditMan(${m.id})">✏️</button><button class="btn btn-danger btn-sm" onclick="delMan(${m.id})">✕</button>
        ${m.stato==='programmata'?`<button class="btn btn-success btn-sm" onclick="completaMan(${m.id})">✓ Completata</button>`:''}
      </div>
    </div>`;
  }).join('');
  const scad=await api('/api/manutenzioni/scadenze');
  const urgent=(scad||[]).filter(s=>parseInt(s.giorni_scadenza)<=30);
  if(urgent.length){
    document.getElementById('man-scad-wrap').classList.remove('hidden');
    document.getElementById('man-scad-list').innerHTML=urgent.map(m=>`<div style="font-size:12px;padding:3px 0;display:flex;justify-content:space-between;border-bottom:1px solid rgba(239,68,68,.1);"><span>${PRIOR_ICONS[m.priorita]||''} <strong>${esc(m.tipo)}</strong>${m.sub_codice?' — SUB '+esc(m.sub_codice):''}</span><span style="color:${parseInt(m.giorni_scadenza)<0?'var(--red)':'var(--orange)'};">${fmt(m.prossima_scadenza)} (${m.giorni_scadenza}gg)</span></div>`).join('');
  }else document.getElementById('man-scad-wrap').classList.add('hidden');
}

function openModalMan(){
  if(typeof populateSedeSelect==="function") populateSedeSelect('man-sede');
  manEditId=null;
  document.getElementById('m-man-ttl').textContent='Nuova Manutenzione';
  document.getElementById('man-sub').innerHTML='<option value="">—</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
  document.getElementById('man-sede').innerHTML='<option value="">—</option>'+DB.sedi.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
  document.getElementById('man-forn').innerHTML='<option value="">—</option>'+DB.fornitori.map(f=>`<option value="${f.id}">${f.ragione_sociale}</option>`).join('');
  ['man-data-prog','man-data-eseg','man-desc','man-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('man-costo').value='';
  document.getElementById('modal-man').classList.add('open');
}

async function saveMan(){
  const editId=document.getElementById('modal-man').__editId;
  if(editId){
    const v=id=>document.getElementById(id)?.value||'';
    const r=await api('/api/manutenzioni/'+editId,{method:'PUT',body:JSON.stringify({sub_id:parseInt(v('man-sub'))||null,sede_id:parseInt(v('man-sede'))||null,fornitore_id:parseInt(v('man-forn'))||null,tipo:v('man-tipo'),descrizione:v('man-desc')||null,priorita:v('man-prior'),stato:v('man-stato'),data_programmata:v('man-data-prog')||null,costo:v('man-costo')||null,note:v('man-note')||null})});
    if(!r||r.error){toast('Errore: '+(r?.error||'?'),'error');return;}
    document.getElementById('modal-man').__editId=null;
    closeM('modal-man');loadMan();toast('Manutenzione aggiornata ✓');return;
  }
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('man-tipo')){toast('Seleziona il tipo','error');return;}
  const data={tipo:v('man-tipo'),priorita:v('man-prior'),stato:v('man-stato'),
    sub_id:parseInt(v('man-sub'))||null,sede_id:parseInt(v('man-sede'))||null,
    fornitore_id:parseInt(v('man-forn'))||null,
    data_programmata:v('man-data-prog')||null,data_eseguita:v('man-data-eseg')||null,
    ricorrenza:v('man-ric')||null,costo:v('man-costo')||null,
    descrizione:v('man-desc'),note:v('man-note')};
  const r=manEditId
    ? await api('/api/manutenzioni/'+manEditId,{method:'PUT',body:JSON.stringify(data)})
    : await api('/api/manutenzioni',{method:'POST',body:JSON.stringify(data)});
  if(!r||r.error){toast('Errore: '+(r?.error||'?'),'error');return;}
  closeM('modal-man');loadMan();toast('Manutenzione salvata ✓');
}

async function delMan(id){if(!await appConfirm('Eliminare?'))return;
  // Rimuovi subito dalla cache e rirender (UI istantanea)
  if (_cache.manutenzioni) {
    _cache.manutenzioni = _cache.manutenzioni.filter(x => Number(x.id) !== Number(id));
  }
  loadMan();await api('/api/manutenzioni/'+id,{method:'DELETE'});loadMan();toast('Eliminata','error');}

async function openEditMan(id){
  const allM=await api('/api/manutenzioni');
  const m=(allM||[]).find(x=>x.id==id);
  if(!m){toast('Manutenzione non trovata','error');return;}
  openModalMan();
  setTimeout(()=>{
    const sv=(elId,val)=>{const el=document.getElementById(elId);if(el)el.value=val||'';};
    sv('man-sub',m.sub_id||'');sv('man-sede',m.sede_id||'');sv('man-forn',m.fornitore_id||'');
    sv('man-tipo',m.tipo);sv('man-desc',m.descrizione||'');
    sv('man-prior',m.priorita||'normale');sv('man-stato',m.stato||'programmata');
    sv('man-data-prog',m.data_programmata?.split('T')[0]||'');
    sv('man-costo',m.costo||'');sv('man-note',m.note||'');
    document.getElementById('m-man-ttl').textContent='✏️ Modifica Manutenzione';
    document.getElementById('modal-man').__editId=id;
  },100);
}