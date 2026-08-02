// =======================================================
// MODULE: dashboard.js
// =======================================================

async function loadSettings(){const s=await api('/api/settings');if(!s)return;if(s.app_name){['app-title','header-title','login-title'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=s.app_name;});['hero-badge','hero-title'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=s.app_name;});const sn=document.getElementById('s-nome');if(sn)sn.value=s.app_name;}if(s.footer_text){const sf=document.getElementById('s-footer');if(sf)sf.value=s.footer_text;}}

async function loadDashboard(){
  if(typeof loadPromemoriaAttivi==='function')loadPromemoriaAttivi();
  const _anno=new Date().getFullYear();
  const [dash,notifiche,subs,pagamenti,cal,recentInts]=await Promise.all([
    api('/api/dashboard'), api('/api/notifiche'), api('/api/subs'),
    api('/api/pagamenti-affitto?anno='+_anno), api('/api/calendario'),
    api('/api/interventi?limit=5'),
  ]);
  if(!dash)return;

  // KPI — nc = notifiche NON LETTE importanti (il totale ignorava lo stato letto
  // e teneva il badge rosso fisso anche dopo averle lette tutte)
  const _uid = n => (typeof notifUid==='function') ? notifUid(n) : n.tipo+'_'+(n.id||'');
  const _read = (typeof _readNotifs!=='undefined') ? _readNotifs : new Set();
  const notifNonLette=(notifiche||[]).filter(n=>!_read.has(_uid(n)));
  const nc=notifNonLette.filter(n=>n.tipo!=='incompleto').length;
  // ═══ I 4 NUMERI CHE CONTANO (ricerca: soldi prima di tutto, semaforo, zero scroll) ═══
  const attivi=(subs||[]).filter(x=>!x.stato_sub||x.stato_sub==='attivo');
  const occupati=attivi.filter(x=>x.stato_occupazione==='occupato');
  const occPct=attivi.length?Math.round(occupati.length/attivi.length*100):0;
  const attesoMese=occupati.reduce((a,x)=>a+(parseFloat(x.canone_annuo)||0),0)/12;
  const meseCorr=new Date().getMonth()+1;
  const pags=pagamenti||[];
  const incassatoMese=pags.filter(p=>p.mese==meseCorr&&p.stato==='pagato').reduce((a,p)=>a+(parseFloat(p.importo)||0),0);
  const insoluti=pags.filter(p=>p.stato==='insoluto'||p.stato==='ritardo');
  const insolutiTot=insoluti.reduce((a,p)=>a+(parseFloat(p.importo)||0),0);
  const scad7=(cal||[]).filter(e=>{const g=Math.floor((new Date(e.scadenza)-new Date())/86400000);return g>=0&&g<=7;});
  const manAperte=parseInt(dash.totali?.manutenzioni_aperte)||0;
  const eur=n=>'€ '+(n||0).toLocaleString('it-IT',{maximumFractionDigits:0});
  const dot=c=>`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px;"></span>`;

  const hero=[
    { l:'Canone atteso / mese', v:eur(attesoMese), col:'var(--text-strong)',
      st: attesoMese>0?dot('var(--success)')+occupati.length+' unità a reddito':dot('var(--muted-2)')+'nessun canone impostato', s:'affitti' },
    { l:'Incassato questo mese', v:eur(incassatoMese),
      col: attesoMese&&incassatoMese>=attesoMese*.95?'var(--success)':incassatoMese>0?'var(--warning)':'var(--text-strong)',
      st: attesoMese?dot(incassatoMese>=attesoMese*.95?'var(--success)':'var(--warning)')+Math.round(incassatoMese/attesoMese*100)+'% dell\'atteso':dot('var(--muted-2)')+'registra i pagamenti', s:'affitti' },
    { l:'Da incassare', v:eur(insolutiTot), col: insoluti.length?'var(--danger)':'var(--success)',
      st: insoluti.length?dot('var(--danger)')+insoluti.length+' canoni insoluti — sollecita':dot('var(--success)')+'nessun insoluto', s:'affitti' },
    { l:'Occupazione', v:occPct+'%', col: occPct>=90?'var(--success)':occPct>=70?'var(--warning)':'var(--danger)',
      st: dot(occPct>=90?'var(--success)':occPct>=70?'var(--warning)':'var(--danger)')+(attivi.length-occupati.length)+' unità libere', s:'subs' },
  ];
  const kpiEl=document.getElementById('dash-kpi');
  if(kpiEl)kpiEl.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:13px;">'
    +hero.map(k=>`<div class="card" onclick="showSection('${k.s}')" style="cursor:pointer;padding:16px 18px;">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:1.7px;color:var(--muted-2);font-weight:700;margin-bottom:8px;">${k.l}</div>
      <div class="wow-num" style="font-family:'Fraunces',serif;font-size:29px;font-weight:600;color:${k.col};line-height:1;margin-bottom:8px;">${k.v}</div>
      <div style="font-size:11px;color:var(--muted);">${k.st}</div>
    </div>`).join('')+'</div>';
  if(kpiEl&&typeof wowNumbers==='function')wowNumbers(kpiEl);

  // ═══ DA FARE ADESSO: scadenze + insoluti + SUB da attenzionare, in un'unica lista azionabile ═══
  const todoEl=document.getElementById('dash-todo');
  if(todoEl){
    const voci=[];
    insoluti.slice(0,4).forEach(p=>voci.push({ico:'💶',t:'Canone insoluto — '+(p.sub_codice?'SUB '+p.sub_codice:'')+(p.inquilino_nome?' · '+p.inquilino_nome:''),d:eur(parseFloat(p.importo)||0),urg:2,run:`showSection('affitti')`}));
    scad7.filter(e=>e.tipo!=='bolletta').slice(0,5).forEach(e=>{const g=Math.floor((new Date(e.scadenza)-new Date())/86400000);voci.push({ico:e.icon||'📅',t:e.titolo||'Scadenza',d:g===0?'oggi':'tra '+g+'g',urg:g<=2?2:1,run:`showSection('calendario')`});});
    (dash.subsCritici||[]).slice(0,3).forEach(c=>voci.push({ico:'🔧',t:'Da attenzionare — '+c.codice+(c.sede?' · '+c.sede:''),d:(c.urgenze||0)+' urgenze',urg:1,run:`openSubDetail(${c.id})`}));
    (notifiche||[]).filter(n=>n.tipo==='bolletta').slice(0,4).forEach(n=>{
      const g=n.giorni==null?null:parseInt(n.giorni);
      voci.push({ico:'⚡',t:'Bolletta da pagare — '+(n.titolo||'')+(n.sub?' · SUB '+n.sub:''),
        d:g==null?'senza scadenza':g<0?'scaduta!':g===0?'oggi':'tra '+g+'g',urg:g!=null&&g<=7?2:1,run:`showSection('bollette')`});
    });
    voci.sort((a,b)=>b.urg-a.urg);
    todoEl.innerHTML=voci.length?voci.slice(0,8).map(v2=>`
      <div class="row-click" onclick="${v2.run}" style="display:flex;align-items:center;gap:11px;padding:9px 6px;border-bottom:1px solid var(--border);cursor:pointer;border-radius:6px;">
        <span style="width:28px;height:28px;border-radius:8px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:13px;filter:grayscale(.4);flex-shrink:0;">${v2.ico}</span>
        <span style="flex:1;font-size:12.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(v2.t)}</span>
        <span style="font-size:11.5px;font-weight:700;color:${v2.urg===2?'var(--danger)':'var(--muted)'};white-space:nowrap;">${v2.d}</span>
        <span style="color:var(--muted-2);">›</span>
      </div>`).join(''):'<div style="color:var(--success);font-size:12.5px;padding:14px 4px;">✓ Tutto in ordine: nessuna urgenza, nessun insoluto, nessuna scadenza nei prossimi 7 giorni.</div>';
  }

  // Saluto con nome e data
  const gr=document.getElementById('dash-greeting');
  if(gr){
    const h=new Date().getHours();
    const saluto=h<12?'Buongiorno':h<18?'Buon pomeriggio':'Buonasera';
    const nome=(currentUser?.nome||'').split(' ')[0];
    gr.textContent=saluto+(nome?', '+nome:'');
  }
  const dt=document.getElementById('dash-date');
  if(dt)dt.textContent=new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  // Alert
  const alertBanner=document.getElementById('dash-alert-banner');
  const alertText=document.getElementById('dash-alert-text');
  if(nc>0&&alertBanner&&alertText){
    alertBanner.classList.remove('hidden');
    alertText.textContent=`${nc} notifiche da leggere — ISTAT, scadenze documenti, manutenzioni`;
  }

  // Notif badge (mostra E nasconde)
  ['notif-badge-cnt','sb-notif-badge'].forEach(id=>{const el=document.getElementById(id);if(el){el.textContent=nc;el.classList.toggle('hidden',nc===0);}});

  // Occupazione (anello CSS)
  const occEl=document.getElementById('dash-occupazione');
  if(occEl){
    const tot=(subs||[]).filter(s=>!s.stato_sub||s.stato_sub==='attivo');
    const occ=tot.filter(s=>s.stato_occupazione==='occupato').length;
    const lib=tot.length-occ;
    const pct=tot.length?Math.round(occ/tot.length*100):0;
    occEl.innerHTML=`
      <div style="width:92px;height:92px;border-radius:50%;background:conic-gradient(var(--green) 0 ${pct}%,rgba(100,116,139,.18) ${pct}% 100%);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <span style="font-size:17px;font-weight:700;color:var(--green);">${pct}%</span>
          <span style="font-size:8px;color:var(--muted);text-transform:uppercase;">occupato</span>
        </div>
      </div>
      <div style="flex:1;font-size:12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:9px;height:9px;border-radius:2px;background:var(--green);display:inline-block;"></span> Occupati: <strong>${occ}</strong></div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="width:9px;height:9px;border-radius:2px;background:rgba(100,116,139,.35);display:inline-block;"></span> Liberi: <strong>${lib}</strong></div>
        ${lib>0?`<div style="font-size:10px;color:var(--muted);">${lib} SUB da mettere a reddito</div>`:''}
      </div>`;
  }

  // SUB da attenzionare
  const critEl=document.getElementById('dash-critici');
  if(critEl){
    const crit=(dash.subsCritici||[]).slice(0,5);
    critEl.innerHTML=crit.length?crit.map(c=>`<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;" onclick="openSubDetail(${c.id})">
      <span>🟡</span>
      <div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:#0f172a;">${esc(c.codice)}</div><div style="font-size:10px;color:var(--muted);">${esc(c.sede||'—')}${c.inquilino?' · '+esc(c.inquilino):''}</div></div>
      <span style="font-size:10px;font-weight:700;color:var(--orange);">${c.urgenze||0} urgenze</span>
    </div>`).join(''):'<div style="color:var(--green);font-size:11px;">✅ Tutto sotto controllo</div>';
  }

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
        <div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(e.titolo||'')}</div><div style="font-size:10px;color:var(--muted);">${e.sub?'SUB '+esc(e.sub)+' · ':''}</div></div>
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
      <div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc((i.descrizione||'').slice(0,40))}</div><div style="font-size:10px;color:var(--muted);">${i.sub_codice?'SUB '+esc(i.sub_codice):''} ${fmt(i.data_intervento)}</div></div>
      ${i.prezzo?`<span style="font-size:10px;font-family:monospace;color:var(--accent);">€${parseFloat(i.prezzo).toLocaleString('it-IT',{maximumFractionDigits:0})}</span>`:''}
    </div>`).join(''):'<div style="color:var(--muted);font-size:11px;">Nessun intervento recente</div>';
  }

  // Notifiche rapide
  const notifQuick=document.getElementById('dash-notif-quick');
  if(notifQuick){
    const nn=notifNonLette.slice(0,4);
    notifQuick.innerHTML=nn.length?nn.map(n=>`<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;" onclick="showSection('notifiche')">
      <div style="width:7px;height:7px;border-radius:50%;background:${n.tipo==='urgente'?'var(--red)':n.tipo==='istat'?'#a3e635':'var(--orange)'};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;">${esc(n.titolo||n.tipo)}</div>
      ${n.giorni!==undefined?`<span style="font-size:9px;color:var(--muted);">${parseInt(n.giorni)<0?'Scaduto':parseInt(n.giorni)+'gg'}</span>`:''}
    </div>`).join('')+'<div style="margin-top:6px;"><button class="btn btn-xs btn-gray" onclick="showSection(&quot;notifiche&quot;)" style="width:100%;">Vedi tutte →</button></div>'
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
        <div style="width:100%;height:${h}px;background:linear-gradient(180deg,var(--accent),rgba(107,142,107,.4));border-radius:4px 4px 0 0;transition:all .2s;" onmouseover="this.style.background='linear-gradient(180deg,var(--accent),rgba(193,154,107,.4))'" onmouseout="this.style.background='linear-gradient(180deg,var(--accent),rgba(107,142,107,.4))'"></div>
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
      <div class="flex" style="margin-bottom:4px;">${sal} <strong style="color:#0f172a;font-size:13px;">${esc(s.codice)}</strong>${s.manutenzioni_aperte>0?`<span class="badge" style="background:rgba(184,134,11,.2);color:#7a5a08;margin-left:auto;">🔨${s.manutenzioni_aperte}</span>`:''}
      </div>
      <div style="font-size:11px;color:var(--muted);">${esc(s.sede_nome||'—')}</div>
      <div style="font-size:11px;color:var(--text);">${esc(s.inquilino_nome||'Libero')}</div>
      <div style="display:flex;justify-content:space-between;margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.05);">
        <span style="font-size:10px;color:var(--muted);">${s.num_interventi||0} int.</span>
        <span style="font-family:monospace;font-size:10px;font-weight:700;color:var(--accent);">${s.totale_spese?'€ '+parseFloat(s.totale_spese).toLocaleString('it-IT',{maximumFractionDigits:0}):'—'}</span>
      </div>
    </div>`;
  }).join('')||'<div class="empty">Nessun SUB ancora.</div>';

    await loadSettings();
}