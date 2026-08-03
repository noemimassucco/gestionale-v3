// =======================================================
// MODULE: analytics.js
// =======================================================

// TODO: saveAffitto, openModalAffitto, loadRiepilogo

// Piano canoni: legge le rate canone già presenti nello Schema Fatturazione
// (ordini_fatturazione, tipo_servizio='canone_locazione') — nessun dato duplicato.
async function loadAffitti(){
  const anno=document.getElementById('af-anno')?.value;
  const sub_id=document.getElementById('af-sub')?.value;
  const stato=document.getElementById('af-stato')?.value;
  const p=new URLSearchParams();
  if(anno)p.set('anno',anno);
  if(sub_id)p.set('sub_id',sub_id);
  if(stato)p.set('stato',stato);
  const data=await api('/api/canoni?'+p);if(!data)return;
  const righe=data.righe||[];
  const eur=n=>'€ '+(n||0).toLocaleString('it-IT',{minimumFractionDigits:2});
  document.getElementById('affitti-stats').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;grid-column:1/-1;">
      <div class="aging-chip" style="background:var(--card);border:1px solid var(--border);color:var(--muted);"><div class="n">${eur(data.totali?.previsto)}</div><div class="l">Previsto</div></div>
      <div class="aging-chip" style="background:rgba(250,204,21,.14);border:1px solid rgba(250,204,21,.3);color:#8a6d1a;"><div class="n">${eur(data.totali?.daFatturare)}</div><div class="l">Da fatturare</div></div>
      <div class="aging-chip" style="background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);color:var(--green);"><div class="n">${eur(data.totali?.fatturato)}</div><div class="l">Fatturato</div></div>
    </div>`;
  const el=document.getElementById('affitti-list');
  if(!righe.length){el.innerHTML='<div class="empty">Nessuna rata canone trovata per questo filtro.</div>';return;}
  el.innerHTML=righe.map(r=>{
    const c=CA_RATA_STATO[r.stato]||{label:r.stato,bg:'rgba(148,163,184,.2)',col:'var(--muted)'};
    const periodo=r.periodo_dal?`${fmt(r.periodo_dal)} → ${fmt(r.periodo_al)}`:'—';
    const isDaFatt=r.stato==='da_fatturare';
    return `
    <div class="int-card" style="${isDaFatt?'background:rgba(250,204,21,.08);':''}border-left:3px solid ${c.col};">
      <div class="int-card-hdr">
        <strong style="font-size:13px;color:#0f172a;">${r.sub_codice?'SUB '+esc(r.sub_codice):'—'}</strong>
        <span style="font-size:12px;color:var(--muted);">${periodo}</span>
        ${r.inquilino_nome?`<span style="font-size:12px;color:var(--muted);">👤 ${esc(r.inquilino_nome)}</span>`:''}
        <span class="td-price" style="margin-left:auto;">€ ${parseFloat(r.importo||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
      </div>
      <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="background:${c.bg};color:${c.col};border-radius:8px;padding:3px 9px;font-size:11px;font-weight:600;">${c.label}</span>
        ${r.numero_fattura?`<span style="font-size:11px;color:var(--muted);">Fattura ${esc(r.numero_fattura)}${r.data_fatturazione?' · '+fmt(r.data_fatturazione):''}</span>`:''}
        ${r.stato_pagamento==='pagato'?`<span style="font-size:11px;color:var(--green);">✓ Pagato${r.data_pagamento?' il '+fmt(r.data_pagamento):''}</span>`:''}
      </div>
    </div>`;
  }).join('');
}

// (filterSubBySede: si usa la versione di interventi.js)
