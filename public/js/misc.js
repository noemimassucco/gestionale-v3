// ═══════════════════════════════════════════════════════════
// misc.js — remaining utility functions
// ═══════════════════════════════════════════════════════════

async function confirmPr(){pending.prezzo=document.getElementById('pr-quick').value;closeM('modal-pr');await checkDup(pending);}

async function checkDup(data){if(!editId){const r=await api('/api/interventi/check-duplicate',{method:'POST',body:JSON.stringify(data)});if(r?.duplicates?.length){pending=data;document.getElementById('dup-n').textContent=r.duplicates.length;document.getElementById('dup-list').innerHTML=r.duplicates.map(d=>`<div class="alert-item">📅 ${d.data_intervento?fmt(d.data_intervento):'—'} — ${esc((d.descrizione||'').slice(0,60))}${d.prezzo?` <strong class="text-gold">€ ${parseFloat(d.prezzo).toLocaleString('it-IT')}</strong>`:''}</div>`).join('');document.getElementById('modal-dup').classList.add('open');return;}}await doSave(data);}

async function forceS(){closeM('modal-dup');await doSave(pending);}

async function doSave(data){if(editId){await api('/api/interventi/'+editId,{method:'PUT',body:JSON.stringify(data)});toast('Aggiornato ✓');}else{await api('/api/interventi',{method:'POST',body:JSON.stringify(data)});toast('Salvato ✓');}closeM('modal-int');loadInt();}

async function upAll(input,intId){for(const f of input.files){const tipo=f.type.startsWith('image/')?'foto':f.name.toLowerCase().endsWith('.pdf')?'fattura':'documento';const fd=new FormData();fd.append('file',f);fd.append('intervento_id',intId);fd.append('tipo',tipo);toast('Caricamento…','warning');await apiUp('/api/allegati',fd);toast('Caricato ✓');}openDet(intId);}

async function delAll(alId,intId){if(!confirm('Eliminare allegato?'))return;await api('/api/allegati/'+alId,{method:'DELETE'});openDet(intId);}

