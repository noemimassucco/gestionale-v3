// =======================================================
// MODULE: analytics.js
// =======================================================

// TODO: saveAffitto, openModalAffitto, loadRiepilogo

async function loadAffitti(){
  const anno=document.getElementById('af-anno')?.value;
  const sub_id=document.getElementById('af-sub')?.value;
  const stato=document.getElementById('af-stato')?.value;
  const p=new URLSearchParams();
  if(anno)p.set('anno',anno);
  if(sub_id)p.set('sub_id',sub_id);
  const data=await api('/api/pagamenti-affitto?'+p);if(!data)return;
  const filtered=stato?data.filter(d=>d.stato===stato):data;
  const mesi=['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const statoColors={pagato:'var(--green)',atteso:'var(--muted)',ritardo:'var(--orange)',insoluto:'var(--red)'};
  const statoIcons={pagato:'✅',atteso:'⏳',ritardo:'⚠️',insoluto:'🔴'};
  // Stats
  const totPag=filtered.filter(p=>p.stato==='pagato').reduce((s,p)=>s+parseFloat(p.importo||0),0);
  const totInsoluti=filtered.filter(p=>p.stato==='insoluto').length;
  document.getElementById('affitti-stats').innerHTML=[
    {label:'Totale incassato',val:'€ '+totPag.toLocaleString('it-IT',{minimumFractionDigits:2}),color:'var(--green)'},
    {label:'Pagamenti',val:filtered.filter(p=>p.stato==='pagato').length,color:'var(--green)'},
    {label:'Insoluti',val:totInsoluti,color:totInsoluti>0?'var(--red)':'var(--muted)'},
  ].map(k=>`<div class="home-kpi-card"><div class="stat-label">${k.label}</div><div style="font-size:20px;font-weight:700;color:${k.color};">${k.val}</div></div>`).join('');
  const el=document.getElementById('affitti-list');
  if(!filtered.length){el.innerHTML='<div class="empty">Nessun pagamento trovato.</div>';return;}
  el.innerHTML=filtered.map(p=>`
    <div class="int-card" style="border-left:3px solid ${statoColors[p.stato]||'var(--border)'};">
      <div class="int-card-hdr">
        ${statoIcons[p.stato]||''} <strong style="font-size:13px;color:#0f172a;">${p.sub_codice?'SUB '+esc(p.sub_codice):'—'}</strong>
        <span style="font-size:12px;color:var(--muted);">${mesi[p.mese]||p.mese} ${p.anno}</span>
        ${p.inquilino_nome?`<span style="font-size:12px;color:var(--muted);">👤 ${esc(p.inquilino_nome)}</span>`:''}
        <span class="td-price" style="margin-left:auto;">€ ${parseFloat(p.importo||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
      </div>
      ${p.data_pagamento?`<div style="font-size:11px;color:var(--muted);">Pagato il: ${fmt(p.data_pagamento)}</div>`:''}
      <div style="margin-top:6px;display:flex;gap:5px;">
        ${p.stato!=='pagato'?`<button class="btn btn-success btn-sm" onclick="segnaAffittoPagato(${p.id})">✓ Pagato</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="delAffitto(${p.id})">✕</button>
      </div>
    </div>`).join('');
}

function filterSubBySede(){const sedeId=document.getElementById('fi-sede').value;const subs=sedeId?DB.subs.filter(s=>s.sede_id==sedeId):DB.subs;document.getElementById('fi-sub').innerHTML='<option value="">— SUB —</option>'+subs.map(s=>`<option value="${s.id}">${s.codice}${s.ex_sub?' (ex '+s.ex_sub+')':''}</option>`).join('');}

async function loadUsers(){const u=await api('/api/users');if(!u)return;document.getElementById('users-list').innerHTML=u.map(x=>`<div style="display:flex;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px;"><div style="flex:1;"><strong>${esc(x.nome)}</strong><div style="font-size:10px;color:var(--muted);">${esc(x.email)} — ${x.ruolo}</div></div><span style="font-size:10px;color:${x.attivo?'var(--green)':'var(--red)'};">${x.attivo?'Attivo':'Off'}</span></div>`).join('')||'<div style="color:var(--muted);font-size:12px;">Nessun utente</div>';}

async function saveUser(){const v=id=>document.getElementById(id)?.value||'';const n=v('u-nome'),e=v('u-email'),p=v('u-pwd'),r=v('u-ruolo');if(!n||!e||!p){toast('Compila tutti i campi','error');return;}await api('/api/users',{method:'POST',body:JSON.stringify({nome:n,email:e,password:p,ruolo:r})});closeM('modal-user');loadUsers();toast('Utente creato ✓');}