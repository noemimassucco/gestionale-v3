// =======================================================
// MODULE: calendar.js
// =======================================================

async function loadCalendario(){
  const mese=document.getElementById('cal-mese')?.value;
  const anno=document.getElementById('cal-anno')?.value;
  const p=new URLSearchParams();
  if(mese)p.set('mese',mese);
  if(anno)p.set('anno',anno);
  const data=await api('/api/calendario?'+p);if(!data)return;
  const el=document.getElementById('cal-list');
  if(!data.length){el.innerHTML='<div class="empty">Nessuna scadenza nel periodo selezionato. 🎉</div>';return;}
  // Raggruppa per settimana/giorno
  const byDate={};
  data.forEach(ev=>{
    const d=ev.scadenza?String(ev.scadenza).split('T')[0]:'senza data';
    if(!byDate[d])byDate[d]=[];
    byDate[d].push(ev);
  });
  const typeColors={documento:'rgba(193,154,107,.2)',manutenzione:'rgba(239,68,68,.2)',bolletta:'rgba(107,142,107,.2)',contratto_istat:'rgba(163,230,53,.2)'};
  el.innerHTML=Object.entries(byDate).map(([date,events])=>`
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;padding:0 0 7px;margin-bottom:8px;border-bottom:1px solid var(--border);">
        📅 ${date==='senza data'?date:fmt(date)} ${date!=='senza data'?`<span style="font-size:10px;background:${getDaysUntil(date)<0?'rgba(239,68,68,.2)':getDaysUntil(date)<7?'rgba(184,134,11,.2)':'rgba(100,116,139,.1)'};color:${getDaysUntil(date)<0?'var(--red)':getDaysUntil(date)<7?'var(--accent)':'var(--muted)'};padding:1px 7px;border-radius:8px;margin-left:6px;">${getDaysUntil(date)===0?'Oggi':getDaysUntil(date)<0?`Scaduto ${-getDaysUntil(date)}gg fa`:`${getDaysUntil(date)}gg`}</span>`:''}
      </div>
      ${events.map(ev=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${typeColors[ev.tipo]||'var(--border)'};border-radius:8px;margin-bottom:7px;">
        <span style="font-size:18px;">${ev.icon||'📌'}</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(ev.titolo||'—')}</div>
          <div style="font-size:11px;color:var(--muted);">${esc(ev.tipo?.replace('_',' ')||'')}${ev.sub?' · SUB '+esc(ev.sub):''}${ev.sede?' · '+esc(ev.sede):''}</div>
        </div>
      </div>`).join('')}
    </div>`).join('');
}