function setAnaTab(tab,btn){['subs','fornitori','inquilini','sedi','categorie'].forEach(t=>document.getElementById('ana-'+t).style.display=t===tab?'':'none');document.querySelectorAll('#sec-anagrafiche .tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}

function autoMapZ(cols){const m={};const low=cols.map(c=>c.toLowerCase().trim());Object.entries(ZM).forEach(([f,vs])=>{for(const v of vs){const i=low.findIndex(c=>c.includes(v)||v.includes(c));if(i>=0){m[f]=cols[i];break;}}});return m;}



function gV(id){return(document.getElementById(id)?.value||'');}

function setRiepTab(tab, btn) {
  currentRiepTab = tab;
  document.querySelectorAll('#riep-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderRiepTab(tab);
}

async function renderRiep() {
  await loadDD();
  // Stats globali sempre visibili
  const dash = await api('/api/dashboard');
  if (!dash) return;
  const tot = parseFloat(dash.totali.totale_spese || 0);
  document.getElementById('riep-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Totale spese</div><div class="stat-value text-gold">€ ${tot.toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>
    <div class="stat-card"><div class="stat-label">Interventi</div><div class="stat-value">${dash.totali.num_interventi}</div></div>
    <div class="stat-card"><div class="stat-label">SUB gestiti</div><div class="stat-value">${dash.totali.num_subs}</div></div>
    <div class="stat-card"><div class="stat-label">Fornitori</div><div class="stat-value">${dash.totali.num_fornitori}</div></div>`;
  renderRiepTab(currentRiepTab);
}

async function renderRiepTab(tab) {
  const el = document.getElementById('riep-list');
  el.innerHTML = '<div class="empty" style="padding:20px;">Caricamento…</div>';

  if (tab === 'sub') {
    const data = await api('/api/riepilogo');
    if (!data) return;
    if (!data.length) { el.innerHTML='<div class="empty">Nessun SUB trovato. Aggiungili da Anagrafiche → SUB</div>'; return; }
    const bySede = {};
    data.forEach(d => { const s=d.sede||'Senza sede'; if(!bySede[s])bySede[s]=[]; bySede[s].push(d); });
    el.innerHTML = Object.entries(bySede).map(([sede, subs]) => {
      const sedeTot = subs.reduce((s,x)=>s+(parseFloat(x.totale)||0),0);
      return `<div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(90deg,rgba(37,99,235,.2),rgba(37,99,235,.05));border:1px solid rgba(37,99,235,.3);border-radius:10px 10px 0 0;">
          <span style="font-family:'Playfair Display',serif;font-size:16px;color:#0f172a;">📍 ${esc(sede)}</span>
          <span style="color:var(--gold);font-weight:700;">€ ${sedeTot.toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
        </div>
        <div style="border:1px solid rgba(37,99,235,.2);border-top:none;border-radius:0 0 10px 10px;padding:10px;">
          ${subs.map(d => `
            <div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="document.getElementById('ff-sub').value='${d.sub_id}';showSec('interventi',document.querySelectorAll('.nb')[0]);loadInt();">
              <div class="flex-between" style="margin-bottom:8px;">
                <div class="flex">
                  <span style="font-size:14px;">${d.stato_salute==='rosso'?'🔴':d.stato_salute==='giallo'?'🟡':'🟢'}</span>
                  <span style="font-family:'Playfair Display',serif;font-size:15px;color:#0f172a;font-weight:700;">SUB ${esc(d.sub||'N/D')}</span>
                  ${d.ex_sub?`<span class="ex-sub">ex ${esc(d.ex_sub)}</span>`:''}
                  ${d.inquilino?`<span style="color:var(--muted);font-size:11px;">👤 ${esc(d.inquilino)}</span>`:''}
                  ${!d.num_interventi?`<span style="font-size:10px;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:1px 7px;">Nessun intervento</span>`:''}
                </div>
                <div style="text-align:right;">
                  <div style="font-size:17px;font-weight:700;color:${d.totale>0?'var(--gold)':'var(--muted)'};">${d.totale>0?'€ '+parseFloat(d.totale).toLocaleString('it-IT',{minimumFractionDigits:2}):'—'}</div>
                  <div style="font-size:10px;color:var(--muted);">${d.num_interventi} intervent${d.num_interventi!==1?'i':'o'}</div>
                </div>
              </div>
              ${d.anni?.length?`<div style="font-size:10px;color:var(--muted);margin-bottom:7px;">Anni: ${d.anni.join(' · ')}</div>`:''}
              ${Object.entries(d.fornitori).length?`<div style="display:flex;gap:6px;flex-wrap:wrap;">${Object.entries(d.fornitori).sort((a,b)=>b[1]-a[1]).map(([fn,tot])=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:4px 9px;"><div style="font-size:9px;color:var(--muted);">${esc(fn)}</div><div style="font-weight:700;font-size:11px;">€ ${parseFloat(tot).toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>`).join('')}</div>`:''}</div>`).join('')}
        </div>
      </div>`;
    }).join('');

  } else if (tab === 'fornitore') {
    const data = await api('/api/riepilogo/fornitori');
    if (!data?.length) { el.innerHTML='<div class="empty">Nessun dato. Importa prima i fornitori e gli interventi.</div>'; return; }
    el.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Fornitore</th><th>Specializzazione</th><th>N° Interventi</th><th>SUB coinvolti</th><th>Primo intervento</th><th>Ultimo intervento</th><th>Totale fatturato</th></tr></thead>
          <tbody>${data.map((f,i)=>`<tr>
            <td style="font-size:12px;color:var(--muted);">${i+1}</td>
            <td class="td-bold">${esc(f.ragione_sociale)}</td>
            <td class="td-muted">${esc(f.spec||'—')}</td>
            <td style="text-align:center;">${f.num_interventi}</td>
            <td style="text-align:center;">${f.num_subs}</td>
            <td>${f.prima_data?fmt(f.prima_data):'—'}</td>
            <td>${f.ultima_data?fmt(f.ultima_data):'—'}</td>
            <td class="td-price" style="font-size:14px;">${f.totale?'€ '+parseFloat(f.totale).toLocaleString('it-IT',{minimumFractionDigits:2}):'—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;

  } else if (tab === 'anno') {
    const data = await api('/api/riepilogo/anni');
    if (!data?.anni?.length) { el.innerHTML='<div class="empty">Nessun dato. Importa prima gli interventi.</div>'; return; }
    const maxTot = Math.max(...data.anni.map(a=>a.totale));
    el.innerHTML = data.anni.map(a => {
      const pct = maxTot > 0 ? (a.totale/maxTot*100) : 0;
      const mesiAnno = data.mesi.filter(m=>m.anno===a.anno);
      const nomiMesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
      return `<div class="card" style="margin-bottom:12px;">
        <div class="flex-between" style="margin-bottom:12px;">
          <div class="flex">
            <span style="font-family:'Playfair Display',serif;font-size:20px;color:#0f172a;font-weight:700;">${a.anno}</span>
            <span style="color:var(--muted);font-size:12px;">${a.num_interventi} interventi · ${a.num_subs} SUB · ${a.num_fornitori} fornitori</span>
          </div>
          <span style="font-size:22px;font-weight:700;color:var(--gold);">€ ${parseFloat(a.totale).toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
        </div>
        <div style="height:8px;background:var(--border);border-radius:4px;margin-bottom:10px;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--gold));border-radius:4px;transition:width .5s;"></div>
        </div>
        ${mesiAnno.length?`<div style="display:flex;gap:4px;flex-wrap:wrap;">${mesiAnno.map(m=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:4px 8px;min-width:70px;"><div style="font-size:9px;color:var(--muted);">${nomiMesi[(m.mese||1)-1]||m.mese}</div><div style="font-size:11px;font-weight:700;">€ ${parseFloat(m.totale).toLocaleString('it-IT',{maximumFractionDigits:0})}</div><div style="font-size:9px;color:var(--muted);">${m.num} int.</div></div>`).join('')}</div>`:''}</div>`;
    }).join('');

  } else if (tab === 'mese') {
    const data = await api('/api/riepilogo/mesi');
    if (!data?.length) { el.innerHTML='<div class="empty">Nessun dato mensile. Assicurati che gli interventi abbiano la data fattura compilata.</div>'; return; }
    const maxTot = Math.max(...data.map(m=>m.totale));
    el.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="table-wrap"><table>
          <thead><tr><th>Mese</th><th>N° Interventi</th><th>Totale</th><th>Andamento</th></tr></thead>
          <tbody>${data.map(m=>{
            const pct = maxTot>0?(m.totale/maxTot*100):0;
            return`<tr>
              <td class="td-bold">${esc(m.etichetta?.trim()||m.mese_anno)}</td>
              <td style="text-align:center;">${m.num_interventi}</td>
              <td class="td-price">€ ${parseFloat(m.totale).toLocaleString('it-IT',{minimumFractionDigits:2})}</td>
              <td style="min-width:150px;">
                <div style="height:6px;background:var(--border);border-radius:3px;">
                  <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;"></div>
                </div>
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;

  } else if (tab === 'sede') {
    const data = await api('/api/riepilogo/sedi');
    if (!data?.length) { el.innerHTML='<div class="empty">Nessuna sede trovata.</div>'; return; }
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">` +
      data.map(s=>`<div class="card">
        <div style="font-family:'Playfair Display',serif;font-size:18px;color:#0f172a;margin-bottom:12px;">📍 ${esc(s.sede||'—')}</div>
        <div style="font-size:26px;font-weight:700;color:var(--gold);margin-bottom:8px;">€ ${parseFloat(s.totale).toLocaleString('it-IT',{minimumFractionDigits:2})}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div style="text-align:center;background:var(--surface2);border-radius:7px;padding:8px;"><div style="font-size:18px;font-weight:700;">${s.num_interventi}</div><div style="font-size:9px;color:var(--muted);">Interventi</div></div>
          <div style="text-align:center;background:var(--surface2);border-radius:7px;padding:8px;"><div style="font-size:18px;font-weight:700;">${s.num_subs}</div><div style="font-size:9px;color:var(--muted);">SUB</div></div>
          <div style="text-align:center;background:var(--surface2);border-radius:7px;padding:8px;"><div style="font-size:18px;font-weight:700;">${s.num_fornitori}</div><div style="font-size:9px;color:var(--muted);">Fornitori</div></div>
        </div>
      </div>`).join('') + `</div>`;
  } else if (tab === 'redditivita') {
    const data = await api('/api/redditivita');
    if (!data) return;
    const tot = data.totali || {};
    el.innerHTML = `
      <!-- Totali globali -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px;">
        <div style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:10px;padding:16px;">
          <div style="font-size:10px;color:var(--green);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Entrate totali</div>
          <div style="font-size:22px;font-weight:700;color:var(--green);font-family:monospace;">€ ${tot.entrate?.toLocaleString('it-IT',{minimumFractionDigits:2})||'0,00'}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">Da affitti registrati</div>
        </div>
        <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:16px;">
          <div style="font-size:10px;color:var(--red);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Uscite totali</div>
          <div style="font-size:22px;font-weight:700;color:var(--red);font-family:monospace;">€ ${tot.uscite?.toLocaleString('it-IT',{minimumFractionDigits:2})||'0,00'}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">Interventi + manutenzioni</div>
        </div>
        <div style="background:${tot.profitto>=0?'rgba(16,185,129,.1)':'rgba(239,68,68,.1)'};border:1px solid ${tot.profitto>=0?'rgba(16,185,129,.25)':'rgba(239,68,68,.25)'};border-radius:10px;padding:16px;">
          <div style="font-size:10px;color:${tot.profitto>=0?'var(--green)':'var(--red)'};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Profitto netto</div>
          <div style="font-size:22px;font-weight:700;color:${tot.profitto>=0?'var(--green)':'var(--red)'};font-family:monospace;">${tot.profitto>=0?'+':''}€ ${tot.profitto?.toLocaleString('it-IT',{minimumFractionDigits:2})||'0,00'}</div>
        </div>
        ${tot.entrate===0?`<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:16px;"><div style="font-size:12px;color:var(--gold);">💡 Registra gli affitti nelle schede SUB per vedere la redditività reale.</div></div>`:''}
      </div>

      <!-- Tabella per SUB -->
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="table-wrap"><table>
          <thead><tr><th>SUB</th><th>Sede</th><th>Inquilino</th><th>Stato</th><th>Entrate</th><th>Uscite</th><th>Profitto</th><th>Redditività</th></tr></thead>
          <tbody>${(data.subs||[]).map(s=>{
            const prof = s.profitto_netto;
            const profColor = prof > 0 ? 'var(--green)' : prof < 0 ? 'var(--red)' : 'var(--muted)';
            const pct = s.entrate_totali > 0 ? Math.round(prof/s.entrate_totali*100) : null;
            return `<tr class="sub-row-click" onclick="openSubDetail(${s.id})">
              <td class="td-bold">${esc(s.codice)}</td>
              <td><span class="badge badge-sede">${esc(s.sede||'—')}</span></td>
              <td style="font-size:12px;">${esc(s.inquilino||'—')}</td>
              <td>${s.stato_occupazione?`<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${s.stato_occupazione==='occupato'?'rgba(16,185,129,.15)':'rgba(100,116,139,.15)'};color:${s.stato_occupazione==='occupato'?'var(--green)':'var(--muted)'};">${s.stato_occupazione}</span>`:'—'}</td>
              <td style="color:var(--green);font-family:monospace;font-size:12px;">${s.entrate_totali>0?'€ '+s.entrate_totali.toLocaleString('it-IT',{maximumFractionDigits:0}):'—'}</td>
              <td style="color:var(--red);font-family:monospace;font-size:12px;">€ ${s.uscite_totali.toLocaleString('it-IT',{maximumFractionDigits:0})}</td>
              <td style="color:${profColor};font-family:monospace;font-weight:700;font-size:12px;">${prof!==0?`${prof>0?'+':''}€ ${prof.toLocaleString('it-IT',{maximumFractionDigits:0})}`:'—'}</td>
              <td>${pct!==null?`<div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;height:6px;background:var(--border);border-radius:3px;"><div style="height:100%;width:${Math.min(100,Math.abs(pct))}%;background:${pct>=0?'var(--green)':'var(--red)'};border-radius:3px;"></div></div><span style="font-size:10px;color:${profColor};">${pct}%</span></div>`:'—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
  }
}

async function extractAllPrices() {
  if(!confirm('Scansiono tutte le descrizioni degli interventi senza prezzo e cerco importi in euro. Continuare?')) return;
  toast('Estrazione in corso…','warning');
  const r = await api('/api/interventi/extract-prices',{method:'POST'});
  toast(`✓ Estratti ${r?.updated||0} prezzi dalle descrizioni`,'success');
  loadInt();
  if(currentRiepTab) renderRiepTab(currentRiepTab);
}

function globalSearch(q){clearTimeout(sT);if(!q||q.length<2){document.getElementById('srch-res').classList.add('hidden');return;}sT=setTimeout(async()=>{const r=await api('/api/search?q='+encodeURIComponent(q));if(!r)return;const el=document.getElementById('srch-res');if(!r.interventi.length&&!r.subs.length&&!r.fornitori.length){el.innerHTML='<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;">Nessun risultato</div>';}else{el.innerHTML='';if(r.interventi.length)el.innerHTML+=`<div class="sr-sec">Interventi</div>`+r.interventi.map(i=>`<div class="sr-item" onclick="closeS();openDet(${i.id})"><span>📋</span><div><strong style="font-size:11px;">${esc(i.sub||'?')} — ${esc(i.fornitore||'?')}</strong><div style="font-size:10px;color:var(--muted);">${esc((i.descrizione||'').slice(0,55))}</div></div>${i.prezzo?`<span class="td-price" style="font-size:11px;margin-left:auto;">€ ${parseFloat(i.prezzo).toLocaleString('it-IT')}</span>`:''}</div>`).join('');if(r.subs.length)el.innerHTML+=`<div class="sr-sec">SUB</div>`+r.subs.map(s=>`<div class="sr-item" onclick="closeS();document.getElementById('ff-sub').value=${s.id};loadInt();">🏠 <strong>${esc(s.codice)}</strong>${s.ex_sub?` (ex ${s.ex_sub})`:''} <span style="color:var(--muted);font-size:10px;">${esc(s.sede||'')} ${esc(s.inquilino||'')}</span></div>`).join('');if(r.fornitori.length)el.innerHTML+=`<div class="sr-sec">Fornitori</div>`+r.fornitori.map(f=>`<div class="sr-item" onclick="closeS();document.getElementById('ff-forn').value=${f.id};loadInt();">🔧 <strong>${esc(f.ragione_sociale)}</strong></div>`).join('');}el.classList.remove('hidden');},280);}

function closeS(){document.getElementById('srch-res').classList.add('hidden');document.getElementById('global-search').value='';}

function closeSearch(){closeS();}

async function saveSettings(){const v=id=>document.getElementById(id)?.value||'';const settings={app_name:v('s-nome')||'Gestionale Immobili',footer_text:v('s-footer')};await api('/api/settings',{method:'POST',body:JSON.stringify({settings})});await loadSettings();toast('Salvato ✓');}

async function changePwd(){const v=id=>document.getElementById(id)?.value||'';const o=v('pwd-old'),n1=v('pwd-new'),n2=v('pwd-c');if(n1!==n2){toast('Le password non coincidono','error');return;}if(n1.length<4){toast('Minimo 4 caratteri','error');return;}const r=await api('/api/auth/change-password',{method:'POST',body:JSON.stringify({oldPassword:o,newPassword:n1})});if(r?.ok){['pwd-old','pwd-new','pwd-c'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});toast('Password aggiornata ✓');}else toast('Password attuale errata','error');}

function openModalUser(){document.getElementById('modal-user').classList.add('open');}

function showSec(name,btn){
  document.querySelectorAll('#app-main .section').forEach(s=>s.classList.remove('active'));
  
  document.getElementById('sec-'+name)?.classList.add('active');
  if(btn)btn.classList.add('active');
  if(name==='riepilogo') renderRiep();
  if(name==='impostazioni') loadUsers();
  if(name==='anagrafiche') loadDD();
  if(name==='documenti'){
    document.getElementById('df-sub').innerHTML='<option value="">Tutti</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
    document.getElementById('df-sede').innerHTML='<option value="">Tutte</option>'+DB.sedi.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
    loadDocs();
  }
  if(name==='manutenzioni'){
    document.getElementById('mf-sub').innerHTML='<option value="">Tutti</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
    document.getElementById('mf-sede').innerHTML='<option value="">Tutte</option>'+DB.sedi.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
    loadMan();
  }
}

async function runOCR(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('ocr-status');
  status.style.display = 'block';
  status.textContent = '⏳ L\'AI sta leggendo la fattura…';

  const fd = new FormData();
  fd.append('file', file);

  try {
    const r = await apiUp('/api/ocr', fd);
    if (!r.ok) {
      status.textContent = '❌ ' + (r.error || 'Errore lettura');
      return;
    }
    const d = r.data;
    status.textContent = '✅ Dati estratti! Verifica e completa i campi mancanti.';
    status.style.color = 'var(--green)';

    // Popola i campi del form
    if (d.num_fattura) document.getElementById('fi-nf').value = d.num_fattura;
    if (d.data_fattura) {
      const df = parseOCRDate(d.data_fattura);
      if (df) document.getElementById('fi-df').value = df;
    }
    if (d.data_intervento) {
      const di = parseOCRDate(d.data_intervento);
      if (di) document.getElementById('fi-di').value = di;
    }
    if (d.protocollo) document.getElementById('fi-prot').value = d.protocollo;
    if (d.importo) {
      const imp = String(d.importo).replace(/[€\s.]/g,'').replace(',','.');
      const num = parseFloat(imp);
      if (!isNaN(num)) document.getElementById('fi-pr').value = num.toFixed(2);
    }
    if (d.descrizione) document.getElementById('fi-desc').value = d.descrizione;
    if (d.note) document.getElementById('fi-note').value = d.note;

    // Anno fattura
    const dfVal = document.getElementById('fi-df').value;
    if (dfVal) document.getElementById('fi-anno').value = dfVal.split('-')[0];

    // Prova a matchare fornitore
    if (d.fornitore) {
      const norm = s => (s||'').toLowerCase().trim();
      const fornM = DB.fornitori.find(f =>
        norm(f.ragione_sociale).includes(norm(d.fornitore)) ||
        norm(d.fornitore).includes(norm(f.ragione_sociale))
      );
      if (fornM) {
        document.getElementById('fi-forn').value = fornM.id;
        status.textContent += ` Fornitore trovato: ${fornM.ragione_sociale}.`;
      } else {
        status.textContent += ` ⚠️ Fornitore "${d.fornitore}" non trovato in anagrafica — aggiungilo prima.`;
      }
    }
    // Prova a matchare SUB
    if (d.sub) {
      const norm = s => (s||'').toLowerCase().trim();
      const subM = DB.subs.find(s => norm(s.codice) === norm(d.sub) || norm(s.ex_sub||'') === norm(d.sub));
      if (subM) {
        const sede = DB.sedi.find(sd => sd.id === subM.sede_id);
        if (sede) { document.getElementById('fi-sede').value = sede.id; filterSubBySede(); }
        document.getElementById('fi-sub').value = subM.id;
      }
    }
    toast('✅ Form compilato da AI!');
  } catch(e) {
    status.textContent = '❌ Errore: ' + e.message;
    status.style.color = 'var(--red)';
  }
  input.value = '';
}

function parseOCRDate(s) {
  if (!s) return '';
  s = String(s).trim();
  // gg/mm/aaaa
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s.split('/').reverse().join('-');
  // gg-mm-aaaa
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) { const p=s.split('-'); return `${p[2]}-${p[1]}-${p[0]}`; }
  // aaaa-mm-gg
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // gg/mm/aa
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) { const [dd,mm,yy]=s.split('/'); return `20${yy}-${mm}-${dd}`; }
  return '';
}

function openImportSub() {
  subImportRows = []; subImportMap = {};
  document.getElementById('sub-import-s1').style.display = '';
  document.getElementById('sub-import-s2').style.display = 'none';
  document.getElementById('sub-import-ok').style.display = 'none';
  document.getElementById('subFile').value = '';
  document.getElementById('modal-sub-import').classList.add('open');
}

async function editMan(id){
  const data=await api('/api/manutenzioni');
  const m=(data||[]).find(x=>x.id==id);if(!m)return;
  manEditId=id;document.getElementById('m-man-ttl').textContent='Modifica Manutenzione';
  openModalMan();
  const s=id2=>document.getElementById(id2);
  s('man-tipo').value=m.tipo||'';s('man-prior').value=m.priorita||'normale';s('man-stato').value=m.stato||'programmata';
  s('man-sub').value=m.sub_id||'';s('man-sede').value=m.sede_id||'';s('man-forn').value=m.fornitore_id||'';
  s('man-data-prog').value=m.data_programmata?String(m.data_programmata).split('T')[0]:'';
  s('man-data-eseg').value=m.data_eseguita?String(m.data_eseguita).split('T')[0]:'';
  s('man-ric').value=m.ricorrenza||'';s('man-costo').value=m.costo||'';
  s('man-desc').value=m.descrizione||'';s('man-note').value=m.note||'';
}

async function completaMan(id){await api('/api/manutenzioni/'+id,{method:'PUT',body:JSON.stringify({stato:'completata',data_eseguita:new Date().toISOString().split('T')[0]})});loadMan();toast('✓ Completata');}

function calcolaIstat(){
  const imp=parseFloat(document.getElementById('istat-imp').value);
  const pct=parseFloat(document.getElementById('istat-pct').value)||1.5;
  const tipo=document.getElementById('istat-tipo').value;
  if(!imp||isNaN(imp)){toast('Inserisci il canone annuo','error');return;}
  const pctEff=tipo==='abitativo'?pct*0.75:pct;
  const aumento=imp*pctEff/100;
  const nuovo=imp+aumento;
  const el=document.getElementById('istat-result');
  el.style.display='block';
  el.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">
    <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">% applicata</div><div style="font-size:18px;font-weight:700;color:var(--accent);">${pctEff.toFixed(2)}%</div><div style="font-size:10px;color:var(--muted);">${tipo==='abitativo'?'(75% del '+pct+'%)':'(100%)'}</div></div>
    <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Aumento annuo</div><div style="font-size:18px;font-weight:700;color:var(--gold);">€ ${aumento.toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>
    <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Nuovo canone/anno</div><div style="font-size:18px;font-weight:700;color:var(--green);">€ ${nuovo.toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>
    <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Nuovo canone/mese</div><div style="font-size:18px;font-weight:700;color:var(--green);">€ ${(nuovo/12).toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>
  </div>
  <div style="margin-top:10px;padding:9px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:7px;font-size:11px;color:var(--muted);">⚠️ Verifica il valore ISTAT FOI aggiornato su <a href="https://www.istat.it" target="_blank" style="color:var(--accent);">istat.it</a></div>`;
}

function subSelAll(v) { if(v===false){subSelIds.clear();}else{DB.subs.forEach(s=>subSelIds.add(s.id));} document.getElementById('sub-mass-cnt').textContent=`${subSelIds.size} selezionati`; renderTbSubs(); }

function subDeselAll() { subSelIds.clear(); document.getElementById('sub-mass-cnt').textContent='0 selezionati'; renderTbSubs(); }

function setSubDetTab(tab,btn){
  subDetTab=tab;
  document.querySelectorAll('#sub-det-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderSubDetTab(tab);
}

async function renderSubDetTab(tab) {
  const data=currentSubData; if(!data)return;
  const s=data.sub;
  const el=document.getElementById('sub-det-content');
  const df=(v)=>v?`<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:3px;">${v[0]}</div><div style="font-size:13px;color:var(--text);font-weight:500;">${v[1]}</div>`:'';
  const card=(label,val,big=false)=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 14px;"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">${label}</div><div style="font-size:${big?'20px':'13px'};color:${big?'var(--gold)':'var(--text)'};font-weight:${big?700:500};${big?'font-family:monospace;':''}">${val}</div></div>`;
  const sec=(t)=>`<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 8px;font-weight:600;">${t}</div>`;

  if(tab==='identita'){    let istatAlert='';
    if(s.data_inizio_contratto&&s.canone_annuo){
      const inizio=new Date(s.data_inizio_contratto),oggi=new Date();
      const mesi=(oggi.getFullYear()-inizio.getFullYear())*12+(oggi.getMonth()-inizio.getMonth());
      if(mesi>=12){const pct=s.tipo_contratto==='abitativo'?1.125:1.5;const aum=parseFloat(s.canone_annuo)*pct/100;istatAlert=`<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:12px 14px;font-size:12px;color:#fcd34d;margin-bottom:12px;">📈 <strong>ISTAT dovuto!</strong> Contratto del ${fmt(s.data_inizio_contratto)} (${mesi} mesi fa). Aumento stimato: +€ ${aum.toLocaleString('it-IT',{minimumFractionDigits:2})}/anno (${pct}% FOI). <button class="btn btn-sm" style="background:rgba(245,158,11,.2);color:#fcd34d;border:1px solid rgba(245,158,11,.4);margin-left:8px;" onclick="showSec('catasto',null)">Calcola ISTAT →</button></div>`;}
    }else if(!s.data_inizio_contratto||!s.canone_annuo){
      istatAlert=`<div style="background:rgba(100,116,139,.08);border:1px solid rgba(100,116,139,.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--muted);margin-bottom:12px;">ℹ️ Aggiungi <strong style="color:var(--text);">data inizio contratto</strong> e <strong style="color:var(--text);">canone annuo</strong> per il calcolo ISTAT automatico. <button class="btn btn-sm btn-gray" onclick="closeM('modal-sub-det');openAnaById('sub',currentSubId);" style="margin-left:8px;">Completa dati →</button></div>`;
    }
    const grid=(fields)=>`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:9px;margin-bottom:4px;">${fields.filter(Boolean).join('')}</div>`;
    el.innerHTML=`${istatAlert}
      ${sec('Identificazione')}
      ${grid([card('Codice SUB',esc(s.codice)),card('Sede',esc(s.sede_nome||'—')),s.piano?card('Piano',esc(s.piano)):null,s.indirizzo_completo?card('Indirizzo',esc(s.indirizzo_completo)):null,card('Stato',esc(s.stato_occupazione||'—')),s.ex_sub?card('Ex SUB',esc(s.ex_sub)):null])}
      ${sec('Inquilino')}
      ${grid([card('Ragione sociale',esc(s.inquilino_nome||'Nessun inquilino')),s.inquilino_tel?card('Telefono','📞 '+esc(s.inquilino_tel)):null,s.inquilino_email?card('Email','✉️ '+esc(s.inquilino_email)):null])}
      ${(s.foglio||s.particella||s.categoria_cat||s.mq_commerciali||s.rendita)?sec('Dati catastali'):''}
      ${(s.foglio||s.particella||s.categoria_cat||s.mq_commerciali||s.rendita)?grid([s.foglio?card('Foglio',esc(s.foglio)):null,s.particella?card('Particella',esc(s.particella)):null,s.subalterno?card('Subalterno',esc(s.subalterno)):null,s.categoria_cat?card('Categoria cat.',esc(s.categoria_cat)):null,s.mq_commerciali?card('mq commerciali',parseFloat(s.mq_commerciali).toFixed(1)+' mq'):null,s.mq_calpestabili?card('mq calpestabili',parseFloat(s.mq_calpestabili).toFixed(1)+' mq'):null,s.rendita?card('Rendita','€ '+parseFloat(s.rendita).toLocaleString('it-IT')):null,s.classe_energetica?card('Classe energ.',esc(s.classe_energetica)):null]):''}
      ${(s.data_inizio_contratto||s.canone_annuo)?sec('Contratto locazione'):''}
      ${(s.data_inizio_contratto||s.canone_annuo)?grid([s.data_inizio_contratto?card('Data inizio',fmt(s.data_inizio_contratto)):null,s.canone_annuo?card('Canone annuo','€ '+parseFloat(s.canone_annuo).toLocaleString('it-IT',{minimumFractionDigits:2}),true):null,s.canone_annuo?card('Canone mensile','€ '+(parseFloat(s.canone_annuo)/12).toLocaleString('it-IT',{minimumFractionDigits:2})):null,s.tipo_contratto?card('Tipo',esc(s.tipo_contratto)):null,s.durata_contratto_anni?card('Durata',s.durata_contratto_anni+' anni'):null]):''}
      ${s.note?sec('Note')+'<div style="font-size:13px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:12px 14px;">'+esc(s.note)+'</div>':''}`;

  }else if(tab==='economico'){
    el.innerHTML=renderTabEconomico(data);
  }else if(tab==='inquilini'){
    el.innerHTML=renderTabInquilini(data);
  }else if(tab==='interventi'){
    const items=data.interventi||[];
    el.innerHTML=`<div class="flex-between" style="margin-bottom:12px;"><span style="font-size:13px;color:var(--muted);">${items.length} interventi totali — € ${items.reduce((s,x)=>s+(parseFloat(x.prezzo)||0),0).toLocaleString('it-IT',{maximumFractionDigits:0})}</span><button class="btn btn-primary btn-sm" onclick="closeM('modal-sub-det');openModalInt();">+ Nuovo intervento</button></div>
      ${items.length?items.map(i=>`<div class="int-card" onclick="closeM('modal-sub-det');openDet(${i.id});" style="margin-bottom:8px;cursor:pointer;">
        <div class="int-card-hdr">${i.icona||'🔧'} <strong style="font-size:13px;color:#0f172a;">${esc(i.fornitore_nome||'—')}</strong>${i.categoria_nome?`<span style="font-size:11px;color:var(--muted);">${esc(i.categoria_nome)}</span>`:''}${i.ha_notifica?`<span class="badge badge-warn">⚠️</span>`:''}<span class="td-price" style="margin-left:auto;">${i.prezzo?'€ '+parseFloat(i.prezzo).toLocaleString('it-IT',{minimumFractionDigits:2}):'—'}</span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;">${i.data_intervento?fmt(i.data_intervento):'—'} — ${esc((i.descrizione||'').slice(0,100))}</div>
      </div>`).join(''):'<div class="empty">Nessun intervento.</div>'}`;

  }else if(tab==='documenti'){
    const items=data.documenti||[];
    const icons={fattura:'🧾',contratto:'📄',preventivo:'💼',verbale:'📋',bolletta:'⚡',catastale:'🏛️'};
    el.innerHTML=`<div class="flex-between" style="margin-bottom:12px;"><span style="font-size:13px;color:var(--muted);">${items.length} documenti</span><button class="btn btn-primary btn-sm" onclick="closeM('modal-sub-det');openModalDoc();">+ Nuovo documento</button></div>
      ${items.length?items.map(d=>`<div class="doc-card"><div class="doc-icon">${icons[d.tipo]||'📂'}</div><div class="doc-info"><div class="doc-nome">${esc(d.nome)}</div><div class="doc-meta">${d.tipo}${d.data_documento?' · '+fmt(d.data_documento):''}${d.importo?' · € '+parseFloat(d.importo).toLocaleString('it-IT'):''}${d.fornitore_nome?' · '+esc(d.fornitore_nome):''}</div></div>${d.scadenza?`<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(245,158,11,.2);color:#fcd34d;">Scade ${fmt(d.scadenza)}</span>`:''}${d.url?`<a href="${d.url}" target="_blank" class="btn btn-edit btn-sm">👁</a>`:''}</div>`).join(''):'<div class="empty">Nessun documento.</div>'}`;

  }else if(tab==='bollette'){
    el.innerHTML='<div class="empty" style="padding:20px;">Caricamento bollette…</div>';
    const bolls=await api('/api/bollette?sub_id='+currentSubId);
    const ICONS2={luce:'⚡',gas:'🔥',acqua:'💧',internet:'🌐',rifiuti:'♻️',condominio:'🏢',altro:'📄'};
    el.innerHTML=`<div class="flex-between" style="margin-bottom:12px;"><span style="font-size:13px;color:var(--muted);">${(bolls||[]).length} bollette</span><button class="btn btn-primary btn-sm" onclick="openModalBoll(${currentSubId})">+ Nuova bolletta</button></div>
      ${!(bolls||[]).length?'<div class="empty">Nessuna bolletta per questo SUB.</div>':
      (bolls||[]).map(b=>`<div class="boll-card">
        <div class="boll-icon">${ICONS2[b.tipo]||'📄'}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(b.tipo.charAt(0).toUpperCase()+b.tipo.slice(1))} ${b.fornitore_nome?'— '+esc(b.fornitore_nome):''}</div>
          <div style="font-size:11px;color:var(--muted);">${b.periodo_dal?fmt(b.periodo_dal)+' → '+fmt(b.periodo_al):''}${b.scadenza?' · Scade '+fmt(b.scadenza):''}</div>
        </div>
        ${b.importo?`<div class="td-price">€ ${parseFloat(b.importo).toLocaleString('it-IT',{minimumFractionDigits:2})}</div>`:''}
        <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${b.stato==='pagato'?'rgba(16,185,129,.15)':'rgba(239,68,68,.15)'};color:${b.stato==='pagato'?'var(--green)':'var(--red)'};">${b.stato==='pagato'?'✅ Pagato':'Da pagare'}</span>
        ${b.url?`<a href="${b.url}" target="_blank" class="btn btn-edit btn-sm">👁</a>`:''}
        ${b.stato!=='pagato'?`<button class="btn btn-success btn-sm" onclick="pagaBolletta(${b.id})">✓</button>`:''}
      </div>`).join('')}`;
  }else if(tab==='manutenzioni'){
    const items=data.manutenzioni||[];
    const pc={urgente:'var(--red)',alta:'var(--orange)',normale:'var(--gold)',bassa:'var(--green)'};
    const pi={urgente:'🔴',alta:'🟠',normale:'🟡',bassa:'🟢'};
    el.innerHTML=`<div class="flex-between" style="margin-bottom:12px;"><span style="font-size:13px;color:var(--muted);">${items.length} manutenzioni</span><button class="btn btn-primary btn-sm" onclick="closeM('modal-sub-det');openModalMan();">+ Nuova</button></div>
      ${items.length?items.map(m=>`<div class="int-card" style="border-left:3px solid ${pc[m.priorita]||'var(--border)'};margin-bottom:8px;"><div class="int-card-hdr">${pi[m.priorita]||'⚪'} <strong style="font-size:13px;color:#0f172a;">${esc(m.tipo)}</strong><span style="font-size:11px;padding:2px 8px;border-radius:5px;background:var(--surface2);color:var(--muted);">${m.stato||'—'}</span>${m.costo?`<span class="td-price" style="margin-left:auto;">€ ${parseFloat(m.costo).toLocaleString('it-IT')}</span>`:''}</div><div style="font-size:11px;color:var(--muted);margin-top:4px;">${m.prossima_scadenza?'Prossima: '+fmt(m.prossima_scadenza)+' · ':''}${esc(m.ricorrenza||'Una tantum')}${m.fornitore_nome?' · '+esc(m.fornitore_nome):''}</div></div>`).join(''):'<div class="empty">Nessuna manutenzione.</div>'}`;

  }else if(tab==='costi'){
    const anni=data.costiAnno||[],forn=data.costiFornitore||[],tot=parseFloat(s.totale_spese||0);
    el.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Spese totali</div><div style="font-size:22px;font-weight:700;color:var(--gold);font-family:monospace;">€ ${tot.toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Interventi totali</div><div style="font-size:22px;font-weight:700;color:var(--text);">${s.num_interventi||0}</div></div>
    </div>
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;font-weight:600;">Per anno</div>
    ${anni.length?anni.map(a=>{const pct=tot>0?parseFloat(a.totale)/tot*100:0;return`<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;"><span style="min-width:50px;font-family:monospace;font-size:12px;color:var(--text);">${a.anno}</span><div style="flex:1;height:8px;background:var(--border);border-radius:4px;"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--gold));border-radius:4px;"></div></div><span style="font-family:monospace;font-size:12px;font-weight:700;color:var(--gold);min-width:100px;text-align:right;">€ ${parseFloat(a.totale).toLocaleString('it-IT',{maximumFractionDigits:0})}</span><span style="font-size:10px;color:var(--muted);">${a.num} int.</span></div>`;}).join(''):'<div style="color:var(--muted);font-size:12px;padding:8px 0;">Nessun dato</div>'}
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 10px;font-weight:600;">Per fornitore</div>
    ${forn.length?forn.map(f=>`<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;margin-bottom:7px;"><span style="flex:1;font-size:13px;">🔧 ${esc(f.fornitore||'—')}</span><span style="font-size:11px;color:var(--muted);">${f.num} int.</span><span style="font-family:monospace;font-weight:700;color:var(--gold);">€ ${parseFloat(f.totale).toLocaleString('it-IT',{maximumFractionDigits:0})}</span></div>`).join(''):'<div style="color:var(--muted);font-size:12px;padding:8px 0;">Nessun dato</div>'}`;

  }else if(tab==='scadenze'){
    const items=data.scadenze||[];
    el.innerHTML=items.length?`<div style="display:flex;flex-direction:column;gap:8px;">${items.map(sc=>{const gg=parseInt(sc.giorni);const col=gg<0?'var(--red)':gg<30?'var(--orange)':gg<90?'var(--gold)':'var(--green)';return`<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-left:3px solid ${col};border-radius:8px;"><span style="font-size:18px;">${sc.tipo==='documento'?'📄':'🔨'}</span><div style="flex:1;"><div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(sc.nome)}</div><div style="font-size:11px;color:var(--muted);">${esc(sc.tipo)} · ${fmt(sc.scadenza)}</div></div><span style="font-weight:700;color:${col};font-size:12px;">${gg<0?`Scaduto ${-gg}gg fa`:gg===0?'Scade oggi':`${gg} giorni`}</span></div>`;}).join('')}</div>` : '<div class="empty">Nessuna scadenza imminente 🎉</div>';

  }else if(tab==='genealogia'){
    el.innerHTML='<div class="empty" style="padding:20px;">Caricamento genealogia…</div>';
    const gen = await api('/api/subs/'+currentSubId+'/genealogia');
    if(!gen){el.innerHTML='<div class="empty">Errore caricamento</div>';return;}
    const s = gen.sub;
    const sal = s?.stato_salute==='rosso'?'🔴':s?.stato_salute==='giallo'?'🟡':'🟢';
    const salPadre = (ss)=>ss==='rosso'?'🔴':ss==='giallo'?'🟡':'🟢';
    const tipoLabel = {scissione:'✂️ Scissione',fusione:'🔗 Fusione',fusione_origine:'🔗 Origine fusione'};
    el.innerHTML=`
      <div style="text-align:center;padding:20px 0;">
        ${gen.padri.length?`<div style="margin-bottom:16px;">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">Deriva da</div>
          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            ${gen.padri.map(p=>`
              <div style="text-align:center;">
                <div class="tree-node" onclick="openSubDetail(${p.sub_padre})" style="flex-direction:column;padding:12px 16px;gap:4px;">
                  <span style="font-size:16px;">${salPadre(p.stato_salute)}</span>
                  <strong style="color:#0f172a;">${esc(p.codice_padre||'—')}</strong>
                  <span style="font-size:10px;color:var(--muted);">${tipoLabel[p.tipo]||p.tipo}</span>
                  ${p.data?`<span style="font-size:9px;color:var(--muted);">${fmt(p.data)}</span>`:''}
                </div>
                <div class="tree-connector">↓</div>
              </div>`).join('')}
          </div>
        </div>`:''}
        
        <!-- SUB corrente -->
        <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(37,99,235,.15);border:2px solid var(--accent);border-radius:10px;padding:14px 20px;margin:8px 0;">
          <span style="font-size:20px;">${sal}</span>
          <div>
            <div style="font-size:16px;font-weight:700;color:#0f172a;">SUB ${esc(s?.codice||'—')}</div>
            <div style="font-size:11px;color:var(--accent);">← SUB corrente</div>
          </div>
        </div>

        ${gen.figli.length?`<div style="margin-top:16px;">
          <div class="tree-connector">↓</div>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">Ha generato</div>
          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            ${gen.figli.map(f=>`
              <div class="tree-node" onclick="openSubDetail(${f.sub_figlio})" style="flex-direction:column;padding:12px 16px;gap:4px;">
                <span style="font-size:16px;">${salPadre(f.stato_salute)}</span>
                <strong style="color:#0f172a;">${esc(f.codice_figlio||'—')}</strong>
                <span style="font-size:10px;color:var(--muted);">${tipoLabel[f.tipo]||f.tipo}</span>
                ${f.data?`<span style="font-size:9px;color:var(--muted);">${fmt(f.data)}</span>`:''}
              </div>`).join('')}
          </div>
        </div>`:''}

        ${!gen.padri.length&&!gen.figli.length?`<div style="margin-top:16px;font-size:13px;color:var(--muted);">Nessuna relazione genealogica.<br>Usa <strong style="color:var(--text);">Scissione</strong> o <strong style="color:var(--text);">Fusione</strong> per creare relazioni.</div>`:''}
      </div>`;
  }else if(tab==='timeline'){
    const storia=data.storia||[];
    const tico={modifica:'✏️',nota:'📝',documento:'📁',manutenzione:'🔨',creazione:'🆕'};
    const tcol={modifica:'rgba(37,99,235,.2)',nota:'rgba(245,158,11,.15)',documento:'rgba(124,58,237,.2)',manutenzione:'rgba(239,68,68,.2)',creazione:'rgba(14,165,194,.2)'};
    el.innerHTML=`<div style="display:flex;gap:8px;margin-bottom:14px;"><input id="tl-nota-txt" placeholder="Aggiungi nota manuale…" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:8px 12px;color:var(--text);font-size:13px;outline:none;" onkeydown="if(event.key==='Enter')addNotaSub()"><button class="btn btn-primary btn-sm" onclick="addNotaSub()">+ Nota</button></div>
      ${storia.length?storia.map(ev=>`<div class="tl-item"><div class="tl-dot" style="background:${tcol[ev.tipo]||'rgba(100,116,139,.2)'};">${tico[ev.tipo]||'📌'}</div><div style="flex:1;"><div style="font-size:10px;color:var(--muted);">${fmt(ev.created_at)}${ev.autore?' · '+esc(ev.autore):''}</div><div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(ev.titolo||ev.tipo)}</div>${ev.descrizione?`<div style="font-size:12px;color:var(--muted);">${esc(ev.descrizione.slice(0,120))}</div>`:''}</div></div>`).join(''):'<div class="empty">Nessun evento ancora.</div>'}`;
  }
}

async function addNotaSub() {
  const txt=document.getElementById('tl-nota-txt')?.value?.trim();
  if(!txt||!currentSubId)return;
  await api('/api/subs/'+currentSubId+'/storia',{method:'POST',body:JSON.stringify({tipo:'nota',titolo:'Nota',descrizione:txt})});
  document.getElementById('tl-nota-txt').value='';
  const data=await api('/api/subs/'+currentSubId+'/detail');
  if(data){currentSubData=data;renderSubDetTab('timeline');}
  toast('Nota aggiunta ✓');
}

function renderTabEconomico(data) {
  const ec = data.economico || {};
  const pagamenti = data.pagamenti || [];
  const mesi = ['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const statoColors = {pagato:'var(--green)',atteso:'var(--muted)',ritardo:'var(--orange)',insoluto:'var(--red)'};
  const statoIcons = {pagato:'✅',atteso:'⏳',ritardo:'⚠️',insoluto:'🔴'};
  const profColor = ec.profittoNetto >= 0 ? 'var(--green)' : 'var(--red)';

  // Raggruppa pagamenti per anno
  const pagPerAnno = {};
  pagamenti.forEach(p => { if(!pagPerAnno[p.anno]) pagPerAnno[p.anno]=[];  pagPerAnno[p.anno].push(p); });
  const anni = Object.keys(pagPerAnno).sort((a,b)=>b-a);

  return `
    <!-- KPI redditività -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:20px;">
      <div style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:10px;padding:14px;">
        <div style="font-size:10px;color:var(--green);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">Entrate totali</div>
        <div style="font-size:20px;font-weight:700;color:var(--green);font-family:monospace;">€ ${ec.totEntrate?.toLocaleString('it-IT',{minimumFractionDigits:2})||'0,00'}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px;">Da ${pagamenti.filter(p=>p.stato==='pagato').length} pagamenti</div>
      </div>
      <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:14px;">
        <div style="font-size:10px;color:var(--red);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">Uscite totali</div>
        <div style="font-size:20px;font-weight:700;color:var(--red);font-family:monospace;">€ ${ec.totUscite?.toLocaleString('it-IT',{minimumFractionDigits:2})||'0,00'}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px;">Interventi + manutenzioni</div>
      </div>
      <div style="background:${ec.profittoNetto>=0?'rgba(16,185,129,.1)':'rgba(239,68,68,.1)'};border:1px solid ${ec.profittoNetto>=0?'rgba(16,185,129,.25)':'rgba(239,68,68,.25)'};border-radius:10px;padding:14px;">
        <div style="font-size:10px;color:${profColor};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">Profitto netto</div>
        <div style="font-size:20px;font-weight:700;color:${profColor};font-family:monospace;">${ec.profittoNetto>=0?'+':''}€ ${ec.profittoNetto?.toLocaleString('it-IT',{minimumFractionDigits:2})||'0,00'}</div>
      </div>
      ${pagamenti.filter(p=>p.stato==='insoluto').length?`<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:14px;"><div style="font-size:10px;color:var(--red);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">Insoluti</div><div style="font-size:20px;font-weight:700;color:var(--red);">${pagamenti.filter(p=>p.stato==='insoluto').length}</div></div>`:''}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Storico pagamenti affitto</div>
      <button class="btn btn-primary btn-sm" onclick="subActionPagamento()">+ Registra pagamento</button>
    </div>

    ${!pagamenti.length ? '<div class="empty">Nessun pagamento registrato. Usa "Genera anno affitti" per creare tutti i mesi.</div>' : ''}
    ${anni.map(anno => `
      <div style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          📅 ${anno}
          <span style="font-size:11px;font-weight:400;color:var(--muted);">— € ${(ec.entratePerAnno?.[anno]||0).toLocaleString('it-IT',{minimumFractionDigits:2})} incassati</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:7px;">
          ${pagPerAnno[anno].map(p=>`
            <div onclick="deletePagamento(${p.id})" title="Clicca per eliminare" style="background:var(--surface2);border:1px solid ${p.stato==='pagato'?'rgba(16,185,129,.3)':p.stato==='insoluto'?'rgba(239,68,68,.3)':'var(--border)'};border-radius:8px;padding:9px 11px;cursor:pointer;transition:all .2s;" onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">
              <div style="font-size:11px;font-weight:600;color:#0f172a;">${mesi[p.mese]}</div>
              <div style="font-size:10px;color:${statoColors[p.stato]||'var(--muted)'};">${statoIcons[p.stato]||''} ${p.stato||'—'}</div>
              <div style="font-size:11px;font-family:monospace;font-weight:700;color:var(--gold);margin-top:2px;">€ ${parseFloat(p.importo).toLocaleString('it-IT')}</div>
            </div>`).join('')}
        </div>
      </div>`).join('')}`;
}

function renderTabInquilini(data) {
  const storico = data.storicoInquilini || [];
  const s = data.sub;
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <div style="font-size:13px;font-weight:600;color:#0f172a;">Inquilino attuale: ${esc(s.inquilino_nome||'Libero')}</div>
        ${s.data_inizio_contratto?`<div style="font-size:11px;color:var(--muted);">Contratto dal ${fmt(s.data_inizio_contratto)} — ${esc(s.tipo_contratto||'—')} — € ${s.canone_annuo?parseFloat(s.canone_annuo).toLocaleString('it-IT'):0}/anno</div>`:''}
      </div>
      <button class="btn btn-primary btn-sm" onclick="subActionCambioInquilino()">👤 Cambia inquilino</button>
    </div>
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:10px;">Storico inquilini</div>
    ${!storico.length ? '<div class="empty">Nessuno storico inquilini registrato.</div>' :
      storico.map(si => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
          <span style="font-size:20px;padding-top:2px;">👤</span>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(si.inquilino_nome||'—')}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:3px;">
              ${si.data_inizio?fmt(si.data_inizio):'?'} → ${si.data_fine?fmt(si.data_fine):'in corso'}
              ${si.canone_mensile?` · € ${parseFloat(si.canone_mensile).toLocaleString('it-IT')}/mese`:''}
              ${si.tipo_contratto?' · '+esc(si.tipo_contratto):''}
            </div>
            ${si.note?`<div style="font-size:11px;color:var(--muted);margin-top:2px;font-style:italic;">${esc(si.note)}</div>`:''}
          </div>
          ${si.tel?`<div style="font-size:11px;color:var(--muted);">📞 ${esc(si.tel)}</div>`:''}
          <button class="btn btn-danger btn-sm" onclick="deleteStorInq(${si.id})">✕</button>
        </div>`).join('')}`;
}

function subActionNuovoIntervento() { closeM('modal-sub-det'); openModalInt(); }

function subActionNuovoDoc() { closeM('modal-sub-det'); openModalDoc(); setTimeout(()=>{ document.getElementById('doc-sub').value=currentSubId; },100); }

function subActionManutenzione() { closeM('modal-sub-det'); openModalMan(); setTimeout(()=>{ document.getElementById('man-sub').value=currentSubId; },100); }

function subActionNota() { setSubDetTab('timeline',null); document.querySelectorAll('#sub-det-tabs .tab-btn').forEach((b,i)=>{if(i===8)b.classList.add('active');else b.classList.remove('active');}); document.getElementById('tl-nota-txt')?.focus(); }

async function savePagamento() {
  const v = id => document.getElementById(id)?.value||'';
  if(!v('pag-anno')||!v('pag-importo')){toast('Anno e importo obbligatori','error');return;}
  const s = currentSubData?.sub;
  const r = await api('/api/pagamenti-affitto',{method:'POST',body:JSON.stringify({
    sub_id: currentSubId, inquilino_id: s?.inquilino_id||null,
    anno: parseInt(v('pag-anno')), mese: parseInt(v('pag-mese')),
    importo: v('pag-importo'), data_pagamento: v('pag-data')||null,
    stato: v('pag-stato'), note: v('pag-note'),
  })});
  closeM('modal-pagamento');
  const data = await api('/api/subs/'+currentSubId+'/detail');
  if(data){currentSubData=data; renderSubDetTab(subDetTab);}
  toast('Pagamento registrato ✓');
}

async function deletePagamento(id) {
  if(!confirm('Eliminare questo pagamento?'))return;
  await api('/api/pagamenti-affitto/'+id,{method:'DELETE'});
  const data=await api('/api/subs/'+currentSubId+'/detail');
  if(data){currentSubData=data;renderSubDetTab('economico');}
  toast('Eliminato','error');
}

function subActionGeneraAnno() {
  const s = currentSubData?.sub;
  document.getElementById('ga-anno').value = new Date().getFullYear();
  document.getElementById('ga-canone').value = s?.canone_annuo ? (parseFloat(s.canone_annuo)/12).toFixed(2) : '';
  document.getElementById('modal-genera-anno').classList.add('open');
}

async function saveGeneraAnno() {
  const anno = document.getElementById('ga-anno').value;
  const canone = document.getElementById('ga-canone').value;
  if(!anno||!canone){toast('Anno e canone obbligatori','error');return;}
  const s = currentSubData?.sub;
  const r = await api('/api/pagamenti-affitto/genera-anno',{method:'POST',body:JSON.stringify({
    sub_id:currentSubId,anno:parseInt(anno),importo_mensile:canone,inquilino_id:s?.inquilino_id||null
  })});
  closeM('modal-genera-anno');
  const data=await api('/api/subs/'+currentSubId+'/detail');
  if(data){currentSubData=data;renderSubDetTab('economico');}
  toast(`✓ ${r?.created||0} mesi generati`);
}

function subActionCambioInquilino() {
  document.getElementById('ci-inq').innerHTML='<option value="">— Nessuno (libera il SUB) —</option>'+DB.inquilini.map(i=>`<option value="${i.id}">${i.ragione_sociale}</option>`).join('');
  document.getElementById('ci-inq').value = currentSubData?.sub?.inquilino_id||'';
  document.getElementById('ci-data').value = new Date().toISOString().split('T')[0];
  document.getElementById('ci-canone').value = currentSubData?.sub?.canone_annuo?(parseFloat(currentSubData.sub.canone_annuo)/12).toFixed(2):'';
  document.getElementById('ci-tipo').value = currentSubData?.sub?.tipo_contratto||'';
  document.getElementById('ci-note').value = '';
  document.getElementById('modal-cambio-inq').classList.add('open');
}

async function saveCambioInquilino() {
  const v=id=>document.getElementById(id)?.value||'';
  const r=await api('/api/subs/'+currentSubId+'/cambia-inquilino',{method:'POST',body:JSON.stringify({
    nuovo_inquilino_id:parseInt(v('ci-inq'))||null,
    data_cambio:v('ci-data')||null,
    canone_mensile:v('ci-canone')||null,
    tipo_contratto:v('ci-tipo')||null,
    note:v('ci-note'),
  })});
  closeM('modal-cambio-inq');
  await loadDD();
  const data=await api('/api/subs/'+currentSubId+'/detail');
  if(data){currentSubData=data;renderSubDetTab('inquilini');}
  toast('Inquilino aggiornato ✓');
}

async function deleteStorInq(id){
  if(!confirm('Eliminare record storico?'))return;
  await api('/api/storico-inquilini/'+id,{method:'DELETE'});
  const data=await api('/api/subs/'+currentSubId+'/detail');
  if(data){currentSubData=data;renderSubDetTab('inquilini');}
  toast('Eliminato','error');
}

function subActionScissione() {
  const s = currentSubData?.sub;
  document.getElementById('sc-codice').value = '';
  document.getElementById('sc-note').value = '';
  document.getElementById('sc-preview').style.display='none';
  document.getElementById('modal-scissione').classList.add('open');
  document.getElementById('sc-codice').addEventListener('input', function() {
    const preview = document.getElementById('sc-preview');
    if(this.value.trim()) {
      preview.style.display='block';
      preview.innerHTML=`Il SUB <strong>${s?.codice}</strong> genererà il nuovo SUB <strong>${esc(this.value.trim())}</strong> — entrambi manterranno la sede, piano e dati catastali. Lo storico rimarrà visibile in Timeline.`;
    } else preview.style.display='none';
  }, {once:false});
}

async function pagaBolletta(id){
  await api('/api/bollette/'+id,{method:'PUT',body:JSON.stringify({stato:'pagato',data_pagamento:new Date().toISOString().split('T')[0]})});
  loadBollette();toast('✓ Bolletta pagata');
}

async function updateTicketStato(id,stato){
  await api('/api/ticket/'+id,{method:'PUT',body:JSON.stringify({stato})});
  loadTicket();toast(stato==='chiuso'?'✓ Ticket chiuso':'Stato aggiornato');
}

async function segnaAffittoPagato(id){
  await api('/api/pagamenti-affitto/'+id,{method:'PUT',body:JSON.stringify({stato:'pagato',data_pagamento:new Date().toISOString().split('T')[0]})});
  loadAffitti();toast('✓ Pagamento registrato');
}

async function delAffitto(id){if(!confirm('Eliminare?'))return;await api('/api/pagamenti-affitto/'+id,{method:'DELETE'});loadAffitti();toast('Eliminato','error');}

function getDaysUntil(dateStr){
  if(!dateStr||dateStr==='senza data')return 999;
  return Math.floor((new Date(dateStr)-new Date())/(1000*60*60*24));
}

function subActionTicket(subId){
  openModalTicket(subId||currentSubId);
}

function subActionBolletta(subId){
  openModalBoll(subId||currentSubId);
}

function openModalPagamento(){
  if(currentSubId) subActionPagamento();
  else {
    // Generic - open without sub pre-selected
    document.getElementById('pag-anno').value=new Date().getFullYear();
    document.getElementById('pag-mese').value=new Date().getMonth()+1;
    document.getElementById('pag-importo').value='';
    document.getElementById('pag-data').value=new Date().toISOString().split('T')[0];
    document.getElementById('pag-stato').value='pagato';
    document.getElementById('modal-pagamento').classList.add('open');
  }
}

function quickChat(msg){const input=document.getElementById('chat-input-page');if(input){input.value=msg;sendChatPage();}}

function docFileSelected(input){docFileInput=input.files[0];if(docFileInput)document.getElementById('doc-file-zone').textContent=`✓ ${docFileInput.name} (${Math.round(docFileInput.size/1024)} KB)`;}

async function openTimeline(subId,subCodice){
  timelineSubId=subId;
  document.getElementById('timeline-sub-name').textContent='Timeline — SUB '+subCodice;
  document.getElementById('nota-testo').value='';
  document.getElementById('modal-timeline').classList.add('open');
  document.getElementById('timeline-content').innerHTML='<div class="empty">Caricamento…</div>';
  const data=await api('/api/subs/'+subId+'/storia');
  if(!data?.length){document.getElementById('timeline-content').innerHTML='<div class="empty">Nessun evento ancora. Gli interventi, documenti e modifiche appariranno qui.</div>';return;}
  document.getElementById('timeline-content').innerHTML=data.map(ev=>{
    let icon,color,titolo,desc;
    if(ev._tipo==='intervento'){icon=ev.icona||'🔧';color='rgba(37,99,235,.2)';titolo=esc(ev.descrizione?.slice(0,80)||'Intervento');desc=`${ev.fornitore?'Fornitore: '+esc(ev.fornitore)+' · ':''}${ev.prezzo?'€ '+parseFloat(ev.prezzo).toLocaleString('it-IT'):''}${ev.protocollo?' · Prot. '+esc(ev.protocollo):''}`;}
    else if(ev._tipo==='documento'){icon=DOC_ICONS[ev.tipo]||'📄';color='rgba(124,58,237,.2)';titolo=esc(ev.nome||'Documento');desc=`Tipo: ${ev.tipo}${ev.importo?' · € '+parseFloat(ev.importo).toLocaleString('it-IT'):''}${ev.scadenza?' · Scad. '+fmt(ev.scadenza):''}`;}
    else{const ti={modifica:'✏️',nota:'📝',documento:'📁',creazione:'🆕'};icon=ti[ev.tipo]||'📌';color='rgba(245,158,11,.15)';titolo=esc(ev.titolo||'Evento');desc=esc(ev.descrizione||'');}
    return`<div class="timeline-item"><div class="timeline-dot" style="background:${color};">${icon}</div><div class="timeline-body"><div class="timeline-date">${ev._data?fmt(ev._data):'—'}${ev.autore?' · '+esc(ev.autore):''}</div><div class="timeline-title">${titolo}</div>${desc?`<div class="timeline-desc">${desc}</div>`:''}</div></div>`;
  }).join('');
}

async function addNota(){
  const testo=document.getElementById('nota-testo').value.trim();
  if(!testo||!timelineSubId)return;
  await api('/api/subs/'+timelineSubId+'/storia',{method:'POST',body:JSON.stringify({tipo:'nota',titolo:'Nota',descrizione:testo})});
  document.getElementById('nota-testo').value='';
  openTimeline(timelineSubId,document.getElementById('timeline-sub-name').textContent.split('SUB ')[1]||'');
  toast('Nota aggiunta ✓');
}

function toggleChat(){
  chatOpen=!chatOpen;
  const panel=document.getElementById('chat-panel');
  panel.style.display=chatOpen?'flex':'none';
  if(chatOpen)setTimeout(()=>document.getElementById('chat-input')?.focus(),100);
}

async function sendChat(){
  const input=document.getElementById('chat-input');
  const msg=input.value.trim();if(!msg)return;
  input.value='';
  addChatMsg(msg,'user');
  addChatMsg('⏳ Sto cercando…','bot','chat-loading');
  const r=await api('/api/chat',{method:'POST',body:JSON.stringify({messaggio:msg})});
  document.getElementById('chat-loading')?.remove();
  if(!r){addChatMsg('Errore di connessione.','bot');return;}
  let html=r.risposta.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  if(r.dati?.length){
    html+=r.dati.slice(0,5).map(d=>{
      if(r.tipo==='interventi')return`<div class="chat-result" onclick="openDet(${d.id})">📋 <strong>${esc(d.sub||'?')}</strong> — ${esc((d.descrizione||'').slice(0,50))} ${d.prezzo?'<strong style="color:var(--gold2);">€'+parseFloat(d.prezzo).toLocaleString('it-IT')+'</strong>':''}`;
      if(r.tipo==='fornitori')return`<div class="chat-result">🔧 <strong>${esc(d.ragione_sociale)}</strong> — ${d.num_int} int · <strong style="color:var(--gold2);">€ ${parseFloat(d.totale||0).toLocaleString('it-IT')}</strong></div>`;
      if(r.tipo==='subs')return`<div class="chat-result" onclick="document.getElementById('ff-sub').value='${d.id||''}';showSec('interventi',document.querySelectorAll('.nb')[0]);loadInt();">🏠 <strong>SUB ${esc(d.sub||d.codice||'?')}</strong> (${esc(d.sede||'')}) — <strong style="color:var(--gold2);">€ ${parseFloat(d.totale||0).toLocaleString('it-IT')}</strong></div>`;
      return`<div class="chat-result">📄 ${esc(d.nome||d.descrizione||'').slice(0,60)}</div>`;
    }).join('');
    if(r.dati.length>5)html+=`<div style="font-size:10px;color:var(--muted);margin-top:4px;">... e altri ${r.dati.length-5}</div>`;
  }
  addChatMsg(html,'bot',null,true);
}

function addChatMsg(html,role,id=null,isHtml=false){
  const msgs=document.getElementById('chat-messages');
  const div=document.createElement('div');
  div.className='chat-msg '+role;
  if(id)div.id=id;
  if(isHtml)div.innerHTML=html;else div.textContent=html;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}