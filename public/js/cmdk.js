

// ═══════ COMMAND PALETTE (Ctrl+K) ═══════
let _cmdkItems=[],_cmdkSel=0;

function _cmdkBuild(q){
  q=(q||'').toLowerCase().trim();
  const hit=t=>!q||String(t||'').toLowerCase().includes(q);
  const out=[];

  // Azioni rapide
  const azioni=[
    ['➕','Nuovo SUB',()=>{showSection('subs');openAna('sub');}],
    ['⚡','Nuova bolletta',()=>{openModalBoll?openModalBoll():showSection('bollette');}],
    ['📄','Nuovo documento',()=>{subAddDocPreset('documento');}],
    ['📝','Nota rapida',()=>{openQuickNote();}],
    ['✉️','Scrivi email con AI',()=>{openAiMail();}],
    ['📐','Millesimi condominiali',()=>{renderMillesimiGlobale();}],
    ['💶','Incassi & Uscite (da data a data)',()=>{showSection('finanze');}],
    ['🤖','Riconoscimento automatico documento',()=>{showSection('import');}],
    ['💳','Registra pagamento affitto',()=>{subActionNuovoAffitto();}],
    ['🔨','Nuova manutenzione',()=>{showSection('manutenzioni');if(typeof openModalMan==='function')openModalMan();}],
  ].filter(a=>hit(a[1]));
  if(azioni.length)out.push({group:'Azioni',items:azioni.map(a=>({ico:a[0],label:a[1],sub:'',run:a[2]}))});

  // SUB
  const subs=(DB.subs||[]).filter(s=>hit(s.codice)||hit(s.ex_sub)||hit(s.indirizzo_completo)||hit(s.inquilino_nome)||hit(s.sede_nome)).slice(0,6);
  if(subs.length)out.push({group:'SUB',items:subs.map(s=>({ico:'🏢',label:subLabel(s),sub:(s.sede_nome||'')+(s.inquilino_nome?' · '+s.inquilino_nome:''),run:()=>openSubDetail(s.id)}))});

  // Clienti
  const inq=(DB.inquilini||[]).filter(i=>hit(i.ragione_sociale)||hit(i.piva)||hit(i.citta)).slice(0,5);
  if(inq.length)out.push({group:'Clienti',items:inq.map(i=>({ico:'👤',label:i.ragione_sociale,sub:i.citta||'',run:()=>{showSection('inquilini');setTimeout(()=>openAnaById('inquilino',i.id),300);}}))});

  // Fornitori
  const forn=(DB.fornitori||[]).filter(f=>hit(f.ragione_sociale)||hit(f.piva)).slice(0,5);
  if(forn.length)out.push({group:'Fornitori',items:forn.map(f=>({ico:'🔧',label:f.ragione_sociale,sub:f.citta||'',run:()=>{showSection('fornitori');}}))});

  // Sezioni
  const sezioni=[['🏠','Dashboard','dashboard'],['🏢','SUB','subs'],['👤','Clienti','inquilini'],['🏛️','Catasto & ISTAT','catasto'],['📋','Interventi','interventi'],['🔨','Manutenzioni','manutenzioni'],['🔧','Fornitori','fornitori'],['📄','Documenti','documenti'],['⬆️','Import / OCR','import'],['🧾','Fatturazione','fatturazione'],['💳','Affitti','affitti'],['⚡','Bollette','bollette'],['📊','Riepilogo','riepilogo'],['🔔','Notifiche','notifiche'],['💬','Chat Team','teamchat'],['📅','Calendario','calendario'],['⚙️','Impostazioni','impostazioni']]
    .filter(x=>hit(x[1])).slice(0,q?6:0);
  if(sezioni.length)out.push({group:'Vai a',items:sezioni.map(x=>({ico:x[0],label:x[1],sub:'sezione',run:()=>showSection(x[2])}))});

  return out;
}

function _cmdkRender(){
  const list=document.getElementById('cmdk-list');
  if(!list)return;
  let idx=0;
  const flat=[];
  list.innerHTML=_cmdkItems.map(g=>
    '<div class="cmdk-group">'+g.group+'</div>'+
    g.items.map(it=>{
      const i=idx++;flat.push(it);
      return '<div class="cmdk-item'+(i===_cmdkSel?' sel':'')+'" data-i="'+i+'" onclick="cmdkRun('+i+')" onmousemove="_cmdkSel='+i+';_cmdkRender()">'
        +'<span class="cmdk-ico">'+it.ico+'</span>'
        +'<span>'+esc(it.label)+'</span>'
        +(it.sub?'<span class="sub">'+esc(it.sub)+'</span>':'')
        +'</div>';
    }).join('')
  ).join('')||'<div class="empty" style="padding:24px;">Nessun risultato. Prova con un codice SUB, un cliente, un fornitore…</div>';
  window._cmdkFlat=flat;
  const sel=list.querySelector('.cmdk-item.sel');
  if(sel)sel.scrollIntoView({block:'nearest'});
}

function cmdkFilter(q){_cmdkItems=_cmdkBuild(q);_cmdkSel=0;_cmdkRender();}
function cmdkRun(i){const it=(window._cmdkFlat||[])[i];if(!it)return;closeCmdk();setTimeout(()=>it.run(),80);}
function cmdkKeys(e){
  const n=(window._cmdkFlat||[]).length;
  if(e.key==='ArrowDown'){e.preventDefault();_cmdkSel=Math.min(_cmdkSel+1,n-1);_cmdkRender();}
  else if(e.key==='ArrowUp'){e.preventDefault();_cmdkSel=Math.max(_cmdkSel-1,0);_cmdkRender();}
  else if(e.key==='Enter'){e.preventDefault();cmdkRun(_cmdkSel);}
  else if(e.key==='Escape'){closeCmdk();}
}
function openCmdk(){
  const el=document.getElementById('cmdk');
  if(!el)return;
  el.style.display='flex';
  cmdkFilter('');
  setTimeout(()=>{const i=document.getElementById('cmdk-input');if(i){i.value='';i.focus();}},60);
}
function closeCmdk(){const el=document.getElementById('cmdk');if(el)el.style.display='none';}
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCmdk();}
});
