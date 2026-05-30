// =======================================================
// MODULE: dashboard.js
// =======================================================

async function loadSettings(){const s=await api('/api/settings');if(!s)return;if(s.app_name){['app-title','header-title','login-title'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=s.app_name;});['hero-badge','hero-title'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=s.app_name;});const sn=document.getElementById('s-nome');if(sn)sn.value=s.app_name;}if(s.footer_text){const sf=document.getElementById('s-footer');if(sf)sf.value=s.footer_text;}}

async function loadDashboard(){
  const [dash,notifiche,subs,news,cal,recentInts]=await Promise.all([
    api('/api/dashboard'), api('/api/notifiche'), api('/api/subs'),
    api('/api/news'), api('/api/calendario'),
    api('/api/interventi?limit=5'),
  ]);
  if(!dash)return;

  // KPI
  const nc=(notifiche||[]).length;
  const kpis=[
    {l:'SUB Gestiti',v:dash.totali?.num_subs||0,c:'var(--teal2)',i:'🏢',s:'subs'},
    {l:'Interventi',v:dash.totali?.num_interventi||0,c:'var(--text)',i:'📋',s:'interventi'},
    {l:'Spese totali',v:'€ '+parseFloat(dash.totali?.totale_spese||0).toLocaleString('it-IT',{maximumFractionDigits:0}),c:'var(--gold)',i:'💰',s:'riepilogo'},
    {l:'Manutenzioni',v:dash.totali?.manutenzioni_aperte||0,c:'var(--orange)',i:'🔨',s:'manutenzioni'},
    {l:'Documenti',v:dash.totali?.num_documenti||0,c:'var(--muted)',i:'📄',s:'documenti'},
    {l:'Notifiche',v:nc,c:nc>0?'var(--red)':'var(--green)',i:'🔔',s:'notifiche'},
  ];
  const kpiEl=document.getElementById('dash-kpi');
  if(kpiEl)kpiEl.innerHTML=kpis.map(k=>`<div class="home-kpi-card" onclick="showSection('${k.s}')" style="cursor:pointer;">
    <div style="font-size:18px;margin-bottom:5px;">${k.i}</div>
    <div class="stat-label">${k.l}</div>
    <div style="font-size:20px;font-weight:700;color:${k.c};font-family:monospace;">${k.v}</div>
  </div>`).join('');

  // Alert
  const alertBanner=document.getElementById('dash-alert-banner');
  const alertText=document.getElementById('dash-alert-text');
  if(nc>0&&alertBanner&&alertText){
    alertBanner.classList.remove('hidden');
    alertText.textContent=`${nc} notifiche attive — contratti ISTAT, scadenze documenti, manutenzioni programmate`;
  }

  // Notif badge
  if(nc>0){['notif-badge-cnt','sb-notif-badge'].forEach(id=>{const el=document.getElementById(id);if(el){el.textContent=nc;el.classList.remove('hidden');}});}

  // Scadenze 7gg
  const scadEl=document.getElementById('dash-scadenze');
  if(scadEl){
    const prox=(cal||[]).filter(e=>{
      const gg=Math.floor((new Date(e.scadenza)-new Date())/(1000*60*60*24));
      return gg>=0&&gg<=7;
    }).slice(0,5);
    scadEl.innerHTML=prox.length?prox.map(e=>{
      const gg=Math.floor((new Date(e.scadenza)-new Date())/(1000*60*60*24));
      return`<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);">
        <span>${e.icon||'📌'}</span>
        <div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e.titolo||'')}</div><div style="font-size:10px;color:var(--muted);">${e.sub?'SUB '+esc(e.sub)+' · ':''}</div></div>
        <span style="font-size:10px;font-weight:700;color:${gg<=2?'var(--red)':gg<=5?'var(--orange)':'var(--muted)'};">${gg===0?'Oggi':gg+'gg'}</span>
      </div>`;
    }).join(''):'<div style="color:var(--green);font-size:11px;">🎉 Nessuna scadenza nei prossimi 7 giorni</div>';
  }

  // Ultime attività
  const actEl=document.getElementById('dash-activity');
  if(actEl){
    const ints=(recentInts||[]).slice(0,5);
    actEl.innerHTML=ints.length?ints.map(i=>`<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;" onclick="openDet(${i.id})">
      <span style="font-size:13px;">${i.priorita==='urgente'?'🔴':i.priorita==='alta'?'🟠':'📋'}</span>
      <div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc((i.descrizione||'').slice(0,40))}</div><div style="font-size:10px;color:var(--muted);">${i.sub_codice?'SUB '+esc(i.sub_codice):''} ${fmt(i.data_intervento)}</div></div>
      ${i.prezzo?`<span style="font-size:10px;font-family:monospace;color:var(--gold);">€${parseFloat(i.prezzo).toLocaleString('it-IT',{maximumFractionDigits:0})}</span>`:''}
    </div>`).join(''):'<div style="color:var(--muted);font-size:11px;">Nessun intervento recente</div>';
  }

  // Notifiche rapide
  const notifQuick=document.getElementById('dash-notif-quick');
  if(notifQuick){
    const nn=(notifiche||[]).slice(0,4);
    notifQuick.innerHTML=nn.length?nn.map(n=>`<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;" onclick="showSection('notifiche')">
      <div style="width:7px;height:7px;border-radius:50%;background:${n.tipo==='urgente'?'var(--red)':n.tipo==='istat'?'#a3e635':'var(--orange)'};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;">${esc(n.titolo||n.tipo)}</div>
      ${n.giorni!==undefined?`<span style="font-size:9px;color:var(--muted);">${parseInt(n.giorni)<0?'Scaduto':parseInt(n.giorni)+'gg'}</span>`:''}
    </div>`).join('')+'<div style="margin-top:6px;"><button class="btn btn-xs btn-gray" onclick="showSection(\"notifiche\")" style="width:100%;">Vedi tutte →</button></div>'
    :'<div style="color:var(--green);font-size:11px;">✅ Nessuna notifica</div>';
  }

  // Bar chart spese mensili
  const chartEl=document.getElementById('dash-chart');
  if(chartEl&&dash.spesePerMese){
    const data=dash.spesePerMese||[];
    const max=Math.max(...data.map(d=>d.totale||0),1);
    const mesi=['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    chartEl.innerHTML=data.map(d=>{
      const h=Math.max(8,Math.round((d.totale/max)*100));
      return`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;" title="€ ${parseFloat(d.totale).toLocaleString('it-IT')}">
        <div style="width:100%;height:${h}px;background:linear-gradient(180deg,var(--accent),rgba(37,99,235,.4));border-radius:4px 4px 0 0;transition:all .2s;" onmouseover="this.style.background='linear-gradient(180deg,var(--gold),rgba(212,168,75,.4))'" onmouseout="this.style.background='linear-gradient(180deg,var(--accent),rgba(37,99,235,.4))'"></div>
        <div style="font-size:9px;color:var(--muted);">${mesi[d.mese]||d.mese}</div>
      </div>`;
    }).join('');
  } else if(chartEl) {
    chartEl.innerHTML='<div style="font-size:11px;color:var(--muted);padding:10px;">Nessun dato spese disponibile</div>';
  }

  // SUB grid
  const sgEl=document.getElementById('dash-sub-grid');
  if(sgEl)sgEl.innerHTML=(subs||[]).slice(0,8).map(s=>{
    const sal=parseInt(s.manutenzioni_aperte)>0?'🟡':s.stato_occupazione==='libero'?'⚪':'🟢';
    return`<div class="home-sub-card" onclick="openSubDetail(${s.id})" style="cursor:pointer;">
      <div class="flex" style="margin-bottom:4px;">${sal} <strong style="color:#fff;font-size:13px;">${esc(s.codice)}</strong>${s.manutenzioni_aperte>0?`<span class="badge" style="background:rgba(245,158,11,.2);color:var(--gold2);margin-left:auto;">🔨${s.manutenzioni_aperte}</span>`:''}
      </div>
      <div style="font-size:11px;color:var(--muted);">${esc(s.sede_nome||'—')}</div>
      <div style="font-size:11px;color:var(--text);">${esc(s.inquilino_nome||'Libero')}</div>
      <div style="display:flex;justify-content:space-between;margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.05);">
        <span style="font-size:10px;color:var(--muted);">${s.num_interventi||0} int.</span>
        <span style="font-family:monospace;font-size:10px;font-weight:700;color:var(--gold);">${s.totale_spese?'€ '+parseFloat(s.totale_spese).toLocaleString('it-IT',{maximumFractionDigits:0}):'—'}</span>
      </div>
    </div>`;
  }).join('')||'<div class="empty">Nessun SUB ancora.</div>';

  // News
  const newsEl=document.getElementById('dash-news');
  if(newsEl&&news?.length){
    newsEl.innerHTML=news.slice(0,6).map(n=>`
      <a href="${n.link||'#'}" target="_blank" style="text-decoration:none;">
        <div class="card" style="transition:all .2s;padding:12px 14px;" onmouseover="this.style.borderColor='rgba(37,99,235,.4)';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
          <div style="font-size:9px;color:var(--teal2);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">🏢 Immobiliare</div>
          <div style="font-size:12px;font-weight:600;color:#fff;line-height:1.4;margin-bottom:5px;">${esc(n.title||'—')}</div>
          ${n.desc?`<div style="font-size:10px;color:var(--muted);line-height:1.5;">${esc(n.desc.slice(0,80))}</div>`:''}
        </div>
      </a>`).join('');
  }

  await loadSettings();
}