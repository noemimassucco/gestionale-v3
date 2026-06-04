// =======================================================
// MODULE: documenti.js
// =======================================================

// TODO: openEditDoc

async function loadDocs(){
  if (_cache.documenti) { const _e=document.getElementById("doc-lbl"); if(_e)_e.textContent=_cache.documenti.length+" documenti"; }
  const p=new URLSearchParams();
  const v=id=>document.getElementById(id)?.value||'';
  if(v('df-tipo'))p.set('tipo',v('df-tipo'));
  if(v('df-sub'))p.set('sub_id',v('df-sub'));
  if(v('df-sede'))p.set('sede_id',v('df-sede'));
  if(v('df-search'))p.set('search',v('df-search'));
  const docs=await api('/api/documenti?'+p);
  if (docs) _cache.documenti = docs;
  if(!docs)return;
  document.getElementById('docs-lbl').textContent=`${docs.length} documenti trovati`;
  const el=document.getElementById('docs-list');
  if(!docs.length){el.innerHTML='<div class="empty">Nessun documento. Carica fatture, contratti, preventivi e altro.</div>';return;}
  el.innerHTML=docs.map(d=>{
    const icon=DOC_ICONS[d.tipo]||'📂';
    const scadGiorni=d.scadenza?Math.floor((new Date(d.scadenza)-new Date())/(1000*60*60*24)):null;
    const scadHtml=scadGiorni!==null?`<span class="doc-scad" style="background:${scadGiorni<30?'rgba(239,68,68,.2)':scadGiorni<90?'rgba(184,134,11,.2)':'rgba(16,185,129,.2)'};color:${scadGiorni<30?'#f87171':scadGiorni<90?'#fcd34d':'#6ee7b7'};">${scadGiorni===0?'Scade oggi':scadGiorni<0?`Scaduto ${-scadGiorni}gg fa`:`${scadGiorni}gg`}</span>`:'';
    return`<div class="doc-card"><div class="doc-icon">${icon}</div><div class="doc-info"><div class="doc-name">${esc(d.nome)}</div><div class="doc-meta">${d.sub_codice?'SUB '+esc(d.sub_codice)+' · ':''}${d.sede_nome?esc(d.sede_nome)+' · ':''}${d.fornitore_nome?esc(d.fornitore_nome)+' · ':''}${d.data_documento?fmt(d.data_documento):''}${d.importo?' · <strong style="color:var(--accent);">€ '+parseFloat(d.importo).toLocaleString('it-IT')+'</strong>':''}</div>${d.descrizione?`<div style="font-size:11px;color:var(--muted);margin-top:2px;">${esc(d.descrizione.slice(0,80))}</div>`:''}</div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">${scadHtml}${d.url?`<a href="${d.url}" target="_blank" class="btn btn-edit btn-sm">👁 Apri</a>`:''}<button class="btn btn-edit btn-xs" onclick="openAnaById('documento',{d.id})" style="flex-shrink:0;">✏️</button><button class="btn btn-danger btn-sm" onclick="delDoc(${d.id})">✕</button></div></div>`;
  }).join('');
  loadScadenze();
}

async function loadScadenze(){
  const sc=await api('/api/documenti/scadenze');
  if(!sc?.length){document.getElementById('scadenze-banner').classList.add('hidden');return;}
  const prossime=sc.filter(d=>parseInt(d.giorni_scadenza)<=60);
  if(!prossime.length){document.getElementById('scadenze-banner').classList.add('hidden');return;}
  document.getElementById('scadenze-banner').classList.remove('hidden');
  document.getElementById('scadenze-list').innerHTML=prossime.map(d=>`<div style="font-size:12px;padding:3px 0;display:flex;justify-content:space-between;"><span>${DOC_ICONS[d.tipo]||'📄'} <strong>${esc(d.nome.slice(0,40))}</strong>${d.sub_codice?' — SUB '+esc(d.sub_codice):''}</span><span style="color:${parseInt(d.giorni_scadenza)<7?'var(--red)':'var(--accent)'};">${fmt(d.scadenza)} (${d.giorni_scadenza}gg)</span></div>`).join('');
}

function openModalDoc(){
  docFileInput=null;
  document.getElementById('m-doc-ttl').textContent='Nuovo Documento';
  document.getElementById('doc-tipo').value='fattura';
  ['doc-nome','doc-data','doc-scad','doc-imp','doc-desc'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('doc-sub').innerHTML='<option value="">— Nessuno —</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
  document.getElementById('doc-sede').innerHTML='<option value="">— Nessuna —</option>'+DB.sedi.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
  document.getElementById('doc-forn').innerHTML='<option value="">— Nessuno —</option>'+DB.fornitori.map(f=>`<option value="${f.id}">${f.ragione_sociale}</option>`).join('');
  document.getElementById('doc-file-zone').textContent='📎 Clicca per allegare file (PDF, immagine, Word…)';
  document.getElementById('doc-file').value='';
  document.getElementById('modal-doc').classList.add('open');
}

async function saveDoc(){
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('doc-nome')){toast('Inserisci il nome del documento','error');return;}
  const fd=new FormData();
  fd.append('tipo',v('doc-tipo'));fd.append('nome',v('doc-nome'));
  if(v('doc-sub'))fd.append('sub_id',v('doc-sub'));
  if(v('doc-sede'))fd.append('sede_id',v('doc-sede'));
  if(v('doc-forn'))fd.append('fornitore_id',v('doc-forn'));
  if(v('doc-data'))fd.append('data_documento',v('doc-data'));
  if(v('doc-scad'))fd.append('scadenza',v('doc-scad'));
  if(v('doc-imp'))fd.append('importo',v('doc-imp'));
  if(v('doc-desc'))fd.append('descrizione',v('doc-desc'));
  if(docFileInput)fd.append('file',docFileInput);
  toast('Salvataggio…','warning');
  const r=await apiUp('/api/documenti',fd);
  if(r?.error){toast('Errore: '+r.error,'error');return;}
  closeM('modal-doc');loadDocs();toast('Documento salvato ✓');
}

async function delDoc(id){if(!confirm('Eliminare documento?'))return;
  // Rimuovi subito dalla cache e rirender (UI istantanea)
  if (_cache.documenti) {
    _cache.documenti = _cache.documenti.filter(x => Number(x.id) !== Number(id));
  }
  loadDocs();await api('/api/documenti/'+id,{method:'DELETE'});loadDocs();toast('Eliminato','error');}