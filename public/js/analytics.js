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
  // Stats + AGING CREDITI (fasce di ritardo: lo strumento che le aziende usano per riscuotere)
  const totPag=filtered.filter(p=>p.stato==='pagato').reduce((s,p)=>s+parseFloat(p.importo||0),0);
  const nonPagati=filtered.filter(p=>p.stato==='insoluto'||p.stato==='ritardo');
  const oggi=new Date();
  const bande={b30:0,b60:0,b90:0,b90p:0};
  nonPagati.forEach(p=>{
    const fine=new Date(p.anno,p.mese,0); // fine del mese di competenza
    const gg=Math.floor((oggi-fine)/86400000);
    const imp=parseFloat(p.importo)||0;
    if(gg<=30)bande.b30+=imp; else if(gg<=60)bande.b60+=imp; else if(gg<=90)bande.b90+=imp; else bande.b90p+=imp;
  });
  const eur=n=>'€ '+(n||0).toLocaleString('it-IT',{maximumFractionDigits:0});
  document.getElementById('affitti-stats').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;grid-column:1/-1;">
      <div class="aging-chip" style="background:var(--success-bg);color:var(--success);"><div class="n">${eur(totPag)}</div><div class="l">Incassato</div></div>
      <div class="aging-chip" style="background:var(--card);border:1px solid var(--border);color:${bande.b30?'var(--warning)':'var(--muted-2)'};"><div class="n">${eur(bande.b30)}</div><div class="l">Ritardo 1-30 gg</div></div>
      <div class="aging-chip" style="background:var(--card);border:1px solid var(--border);color:${bande.b60?'var(--warning)':'var(--muted-2)'};"><div class="n">${eur(bande.b60)}</div><div class="l">31-60 gg</div></div>
      <div class="aging-chip" style="background:var(--card);border:1px solid var(--border);color:${bande.b90?'var(--danger)':'var(--muted-2)'};"><div class="n">${eur(bande.b90)}</div><div class="l">61-90 gg</div></div>
      <div class="aging-chip" style="background:${bande.b90p?'var(--danger-bg)':'var(--card)'};border:1px solid ${bande.b90p?'var(--danger)':'var(--border)'};color:${bande.b90p?'var(--danger)':'var(--muted-2)'};"><div class="n">${eur(bande.b90p)}</div><div class="l">Oltre 90 gg ⚠</div></div>
    </div>`;
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
        ${p.stato!=='pagato'?`<button class="btn btn-success btn-sm" onclick="segnaAffittoPagato(${p.id})">✓ Pagato</button><button class="btn btn-sm" style="background:var(--warning-bg);color:var(--warning);border:1px solid var(--border-2);" onclick="sollecitoAffitto(${p.id})" title="Invia email di sollecito all'inquilino">✉️ Sollecito</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="delAffitto(${p.id})">✕</button>
      </div>
    </div>`).join('');
}

// (filterSubBySede: si usa la versione di interventi.js)
