// =======================================================
// MODULE: documenti.js
// =======================================================

// TODO: openEditDoc

let _docStatoFiltro='tutti';

function setDocStatoFiltro(f){_docStatoFiltro=f;loadDocs();}

function _docStato(d){
  if(!d.scadenza)return{k:'validi',chip:'<span style="background:var(--bg2);color:var(--muted);border-radius:10px;padding:2px 10px;font-size:10px;font-weight:700;">—</span>'};
  const gg=Math.floor((new Date(d.scadenza)-new Date())/86400000);
  if(gg<0)return{k:'scaduti',chip:'<span style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger);border-radius:10px;padding:2px 10px;font-size:10px;font-weight:700;">Scaduto</span>'};
  if(gg<=30)return{k:'in_scadenza',chip:'<span style="background:var(--warning-bg);color:var(--warning);border:1px solid var(--warning);border-radius:10px;padding:2px 10px;font-size:10px;font-weight:700;">In scadenza · '+gg+'g</span>'};
  return{k:'validi',chip:'<span style="background:var(--success-bg);color:var(--success);border:1px solid var(--success);border-radius:10px;padding:2px 10px;font-size:10px;font-weight:700;">Valido</span>'};
}

async function loadDocs(){
  const p=new URLSearchParams();
  const v=id=>document.getElementById(id)?.value||'';
  if(v('df-tipo'))p.set('tipo',v('df-tipo'));
  if(v('df-sub'))p.set('sub_id',v('df-sub'));
  if(v('df-sede'))p.set('sede_id',v('df-sede'));
  if(v('df-search'))p.set('search',v('df-search'));
  const docs=await api('/api/documenti?'+p);
  if (docs) _cache.documenti = docs;
  if(!docs)return;

  // Chips di stato (come il mockup: Tutti · Validi · In scadenza · Scaduti)
  const conta={tutti:docs.length,validi:0,in_scadenza:0,scaduti:0};
  docs.forEach(d=>{conta[_docStato(d).k]++;});
  const chips=document.getElementById('doc-chips');
  if(chips)chips.innerHTML=[['tutti','Tutti'],['validi','Validi'],['in_scadenza','In scadenza'],['scaduti','Scaduti']].map(([k,l])=>
    `<button onclick="setDocStatoFiltro('${k}')" style="border:1px solid ${_docStatoFiltro===k?'var(--primary)':'var(--border-2)'};background:${_docStatoFiltro===k?'var(--primary)':'var(--card)'};color:${_docStatoFiltro===k?'#fff':'var(--muted)'};border-radius:16px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">${l} <span style="opacity:.7;">${conta[k]}</span></button>`
  ).join('');

  const filtered=_docStatoFiltro==='tutti'?docs:docs.filter(d=>_docStato(d).k===_docStatoFiltro);
  document.getElementById('docs-lbl').textContent=`${filtered.length} documenti`;
  const el=document.getElementById('docs-list');
  if(!filtered.length){el.innerHTML='<div class="empty">Nessun documento qui. Trascina un file nella card 🤖 di Import, o usa + Nuovo Documento.</div>';return;}

  // Tabella stile mockup
  el.innerHTML=`<div class="card" style="padding:0;overflow:hidden;"><div class="table-wrap"><table>
    <thead><tr><th style="width:34px;"></th><th>Documento</th><th>Categoria</th><th>SUB</th><th>Scadenza</th><th>Stato</th><th style="width:90px;">Azioni</th></tr></thead>
    <tbody>${filtered.map(d=>{
      const st=_docStato(d);
      const icon=DOC_ICONS[d.tipo]||'📄';
      return `<tr class="row-click" onclick="docVaiAllaSezione(${d.id})" title="Apri la cartella di questo documento">
        <td onclick="event.stopPropagation()"><input type="checkbox" class="sel-check documenti-chk" data-id="${d.id}" onchange="genToggle('documenti',${d.id},this)"></td>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <span style="width:30px;height:30px;border-radius:8px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:14px;filter:grayscale(.4);">${icon}</span>
          <div style="min-width:0;"><div style="font-weight:600;color:var(--text-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;">${esc(d.nome)}</div>
          <div style="font-size:10.5px;color:var(--muted);">${d.fornitore_nome?esc(d.fornitore_nome)+' · ':''}${d.data_documento?fmt(d.data_documento):''}${d.importo?' · € '+parseFloat(d.importo).toLocaleString('it-IT'):''}</div></div>
        </div></td>
        <td style="font-size:11.5px;color:var(--muted);text-transform:capitalize;">${esc((d.tipo||'').replace(/_/g,' '))}</td>
        <td style="font-size:12px;">${esc(d.sub_codice||'—')}</td>
        <td style="font-size:12px;">${d.scadenza?fmt(d.scadenza):'—'}</td>
        <td>${st.chip}</td>
        <td onclick="event.stopPropagation()">
          ${d.url?`<a href="${fileUrl(d.url)}" target="_blank" class="btn btn-xs btn-gray" title="Apri">👁</a>`:''}
          <button class="btn btn-xs btn-gray" onclick="delDoc(${d.id})" title="Elimina">✕</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
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

// Mostra la riga AI quando viene scelto un file leggibile
function _docAiRowRefresh(){
  const row=document.getElementById('doc-ai-row');
  if(!row)return;
  const ok=docFileInput&&/pdf|image/.test(docFileInput.type||'');
  row.style.display=ok?'flex':'none';
  const st=document.getElementById('doc-ai-status'); if(st)st.textContent='';
}

// Legge il documento con l'AI e precompila i campi (tu poi confermi)
async function docOCR(){
  if(!docFileInput){toast('Allega prima un file','error');return;}
  const st=document.getElementById('doc-ai-status');
  if(st){st.textContent='Lettura in corso… (qualche secondo)';st.style.color='var(--muted)';}
  const fd=new FormData(); fd.append('file',docFileInput);
  const r=await apiUp('/api/ocr',fd);
  const d=r?.dati;
  if(!d||!Object.keys(d).some(k=>d[k])){ if(st){st.textContent='❌ '+(r?.error||'Lettura fallita: PDF protetto o illeggibile — prova con una foto');st.style.color='var(--danger)';} return; }
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val)el.value=val;};
  // tipo: usa il valore se esiste tra le opzioni
  if(d.tipo_documento){
    const sel=document.getElementById('doc-tipo');
    if(sel&&[...sel.options].some(o=>o.value===d.tipo_documento)) sel.value=d.tipo_documento;
  }
  set('doc-nome', d.descrizione || (d.tipo_documento?d.tipo_documento+(d.fornitore?' — '+d.fornitore:''):null));
  set('doc-data', d.data_fattura);
  set('doc-scad', d.scadenza);
  if(d.importo){const el=document.getElementById('doc-imp');if(el)el.value=parseFloat(String(d.importo).replace(',','.'))||'';}
  set('doc-desc', [d.fornitore?'Fornitore: '+d.fornitore:null, d.num_fattura?'N. '+d.num_fattura:null].filter(Boolean).join(' · '));
  // fornitore: prova a matchare in anagrafica
  if(d.fornitore){
    const sel=document.getElementById('doc-forn');
    const m=(DB.fornitori||[]).find(f=>(f.ragione_sociale||'').toLowerCase().includes(String(d.fornitore).toLowerCase().slice(0,8)));
    if(sel&&m)sel.value=m.id;
  }
  if(st){st.textContent='✅ Campi compilati — controlla e salva';st.style.color='var(--success)';}
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
  // Se la scheda SUB è aperta sotto, aggiornala senza chiuderla
  if(typeof currentSubId!=='undefined'&&currentSubId&&document.getElementById('sec-subdet')?.classList.contains('active')){
    if(typeof subDetRefresh==='function') subDetRefresh();
  }
}

