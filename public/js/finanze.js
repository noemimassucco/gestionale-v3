'use strict';
// ═══════ FINANZE: INCASSI & USCITE (da data a data) ═══════

const _MESI_IT=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const _finEur=n=>'€ '+(Math.round(n||0)).toLocaleString('it-IT');
const _finDot=c=>`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px;"></span>`;
const _FONTE_LBL={intervento:'🔧 Intervento',manutenzione:'🔨 Manutenzione',bolletta:'⚡ Bolletta'};

function _finDefaultRange(){
  const oggi=new Date();
  const dal=new Date(oggi.getFullYear(),0,1);
  return [dal.toISOString().slice(0,10), oggi.toISOString().slice(0,10)];
}

function finPreset(tipo){
  const oggi=new Date(); let dal,al=oggi;
  if(tipo==='mese')dal=new Date(oggi.getFullYear(),oggi.getMonth(),1);
  else if(tipo==='trimestre')dal=new Date(oggi.getFullYear(),oggi.getMonth()-2,1);
  else if(tipo==='anno_prec'){dal=new Date(oggi.getFullYear()-1,0,1);al=new Date(oggi.getFullYear()-1,11,31);}
  else dal=new Date(oggi.getFullYear(),0,1);
  const f=d=>d.toISOString().slice(0,10);
  const iDal=document.getElementById('fin-dal'),iAl=document.getElementById('fin-al');
  if(iDal)iDal.value=f(dal); if(iAl)iAl.value=f(al);
  loadFinanze();
}

