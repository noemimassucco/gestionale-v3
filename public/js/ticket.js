// =======================================================
// MODULE: ticket.js
// =======================================================

async function loadTicket(){
  if (_cache.ticket) { const _e=document.getElementById("tick-lbl"); if(_e)_e.textContent=_cache.ticket.length+" ticket"; }
  const p=new URLSearchParams();
  const v=id=>document.getElementById(id)?.value||'';
  if(v('tf-stato'))p.set('stato',v('tf-stato'));
  if(v('tf-prior'))p.set('priorita',v('tf-prior'));
  if(v('tf-sub'))p.set('sub_id',v('tf-sub'));
  const data=await api('/api/ticket?'+p);
  if (data) _cache.ticket = data;if(!data)return;
  document.getElementById('tick-lbl').textContent=`${data.length} ticket`;
  const el=document.getElementById('tick-list');
  if(!data.length){el.innerHTML='<div class="empty">Nessun ticket aperto.</div>';return;}
  el.innerHTML=data.map(t=>`
    <div class="tick-card ${t.stato||'aperto'}" data-id="${t.id}">
      <div class="int-card-hdr">
        <input type="checkbox" class="sel-check ticket-chk" data-id="${t.id}" onchange="genToggle('ticket',${t.id},this)" onclick="event.stopPropagation()" style="display:none;">
        ${PRIOR_ICONS2[t.priorita]||'⚪'} <strong style="font-size:13px;color:#0f172a;">${esc(t.titolo)}</strong>
        ${t.sub_codice?`<span class="badge badge-sede">SUB ${esc(t.sub_codice)}</span>`:''}
        ${t.sede_nome?`<span style="font-size:11px;color:var(--muted);">${esc(t.sede_nome)}</span>`:''}
        <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${t.stato==='chiuso'?'rgba(16,185,129,.2)':t.stato==='in_corso'?'rgba(184,134,11,.2)':'rgba(107,142,107,.2)'};color:${t.stato==='chiuso'?'var(--green)':t.stato==='in_corso'?'var(--accent)':'var(--accent)'};">${t.stato?.replace('_',' ')||'—'}</span>
        <button class="btn btn-edit btn-xs" onclick="openEditTicket({t.id})" style="flex-shrink:0;">✏️</button><button class="btn btn-danger btn-sm" style="margin-left:auto;" onclick="delTicket(${t.id})">✕</button>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">
        ${t.inquilino_nome?`👤 ${esc(t.inquilino_nome)} · `:''}${fmt(t.created_at)}${t.autore?' · '+esc(t.autore):''}
        ${t.assegnato_nome?` · Assegnato a ${esc(t.assegnato_nome)}`:''}
      </div>
      ${t.descrizione?`<div style="font-size:12px;color:var(--muted);margin-top:4px;">${esc(t.descrizione.slice(0,100))}</div>`:''}
      ${t.stato!=='chiuso'?`<div style="margin-top:8px;display:flex;gap:6px;">
        ${t.stato==='aperto'?`<button class="btn btn-gray btn-sm" onclick="updateTicketStato(${t.id},'in_corso')">▶ In corso</button>`:''}
        <button class="btn btn-success btn-sm" onclick="updateTicketStato(${t.id},'chiuso')">✓ Chiudi</button>
      </div>`:''}`+'</div>').join('');
}

function openModalTicket(subId=null){
  if(typeof populateSedeSelect==="function") populateSedeSelect('tick-sede');
  document.getElementById('tick-sub').innerHTML='<option value="">— Nessuno —</option>'+DB.subs.map(s=>`<option value="${s.id}"${s.id==subId?' selected':''}>${s.codice}</option>`).join('');
  document.getElementById('tick-inq').innerHTML='<option value="">— Nessuno —</option>'+DB.inquilini.map(i=>`<option value="${i.id}">${i.ragione_sociale}</option>`).join('');
  ['tick-titolo','tick-desc','tick-cat','tick-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('tick-prior').value='normale';
  document.getElementById('modal-ticket').classList.add('open');
}

async function saveTicket(){
  const editId=document.getElementById('modal-ticket').__editId;
  if(editId){
    const v=id=>document.getElementById(id)?.value||'';
    await api('/api/ticket/'+editId,{method:'PUT',body:JSON.stringify({titolo:v('tick-titolo'),descrizione:v('tick-desc')||null,categoria:v('tick-cat')||null,priorita:v('tick-prior'),stato:'aperto',note:v('tick-note')||null})});
    document.getElementById('modal-ticket').__editId=null;
    closeM('modal-ticket');loadTicket();toast('Ticket aggiornato ✓');return;
  }
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('tick-titolo')){toast('Titolo obbligatorio','error');return;}
  await api('/api/ticket',{method:'POST',body:JSON.stringify({
    sub_id:parseInt(v('tick-sub'))||null,inquilino_id:parseInt(v('tick-inq'))||null,
    titolo:v('tick-titolo'),descrizione:v('tick-desc'),categoria:v('tick-cat'),
    priorita:v('tick-prior'),note:v('tick-note')
  })});
  closeM('modal-ticket');loadTicket();toast('Ticket creato ✓');
}

async function delTicket(id){if(!confirm('Eliminare?'))return;
  // Rimuovi subito dalla cache e rirender (UI istantanea)
  if (_cache.ticket) {
    _cache.ticket = _cache.ticket.filter(x => Number(x.id) !== Number(id));
  }
  loadTicket();await api('/api/ticket/'+id,{method:'DELETE'});loadTicket();toast('Eliminato','error');}

function openEditTicket(id){
  // Find ticket and open edit modal with pre-filled data
  api('/api/ticket').then(all=>{
    const t=(all||[]).find(x=>x.id==id);
    if(!t){toast('Ticket non trovato','error');return;}
    openModalTicket(t.sub_id);
    setTimeout(()=>{
      const sv=(el,v)=>{const e=document.getElementById(el);if(e)e.value=v||'';};
      sv('tick-sub',t.sub_id);sv('tick-inq',t.inquilino_id||'');sv('tick-titolo',t.titolo);
      sv('tick-desc',t.descrizione||'');sv('tick-cat',t.categoria||'');sv('tick-prior',t.priorita||'normale');
      sv('tick-note',t.note||'');
      document.getElementById('modal-ticket').__editId=id;
      document.querySelector('#modal-ticket .modal-title').textContent='✏️ Modifica Ticket';
    },100);
  });
}