async function delDoc(id){if(!await appConfirm('Eliminare documento?'))return;
  // Rimuovi subito dalla cache e rirender (UI istantanea)
  if (_cache.documenti) {
    _cache.documenti = _cache.documenti.filter(x => Number(x.id) !== Number(id));
  }
  loadDocs();await api('/api/documenti/'+id,{method:'DELETE'});loadDocs();toast('Eliminato','error');}

// Click su un documento in archivio → apre il SUB nella cartella giusta
async function docVaiAllaSezione(docId){
  const doc=(_cache.documenti||[]).find(x=>x.id==docId);
  if(!doc)return;
  if(!doc.sub_id){toast('Documento non collegato a un SUB — resta in archivio','warning');return;}
  const t=doc.tipo||'';
  let tab='documenti';
  if(t.startsWith('imp_')){ tab='impianto:'+t.split('_')[1]; }
  else if(t==='ape') tab='ape';
  else if(['catastale','visura','planimetria'].includes(t)) tab='catasto';
  else if(['certificazione','agibilita','collaudo','polizza','certif'].includes(t)) tab='certificazioni';
  else if(t==='foto') tab='foto';
  else if(t==='contratto') tab='contratti';
  else if(t==='condominiale') tab='economico';
  await openSubDetail(doc.sub_id);
  if(tab.startsWith('impianto:')){ subDetTab=tab; renderSubDetTab(tab); }
  else setSubDetTab(tab,_subTabBtn(tab));
}