async function loadFinanze(){
  const iDal=document.getElementById('fin-dal'),iAl=document.getElementById('fin-al');
  if(iDal&&!iDal.value){const [d,a]=_finDefaultRange();iDal.value=d;if(iAl)iAl.value=a;}
  const dal=iDal?.value||'',al=iAl?.value||'';
  const lbl=document.getElementById('fin-lbl');
  if(lbl)lbl.textContent='Caricamento…';
  const r=await api(`/api/finanze?dal=${dal}&al=${al}`);
  if(!r||r.error){if(lbl)lbl.textContent='Errore: '+(r?.error||'dati non disponibili');return;}
  const fmtD=s=>{const d=new Date(s);return d.getDate()+' '+_MESI_IT[d.getMonth()]+' '+d.getFullYear();};
  if(lbl)lbl.textContent='Periodo: '+fmtD(r.dal)+' → '+fmtD(r.al);
  const t=r.totali||{};

  // ── KPI ──
  const kpi=[
    { l:'Entrate incassate', v:_finEur(t.entrate), col:'var(--success)',
      st:_finDot('var(--success)')+(r.entrate?.length||0)+' pagamenti registrati' },
    { l:'Uscite totali', v:_finEur(t.uscite), col:'var(--terra,#c2542e)',
      st:_finDot('var(--terra,#c2542e)')+_finEur(t.uscite_interventi)+' interventi · '+_finEur(t.uscite_manutenzioni)+' manut. · '+_finEur(t.uscite_bollette)+' bollette' },
    { l:'Netto del periodo', v:_finEur(t.netto), col:(t.netto||0)>=0?'var(--success)':'var(--danger)',
      st:_finDot((t.netto||0)>=0?'var(--success)':'var(--danger)')+((t.netto||0)>=0?'in attivo':'in perdita — controlla le unità sotto') },
    { l:'In ritardo / insoluti', v:_finEur(t.ritardi), col:(t.ritardi||0)>0?'var(--danger)':'var(--success)',
      st:(t.ritardi||0)>0?_finDot('var(--danger)')+(r.ritardi?.length||0)+' canoni da sollecitare':_finDot('var(--success)')+'tutto in regola' },
  ];
  const kEl=document.getElementById('fin-kpi');
  if(kEl)kEl.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:13px;">'
    +kpi.map(k=>`<div class="card" style="padding:16px 18px;">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:1.7px;color:var(--muted-2);font-weight:700;margin-bottom:8px;">${k.l}</div>
      <div class="wow-num" style="font-family:'Fraunces',serif;font-size:29px;font-weight:600;color:${k.col};line-height:1;margin-bottom:8px;">${k.v}</div>
      <div style="font-size:11px;color:var(--muted);">${k.st}</div>
    </div>`).join('')+'</div>';
  if(kEl&&typeof wowNumbers==='function')wowNumbers(kEl);

  // ── GRAFICO MENSILE (barre affiancate entrate/uscite) ──
  const cEl=document.getElementById('fin-chart');
  if(cEl){
    const mesi=Object.keys(r.perMese||{}).sort();
    if(!mesi.length){cEl.innerHTML='<p style="font-size:12px;color:var(--muted);padding:10px 0;">Nessun movimento nel periodo.</p>';}
    else{
      const max=Math.max(...mesi.map(m=>Math.max(r.perMese[m].entrate,r.perMese[m].uscite)),1);
      cEl.innerHTML='<div style="display:flex;align-items:flex-end;gap:14px;height:170px;padding:6px 2px 0;">'
        +mesi.map(m=>{
          const e=r.perMese[m].entrate,u=r.perMese[m].uscite;
          const [y,mm]=m.split('-');
          return `<div style="flex:1;min-width:46px;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end;" title="Entrate ${_finEur(e)} — Uscite ${_finEur(u)}">
            <div style="display:flex;align-items:flex-end;gap:4px;height:120px;">
              <div class="fin-bar" style="width:16px;border-radius:4px 4px 0 0;background:var(--success);height:${Math.max(Math.round(e/max*120),e>0?3:0)}px;"></div>
              <div class="fin-bar" style="width:16px;border-radius:4px 4px 0 0;background:var(--terra,#c2542e);height:${Math.max(Math.round(u/max*120),u>0?3:0)}px;animation-delay:.08s;"></div>
            </div>
            <div style="font-size:10.5px;color:var(--muted);white-space:nowrap;">${_MESI_IT[parseInt(mm,10)-1]} ${y.slice(2)}</div>
            <div style="font-size:10px;font-weight:600;color:${e-u>=0?'var(--success)':'var(--danger)'};white-space:nowrap;">${_finEur(e-u)}</div>
          </div>`;
        }).join('')+'</div>'
        +`<div style="display:flex;gap:16px;font-size:11px;color:var(--muted);margin-top:10px;">
          <span>${_finDot('var(--success)')}Entrate</span><span>${_finDot('var(--terra,#c2542e)')}Uscite</span></div>`;
    }
  }

  // ── PER SUB (peggiori in alto) ──
  const psEl=document.getElementById('fin-persub');
  if(psEl){
    const rows=(r.perSub||[]).filter(s=>s.entrate||s.uscite);
    psEl.innerHTML=!rows.length?'<p style="font-size:12px;color:var(--muted);">Nessun dato per unità nel periodo.</p>'
      :`<div class="table-wrap"><table style="width:100%;"><thead><tr>
          <th style="text-align:left;">SUB</th><th style="text-align:right;">Entrate</th>
          <th style="text-align:right;">Uscite</th><th style="text-align:right;">Netto</th></tr></thead><tbody>`
        +rows.map(s=>{
          const netto=s.entrate-s.uscite;
          const lblSub=s.codice==='Senza SUB'?'<span style="color:var(--muted);">Senza SUB</span>'
            :(typeof subLabelHtml==='function'?subLabelHtml({codice:s.codice,ex_sub:s.ex_sub}):esc(s.codice));
          const click=s.sub_id?`style="cursor:pointer;" onclick="openSubDetail(${s.sub_id})"`:'';
          return `<tr ${click}>
            <td>${lblSub}</td>
            <td style="text-align:right;color:var(--success);">${_finEur(s.entrate)}</td>
            <td style="text-align:right;color:var(--terra,#c2542e);">${_finEur(s.uscite)}</td>
            <td style="text-align:right;font-weight:700;color:${netto>=0?'var(--success)':'var(--danger)'};">${netto<0?'▼ ':''}${_finEur(netto)}</td>
          </tr>`;
        }).join('')+'</tbody></table></div>';
  }

  // ── RITARDI ──
  const rtEl=document.getElementById('fin-ritardi');
  if(rtEl){
    rtEl.innerHTML=!(r.ritardi||[]).length?'<p style="font-size:12px;color:var(--muted);">Nessun ritardo nel periodo 🎉</p>'
      :r.ritardi.map(p=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="min-width:0;">
            <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_MESI_IT[(p.mese||1)-1]} ${p.anno} — ${p.sub_codice?'SUB '+(typeof subLabel==='function'?esc(subLabel({codice:p.sub_codice,ex_sub:p.ex_sub})):esc(p.sub_codice)):'—'}</div>
            <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.inquilino_nome||'Inquilino non indicato')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span style="font-weight:700;color:var(--danger);font-size:13px;">${_finEur(parseFloat(p.importo)||0)}</span>
            <button class="btn btn-sm btn-gray" title="Invia sollecito" onclick="sollecitoAffitto(${p.id})">✉️</button>
          </div>
        </div>`).join('');
  }

  // ── ULTIME USCITE ──
  const usEl=document.getElementById('fin-uscite');
  if(usEl){
    usEl.innerHTML=!(r.uscite||[]).length?'<p style="font-size:12px;color:var(--muted);">Nessuna uscita nel periodo.</p>'
      :r.uscite.slice(0,25).map(u=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
          <div style="min-width:0;">
            <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_FONTE_LBL[u.fonte]||u.fonte} ${u.sub_codice?'· SUB '+esc(u.sub_codice):''}</div>
            <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc((u.descrizione||'').slice(0,70))} · ${fmtD(u.data_rif)}</div>
          </div>
          <span style="font-weight:700;color:var(--terra,#c2542e);font-size:12.5px;flex-shrink:0;">${_finEur(parseFloat(u.importo)||0)}</span>
        </div>`).join('');
  }
}
