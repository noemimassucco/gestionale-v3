// =======================================================
// MODULE: chat.js
// =======================================================

// TODO: loadChatHistory

async function sendChatPage(){
  const input=document.getElementById('chat-input-page');
  const msg=input?.value?.trim();if(!msg)return;
  input.value='';
  addChatMsgPage(msg,'user');
  addChatMsgPage('⏳ Sto cercando…','bot','chat-page-loading');
  const r=await api('/api/chat',{method:'POST',body:JSON.stringify({messaggio:msg})});
  document.getElementById('chat-page-loading')?.remove();
  if(!r){addChatMsgPage('Errore di connessione.','bot');return;}
  let html=r.risposta.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  if(r.dati?.length){
    html+=r.dati.slice(0,6).map(d=>{
      if(r.tipo==='interventi')return`<div class="chat-result" onclick="openDet(${d.id})">📋 <strong>${esc(d.sub||'?')}</strong> — ${esc((d.descrizione||'').slice(0,50))} ${d.prezzo?`<strong style="color:var(--accent-bg);">€ ${parseFloat(d.prezzo).toLocaleString('it-IT')}</strong>`:''}`;
      if(r.tipo==='fornitori')return`<div class="chat-result">🔧 <strong>${esc(d.ragione_sociale)}</strong> — ${d.num_int||0} int. · <strong style="color:var(--accent-bg);">€ ${parseFloat(d.totale||0).toLocaleString('it-IT')}</strong></div>`;
      return`<div class="chat-result">📄 ${esc(d.nome||d.descrizione||'').slice(0,60)}</div>`;
    }).join('');
    if(r.dati.length>6)html+=`<div style="font-size:10px;color:var(--muted);margin-top:4px;">... e altri ${r.dati.length-6}</div>`;
  }
  addChatMsgPage(html,'bot',null,true);
}

function addChatMsgPage(html,role,id=null,isHtml=false){
  const msgs=document.getElementById('chat-messages-page');if(!msgs)return;
  const div=document.createElement('div');
  div.className='chat-msg '+role;
  if(id)div.id=id;
  if(isHtml)div.innerHTML=html;else div.textContent=html;
  msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;
}