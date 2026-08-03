// ═══════════════════════════════════════════════════════════
// misc.js — remaining utility functions
// ═══════════════════════════════════════════════════════════

async function confirmPr(){
  const pr = document.getElementById('pr-quick').value;
  if (!pr || parseFloat(pr) <= 0) { toast('Inserisci un importo valido', 'error'); return; }
  pending.prezzo = pr;
  closeM('modal-pr');
  await checkDup(pending);
}

async function checkDup(data){
  if(!editId){
    const r=await api('/api/interventi/check-duplicate',{method:'POST',body:JSON.stringify(data)});
    if(r?.duplicates?.length){
      pending=data;
      document.getElementById('dup-n').textContent=r.duplicates.length;
      document.getElementById('dup-list').innerHTML=r.duplicates.map(d=>`<div class="alert-item">📅 ${d.data_intervento?fmt(d.data_intervento):'—'} — ${esc((d.descrizione||'').slice(0,60))}${d.prezzo?` <strong class="text-gold">€ ${parseFloat(d.prezzo).toLocaleString('it-IT')}</strong>`:''}</div>`).join('');
      document.getElementById('modal-dup').classList.add('open');
      return;
    }
  }
  await doSave(data);
}

async function forceS(){ closeM('modal-dup'); await doSave(pending); }

async function doSave(data){
  let r;
  if(editId){
    r = await api('/api/interventi/'+editId, {method:'PUT', body:JSON.stringify(data)});
  } else {
    r = await api('/api/interventi', {method:'POST', body:JSON.stringify(data)});
  }
  if (!r || r.error) { toast('Errore salvataggio: ' + (r?.error || 'risposta vuota'), 'error'); return; }
  closeM('modal-int');
  await loadInt();
  toast(editId ? 'Intervento aggiornato ✓' : 'Intervento salvato ✓');
  editId = null;
}

async function upAll(input,intId){for(const f of input.files){const tipo=f.type.startsWith('image/')?'foto':f.name.toLowerCase().endsWith('.pdf')?'fattura':'documento';const fd=new FormData();fd.append('file',f);fd.append('intervento_id',intId);fd.append('tipo',tipo);toast('Caricamento…','warning');await apiUp('/api/allegati',fd);toast('Caricato ✓');}openDet(intId);}

async function delAll(alId,intId){if(!await appConfirm('Eliminare allegato?'))return;await api('/api/allegati/'+alId,{method:'DELETE'});openDet(intId);}

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
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(90deg,rgba(107,142,107,.2),rgba(107,142,107,.05));border:1px solid rgba(107,142,107,.3);border-radius:10px 10px 0 0;">
          <span style="font-family:'Fraunces',serif;font-size:16px;color:#0f172a;">📍 ${esc(sede)}</span>
          <span style="color:var(--accent);font-weight:700;">€ ${sedeTot.toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
        </div>
        <div style="border:1px solid rgba(107,142,107,.2);border-top:none;border-radius:0 0 10px 10px;padding:10px;">
          ${subs.map(d => `
            <div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="document.getElementById('ff-sub').value='${d.sub_id}';showSec('interventi',document.querySelectorAll('.nb')[0]);loadInt();">
              <div class="flex-between" style="margin-bottom:8px;">
                <div class="flex">
                  <span style="font-family:'Fraunces',serif;font-size:15px;color:#0f172a;font-weight:700;">SUB ${esc(d.sub||'N/D')}</span>
                  ${d.ex_sub?`<span class="ex-sub">ex ${esc(d.ex_sub)}</span>`:''}
                  ${d.inquilino?`<span style="color:var(--muted);font-size:11px;">👤 ${esc(d.inquilino)}</span>`:''}
                  ${!d.num_interventi?`<span style="font-size:10px;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:1px 7px;">Nessun intervento</span>`:''}
                </div>
                <div style="text-align:right;">
                  <div style="font-size:17px;font-weight:700;color:${d.totale>0?'var(--accent)':'var(--muted)'};">${d.totale>0?'€ '+parseFloat(d.totale).toLocaleString('it-IT',{minimumFractionDigits:2}):'—'}</div>
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
            <span style="font-family:'Fraunces',serif;font-size:20px;color:#0f172a;font-weight:700;">${a.anno}</span>
            <span style="color:var(--muted);font-size:12px;">${a.num_interventi} interventi · ${a.num_subs} SUB · ${a.num_fornitori} fornitori</span>
          </div>
          <span style="font-size:22px;font-weight:700;color:var(--accent);">€ ${parseFloat(a.totale).toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
        </div>
        <div style="height:8px;background:var(--border);border-radius:4px;margin-bottom:10px;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--accent));border-radius:4px;transition:width .5s;"></div>
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
        <div style="font-family:'Fraunces',serif;font-size:18px;color:#0f172a;margin-bottom:12px;">📍 ${esc(s.sede||'—')}</div>
        <div style="font-size:26px;font-weight:700;color:var(--accent);margin-bottom:8px;">€ ${parseFloat(s.totale).toLocaleString('it-IT',{minimumFractionDigits:2})}</div>
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
        ${tot.entrate===0?`<div style="background:rgba(184,134,11,.1);border:1px solid rgba(184,134,11,.3);border-radius:10px;padding:16px;"><div style="font-size:12px;color:var(--accent);">💡 Registra gli affitti nelle schede SUB per vedere la redditività reale.</div></div>`:''}
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
  if(!await appConfirm('Scansiono tutte le descrizioni degli interventi senza prezzo e cerco importi in euro. Continuare?')) return;
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

function openModalUser(){['u-nome','u-email','u-pwd'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('modal-user').classList.add('open');}

// ── GESTIONE UTENTI (Impostazioni) ──
async function loadUsers(){
  const el=document.getElementById('users-list');
  if(!el)return;
  const users=await api('/api/users');
  if(!Array.isArray(users)){el.innerHTML='<p style="font-size:12px;color:var(--muted);">Impossibile caricare gli utenti.</p>';return;}
  const isAdmin=(currentUser?.ruolo||'')==='admin';
  el.innerHTML=users.map(u=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);${u.attivo===false?'opacity:.5;':''}">
      <span style="width:30px;height:30px;border-radius:50%;background:var(--terra-bg,#f7e5dc);color:var(--terra-dark,#a03f1e);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${esc((u.nome||u.email||'?').slice(0,1).toUpperCase())}</span>
      <div style="min-width:0;flex:1;">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.nome||'—')} ${u.id===currentUser?.id?'<span style="font-size:10px;color:var(--muted);">(tu)</span>':''}</div>
        <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.email)} · ${u.ruolo==='admin'?'👑 Admin':'Operatore'}${u.attivo===false?' · disattivato':''}</div>
      </div>
      ${isAdmin&&u.id!==currentUser?.id?`
        <button class="btn btn-sm btn-gray" title="Reimposta password" onclick="userResetPwdBox(${u.id})">🔑</button>
        <button class="btn btn-sm btn-gray" title="${u.attivo===false?'Riattiva':'Disattiva'}" onclick="userToggleAttivo(${u.id},${u.attivo===false})">${u.attivo===false?'▶':'⏸'}</button>`:''}
    </div>
    <div id="user-pwd-box-${u.id}" style="display:none;padding:8px 0 10px 40px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="password" id="user-pwd-inp-${u.id}" placeholder="Nuova password (min 6)" class="input" style="flex:1;max-width:220px;">
        <button class="btn btn-sm btn-success" onclick="userResetPwd(${u.id})">✓ Imposta</button>
      </div>
    </div>`).join('');
}

async function saveUser(){
  const v=id=>document.getElementById(id)?.value?.trim()||'';
  const nome=v('u-nome'),email=v('u-email'),password=document.getElementById('u-pwd')?.value||'',ruolo=v('u-ruolo')||'operatore';
  if(!nome||!email||!password){toast('Nome, email e password obbligatori','error');return;}
  if(password.length<6){toast('Password troppo corta (min 6 caratteri)','error');return;}
  const r=await api('/api/users',{method:'POST',body:JSON.stringify({nome,email,password,ruolo})});
  if(!r||r.error){toast('❌ '+(r?.error||'Creazione fallita'),'error');return;}
  closeM('modal-user');
  toast('👤 Utente '+nome+' creato ✓');
  loadUsers();
}

async function userToggleAttivo(id,riattiva){
  if(!riattiva&&!await appConfirm('Disattivare questo utente? Non potrà più accedere.',{icon:'⏸',title:'Disattiva utente',okText:'Disattiva'}))return;
  const users=await api('/api/users');
  const u=(users||[]).find(x=>x.id===id);
  if(!u)return;
  const r=await api('/api/users/'+id,{method:'PUT',body:JSON.stringify({nome:u.nome,ruolo:u.ruolo,attivo:riattiva})});
  if(!r||r.error){toast('❌ '+(r?.error||'Operazione fallita'),'error');return;}
  toast(riattiva?'Utente riattivato ✓':'Utente disattivato ✓');
  loadUsers();
}

function userResetPwdBox(id){
  const box=document.getElementById('user-pwd-box-'+id);
  if(box)box.style.display=box.style.display==='none'?'block':'none';
}

async function userResetPwd(id){
  const inp=document.getElementById('user-pwd-inp-'+id);
  const pwd=inp?.value||'';
  if(pwd.length<6){toast('Password troppo corta (min 6 caratteri)','error');return;}
  const r=await api('/api/users/'+id+'/password',{method:'POST',body:JSON.stringify({password:pwd})});
  if(!r||r.error){toast('❌ '+(r?.error||'Reset fallito'),'error');return;}
  toast('🔑 Password reimpostata ✓ Comunicala all\'utente');
  userResetPwdBox(id);
}

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
    const d = r?.dati;
    if (!d) {
      status.textContent = '❌ ' + (r?.error || 'Errore lettura');
      return;
    }
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
        window.__fiFornSuggerito = '';
      } else {
        // Non blocca l'import: propone di creare il fornitore al volo, senza perdere il resto del form già compilato
        window.__fiFornSuggerito = d.fornitore;
        status.innerHTML += ` ⚠️ Fornitore "${esc(d.fornitore)}" non trovato in anagrafica — <a href="#" onclick="event.preventDefault();quickCreateAna('fornitore','fi-forn',window.__fiFornSuggerito)" style="color:var(--accent);font-weight:600;">crealo ora ➕</a>`;
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
  // Il vecchio modale è stato rimosso: aveva ID duplicati rispetto alla sezione
  // Import/OCR, quindi loadSubImport() scriveva nella sezione e il modale restava
  // vuoto. Ora il pulsante porta direttamente all'import SUB funzionante.
  subImportRows = []; subImportMap = {};
  const wiz = document.getElementById('sub-import-wiz');
  if (wiz) wiz.style.display = 'none';
  const s1 = document.getElementById('sub-import-s1');
  if (s1) s1.style.display = '';
  const s2 = document.getElementById('sub-import-s2');
  if (s2) s2.style.display = 'none';
  const an = document.getElementById('sub-import-analyze');
  if (an) an.style.display = '';
  const f = document.getElementById('subImportFile');
  if (f) f.value = '';

  showSection('import');
  setTimeout(function() {
    const card = document.getElementById('sub-import-wiz');
    if (card && card.parentElement) {
      card.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

async function editMan(id){
  const data=await api('/api/manutenzioni');
  const m=(data||[]).find(x=>x.id==id);if(!m)return;
  openModalMan(); // prima apre (resetta manEditId), POI marca la modifica
  manEditId=id;document.getElementById('m-man-ttl').textContent='Modifica Manutenzione';
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
    <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Aumento annuo</div><div style="font-size:18px;font-weight:700;color:var(--accent);">€ ${aumento.toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>
    <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Nuovo canone/anno</div><div style="font-size:18px;font-weight:700;color:var(--green);">€ ${nuovo.toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>
    <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Nuovo canone/mese</div><div style="font-size:18px;font-weight:700;color:var(--green);">€ ${(nuovo/12).toLocaleString('it-IT',{minimumFractionDigits:2})}</div></div>
  </div>
  <div style="margin-top:10px;padding:9px 12px;background:rgba(184,134,11,.08);border:1px solid rgba(184,134,11,.2);border-radius:7px;font-size:11px;color:var(--muted);">⚠️ Verifica il valore ISTAT FOI aggiornato su <a href="https://www.istat.it" target="_blank" style="color:var(--accent);">istat.it</a></div>`;
}

function subSelAll(v) {
  if(v===false){subSelIds.clear();}else{DB.subs.forEach(s=>subSelIds.add(s.id));}
  // "sub-mass-cnt" esiste 2 volte nel DOM (Anagrafiche + pagina SUB standalone): aggiorna entrambe,
  // altrimenti chi guarda la pagina SUB vede sempre "0 selezionati" anche se la selezione è avvenuta.
  document.querySelectorAll('[id="sub-mass-cnt"]').forEach(el => el.textContent = `${subSelIds.size} selezionati`);
  renderTbSubs();
}

function subDeselAll() {
  subSelIds.clear();
  document.querySelectorAll('[id="sub-mass-cnt"]').forEach(el => el.textContent = '0 selezionati');
  renderTbSubs();
}

function setSubDetTab(tab,btn){
  subDetTab=tab;
  document.querySelectorAll('#sub-det-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderSubDetTab(tab);
}

// ═══════════════ SUB HUB: cartelle documenti, impianti, navigazione ═══════════════

// Configurazione impianti con sottocartelle interne
const SUB_IMPIANTI = {
  elettrico:   { icona:'⚡',  nome:'Impianto elettrico',  sotto:{ dico:'DiCo / Conformità', progetto:'Progetto / Schemi', verifiche:'Verifiche periodiche', altro:'Altro' } },
  idraulico:   { icona:'🚰', nome:'Impianto idraulico',  sotto:{ dico:'DiCo / Conformità', schemi:'Schemi', manutenzione:'Manutenzioni', altro:'Altro' } },
  termico:     { icona:'🔥', nome:'Impianto termico',    sotto:{ libretto:'Libretto impianto', fumi:'Controllo fumi', dico:'DiCo', altro:'Altro' } },
  clima:       { icona:'❄️',  nome:'Climatizzazione',     sotto:{ fgas:'F-GAS', manutenzione:'Manutenzioni', altro:'Altro' } },
  ascensore:   { icona:'🛗', nome:'Ascensore',           sotto:{ collaudo:'Collaudo', verifiche:'Verifiche biennali', altro:'Altro' } },
  antincendio: { icona:'🧯', nome:'Antincendio',         sotto:{ cpi:'CPI / SCIA', registri:'Registri estintori', altro:'Altro' } },
};

function _subDocs(prefix){
  return (currentSubData?.documenti||[]).filter(d=>(d.tipo||'').startsWith(prefix));
}

function _subDocRow(d){
  const today=new Date(); today.setHours(0,0,0,0);
  const scad=d.scadenza?new Date(d.scadenza):null;
  const gg=scad?Math.round((scad-today)/86400000):null;
  // Chip stile mockup: Valido / In scadenza / Scaduto
  const scadBadge = scad
    ? (gg<0
        ? `<span style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger);border-radius:10px;padding:1px 9px;font-size:10px;font-weight:700;">Scaduto</span>`
        : gg<=30
          ? `<span style="background:var(--warning-bg);color:var(--warning);border:1px solid var(--warning);border-radius:10px;padding:1px 9px;font-size:10px;font-weight:700;">In scadenza · ${gg}g</span>`
          : `<span style="background:var(--success-bg);color:var(--success);border:1px solid var(--success);border-radius:10px;padding:1px 9px;font-size:10px;font-weight:700;">Valido</span>`)
    : `<span style="background:var(--bg2);color:var(--muted);border-radius:10px;padding:1px 9px;font-size:10px;font-weight:600;">Valido</span>`;
  return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:7px;margin-bottom:6px;background:var(--surface2);">
    <div style="flex:1;min-width:0;">
      <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.nome||'Documento')}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        ${d.data_documento?`<span>${fmt(d.data_documento)}</span>`:''}
        ${d.fornitore_nome?`<span>· ${esc(d.fornitore_nome)}</span>`:''}
        ${d.importo?`<span>· € ${parseFloat(d.importo).toLocaleString('it-IT')}</span>`:''}
        ${scadBadge}
      </div>
    </div>
    ${d.url?`<a href="${esc(fileUrl(d.url))}" target="_blank" class="btn btn-xs btn-gray" title="Apri">👁</a>`:'<span style="font-size:10px;color:var(--muted);" title="Nessun file allegato">solo dati</span>'}
    <button class="btn btn-xs btn-gray" onclick="subDelDoc(${d.id})" title="Elimina">✕</button>
  </div>`;
}

// Cartella documenti: titolo + pulsante aggiungi con tipo preimpostato + lista
function _subDocFolder(titolo, prefix, hint){
  const docs=_subDocs(prefix);
  return `<div style="border:1px solid var(--border);border-radius:9px;padding:12px 14px;margin-bottom:10px;">
    <div class="flex-between" style="margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;">${titolo} <span style="color:var(--muted);font-weight:400;">(${docs.length})</span></div>
      <button class="btn btn-xs btn-primary" onclick="subAddDocPreset('${prefix}','${titolo.replace(/'/g,"\\'")}')">+ Aggiungi</button>
    </div>
    ${docs.length?docs.map(_subDocRow).join(''):`<div style="font-size:11px;color:var(--muted);">${hint||'Nessun documento.'}</div>`}
  </div>`;
}

// Apre il modale documento SENZA chiudere la scheda SUB, con tipo già impostato
function subAddDocPreset(tipo, label){
  openModalDoc();
  const md=document.getElementById('modal-doc');
  if(md) md.style.zIndex=3000; // sopra la scheda SUB
  const sel=document.getElementById('doc-tipo');
  if(sel){
    if(![...sel.options].some(o=>o.value===tipo)) sel.add(new Option((label||tipo).replace(/<[^>]*>/g,''), tipo));
    sel.value=tipo;
  }
  const ds=document.getElementById('doc-sub');
  if(ds&&currentSubId) ds.value=currentSubId;
  const dn=document.getElementById('doc-nome');
  if(dn&&label) dn.placeholder=label;
}

async function subDelDoc(id){
  if(!await appConfirm('Eliminare questo documento?'))return;
  await api('/api/documenti/'+id,{method:'DELETE'});
  await subDetRefresh();
  toast('Documento eliminato');
}

// Ricarica i dati del SUB e ridisegna la tab corrente (senza chiudere nulla)
async function subDetRefresh(){
  if(!currentSubId)return;
  const d=await api('/api/subs/'+currentSubId+'/detail');
  if(d?.sub){currentSubData=d;renderSubDetTab(subDetTab);}
}

// Trova il pulsante tab corrispondente (per riattivarlo tornando indietro)
function _subTabBtn(tab){
  return [...document.querySelectorAll('#sub-det-tabs .tab-btn')].find(b=>(b.getAttribute('onclick')||'').includes("'"+tab+"'"))||null;
}

// Vista secondaria con pulsante "← Indietro" (es. Bollette da Economico)
async function subDetSubview(tab, backTo){
  subDetTab=tab;
  await renderSubDetTab(tab);
  document.getElementById('sub-det-content').insertAdjacentHTML('afterbegin',
    `<div style="margin-bottom:10px;"><button class="btn btn-xs btn-gray" onclick="setSubDetTab('${backTo}',_subTabBtn('${backTo}'))">← Indietro</button></div>`);
}

// Navigazione nella cartella di un impianto
function subDetGoImpianto(key){
  subDetTab='impianto:'+key;
  renderSubDetTab(subDetTab);
}

async function renderSubDetTab(tab) {
  const data=currentSubData; if(!data)return;
  const s=data.sub;
  const el=document.getElementById('sub-det-content');

  // ── Cartella di un singolo impianto: scheda tecnica + sottocartelle allegati ──
  if(tab&&tab.startsWith('impianto:')){
    const key=tab.split(':')[1], cfg=SUB_IMPIANTI[key];
    if(!cfg){renderSubDetTab('impianti');return;}
    await _caricaImpiantiDati();
    el.innerHTML=`
      <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;">
        <button class="btn btn-xs btn-gray" onclick="setSubDetTab('impianti',_subTabBtn('impianti'))">← Impianti</button>
        <span style="font-size:15px;font-weight:700;">${cfg.icona} ${cfg.nome}</span>
      </div>
      ${_impSchedaHtml(key)}
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:var(--muted);font-weight:700;margin:16px 0 8px;">Allegati</div>
      ${Object.entries(cfg.sotto).map(([sk,label])=>
        _subDocFolder(label,'imp_'+key+'_'+sk,'Nessun documento in questa sottocartella.')
      ).join('')}`;
    return;
  }
  const df=(v)=>v?`<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:3px;">${v[0]}</div><div style="font-size:13px;color:var(--text);font-weight:500;">${v[1]}</div>`:'';
  const card=(label,val,big=false)=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 14px;"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">${label}</div><div style="font-size:${big?'20px':'13px'};color:${big?'var(--accent)':'var(--text)'};font-weight:${big?700:500};${big?'font-family:monospace;':''}">${val}</div></div>`;
  const sec=(t)=>`<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 8px;font-weight:600;">${t}</div>`;

  if(tab==='overview'){
    const docs=data.documenti||[];
    const has=p=>docs.some(d=>(d.tipo||'').startsWith(p));
    const scadenze=data.scadenze||[];
    const check=[
      ['APE', has('ape')],
      ['Visura', has('visura')||has('catastale')],
      ['Planimetria', has('planimetria')],
      ['DiCo elettrico', has('imp_elettrico')],
      ['Libretto termico', has('imp_termico')],
      ['Contratto', (data.contratti||[]).length>0],
      ['Foto', has('foto')],
    ];
    const okN=check.filter(c=>c[1]).length;
    const riga=(label,val)=>val?`<div style="display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;"><span style="color:var(--muted);">${label}</span><span style="font-weight:500;text-align:right;">${val}</span></div>`:'';
    el.innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:start;">
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.8px;color:var(--muted-2);font-weight:700;margin-bottom:6px;">Identificazione</div>
          ${riga('Codice',esc(s.codice))}
          ${riga('Sede',esc(s.sede_nome||''))}
          ${riga('Piano',s.piano?esc(s.piano):'')}
          ${riga('Indirizzo',s.indirizzo_completo?esc(s.indirizzo_completo):'')}
          ${riga('Catasto',(s.foglio||s.particella)?('Fg. '+esc(s.foglio||'—')+' · Part. '+esc(s.particella||'—')+(s.subalterno?' · Sub. '+esc(s.subalterno):'')):'')}
          ${riga('Categoria',s.categoria_cat?esc(s.categoria_cat):'')}
          ${riga('Superficie',s.mq_commerciali?parseFloat(s.mq_commerciali).toFixed(0)+' mq comm.'+(s.mq_calpestabili?' · '+parseFloat(s.mq_calpestabili).toFixed(0)+' mq calp.':''):'')}
          ${riga('Rendita',s.rendita?'€ '+parseFloat(s.rendita).toLocaleString('it-IT'):'')}
          ${riga('Classe energetica',s.classe_energetica?esc(s.classe_energetica):'')}

          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.8px;color:var(--muted-2);font-weight:700;margin:22px 0 6px;">Locazione</div>
          ${riga('Conduttore',esc(s.inquilino_nome||'Libero'))}
          ${riga('Canone annuo',s.canone_annuo?'€ '+parseFloat(s.canone_annuo).toLocaleString('it-IT',{minimumFractionDigits:2}):'')}
          ${riga('Canone mensile',s.canone_annuo?'€ '+(parseFloat(s.canone_annuo)/12).toLocaleString('it-IT',{minimumFractionDigits:2}):'')}
          ${riga('Contratto',s.tipo_contratto?esc(s.tipo_contratto)+(s.data_inizio_contratto?' · dal '+fmt(s.data_inizio_contratto):''):'')}
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.8px;color:var(--muted-2);font-weight:700;margin-bottom:6px;">Prossime scadenze</div>
          ${scadenze.length?scadenze.slice(0,6).map(sc=>`
            <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
              <span>${esc(sc.nome||sc.tipo)}</span>
              <span style="white-space:nowrap;font-weight:600;color:${parseInt(sc.giorni)<15?'var(--danger)':'var(--muted)'};">${fmt(sc.scadenza)} · ${sc.giorni}g</span>
            </div>`).join(''):'<div style="font-size:12px;color:var(--muted);padding:7px 0;">Nessuna scadenza imminente.</div>'}

          <div style="display:flex;justify-content:space-between;align-items:baseline;margin:22px 0 6px;">
            <span style="font-size:10px;text-transform:uppercase;letter-spacing:1.8px;color:var(--muted-2);font-weight:700;">Fascicolo</span>
            <span style="font-size:11px;color:var(--muted);">${okN}/${check.length} completo</span>
          </div>
          <div style="height:4px;background:var(--bg2);border-radius:2px;margin-bottom:10px;"><div style="height:4px;width:${Math.round(okN/check.length*100)}%;background:var(--primary);border-radius:2px;"></div></div>
          ${check.map(c=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="color:var(--muted);">${c[0]}</span><span style="font-weight:600;color:${c[1]?'var(--success)':'var(--muted-2)'};">${c[1]?'presente':'mancante'}</span></div>`).join('')}

          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.8px;color:var(--muted-2);font-weight:700;margin:22px 0 6px;">Attività</div>
          ${riga('Interventi',String(s.num_interventi||0))}
          ${riga('Documenti',String(docs.length))}
          ${riga('Manutenzioni aperte',String(s.manutenzioni_aperte||0))}
          ${riga('Spese totali','€ '+parseFloat(s.totale_spese||0).toLocaleString('it-IT',{maximumFractionDigits:0}))}
        </div>
      </div>
      ${s.note?`<div style="margin-top:18px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--muted);">${esc(s.note)}</div>`:''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:18px;">
        <button class="btn btn-xs btn-gray" onclick="subDetSubview('documenti','overview')">Tutti i documenti</button>
        <button class="btn btn-xs btn-gray" onclick="subDetSubview('genealogia','overview')">Genealogia</button>
        <button class="btn btn-xs btn-gray" onclick="subDetSubview('scadenze','overview')">Tutte le scadenze</button>
      </div>`;

    }else if(tab==='catasto'){
    el.innerHTML=`
      ${sec('Dati catastali')}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px;margin-bottom:14px;">
        ${s.foglio?card('Foglio',esc(s.foglio)):''}
        ${s.particella?card('Particella',esc(s.particella)):''}
        ${s.subalterno?card('Subalterno',esc(s.subalterno)):''}
        ${s.categoria_cat?card('Categoria',esc(s.categoria_cat)):''}
        ${s.rendita?card('Rendita','€ '+parseFloat(s.rendita).toLocaleString('it-IT'),true):''}
        ${s.mq_commerciali?card('mq commerciali',parseFloat(s.mq_commerciali).toFixed(1)+' mq'):''}
        ${s.mq_calpestabili?card('mq calpestabili',parseFloat(s.mq_calpestabili).toFixed(1)+' mq'):''}
        ${s.anno_costruzione?card('Anno costruzione',s.anno_costruzione):''}
      </div>
      ${(!s.foglio&&!s.particella)?'<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Nessun dato catastale inserito — usa ✏️ Modifica per aggiungerli.</div>':''}
      ${s.note_catastali?sec('Note catastali')+`<div style="font-size:12px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:10px 14px;margin-bottom:12px;">${esc(s.note_catastali)}</div>`:''}
      ${sec('Documenti catastali')}
      ${_subDocFolder('📑 Visure','visura','Carica qui le visure catastali.')}
      ${_subDocFolder('📐 Planimetrie','planimetria','Carica qui le planimetrie.')}
      ${_subDocFolder('🏛️ Altri documenti catastali','catastale','Volture, denunce, docfa…')}`;

  }else if(tab==='ape'){
    const apeDocs=_subDocs('ape');
    el.innerHTML=`
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:9px;margin-bottom:14px;">
        ${card('Classe energetica', s.classe_energetica?esc(s.classe_energetica):'—', true)}
        ${apeDocs.length&&apeDocs[0].scadenza?card('Scadenza APE',fmt(apeDocs[0].scadenza)):''}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px;">ℹ️ L'APE ha validità 10 anni dalla data di rilascio. Imposta la scadenza sul documento per ricevere l'avviso.</div>
      ${_subDocFolder('⚡ Attestati APE','ape','Carica qui gli attestati di prestazione energetica.')}`;

  }else if(tab==='impianti'){
    await _caricaImpiantiDati();
    el.innerHTML=`
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Clicca su un impianto: dentro trovi la scheda tecnica compilabile e gli allegati (DiCo, libretti, verifiche…).</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;">
        ${Object.entries(SUB_IMPIANTI).map(([key,cfg])=>{
          const docs=_subDocs('imp_'+key);
          const dati=(currentSubData._impianti||{})[key];
          const sunto=_impRiassunto(key,dati);
          return `<div onclick="subDetGoImpianto('${key}')" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;transition:all .15s;" onmouseover="this.style.borderColor='var(--primary-2)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;">
              <span style="font-size:20px;filter:grayscale(.5);">${cfg.icona}</span>
              <span style="font-size:13.5px;font-weight:700;">${cfg.nome}</span>
            </div>
            ${sunto?`<div style="font-size:12px;color:var(--text);margin-bottom:7px;">${esc(sunto)}</div>`:`<div style="font-size:11.5px;color:var(--muted-2);margin-bottom:7px;font-style:italic;">Scheda tecnica da compilare</div>`}
            <div style="display:flex;gap:8px;font-size:10.5px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border);">
              <span>${docs.length} allegati</span>
              ${docs.slice(0,2).map(d=>`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;">📄 ${esc(d.nome||'')}</span>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;

  }else if(tab==='certificazioni'){
    el.innerHTML=`
      ${_subDocFolder('🛡️ Assicurazioni','polizza','Polizze fabbricato, RC, incendio — metti la scadenza per l\'avviso di rinnovo.')}
      ${_subDocFolder('🏆 Certificazioni','certificazione','Agibilità, collaudi, certificati…')}
      ${_subDocFolder('🏠 Agibilità','agibilita','Certificato di agibilità.')}
      ${_subDocFolder('📋 Collaudi','collaudo','Collaudi statici e tecnici.')}
      ${_subDocs('certif').length?_subDocFolder('📜 Altre certificazioni (archivio)','certif',''):''}`;

  }else if(tab==='foto'){
    const foto=_subDocs('foto');
    const isImg=u=>u&&(/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(u)||/\/image\/upload\//.test(u)||/\/api\/documenti\/\d+\/file/.test(u));
    el.innerHTML=`
      <div class="flex-between" style="margin-bottom:12px;">
        <span style="font-size:13px;color:var(--muted);">${foto.length} foto</span>
        <button class="btn btn-primary btn-sm" onclick="subAddDocPreset('foto','Foto immobile')">+ Aggiungi foto</button>
      </div>
      ${foto.length?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">
        ${foto.map(f=>`<div style="border:1px solid var(--border);border-radius:9px;overflow:hidden;background:var(--surface2);">
          ${isImg(f.url)?`<a href="${esc(fileUrl(f.url))}" target="_blank"><img src="${esc(fileUrl(f.url))}" style="width:100%;height:120px;object-fit:cover;display:block;" loading="lazy"></a>`:`<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:34px;">🖼️</div>`}
          <div style="padding:7px 10px;display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.nome||'Foto')}</span>
            <button class="btn btn-xs btn-gray" onclick="subDelDoc(${f.id})">✕</button>
          </div>
        </div>`).join('')}
      </div>`:'<div class="empty">Nessuna foto. Aggiungile per completare il fascicolo.</div>'}`;

  }else if(tab==='identita'){    let istatAlert='';
    if(s.data_inizio_contratto&&s.canone_annuo){
      const inizio=new Date(s.data_inizio_contratto),oggi=new Date();
      const mesi=(oggi.getFullYear()-inizio.getFullYear())*12+(oggi.getMonth()-inizio.getMonth());
      if(mesi>=12){const pct=s.tipo_contratto==='abitativo'?1.125:1.5;const aum=parseFloat(s.canone_annuo)*pct/100;istatAlert=`<div style="background:rgba(184,134,11,.1);border:1px solid rgba(184,134,11,.3);border-radius:8px;padding:12px 14px;font-size:12px;color:var(--warning);margin-bottom:12px;">📈 <strong>ISTAT dovuto!</strong> Contratto del ${fmt(s.data_inizio_contratto)} (${mesi} mesi fa). Aumento stimato: +€ ${aum.toLocaleString('it-IT',{minimumFractionDigits:2})}/anno (${pct}% FOI). <button class="btn btn-sm" style="background:rgba(184,134,11,.2);color:var(--warning);border:1px solid rgba(184,134,11,.4);margin-left:8px;" onclick="showSec('catasto',null)">Calcola ISTAT →</button></div>`;}
    }else if(!s.data_inizio_contratto||!s.canone_annuo){
      istatAlert=`<div style="background:rgba(100,116,139,.08);border:1px solid rgba(100,116,139,.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--muted);margin-bottom:12px;">ℹ️ Aggiungi <strong style="color:var(--text);">data inizio contratto</strong> e <strong style="color:var(--text);">canone annuo</strong> per il calcolo ISTAT automatico. <button class="btn btn-sm btn-gray" onclick="openAnaById('sub',currentSubId);" style="margin-left:8px;">Completa dati →</button></div>`;
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

  }else if(tab==='affitti'){
    el.innerHTML=renderTabPagamenti(data);
  }else if(tab==='economico'){
    if(!currentSubData._bollette)currentSubData._bollette=await api('/api/bollette?sub_id='+currentSubId)||[];
    el.innerHTML=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
      <button class="btn btn-xs btn-gray" onclick="subDetSubview('affitti','economico')">💶 Affitti</button>
      <button class="btn btn-xs btn-gray" onclick="subDetSubview('bollette','economico')">⚡ Bollette</button>
      <button class="btn btn-xs btn-gray" onclick="subDetSubview('costi','economico')">📊 Uscite</button>
      <button class="btn btn-xs btn-gray" onclick="subDetSubview('scadenze','economico')">📅 Scadenze</button>
    </div>`+renderTabEconomico(data)
    +`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:10px;align-items:start;margin-top:16px;">`
    +_subIstatCard(s)
    +`<div style="border:1px solid var(--border);border-radius:9px;padding:12px 14px;margin-bottom:10px;background:var(--card-alt);">
      <div class="flex-between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:12px;font-weight:700;">📐 Millesimi di proprietà</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <span style="font-size:14px;font-weight:700;color:var(--accent);font-family:monospace;">${s.millesimi?parseFloat(s.millesimi)+'‰':'non impostati'}</span>
          <button class="btn btn-xs btn-gray" onclick="setSubDetTab('millesimi',_subTabBtn('millesimi'))">✏️ Gestisci →</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;">
        <span style="color:var(--muted);">Calcola la tua quota:</span>
        <span>spesa totale condominio €</span>
        <input id="sub-mill-spesa" type="number" step="0.01" value="${s.spesa_cond_totale||''}" placeholder="0.00" style="width:110px;background:var(--card);border:1px solid var(--border);border-radius:7px;padding:6px 10px;font-size:12px;" oninput="calcQuotaMillesimi()" onchange="saveMillesimiSpesa()">
        <span>→ quota SUB: <strong id="sub-mill-quota" style="color:var(--accent);font-family:monospace;">${(s.millesimi&&s.spesa_cond_totale)?('€ '+(parseFloat(s.spesa_cond_totale)*parseFloat(s.millesimi)/1000).toLocaleString('it-IT',{minimumFractionDigits:2})+' ('+parseFloat(s.millesimi)+'‰)'):'—'}</strong></span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">I millesimi sono un dato strutturale del SUB: si gestiscono nella scheda dedicata, con storico delle variazioni.</div>
    </div></div>`
    +_subDocFolder('🏢 Spese condominiali','condominiale','Carica qui riparti, verbali assemblea e rendiconti condominiali (con importo e scadenza).');
    if(typeof wowNumbers==='function')wowNumbers(el);
  }else if(tab==='millesimi'){
    el.innerHTML='<div class="empty">Caricamento millesimi…</div>';
    await renderTabMillesimi(s);
  }else if(tab==='inquilini'){
    el.innerHTML=renderTabInquilini(data);
  }else if(tab==='interventi'){
    const items = data.interventi || [];
    const totale = items.reduce((s,x) => s + (parseFloat(x.prezzo)||0), 0);

    // Raggruppa per categoria_nome
    const gruppi = {};
    items.forEach(function(i) {
      const key = i.categoria_nome || 'Senza categoria';
      if (!gruppi[key]) gruppi[key] = { icona: i.icona || '🔧', rows: [], totale: 0 };
      gruppi[key].rows.push(i);
      gruppi[key].totale += parseFloat(i.prezzo) || 0;
    });

    let html =
      '<div class="flex-between" style="margin-bottom:12px;">' +
        '<span style="font-size:13px;color:var(--muted);">' +
          items.length + ' interventi — € ' + totale.toLocaleString('it-IT',{maximumFractionDigits:0}) +
        '</span>' +
        '<button class="btn btn-primary btn-sm" onclick="subActionNuovoIntervento();">+ Nuovo intervento</button>' +
      '</div>';

    if (!items.length) {
      html += '<div class="empty">Nessun intervento.</div>';
    } else {
      let ci = 0;
      Object.entries(gruppi).forEach(function(entry) {
        const catNome = entry[0], g = entry[1];
        const open  = ci < 3;
        const bid   = 'ca' + ci++;
        html +=
          '<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;">' +
            '<div class="sub-cat-hdr" data-bid="' + bid + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg2);cursor:pointer;user-select:none;">' +
              '<span>' + g.icona + '</span>' +
              '<span style="font-size:13px;font-weight:600;color:var(--text-strong);flex:1;">' + esc(catNome) + '</span>' +
              '<span style="font-size:11px;color:var(--muted);margin-right:6px;">' +
                g.rows.length + ' · € ' + g.totale.toLocaleString('it-IT',{maximumFractionDigits:0}) +
              '</span>' +
              '<span class="acc-arr" style="font-size:10px;color:var(--muted);">' + (open ? '▼' : '▶') + '</span>' +
            '</div>' +
            '<div id="' + bid + '"' + (open ? '' : ' style="display:none"') + '>';
        g.rows.forEach(function(i) {
          html +=
            '<div class="sub-int-row" data-id="' + i.id + '" style="display:flex;align-items:flex-start;gap:10px;padding:9px 14px;border-top:1px solid var(--border);cursor:pointer;">' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                  '<strong style="font-size:12px;color:var(--text-strong);">' + esc(i.fornitore_nome||'—') + '</strong>' +
                  (i.ha_notifica ? '<span class="badge badge-warn">⚠️</span>' : '') +
                  '<span style="font-size:11px;color:var(--muted);margin-left:auto;">' + (i.data_intervento ? fmt(i.data_intervento) : '—') + '</span>' +
                '</div>' +
                '<div style="font-size:11px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                  esc((i.descrizione||'').slice(0,90)) +
                '</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
                (i.allegati && i.allegati.length
                  ? '<span class="sub-alleg-btn" data-iid="' + i.id + '" style="font-size:10px;background:var(--info-bg);color:var(--info);border-radius:4px;padding:2px 6px;cursor:pointer;white-space:nowrap;" onclick="event.stopPropagation();">📎' + i.allegati.length + '</span>'
                  : '') +
                '<div style="font-size:12px;font-weight:600;white-space:nowrap;">' +
                  (i.prezzo ? '€ ' + parseFloat(i.prezzo).toLocaleString('it-IT',{minimumFractionDigits:2}) : '—') +
                '</div>' +
              '</div>' +
            '</div>' +
            // Allegati panel (hidden by default)
            (i.allegati && i.allegati.length
              ? '<div id="alleg-' + i.id + '" style="display:none;background:var(--bg2);border-top:1px solid var(--border);padding:8px 14px;">' +
                  i.allegati.map(function(a) {
                    return '<div style="font-size:11px;padding:3px 0;display:flex;align-items:center;gap:6px;">' +
                      '<span>' + (a.tipo==='fattura'?'🧾':a.tipo==='foto'?'🖼️':'📎') + '</span>' +
                      '<a href="' + esc(fileUrl(a.url)||'#') + '" target="_blank" style="color:var(--primary-dark);text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(a.nome||'Allegato') + '</a>' +
                      (a.dimensione ? '<span style="color:var(--muted);">' + Math.round(a.dimensione/1024) + ' KB</span>' : '') +
                    '</div>';
                  }).join('') +
                '</div>'
              : '');
        });
        html += '</div></div>';
      });
    }

    el.innerHTML = html;

    // Delegated: click accordion header
    el.querySelectorAll('.sub-cat-hdr').forEach(function(hdr) {
      hdr.addEventListener('click', function() {
        const body = document.getElementById(hdr.dataset.bid);
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        hdr.querySelector('.acc-arr').textContent = open ? '▶' : '▼';
      });
    });

    // Delegated: click intervento row
    el.querySelectorAll('.sub-int-row').forEach(function(row) {
      row.addEventListener('mouseenter', function() { row.style.background = 'var(--primary-bg)'; });
      row.addEventListener('mouseleave', function() { row.style.background = ''; });
      row.addEventListener('click', function() { openDet(parseInt(row.dataset.id)); });
    });

    // Delegated: toggle allegati panel
    el.querySelectorAll('.sub-alleg-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const panel = document.getElementById('alleg-' + btn.dataset.iid);
        if (panel) {
          const open = panel.style.display !== 'none';
          panel.style.display = open ? 'none' : '';
          btn.style.background = open ? 'var(--info-bg)' : 'var(--info)';
          btn.style.color      = open ? 'var(--info)'    : '#fff';
        }
      });
    });
  }else if(tab==='documenti'){
    const items = data.documenti || [];
    const today = new Date(); today.setHours(0,0,0,0);
    const icons = {fattura:'🧾',contratto:'📄',preventivo:'💼',verbale:'📋',bolletta:'⚡',catastale:'🏛️',planimetria:'📐',certif:'🏆',foto:'🖼️',altro:'📂'};

    // Raggruppa per tipo
    const gruppi = {};
    items.forEach(function(d) {
      const key = d.tipo || 'altro';
      if (!gruppi[key]) gruppi[key] = [];
      gruppi[key].push(d);
    });

    let html =
      '<div class="flex-between" style="margin-bottom:12px;">' +
        '<span style="font-size:13px;color:var(--muted);">' + items.length + ' documenti</span>' +
        '<button class="btn btn-primary btn-sm" onclick="subActionNuovoDoc();">+ Nuovo documento</button>' +
      '</div>';

    if (!items.length) {
      html += '<div class="empty">Nessun documento.</div>';
    } else {
      Object.entries(gruppi).forEach(function(entry) {
        const tipo = entry[0], docs = entry[1];
        const icona = icons[tipo] || '📂';
        html +=
          '<div style="margin-bottom:12px;">' +
            '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">' +
              icona + ' ' + tipo.replace(/_/g,' ') + ' (' + docs.length + ')' +
            '</div>';
        docs.forEach(function(d) {
          const scad      = d.scadenza ? new Date(d.scadenza) : null;
          const scaduto   = scad && scad < today;
          const scadBadge = scaduto
            ? '<span style="background:var(--danger-bg);color:var(--danger);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;">Scaduta ' + fmt(d.scadenza) + '</span>'
            : scad
              ? '<span style="background:var(--warning-bg);color:var(--warning);border-radius:4px;padding:1px 6px;font-size:10px;">Scade ' + fmt(d.scadenza) + '</span>'
              : '';
          html +=
            '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:7px;margin-bottom:6px;">' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:12px;font-weight:500;color:var(--text-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                  esc(d.nome||'Documento') +
                '</div>' +
                '<div style="font-size:11px;color:var(--muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
                  (d.data_documento ? '<span>' + fmt(d.data_documento) + '</span>' : '') +
                  (d.fornitore_nome ? '<span>· ' + esc(d.fornitore_nome) + '</span>' : '') +
                  (d.importo ? '<span>· € ' + parseFloat(d.importo).toLocaleString('it-IT') + '</span>' : '') +
                  scadBadge +
                '</div>' +
              '</div>' +
              (d.url ? '<a href="' + esc(fileUrl(d.url)) + '" target="_blank" class="btn btn-xs btn-gray" onclick="event.stopPropagation();">👁</a>' : '') +
            '</div>';
        });
        html += '</div>';
      });
    }

    el.innerHTML = html;
  }
  else if(tab==='contratti'){
    const items = data.contratti || [];
    const today = new Date(); today.setHours(0,0,0,0);

    let html =
      '<div class="flex-between" style="margin-bottom:12px;">' +
        '<span style="font-size:13px;color:var(--muted);">' + items.length + ' contratti</span>' +
      '</div>';

    if (!items.length) {
      html += '<div class="empty">Nessun contratto registrato.</div>';
    } else {
      items.forEach(function(ct) {
        const scad    = ct.data_scadenza ? new Date(ct.data_scadenza) : null;
        const scaduto = scad && scad < today;
        const attivo  = scad && scad >= today;
        const badge   = scaduto
          ? '<span style="background:var(--danger-bg);color:var(--danger);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;">Scaduto</span>'
          : attivo
            ? '<span style="background:var(--success-bg);color:var(--success);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;">Attivo</span>'
            : '<span style="background:var(--bg2);color:var(--muted);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;">N/D</span>';
        html +=
          '<div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;">' +
            '<div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">' +
                  '<strong style="font-size:13px;color:var(--text-strong);">' + esc(ct.nome||ct.tipo||'Contratto') + '</strong>' +
                  badge +
                '</div>' +
                '<div style="font-size:11px;color:var(--muted);">' +
                  (ct.fornitore_nome ? '🔧 ' + esc(ct.fornitore_nome) + ' · ' : '') +
                  (ct.data_inizio ? 'Dal ' + fmt(ct.data_inizio) : '') +
                  (ct.data_scadenza ? ' al ' + fmt(ct.data_scadenza) : '') +
                '</div>' +
                (ct.note ? '<div style="font-size:11px;color:var(--muted);margin-top:3px;font-style:italic;">' + esc(ct.note.slice(0,80)) + '</div>' : '') +
              '</div>' +
              (ct.url
                ? '<a href="' + esc(fileUrl(ct.url)) + '" target="_blank" class="btn btn-xs btn-gray" style="flex-shrink:0;" onclick="event.stopPropagation();">👁</a>'
                : '') +
            '</div>' +
          '</div>';
      });
    }

    el.innerHTML = html;
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
        ${b.url?`<a href="${fileUrl(b.url)}" target="_blank" class="btn btn-edit btn-sm">👁</a>`:''}
        ${b.stato!=='pagato'?`<button class="btn btn-success btn-sm" title="Segna pagata" onclick="pagaBollettaChiedi(${b.id},this)">✓</button>`:''}
      </div>`).join('')}`;
  }else if(tab==='manutenzioni'){
    const items=data.manutenzioni||[];
    const pc={urgente:'var(--red)',alta:'var(--orange)',normale:'var(--accent)',bassa:'var(--green)'};
    const pi={urgente:'🔴',alta:'🟠',normale:'🟡',bassa:'🟢'};
    el.innerHTML=`<div class="flex-between" style="margin-bottom:12px;"><span style="font-size:13px;color:var(--muted);">${items.length} manutenzioni</span><button class="btn btn-primary btn-sm" onclick="openModalMan();">+ Nuova</button></div>
      ${items.length?items.map(m=>`<div class="int-card" style="border-left:3px solid ${pc[m.priorita]||'var(--border)'};margin-bottom:8px;"><div class="int-card-hdr">${pi[m.priorita]||'⚪'} <strong style="font-size:13px;color:#0f172a;">${esc(m.tipo)}</strong><span style="font-size:11px;padding:2px 8px;border-radius:5px;background:var(--surface2);color:var(--muted);">${m.stato||'—'}</span>${m.costo?`<span class="td-price" style="margin-left:auto;">€ ${parseFloat(m.costo).toLocaleString('it-IT')}</span>`:''}</div><div style="font-size:11px;color:var(--muted);margin-top:4px;">${m.prossima_scadenza?'Prossima: '+fmt(m.prossima_scadenza)+' · ':''}${esc(m.ricorrenza||'Una tantum')}${m.fornitore_nome?' · '+esc(m.fornitore_nome):''}</div></div>`).join(''):'<div class="empty">Nessuna manutenzione.</div>'}`;

  }else if(tab==='costi'){
    // ── USCITE COMPLETE DEL SUB: interventi + manutenzioni + bollette, da data a data ──
    el.innerHTML='<div class="empty" style="padding:20px;">Caricamento costi…</div>';
    if(!currentSubData._bollette)currentSubData._bollette=await api('/api/bollette?sub_id='+currentSubId)||[];
    const rng=window._subCostiRange||{};
    const oggi=new Date();
    const dal=rng.dal||new Date(oggi.getFullYear()-1,oggi.getMonth(),1).toISOString().slice(0,10);
    const al=rng.al||oggi.toISOString().slice(0,10);
    window._subCostiRange={dal,al};
    const inR=d=>{if(!d)return false;const x=String(d).slice(0,10);return x>=dal&&x<=al;};
    const eur2=n=>'€ '+(n||0).toLocaleString('it-IT',{maximumFractionDigits:0});
    const usc=[
      ...(data.interventi||[]).filter(i=>i.prezzo&&inR(i.data_fattura||i.data_intervento||i.created_at)).map(i=>({ico:'🔧',fonte:'Intervento',dt:i.data_fattura||i.data_intervento||i.created_at,imp:parseFloat(i.prezzo)||0,desc:(i.fornitore_nome?i.fornitore_nome+' · ':'')+(i.descrizione||'')})),
      ...(data.manutenzioni||[]).filter(m=>m.costo&&inR(m.data_eseguita||m.data_programmata)).map(m=>({ico:'🔨',fonte:'Manutenzione',dt:m.data_eseguita||m.data_programmata,imp:parseFloat(m.costo)||0,desc:m.tipo||''})),
      ...(currentSubData._bollette||[]).filter(b=>b.stato==='pagato'&&b.importo&&inR(b.data_pagamento||b.scadenza)).map(b=>({ico:'⚡',fonte:'Bolletta '+(b.tipo||''),dt:b.data_pagamento||b.scadenza,imp:parseFloat(b.importo)||0,desc:(b.fornitore_nome||'')+(b.periodo_dal?' · periodo '+fmt(b.periodo_dal)+' → '+fmt(b.periodo_al):'')})),
    ].sort((a,b)=>new Date(b.dt)-new Date(a.dt));
    const tInt=usc.filter(u=>u.ico==='🔧').reduce((a,u)=>a+u.imp,0);
    const tMan=usc.filter(u=>u.ico==='🔨').reduce((a,u)=>a+u.imp,0);
    const tBol=usc.filter(u=>u.ico==='⚡').reduce((a,u)=>a+u.imp,0);
    const tot=tInt+tMan+tBol;
    const bollNonPagate=(currentSubData._bollette||[]).filter(b=>b.stato!=='pagato'&&b.importo);
    el.innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;font-size:12px;">
        <span style="color:var(--muted);">Uscite dal</span>
        <input type="date" id="subcosti-dal" value="${dal}" style="font-size:12px;padding:6px 8px;border:1px solid var(--border-2);border-radius:7px;background:var(--card);">
        <span style="color:var(--muted);">al</span>
        <input type="date" id="subcosti-al" value="${al}" style="font-size:12px;padding:6px 8px;border:1px solid var(--border-2);border-radius:7px;background:var(--card);">
        <button class="btn btn-xs btn-primary" onclick="window._subCostiRange={dal:document.getElementById('subcosti-dal').value,al:document.getElementById('subcosti-al').value};renderSubDetTab('costi')">Aggiorna</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;"><div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:1.4px;margin-bottom:4px;">Totale periodo</div><div style="font-size:20px;font-weight:700;color:var(--terra,#c2542e);font-family:'Fraunces',serif;">${eur2(tot)}</div></div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;"><div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:1.4px;margin-bottom:4px;">🔧 Interventi</div><div style="font-size:16px;font-weight:700;">${eur2(tInt)}</div></div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;"><div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:1.4px;margin-bottom:4px;">🔨 Manutenzioni</div><div style="font-size:16px;font-weight:700;">${eur2(tMan)}</div></div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;"><div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:1.4px;margin-bottom:4px;">⚡ Bollette pagate</div><div style="font-size:16px;font-weight:700;">${eur2(tBol)}</div></div>
      </div>
      ${bollNonPagate.length?`<div style="background:#fdf3f2;border:1px solid rgba(142,67,67,.25);border-radius:8px;padding:9px 13px;margin-bottom:14px;font-size:12px;color:var(--danger);">⚠ ${bollNonPagate.length} bollette ancora da pagare per ${eur2(bollNonPagate.reduce((a,b)=>a+parseFloat(b.importo),0))} (non incluse nel totale)</div>`:''}
      ${!usc.length?'<div class="empty">Nessuna uscita nel periodo selezionato.</div>':usc.map(u=>`
        <div style="display:flex;align-items:center;gap:11px;padding:9px 12px;border-bottom:1px solid var(--border);">
          <span style="font-size:16px;">${u.ico}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.fonte)}${u.desc?' — '+esc(String(u.desc).slice(0,70)):''}</div>
            <div style="font-size:10.5px;color:var(--muted);">${fmt(u.dt)}</div>
          </div>
          <span style="font-weight:700;color:var(--terra,#c2542e);font-size:13px;flex-shrink:0;">${eur2(u.imp)}</span>
        </div>`).join('')}`;

  }else if(tab==='scadenze'){
    const items=data.scadenze||[];
    el.innerHTML=items.length?`<div style="display:flex;flex-direction:column;gap:8px;">${items.map(sc=>{const gg=parseInt(sc.giorni);const col=gg<0?'var(--red)':gg<30?'var(--orange)':gg<90?'var(--accent)':'var(--green)';return`<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-left:3px solid ${col};border-radius:8px;"><span style="font-size:18px;">${sc.tipo==='documento'?'📄':'🔨'}</span><div style="flex:1;"><div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(sc.nome)}</div><div style="font-size:11px;color:var(--muted);">${esc(sc.tipo)} · ${fmt(sc.scadenza)}</div></div><span style="font-weight:700;color:${col};font-size:12px;">${gg<0?`Scaduto ${-gg}gg fa`:gg===0?'Scade oggi':`${gg} giorni`}</span></div>`;}).join('')}</div>` : '<div class="empty">Nessuna scadenza imminente 🎉</div>';

  }else if(tab==='genealogia'){
    el.innerHTML='<div class="empty" style="padding:20px;">Caricamento genealogia…</div>';
    const gen = await api('/api/subs/'+currentSubId+'/genealogia');
    if(!gen){el.innerHTML='<div class="empty">Errore caricamento</div>';return;}
    const s = gen.sub;
    const tipoLabel = {scissione:'✂️ Scissione',fusione:'🔗 Fusione',fusione_origine:'🔗 Origine fusione'};
    el.innerHTML=`
      <div style="text-align:center;padding:20px 0;">
        ${gen.padri.length?`<div style="margin-bottom:16px;">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">Deriva da</div>
          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            ${gen.padri.map(p=>`
              <div style="text-align:center;">
                <div class="tree-node" onclick="openSubDetail(${p.sub_padre})" style="flex-direction:column;padding:12px 16px;gap:4px;">
                  <strong style="color:#0f172a;">${esc(p.codice_padre||'—')}</strong>
                  <span style="font-size:10px;color:var(--muted);">${tipoLabel[p.tipo]||p.tipo}</span>
                  ${p.data?`<span style="font-size:9px;color:var(--muted);">${fmt(p.data)}</span>`:''}
                </div>
                <div class="tree-connector">↓</div>
              </div>`).join('')}
          </div>
        </div>`:''}
        
        <!-- SUB corrente -->
        <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(107,142,107,.15);border:2px solid var(--accent);border-radius:10px;padding:14px 20px;margin:8px 0;">
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
    const tcol={modifica:'rgba(107,142,107,.2)',nota:'rgba(184,134,11,.15)',documento:'rgba(193,154,107,.2)',manutenzione:'rgba(239,68,68,.2)',creazione:'rgba(107,142,107,.2)'};
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

// ── ECONOMICO: panoramica GENERALE del SUB (entrate + uscite + sospesi) ──
function renderTabEconomico(data) {
  const ec = data.economico || {};
  const pagamenti = data.pagamenti || [];
  const bollette = (typeof currentSubData!=='undefined'&&currentSubData?._bollette)||[];
  const annoCorr = new Date().getFullYear();
  const eur0 = n=>'€ '+(n||0).toLocaleString('it-IT',{maximumFractionDigits:0});
  const annoDi = d=>d?new Date(d).getFullYear():null;

  const canoneMese = data.sub?.canone_annuo ? parseFloat(data.sub.canone_annuo)/12 : 0;
  const insoluti = pagamenti.filter(p=>p.stato==='insoluto'||p.stato==='ritardo');
  const insTot = insoluti.reduce((a,p)=>a+(parseFloat(p.importo)||0),0);
  const entAnno = ec.entratePerAnno?.[annoCorr]||0;

  // Uscite dell'anno corrente: interventi + manutenzioni + bollette pagate
  const usciteAnno =
    (data.interventi||[]).filter(i=>i.prezzo&&annoDi(i.data_fattura||i.data_intervento||i.created_at)===annoCorr).reduce((a,i)=>a+parseFloat(i.prezzo),0)
    +(data.manutenzioni||[]).filter(m=>m.costo&&annoDi(m.data_eseguita||m.data_programmata)===annoCorr).reduce((a,m)=>a+parseFloat(m.costo),0)
    +bollette.filter(b=>b.stato==='pagato'&&b.importo&&annoDi(b.data_pagamento||b.scadenza)===annoCorr).reduce((a,b)=>a+parseFloat(b.importo),0);
  const nettoAnno = entAnno - usciteAnno;
  const bollDaPag = bollette.filter(b=>b.stato!=='pagato'&&b.importo);
  const bollDaPagTot = bollDaPag.reduce((a,b)=>a+parseFloat(b.importo),0);

  // Ultimi movimenti (entrate + uscite mescolate, più recenti prima)
  const movimenti = [
    ...pagamenti.filter(p=>p.stato==='pagato').map(p=>({dt:p.data_pagamento||new Date(p.anno,(p.mese||1)-1,1).toISOString(),ico:'💶',lbl:'Canone '+['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][p.mese]+' '+p.anno,imp:parseFloat(p.importo)||0,segno:1})),
    ...(data.interventi||[]).filter(i=>i.prezzo).map(i=>({dt:i.data_fattura||i.data_intervento||i.created_at,ico:'🔧',lbl:'Intervento'+(i.fornitore_nome?' · '+i.fornitore_nome:''),imp:parseFloat(i.prezzo)||0,segno:-1})),
    ...(data.manutenzioni||[]).filter(m=>m.costo).map(m=>({dt:m.data_eseguita||m.data_programmata,ico:'🔨',lbl:'Manutenzione · '+(m.tipo||''),imp:parseFloat(m.costo)||0,segno:-1})),
    ...bollette.filter(b=>b.stato==='pagato'&&b.importo).map(b=>({dt:b.data_pagamento||b.scadenza,ico:'⚡',lbl:'Bolletta '+(b.tipo||''),imp:parseFloat(b.importo)||0,segno:-1})),
  ].filter(m=>m.dt).sort((a,b)=>new Date(b.dt)-new Date(a.dt)).slice(0,8);

  return `
    <!-- Quadro generale -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px;">
      <div class="card" style="padding:13px 15px;margin:0;">
        <div style="font-size:9.5px;color:var(--muted-2);text-transform:uppercase;letter-spacing:1.6px;font-weight:700;margin-bottom:6px;">Entrate ${annoCorr}</div>
        <div class="wow-num" style="font-family:'Fraunces',serif;font-size:22px;font-weight:600;color:var(--success);">${eur0(entAnno)}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:3px;">${canoneMese?'canone '+eur0(canoneMese)+'/mese':'canone non impostato'}</div>
      </div>
      <div class="card" style="padding:13px 15px;margin:0;">
        <div style="font-size:9.5px;color:var(--muted-2);text-transform:uppercase;letter-spacing:1.6px;font-weight:700;margin-bottom:6px;">Uscite ${annoCorr}</div>
        <div class="wow-num" style="font-family:'Fraunces',serif;font-size:22px;font-weight:600;color:var(--terra,#c2542e);">${eur0(usciteAnno)}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:3px;">interventi + manutenzioni + bollette</div>
      </div>
      <div class="card" style="padding:13px 15px;margin:0;">
        <div style="font-size:9.5px;color:var(--muted-2);text-transform:uppercase;letter-spacing:1.6px;font-weight:700;margin-bottom:6px;">Netto ${annoCorr}</div>
        <div class="wow-num" style="font-family:'Fraunces',serif;font-size:22px;font-weight:600;color:${nettoAnno>=0?'var(--success)':'var(--danger)'};">${nettoAnno>=0?'+':''}${eur0(nettoAnno)}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:3px;">storico: ${ec.profittoNetto>=0?'+':''}${eur0(ec.profittoNetto)}</div>
      </div>
      <div class="card" style="padding:13px 15px;margin:0;">
        <div style="font-size:9.5px;color:var(--muted-2);text-transform:uppercase;letter-spacing:1.6px;font-weight:700;margin-bottom:6px;">Da incassare</div>
        <div class="wow-num" style="font-family:'Fraunces',serif;font-size:22px;font-weight:600;color:${insoluti.length?'var(--danger)':'var(--success)'};">${eur0(insTot)}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:3px;">${insoluti.length?insoluti.length+' canoni insoluti':'tutto in regola ✓'}</div>
      </div>
    </div>

    <!-- Cose in sospeso -->
    ${(bollDaPag.length||insoluti.length)?`<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:16px;">
      ${bollDaPag.length?`<div onclick="subDetSubview('bollette','economico')" style="display:flex;align-items:center;gap:10px;background:#fdf6ec;border:1px solid rgba(194,84,46,.3);border-radius:9px;padding:10px 14px;cursor:pointer;">
        <span style="font-size:16px;">⚡</span>
        <span style="flex:1;font-size:12.5px;font-weight:600;">${bollDaPag.length} bollett${bollDaPag.length===1?'a':'e'} da pagare — ${eur0(bollDaPagTot)}</span>
        <span style="color:var(--muted-2);">›</span>
      </div>`:''}
      ${insoluti.length?`<div onclick="subDetSubview('affitti','economico')" style="display:flex;align-items:center;gap:10px;background:#fdf3f2;border:1px solid rgba(142,67,67,.3);border-radius:9px;padding:10px 14px;cursor:pointer;">
        <span style="font-size:16px;">💶</span>
        <span style="flex:1;font-size:12.5px;font-weight:600;">${insoluti.length} canon${insoluti.length===1?'e':'i'} non incassat${insoluti.length===1?'o':'i'} — ${eur0(insTot)}</span>
        <span style="color:var(--muted-2);">›</span>
      </div>`:''}
    </div>`:''}

    <!-- Ultimi movimenti -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Ultimi movimenti</div>
      <button class="btn btn-primary btn-sm" onclick="subActionPagamento()">+ Registra pagamento</button>
    </div>
    ${!movimenti.length?'<div class="empty">Nessun movimento registrato: incassi e spese compariranno qui.</div>':
      movimenti.map(m=>`<div style="display:flex;align-items:center;gap:11px;padding:8px 10px;border-bottom:1px solid var(--border);">
        <span style="font-size:15px;">${m.ico}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.lbl)}</div>
          <div style="font-size:10.5px;color:var(--muted);">${fmt(m.dt)}</div>
        </div>
        <span style="font-weight:700;font-size:13px;color:${m.segno>0?'var(--success)':'var(--terra,#c2542e)'};">${m.segno>0?'+':'−'} ${eur0(m.imp)}</span>
      </div>`).join('')}`;
}

// ── AFFITTI: griglia pagamenti per anno (sotto-cartella di Economico) ──
function renderTabPagamenti(data) {
  const ec = data.economico || {};
  const pagamenti = data.pagamenti || [];
  const mesi = ['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const statoColors = {pagato:'var(--green)',atteso:'var(--muted)',ritardo:'var(--orange)',insoluto:'var(--red)'};
  const statoIcons = {pagato:'✅',atteso:'⏳',ritardo:'⚠️',insoluto:'🔴'};
  const annoCorr = new Date().getFullYear();
  const eur0 = n=>'€ '+(n||0).toLocaleString('it-IT',{maximumFractionDigits:0});
  const pagPerAnno = {};
  pagamenti.forEach(p => { if(!pagPerAnno[p.anno]) pagPerAnno[p.anno]=[];  pagPerAnno[p.anno].push(p); });
  const anni = Object.keys(pagPerAnno).sort((a,b)=>b-a);
  if(typeof window!=='undefined'&&window._subEcoAnno===undefined)window._subEcoAnno=null;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Pagamenti affitto per anno</div>
      <button class="btn btn-primary btn-sm" onclick="subActionPagamento()">+ Registra pagamento</button>
    </div>

    ${!pagamenti.length ? '<div class="empty">Nessun pagamento registrato. Usa "Genera anno affitti" per creare tutti i mesi.</div>' : ''}
    ${anni.map(anno => {
      const aperto = window._subEcoAnno ? String(window._subEcoAnno)===String(anno) : String(anno)===String(annoCorr);
      const pags = pagPerAnno[anno];
      const nPag = pags.filter(p=>p.stato==='pagato').length;
      return `
      <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden;">
        <div onclick="window._subEcoAnno='${anno}';subDetSubview('affitti','economico')" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg2);cursor:pointer;user-select:none;">
          <span style="font-size:13px;font-weight:700;">📅 ${anno}</span>
          <span style="font-size:11px;color:var(--muted);">${nPag}/${pags.length} pagati · ${eur0(ec.entratePerAnno?.[anno]||0)} incassati</span>
          ${pags.some(p=>p.stato==='insoluto')?'<span style="font-size:10px;background:#fdf3f2;color:var(--danger);border-radius:10px;padding:1px 8px;font-weight:700;">⚠ insoluti</span>':''}
          <span style="margin-left:auto;font-size:10px;color:var(--muted);">${aperto?'▼':'▶'}</span>
        </div>
        ${aperto?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:7px;padding:12px 14px;">
          ${pags.map(p=>`
            <div onclick="pagMenu(${p.id},this)" title="Clicca per modificare" style="background:${p.stato==='pagato'?'rgba(62,107,82,.1)':p.stato==='insoluto'?'rgba(142,67,67,.09)':'var(--surface2)'};border:1px solid ${p.stato==='pagato'?'rgba(62,107,82,.35)':p.stato==='insoluto'?'rgba(142,67,67,.35)':'var(--border)'};border-radius:8px;padding:9px 11px;cursor:pointer;transition:all .15s;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform=''">
              <div style="font-size:11px;font-weight:700;color:var(--text-strong);">${mesi[p.mese]}</div>
              <div style="font-size:10px;color:${statoColors[p.stato]||'var(--muted)'};margin-top:1px;">${statoIcons[p.stato]||''} ${p.stato||'—'}</div>
              <div style="font-size:11.5px;font-weight:700;color:${p.stato==='pagato'?'var(--success)':'var(--text-strong)'};margin-top:2px;">€ ${parseFloat(p.importo).toLocaleString('it-IT')}</div>
            </div>`).join('')}
        </div>`:''}
      </div>`;
    }).join('')}`;
}

// ── Menu azioni su un singolo mese (pagato / insoluto / elimina) ──
function _pagMenuClose(){document.getElementById('pag-menu')?.remove();document.removeEventListener('click',_pagMenuOut);}
function _pagMenuOut(e){const m=document.getElementById('pag-menu');if(m&&!m.contains(e.target))_pagMenuClose();}
function pagMenu(pid,el){
  _pagMenuClose();
  const m=document.createElement('div');
  m.id='pag-menu';
  m.style.cssText='position:fixed;z-index:500;background:var(--card);border:1px solid var(--border-2);border-radius:10px;box-shadow:0 10px 26px rgba(20,25,20,.2);padding:7px;display:flex;gap:6px;flex-wrap:wrap;';
  m.innerHTML=`<button class="btn btn-xs btn-success" onclick="pagStato(${pid},'pagato')">✓ Pagato</button>
    <button class="btn btn-xs" style="background:#fdf3f2;color:var(--danger);border:1px solid rgba(142,67,67,.3);" onclick="pagStato(${pid},'insoluto')">⚠ Insoluto</button>
    <button class="btn btn-xs btn-gray" onclick="pagStato(${pid},'atteso')">⏳ Atteso</button>
    <button class="btn btn-xs btn-gray" onclick="_pagMenuClose();deletePagamento(${pid})">🗑</button>`;
  document.body.appendChild(m);
  const r=el.getBoundingClientRect();
  m.style.left=Math.max(8,Math.min(r.left,window.innerWidth-m.offsetWidth-8))+'px';
  m.style.top=Math.min(r.bottom+5,window.innerHeight-60)+'px';
  setTimeout(()=>document.addEventListener('click',_pagMenuOut),0);
}
async function pagStato(pid,stato){
  _pagMenuClose();
  const body={stato};
  if(stato==='pagato')body.data_pagamento=new Date().toISOString().split('T')[0];
  const r=await api('/api/pagamenti-affitto/'+pid,{method:'PUT',body:JSON.stringify(body)});
  if(!r||r.error){toast('❌ '+(r?.error||'Aggiornamento fallito'),'error');return;}
  toast(stato==='pagato'?'✓ Segnato pagato':stato==='insoluto'?'⚠ Segnato insoluto':'Aggiornato ✓');
  const data=await api('/api/subs/'+currentSubId+'/detail');
  if(data){
    const boll=currentSubData?._bollette;
    currentSubData=data;
    if(boll)currentSubData._bollette=boll;
    if(subDetTab==='affitti')subDetSubview('affitti','economico');else renderSubDetTab('economico');
  }
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

function subActionNuovoIntervento() {
  const subId = currentSubId;
  
  openModalInt();
  setTimeout(() => {
    const sub = (DB.subs || []).find(x => x.id === subId);
    if (sub) {
      document.getElementById('fi-sede').value = sub.sede_id || '';
      if (typeof filterSubBySede === 'function') filterSubBySede();
    }
    document.getElementById('fi-sub').value = subId;
  }, 100);
}

function subActionNuovoDoc() { subAddDocPreset('documento'); }

function subActionManutenzione() { openModalMan(); setTimeout(()=>{ document.getElementById('man-sub').value=currentSubId; },100); }

function subActionNuovaBolletta() {
  
  openModalBoll(currentSubId);
}

function subActionNuovoAffitto() {
  // Da Affitti: mostra SEMPRE il campo SUB (preselezionato se c'è un SUB corrente)
  const fld = document.getElementById('pag-sub-field');
  const sel = document.getElementById('pag-sub-sel');
  if (fld && sel) {
    sel.innerHTML = '<option value="">— Seleziona il SUB —</option>' +
      (DB.subs||[]).map(s => `<option value="${s.id}">${esc(s.codice)}</option>`).join('');
    fld.style.display = '';
    if (currentSubId) sel.value = currentSubId;
  }
  subActionPagamento();
}

function subActionNota() { setSubDetTab('timeline',_subTabBtn('timeline')); setTimeout(()=>document.getElementById('tl-nota-txt')?.focus(),150); }

async function savePagamento() {
  const v = id => document.getElementById(id)?.value||'';
  if(!v('pag-anno')||!v('pag-importo')){toast('Anno e importo obbligatori','error');return;}
  const subId = parseInt(v('pag-sub-sel')) || currentSubId || null;
  if(!subId){toast('Seleziona il SUB','error');return;}
  const s = currentSubData?.sub;
  const r = await api('/api/pagamenti-affitto',{method:'POST',body:JSON.stringify({
    sub_id: subId, inquilino_id: s?.inquilino_id||null,
    anno: parseInt(v('pag-anno')), mese: parseInt(v('pag-mese')),
    importo: v('pag-importo'), data_pagamento: v('pag-data')||null,
    stato: v('pag-stato'), note: v('pag-note'),
  })});
  closeM('modal-pagamento');
  if(typeof loadAffitti==='function'&&document.getElementById('sec-affitti')?.classList.contains('active'))loadAffitti();
  if(currentSubId&&document.getElementById('sec-subdet')?.classList.contains('active')){
    const data = await api('/api/subs/'+currentSubId+'/detail');
    if(data){currentSubData=data; renderSubDetTab(subDetTab);}
  }
  toast('Pagamento registrato ✓');
}

async function deletePagamento(id) {
  if(!await appConfirm('Eliminare questo pagamento?'))return;
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
  // Mostra il codice del SUB nel titolo
  const subCodice = currentSubData?.sub?.codice || ('SUB #' + currentSubId);
  const titleEl = document.querySelector('#modal-cambio-inq .modal-title');
  if (titleEl) titleEl.textContent = '👤 Cambia Inquilino — ' + subCodice;
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
  if (!r || r.error) { toast('Errore: ' + (r?.error || 'risposta vuota'), 'error'); return; }
  closeM('modal-cambio-inq');
  await loadDD();
  const data=await api('/api/subs/'+currentSubId+'/detail');
  if(data){currentSubData=data;renderSubDetTab('inquilini');}
  toast('Inquilino aggiornato ✓');
}

async function deleteStorInq(id){
  if(!await appConfirm('Eliminare record storico?'))return;
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

// Chiede la data prima di segnare pagata (piccolo popover inline al posto del bottone)
function pagaBollettaChiedi(id,btn){
  const oggi=new Date().toISOString().split('T')[0];
  const wrap=document.createElement('span');
  wrap.style.cssText='display:inline-flex;gap:5px;align-items:center;';
  wrap.innerHTML=`<span style="font-size:11px;color:var(--muted);">pagata il</span>
    <input type="date" id="pagab-${id}" value="${oggi}" style="font-size:12px;padding:5px 7px;border:1px solid var(--border-2);border-radius:7px;background:var(--card);">
    <button class="btn btn-success btn-sm" onclick="pagaBolletta(${id},document.getElementById('pagab-${id}').value)">✓</button>`;
  btn.replaceWith(wrap);
}

async function pagaBolletta(id,data){
  await api('/api/bollette/'+id,{method:'PUT',body:JSON.stringify({stato:'pagato',data_pagamento:data||new Date().toISOString().split('T')[0]})});
  toast('✓ Bolletta pagata');
  if(typeof currentSubData!=='undefined'&&currentSubData)delete currentSubData._bollette;
  if(document.getElementById('sec-subdet')?.classList.contains('active'))renderSubDetTab(typeof subDetTab!=='undefined'&&subDetTab?subDetTab:'bollette');
  else loadBollette();
}

async function segnaAffittoPagato(id){
  await api('/api/pagamenti-affitto/'+id,{method:'PUT',body:JSON.stringify({stato:'pagato',data_pagamento:new Date().toISOString().split('T')[0]})});
  loadAffitti();toast('✓ Pagamento registrato');
}

async function delAffitto(id){if(!await appConfirm('Eliminare?'))return;await api('/api/pagamenti-affitto/'+id,{method:'DELETE'});loadAffitti();toast('Eliminato','error');}

function getDaysUntil(dateStr){
  if(!dateStr||dateStr==='senza data')return 999;
  return Math.floor((new Date(dateStr)-new Date())/(1000*60*60*24));
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

function docFileSelected(input){docFileInput=input.files[0];if(docFileInput)document.getElementById('doc-file-zone').textContent=`✓ ${docFileInput.name} (${Math.round(docFileInput.size/1024)} KB)`;if(typeof _docAiRowRefresh==='function')_docAiRowRefresh();}

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
    if(ev._tipo==='intervento'){icon=ev.icona||'🔧';color='rgba(107,142,107,.2)';titolo=esc(ev.descrizione?.slice(0,80)||'Intervento');desc=`${ev.fornitore?'Fornitore: '+esc(ev.fornitore)+' · ':''}${ev.prezzo?'€ '+parseFloat(ev.prezzo).toLocaleString('it-IT'):''}${ev.protocollo?' · Prot. '+esc(ev.protocollo):''}`;}
    else if(ev._tipo==='documento'){icon=DOC_ICONS[ev.tipo]||'📄';color='rgba(193,154,107,.2)';titolo=esc(ev.nome||'Documento');desc=`Tipo: ${ev.tipo}${ev.importo?' · € '+parseFloat(ev.importo).toLocaleString('it-IT'):''}${ev.scadenza?' · Scad. '+fmt(ev.scadenza):''}`;}
    else{const ti={modifica:'✏️',nota:'📝',documento:'📁',creazione:'🆕'};icon=ti[ev.tipo]||'📌';color='rgba(184,134,11,.15)';titolo=esc(ev.titolo||'Evento');desc=esc(ev.descrizione||'');}
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

// ═══ Adeguamento ISTAT (tab Economico) ═══
function _subIstatProssima(s){
  // Data della prossima revisione: quella configurata, oppure ultima revisione/inizio contratto + 12 mesi
  if(s.istat_data_prossima_revisione)return new Date(s.istat_data_prossima_revisione);
  const base=s.istat_data_ultima_revisione||s.data_inizio_contratto;
  if(!base)return null;
  const d=new Date(base);d.setMonth(d.getMonth()+12);
  return d;
}

function _subIstatCard(s){
  const canone=parseFloat(s.canone_annuo)||0;
  const prossima=_subIstatProssima(s);
  let stato='';
  if(!canone){
    stato=`<span style="font-size:12px;color:var(--muted);">Imposta il canone annuo nell'anagrafica per attivare il promemoria ISTAT.</span>`;
  }else if(!prossima){
    stato=`<span style="font-size:12px;color:var(--muted);">Nessuna data: imposta la data di inizio contratto o configura l'ISTAT.</span>`;
  }else{
    const gg=Math.ceil((prossima-new Date())/86400000);
    const dataStr=prossima.toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
    const pill=(bg,col,txt)=>`<span style="background:${bg};color:${col};border-radius:20px;padding:3px 12px;font-size:11.5px;font-weight:700;white-space:nowrap;">${txt}</span>`;
    if(gg<0)stato=pill('var(--danger)','#fff','⚠ Scaduto da '+(-gg)+' giorni')+` <span style="font-size:12px;color:var(--muted);">era previsto il ${dataStr}</span>`;
    else if(gg<=60)stato=pill('#f5e6c8','#8a6d1a','⏳ Tra '+gg+' giorni')+` <span style="font-size:12px;color:var(--muted);">il ${dataStr}</span>`;
    else stato=pill('#dcefe2','var(--success)','✓ Tra '+gg+' giorni')+` <span style="font-size:12px;color:var(--muted);">il ${dataStr}</span>`;
  }
  const ultima=s.istat_data_ultima_revisione?new Date(s.istat_data_ultima_revisione).toLocaleDateString('it-IT'):null;
  return `<div style="border:1px solid var(--border);border-radius:9px;padding:12px 14px;margin-bottom:10px;background:var(--card-alt);">
    <div class="flex-between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:12px;font-weight:700;">📈 Adeguamento ISTAT del canone</div>
      <button class="btn btn-xs btn-gray" onclick="openIstatCfg(${s.id})">⚙ Configura</button>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">${stato}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">
      Canone attuale: <strong style="color:var(--text-strong);">€ ${canone?canone.toLocaleString('it-IT'):'—'}/anno</strong>
      ${canone?` (€ ${(canone/12).toLocaleString('it-IT',{maximumFractionDigits:0})}/mese)`:''}
      ${ultima?` · Ultima revisione: ${ultima}${s.istat_percentuale?' (+'+s.istat_percentuale+'%)':''}`:''}
    </div>
    ${canone?`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;">
      <span>Indice ISTAT</span>
      <input id="sub-istat-pct" type="number" step="0.1" placeholder="es. 1.8" style="width:80px;background:var(--card);border:1px solid var(--border);border-radius:7px;padding:6px 10px;font-size:12px;" oninput="_subIstatPreview(${canone})">
      <span>% → nuovo canone: <strong id="sub-istat-preview" style="color:var(--accent);font-family:monospace;">—</strong></span>
      <button class="btn btn-xs btn-primary" onclick="subIstatApplica()">✓ Applica adeguamento</button>
    </div>`:''}
  </div>`;
}

function _subIstatPreview(canone){
  const pct=parseFloat(document.getElementById('sub-istat-pct')?.value);
  const el=document.getElementById('sub-istat-preview');
  if(!el)return;
  el.textContent=isNaN(pct)?'—':'€ '+(Math.round(canone*(1+pct/100)*100)/100).toLocaleString('it-IT')+'/anno';
}

async function subIstatApplica(){
  const pct=parseFloat(document.getElementById('sub-istat-pct')?.value);
  if(isNaN(pct)){toast('Inserisci la percentuale ISTAT (es. 1.8)','error');return;}
  const canone=parseFloat(currentSubData?.sub?.canone_annuo)||0;
  const nuovo=Math.round(canone*(1+pct/100)*100)/100;
  if(!await appConfirm(`Applicare l'adeguamento ISTAT del ${pct}%?\n\nCanone: € ${canone.toLocaleString('it-IT')} → € ${nuovo.toLocaleString('it-IT')} /anno.\n\nLa prossima revisione verrà riprogrammata automaticamente.`,{icon:'📈',title:'Adeguamento ISTAT',okText:'Applica'}))return;
  const r=await api('/api/subs/'+currentSubId+'/istat/applica',{method:'POST',body:JSON.stringify({percentuale:pct})});
  if(!r||r.error){toast('❌ '+(r?.error||'Operazione fallita'),'error');return;}
  toast(`📈 Canone aggiornato: € ${r.canone_nuovo.toLocaleString('it-IT')}/anno ✓`);
  if(currentSubData?.sub)Object.assign(currentSubData.sub,r.sub);
  renderSubDetTab('economico');
}

// ═══ Millesimi (tab Economico) ═══
// Salva SOLO la spesa condominiale simulata per il calcolo rapido quota — i millesimi veri e propri
// (dato strutturale) si gestiscono ora nella scheda dedicata "Millesimi", non da qui.
async function saveMillesimiSpesa(){
  const spesa=document.getElementById('sub-mill-spesa')?.value||'';
  const r=await api('/api/subs/'+currentSubId+'/millesimi',{method:'PUT',body:JSON.stringify({millesimi:null,spesa_cond_totale:spesa||null})});
  if(!r||r.error){toast('Errore: '+(r?.error||'salvataggio fallito'),'error');return;}
  if(currentSubData?.sub){currentSubData.sub.spesa_cond_totale=r.spesa_cond_totale;}
  toast('📐 Spesa condominio salvata ✓');
  calcQuotaMillesimi();
}
function calcQuotaMillesimi(){
  const mill=parseFloat(currentSubData?.sub?.millesimi||0);
  const tot=parseFloat(document.getElementById('sub-mill-spesa')?.value||0);
  const out=document.getElementById('sub-mill-quota');
  if(!out)return;
  out.textContent=(mill&&tot)?('€ '+(tot*mill/1000).toLocaleString('it-IT',{minimumFractionDigits:2}))+' ('+mill+'‰)':'—';
}

// ═══════════════════════════════════════════════════════════
// MILLESIMI CONDOMINIALI — sezione dedicata sulla scheda SUB
// Dato strutturale permanente: tabella millesimale di riferimento, valore corrente per il SUB,
// data di validità, storico delle variazioni nel tempo. Più tabelle = criteri diversi per tipo di spesa.
// ═══════════════════════════════════════════════════════════
async function renderTabMillesimi(s){
  const el=document.getElementById('sub-det-content');
  const millData=await api('/api/millesimi/'+currentSubId)||[];
  if(currentSubData)currentSubData._millesimi=millData;
  const card=(t)=>{
    const cor=t.corrente;
    const prox=(t.prossime||[])[0];
    return `<div class="card" style="margin-bottom:12px;">
      <div class="flex-between" style="flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:14px;font-weight:700;">${esc(t.tabella_nome)}</div>
          ${t.tabella_descrizione?`<div style="font-size:11px;color:var(--muted);">${esc(t.tabella_descrizione)}</div>`:''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px;font-weight:700;color:var(--accent);font-family:monospace;">${cor?parseFloat(cor.valore)+'‰':'—'}</div>
          <div style="font-size:11px;color:var(--muted);">${cor?'valido dal '+fmt(cor.data_validita):'nessun valore impostato'}</div>
        </div>
      </div>
      ${cor?.note?`<div style="font-size:12px;color:var(--muted);margin-top:6px;">📝 ${esc(cor.note)}</div>`:''}
      ${prox?`<div style="margin-top:8px;background:rgba(184,134,11,.08);border:1px solid rgba(184,134,11,.25);border-radius:8px;padding:8px 12px;font-size:12px;">📅 Variazione già programmata: <strong>${parseFloat(prox.valore)}‰</strong> a partire dal <strong>${fmt(prox.data_validita)}</strong></div>`:''}
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <button class="btn btn-xs btn-primary" onclick="apriNuovoValoreMillesimi(${t.tabella_id})">➕ Nuovo valore / variazione</button>
        ${t.storico.length?`<button class="btn btn-xs btn-gray" onclick="toggleStoricoMillesimi(${t.tabella_id})">🕐 Storico (${t.storico.length})</button>`:''}
      </div>
      <div id="mill-storico-${t.tabella_id}" class="hidden" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">
        ${t.storico.map(v=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border);">
          <span>${fmt(v.data_validita)} → <strong style="font-family:monospace;">${parseFloat(v.valore)}‰</strong>${v.note?' · '+esc(v.note):''}${v.autore_nome?' · <span style=\"color:var(--muted);\">'+esc(v.autore_nome)+'</span>':''}</span>
          <button class="btn btn-xs btn-danger" onclick="delValoreMillesimi(${v.id})" title="Elimina questa voce di storico">✕</button>
        </div>`).join('')||'<div style="font-size:12px;color:var(--muted);">Nessuna variazione precedente.</div>'}
      </div>
    </div>`;
  };
  el.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:11px;color:var(--muted);">I millesimi sono un dato strutturale del SUB: restano salvati qui, con la data da cui sono validi. Puoi avere più tabelle per criteri diversi (es. proprietà, riscaldamento, ascensore).</div>
      <button class="btn btn-sm btn-gray" onclick="nuovaTabellaMillesimi()">➕ Nuova tabella millesimale</button>
    </div>
    <div id="mill-nuovo-form" class="hidden card" style="margin-bottom:14px;background:var(--card-alt);"></div>
    ${millData.length?millData.map(card).join(''):'<div class="empty">Nessuna tabella millesimale configurata. Creane una per iniziare.</div>'}
  `;
}

function apriNuovoValoreMillesimi(tabellaId){
  const wrap=document.getElementById('mill-nuovo-form');
  if(!wrap)return;
  const oggi=new Date().toISOString().slice(0,10);
  wrap.innerHTML=`
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Nuovo valore millesimale</div>
    <div class="form-grid">
      <div class="field"><label>Valore ‰</label><input type="number" step="0.0001" min="0" max="1000" id="mv-valore" placeholder="es. 128.5000"></div>
      <div class="field"><label>Valido dal</label><input type="date" id="mv-data" value="${oggi}"></div>
      <div class="field form-full"><label>Note (opzionale)</label><input id="mv-note" placeholder="es. dopo variazione catastale, delibera assemblea…"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button class="btn btn-sm btn-gray" onclick="document.getElementById('mill-nuovo-form').classList.add('hidden')">Annulla</button>
      <button class="btn btn-sm btn-success" onclick="salvaValoreMillesimi(${tabellaId})">✓ Salva</button>
    </div>`;
  wrap.classList.remove('hidden');
  wrap.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>document.getElementById('mv-valore')?.focus(),100);
}

async function salvaValoreMillesimi(tabellaId){
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('mv-valore')){toast('Inserisci il valore','error');return;}
  const r=await api('/api/millesimi/'+currentSubId,{method:'POST',body:JSON.stringify({
    tabella_id:tabellaId, valore:v('mv-valore'), data_validita:v('mv-data')||null, note:v('mv-note')||null
  })});
  if(!r||r.error){toast('Errore: '+(r?.error||'salvataggio fallito'),'error');return;}
  toast('📐 Millesimi salvati ✓');
  document.getElementById('mill-nuovo-form')?.classList.add('hidden');
  // Aggiorna anche subs.millesimi in cache locale se è la tabella di default e il valore è già efficace
  if(currentSubData?.sub){
    const oggi=new Date().toISOString().slice(0,10);
    if((v('mv-data')||oggi)<=oggi) currentSubData.sub.millesimi=v('mv-valore');
  }
  renderTabMillesimi(currentSubData.sub);
}

async function delValoreMillesimi(id){
  if(!await appConfirm('Eliminare questa voce di storico? L\'operazione non è reversibile.',{icon:'🗑',title:'Elimina voce'}))return;
  const r=await api('/api/millesimi/valori/'+id,{method:'DELETE'});
  if(r?.error){toast('Errore: '+r.error,'error');return;}
  toast('🗑 Voce eliminata');
  renderTabMillesimi(currentSubData.sub);
}

function toggleStoricoMillesimi(tabellaId){
  document.getElementById('mill-storico-'+tabellaId)?.classList.toggle('hidden');
}

async function nuovaTabellaMillesimi(){
  const nome=prompt('Nome della nuova tabella millesimale (es. "Riscaldamento", "Ascensore"):');
  if(!nome?.trim())return;
  const descrizione=prompt('Descrizione (opzionale):')||null;
  const r=await api('/api/millesimi/tabelle',{method:'POST',body:JSON.stringify({nome:nome.trim(),descrizione})});
  if(r?.error){toast('Errore: '+r.error,'error');return;}
  toast('✅ Tabella millesimale creata');
  _cache._millDefTab=null; // forza ricalcolo se cambia la tabella di default
  renderTabMillesimi(currentSubData.sub);
}

// ═══ Email: sollecito affitto + test configurazione ═══
async function sollecitoAffitto(pagamentoId){
  if(!await appConfirm('Inviare una email di sollecito all\'inquilino per questo canone?',{danger:false,icon:'✉️',title:'Sollecito di pagamento',okText:'Invia email'}))return;
  toast('Invio in corso…','warning');
  const r=await api('/api/solleciti/affitto/'+pagamentoId,{method:'POST'});
  if(!r||r.error){toast('❌ '+(r?.error||'Invio fallito'),'error');return;}
  toast('✉️ Sollecito inviato a '+r.email+' ✓');
}

async function testEmail(){
  toast('Invio email di prova…','warning');
  const el=document.getElementById('email-status');
  const r=await api('/api/email/test',{method:'POST'});
  if(!r||r.error){
    toast('❌ Invio fallito — leggi il dettaglio nella card','error');
    if(el)el.innerHTML='<span style="color:var(--danger);font-weight:600;">❌ Invio fallito</span><div style="font-size:11.5px;color:var(--danger);margin-top:6px;line-height:1.55;background:#fdf3f2;border:1px solid rgba(142,67,67,.25);border-radius:7px;padding:8px 11px;">'+esc(r?.error||'Errore sconosciuto')+'</div>';
    return;
  }
  toast('✉️ Email di prova inviata! Controlla la casella ✓');
  if(el)el.innerHTML='<span style="color:var(--success);font-weight:600;">✅ Email inviata correttamente — controlla la casella</span>';
}

async function loadEmailStatus(){
  const el=document.getElementById('email-status');
  if(!el)return;
  const r=await api('/api/email/status');
  el.innerHTML=r?.configurato
    ? '<span style="color:var(--success);font-weight:600;">✅ Email configurate e attive</span>'
    : '<span style="color:var(--warning);font-weight:600;">⚠️ Email non configurate</span><div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.6;">Su Render → Environment aggiungi:<br><code>SMTP_HOST</code> = smtp.gmail.com<br><code>SMTP_USER</code> = la tua Gmail<br><code>SMTP_PASS</code> = password per le app (myaccount.google.com/apppasswords)<br><code>SMTP_FROM</code> = la tua Gmail</div>';
}


// ═══════ FASCICOLO GLOBALE: viste su TUTTI i SUB ═══════
let _fascDocsCache=null;
async function _fascDocs(){
  if(_fascDocsCache) return _fascDocsCache;
  _fascDocsCache = await api('/api/documenti') || [];
  setTimeout(()=>{_fascDocsCache=null;},60000); // cache 1 minuto
  return _fascDocsCache;
}

function _showFascicolo(titolo,sottotitolo,html){
  document.querySelectorAll('#app-main .section').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-fascicolo')?.classList.add('active');
  document.getElementById('sb-subs')?.classList.add('active');
  document.getElementById('fascicolo-content').innerHTML=`
    <div class="flex-between mb-16">
      <div><h2 class="page-title">${titolo}</h2><p class="page-sub">${sottotitolo}</p></div>
      <button class="btn btn-gray btn-sm" onclick="showSection('subs')">← SUB</button>
    </div>`+html;
}

async function fascGoSub(subId, tab){
  await openSubDetail(subId);
  setSubDetTab(tab,_subTabBtn(tab));
}

async function renderFascicoloGlobale(tab){
  const subs=(DB.subs||[]).filter(x=>!x.stato_sub||x.stato_sub==='attivo');
  const docs=await _fascDocs();
  const byTipo=p=>docs.filter(d=>(d.tipo||'').startsWith(p));
  const wrap=h=>`<div class="card" style="padding:0;overflow:hidden;"><div class="table-wrap"><table>${h}</table></div></div>`;

  if(tab==='catasto'){
    const manca=subs.filter(x=>!x.foglio&&!x.particella).length;
    _showFascicolo('Catasto — tutti i SUB', manca?`${manca} SUB senza dati catastali`:'Dati catastali completi', wrap(`
      <thead><tr><th>SUB</th><th>Sede</th><th>Foglio</th><th>Part.</th><th>Sub.</th><th>Cat.</th><th>Rendita</th><th>mq comm.</th><th>Millesimi</th></tr></thead>
      <tbody>${subs.map(x=>`<tr class="row-click" onclick="fascGoSub(${x.id},'catasto')">
        <td class="td-bold">${esc(x.codice)}</td><td>${esc(x.sede_nome||'—')}</td>
        <td>${esc(x.foglio||'—')}</td><td>${esc(x.particella||'—')}</td><td>${esc(x.subalterno||'—')}</td>
        <td>${esc(x.categoria_cat||'—')}</td>
        <td style="font-family:monospace;">${x.rendita?'€ '+parseFloat(x.rendita).toLocaleString('it-IT'):'—'}</td>
        <td>${x.mq_commerciali?parseFloat(x.mq_commerciali).toFixed(0)+' mq':'—'}</td>
        <td>${x.millesimi?parseFloat(x.millesimi)+'‰':'—'}</td>
      </tr>`).join('')||'<tr><td colspan="9" class="empty">Nessun SUB</td></tr>'}</tbody>`));

  }else if(tab==='ape'){
    const apeBySub={}; byTipo('ape').forEach(d=>{if(d.sub_id&&!apeBySub[d.sub_id])apeBySub[d.sub_id]=d;});
    const senza=subs.filter(x=>!apeBySub[x.id]).length;
    _showFascicolo('APE — tutti i SUB', senza?`${senza} SUB senza attestato`:'Tutti i SUB hanno l\'APE', wrap(`
      <thead><tr><th>SUB</th><th>Sede</th><th>Classe</th><th>Attestato</th><th>Scadenza</th></tr></thead>
      <tbody>${subs.map(x=>{const a=apeBySub[x.id];return`<tr class="row-click" onclick="fascGoSub(${x.id},'ape')">
        <td class="td-bold">${esc(x.codice)}</td><td>${esc(x.sede_nome||'—')}</td>
        <td style="font-weight:700;">${esc(x.classe_energetica||'—')}</td>
        <td style="color:${a?'var(--success)':'var(--danger)'};font-weight:600;">${a?'presente':'mancante'}</td>
        <td>${a?.scadenza?fmt(a.scadenza):'—'}</td>
      </tr>`;}).join('')||'<tr><td colspan="5" class="empty">Nessun SUB</td></tr>'}</tbody>`));

  }else if(tab==='impianti'){
    const K=Object.keys(SUB_IMPIANTI);
    _showFascicolo('Impianti — tutti i SUB','Numero di documenti per impianto; clicca una riga per aprire', wrap(`
      <thead><tr><th>SUB</th>${K.map(k=>`<th>${SUB_IMPIANTI[k].nome.replace('Impianto ','')}</th>`).join('')}</tr></thead>
      <tbody>${subs.map(x=>{
        const cnt=K.map(k=>docs.filter(d=>d.sub_id==x.id&&(d.tipo||'').startsWith('imp_'+k)).length);
        return`<tr class="row-click" onclick="fascGoSub(${x.id},'impianti')">
          <td class="td-bold">${esc(x.codice)}</td>
          ${cnt.map(n=>`<td style="color:${n?'var(--success)':'var(--muted-2)'};font-weight:${n?700:400};">${n||'—'}</td>`).join('')}
        </tr>`;}).join('')||'<tr><td colspan="7" class="empty">Nessun SUB</td></tr>'}</tbody>`));

  }else if(tab==='certificazioni'){
    const cert=docs.filter(d=>['certificazione','agibilita','collaudo','polizza','certif'].some(p=>(d.tipo||'').startsWith(p)));
    _showFascicolo('Certificazioni e polizze — tutte', cert.length+' documenti', wrap(`
      <thead><tr><th>Documento</th><th>Tipo</th><th>SUB</th><th>Data</th><th>Scadenza</th></tr></thead>
      <tbody>${cert.map(d=>`<tr class="row-click" onclick="${d.sub_id?`fascGoSub(${d.sub_id},'certificazioni')`:`showSection('documenti')`}">
        <td class="td-bold">${esc(d.nome||'—')}</td><td>${esc((d.tipo||'').replace(/_/g,' '))}</td>
        <td>${esc(d.sub_codice||'—')}</td><td>${d.data_documento?fmt(d.data_documento):'—'}</td>
        <td style="color:${d.scadenza&&new Date(d.scadenza)<new Date()?'var(--danger)':'var(--text)'};">${d.scadenza?fmt(d.scadenza):'—'}</td>
      </tr>`).join('')||'<tr><td colspan="5" class="empty">Nessuna certificazione caricata</td></tr>'}</tbody>`));

  }else if(tab==='foto'){
    const foto=byTipo('foto');
    const isImg=u=>u&&(/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(u)||/\/image\/upload\//.test(u)||/\/api\/documenti\/\d+\/file/.test(u));
    _showFascicolo('Foto — tutti i SUB', foto.length+' foto', foto.length?`
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;">
        ${foto.map(f=>`<div style="border:1px solid var(--border);border-radius:9px;overflow:hidden;background:var(--card);cursor:pointer;" onclick="${f.sub_id?`fascGoSub(${f.sub_id},'foto')`:''}">
          ${isImg(f.url)?`<img src="${esc(fileUrl(f.url))}" style="width:100%;height:110px;object-fit:cover;display:block;" loading="lazy">`:`<div style="height:110px;display:flex;align-items:center;justify-content:center;font-size:30px;filter:grayscale(.6);">🖼️</div>`}
          <div style="padding:6px 10px;font-size:11px;display:flex;justify-content:space-between;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.nome||'Foto')}</span><strong>${esc(f.sub_codice||'')}</strong></div>
        </div>`).join('')}
      </div>`:'<div class="empty">Nessuna foto caricata.</div>');

  }else if(tab==='contratti'){
    const contr=docs.filter(d=>(d.tipo||'')==='contratto');
    _showFascicolo('Contratti — tutti i SUB', contr.length+' documenti contrattuali', wrap(`
      <thead><tr><th>Contratto</th><th>SUB</th><th>Data</th><th>Scadenza</th><th>Importo</th></tr></thead>
      <tbody>${contr.map(d=>`<tr class="row-click" onclick="${d.sub_id?`fascGoSub(${d.sub_id},'contratti')`:`showSection('documenti')`}">
        <td class="td-bold">${esc(d.nome||'—')}</td><td>${esc(d.sub_codice||'—')}</td>
        <td>${d.data_documento?fmt(d.data_documento):'—'}</td>
        <td style="color:${d.scadenza&&new Date(d.scadenza)<new Date()?'var(--danger)':'var(--text)'};">${d.scadenza?fmt(d.scadenza):'—'}</td>
        <td style="font-family:monospace;">${d.importo?'€ '+parseFloat(d.importo).toLocaleString('it-IT'):'—'}</td>
      </tr>`).join('')||'<tr><td colspan="5" class="empty">Nessun contratto caricato</td></tr>'}</tbody>`));
  }
}


// ═══ Drag & drop sulle zone di caricamento dei modali ═══
(function(){
  [['doc-file-zone','doc-file',(inp)=>docFileSelected(inp)],['boll-file-zone','boll-file',(inp)=>bollFileSelected(inp)]].forEach(([zoneId,inputId,cb])=>{
    const zone=document.getElementById(zoneId);
    if(!zone||typeof zone.addEventListener!=='function')return;
    ;['dragover','dragenter'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.style.borderColor='var(--primary)';}));
    ;['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.style.borderColor='';}));
    zone.addEventListener('drop',e=>{
      const f=e.dataTransfer?.files?.[0];
      if(!f)return;
      const inp=document.getElementById(inputId);
      const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;
      try{cb(inp);}catch(err){}
    });
  });
})();


// ═══ Backup manuale ═══
async function backupAdesso(){
  const st=document.getElementById('backup-status');
  if(st){st.textContent='Backup in corso…';}
  const r=await api('/api/backup/adesso',{method:'POST'});
  if(!r||r.error){if(st){st.textContent='❌ '+(r?.error||'fallito');st.style.color='var(--danger)';}return;}
  if(st){st.textContent='✅ '+r.righe+' righe salvate su Cloudinary';st.style.color='var(--success)';}
  toast('💾 Backup completato ✓');
}

// Scarica la copia completa sul computer
function backupScarica(){
  const a=document.createElement('a');
  a.href=fileUrl('/api/backup');
  a.download='gestionale_backup_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);a.click();a.remove();
  toast('⬇ Download del backup avviato');
}

// Invia la copia completa via email
async function backupEmailAdesso(){
  const st=document.getElementById('backup-status');
  if(st){st.textContent='Invio email in corso…';st.style.color='var(--muted)';}
  const r=await api('/api/backup/email',{method:'POST'});
  if(!r||r.error){if(st){st.textContent='❌ '+(r?.error||'invio fallito');st.style.color='var(--danger)';}return;}
  if(st){st.textContent='✉️ Copia inviata alla tua email ('+r.righe+' righe)';st.style.color='var(--success)';}
  toast('✉️ Backup inviato via email ✓');
}

// Ripristino da file JSON (con doppia conferma: è distruttivo)
async function restoreDaFile(input){
  const f=input.files[0];input.value='';
  if(!f)return;
  let dati;
  try{ dati=JSON.parse(await f.text()); }
  catch(e){ toast('File non valido: non è un backup del gestionale','error'); return; }
  if(!dati.tables){ toast('File non valido: manca la sezione dati','error'); return; }
  const nTab=Object.keys(dati.tables).length;
  const quando=dati.exported?new Date(dati.exported).toLocaleString('it-IT'):'data sconosciuta';
  if(!await appConfirm(`Ripristinare il backup del ${quando}?\n\n${dati.totalRows||'?'} righe in ${nTab} tabelle.\n\n⚠ I DATI ATTUALI VERRANNO SOSTITUITI con quelli del backup.`,{danger:true,icon:'🛟',title:'Ripristino backup',okText:'Continua'}))return;
  if(!await appConfirm('Ultima conferma: questa operazione non si può annullare. Procedere davvero col ripristino?',{danger:true,icon:'⚠️',title:'Conferma definitiva',okText:'Sì, ripristina'}))return;
  const st=document.getElementById('backup-status');
  if(st){st.textContent='Ripristino in corso… non chiudere la pagina';st.style.color='var(--warning)';}
  const r=await api('/api/restore',{method:'POST',body:JSON.stringify(dati)});
  if(!r||r.error){if(st){st.textContent='❌ '+(r?.error||'ripristino fallito');st.style.color='var(--danger)';}toast('❌ Ripristino fallito','error');return;}
  if(st){st.textContent='✅ '+(r.message||'Ripristino completato');st.style.color='var(--success)';}
  toast('🛟 '+(r.message||'Ripristino completato')+' — ricarico…');
  setTimeout(()=>location.reload(),1800);
}


// ═══════ SCHEDE TECNICHE IMPIANTI (con suggerimenti) ═══════
const IMPIANTI_CAMPI = {
  termico: [
    { k:'tipo_generatore', l:'Tipo generatore', sugg:['Caldaia a condensazione','Caldaia tradizionale','Pompa di calore','Teleriscaldamento','Sistema ibrido'] },
    { k:'alimentazione', l:'Alimentazione', sugg:['Metano','GPL','Elettrico','Gasolio','Pellet'] },
    { k:'marca_modello', l:'Marca e modello', sugg:['Vaillant','Baxi','Immergas','Ariston','Viessmann','Bosch'] },
    { k:'potenza_kw', l:'Potenza (kW)', sugg:['24','28','32','35'] },
    { k:'anno_installazione', l:'Anno installazione', sugg:[] },
    { k:'ultimo_controllo_fumi', l:'Ultimo controllo fumi', tipo:'date' },
    { k:'prossimo_controllo_fumi', l:'Prossimo controllo fumi', tipo:'date' },
  ],
  elettrico: [
    { k:'tipo_impianto', l:'Tipo impianto', sugg:['Civile monofase 3 kW','Monofase 6 kW','Trifase 10 kW','Trifase oltre 10 kW','Industriale'] },
    { k:'pod', l:'POD', sugg:[] },
    { k:'potenza_kw', l:'Potenza contatore (kW)', sugg:['3','4,5','6','10','15'] },
    { k:'anno_impianto', l:'Anno impianto', sugg:[] },
    { k:'conformita', l:'Conformità', sugg:['DiCo presente','Conforme DM 37/08','Da verificare','Non conforme'] },
    { k:'note', l:'Note', sugg:[] },
  ],
  idraulico: [
    { k:'tipo', l:'Tipo', sugg:['Autonomo','Centralizzato'] },
    { k:'scaldacqua', l:'Scaldacqua', sugg:['A gas','Elettrico','Pompa di calore','Centralizzato'] },
    { k:'anno', l:'Anno', sugg:[] },
    { k:'note', l:'Note', sugg:[] },
  ],
  clima: [
    { k:'n_split', l:'N. split', sugg:['1','2','3','4'] },
    { k:'gas', l:'Gas refrigerante', sugg:['R32','R410A','R290'] },
    { k:'kg_gas', l:'Kg gas', sugg:[] },
    { k:'fgas_scadenza', l:'Scadenza controllo F-GAS', tipo:'date' },
    { k:'note', l:'Note', sugg:[] },
  ],
  ascensore: [
    { k:'matricola', l:'Matricola', sugg:[] },
    { k:'ditta_manutenzione', l:'Ditta manutenzione', sugg:[] },
    { k:'ultima_verifica', l:'Ultima verifica biennale', tipo:'date' },
    { k:'prossima_verifica', l:'Prossima verifica', tipo:'date' },
  ],
  antincendio: [
    { k:'n_estintori', l:'N. estintori', sugg:['1','2','3','4','6'] },
    { k:'scadenza_cpi', l:'Scadenza CPI/SCIA', tipo:'date' },
    { k:'ditta', l:'Ditta antincendio', sugg:[] },
    { k:'note', l:'Note', sugg:[] },
  ],
};

async function _caricaImpiantiDati(force){
  if(!currentSubData) return {};
  if(!currentSubData._impianti || force){
    const rows = await api('/api/subs/'+currentSubId+'/impianti') || [];
    currentSubData._impianti = {};
    rows.forEach(r=>{ currentSubData._impianti[r.impianto] = r.dati || {}; });
  }
  return currentSubData._impianti;
}

function _impRiassunto(key, dati){
  if(!dati) return '';
  const d=dati;
  if(key==='termico')   return [d.tipo_generatore,d.alimentazione,d.potenza_kw?d.potenza_kw+' kW':null].filter(Boolean).join(' · ');
  if(key==='elettrico') return [d.tipo_impianto,d.conformita].filter(Boolean).join(' · ');
  if(key==='idraulico') return [d.tipo,d.scaldacqua].filter(Boolean).join(' · ');
  if(key==='clima')     return [d.n_split?d.n_split+' split':null,d.gas].filter(Boolean).join(' · ');
  if(key==='ascensore') return [d.matricola?'Matr. '+d.matricola:null,d.ditta_manutenzione].filter(Boolean).join(' · ');
  if(key==='antincendio') return [d.n_estintori?d.n_estintori+' estintori':null,d.scadenza_cpi?'CPI '+fmt(d.scadenza_cpi):null].filter(Boolean).join(' · ');
  return '';
}

function _impSchedaHtml(key){
  const campi=IMPIANTI_CAMPI[key]||[];
  const dati=(currentSubData?._impianti||{})[key]||{};
  return `<div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px;background:var(--card-alt);">
    <div class="flex-between" style="margin-bottom:10px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:var(--muted);font-weight:700;">Scheda tecnica</div>
      <button class="btn btn-xs btn-primary" onclick="salvaImpianto('${key}')">Salva scheda</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
      ${campi.map(c=>{
        const val=esc(dati[c.k]||'');
        if(c.tipo==='date') return `<div class="field"><label>${c.l}</label><input type="date" id="imp-${key}-${c.k}" value="${val}"></div>`;
        const dl=c.sugg&&c.sugg.length?`list="dl-${key}-${c.k}"`:'';
        const dlHtml=c.sugg&&c.sugg.length?`<datalist id="dl-${key}-${c.k}">${c.sugg.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`:'';
        return `<div class="field"><label>${c.l}</label><input id="imp-${key}-${c.k}" value="${val}" ${dl} placeholder="${c.sugg&&c.sugg[0]?'es. '+esc(c.sugg[0]):''}">${dlHtml}</div>`;
      }).join('')}
    </div>
  </div>`;
}

async function salvaImpianto(key){
  const campi=IMPIANTI_CAMPI[key]||[];
  const dati={};
  campi.forEach(c=>{ const el=document.getElementById('imp-'+key+'-'+c.k); if(el&&el.value) dati[c.k]=el.value; });
  const r=await api('/api/subs/'+currentSubId+'/impianti/'+key,{method:'PUT',body:JSON.stringify({dati})});
  if(!r||r.error){toast('Errore: '+(r?.error||'salvataggio fallito'),'error');return;}
  if(currentSubData){ currentSubData._impianti=currentSubData._impianti||{}; currentSubData._impianti[key]=dati; }
  toast('🔧 Scheda impianto salvata ✓');
}

// ═══════ MILLESIMI CONDOMINIALI: vista globale per sede ═══════
async function renderMillesimiGlobale(){
  const subs=(DB.subs||[]).filter(x=>!x.stato_sub||x.stato_sub==='attivo');
  const gruppi={};
  subs.forEach(s=>{const k=s.sede_nome||'Senza sede';(gruppi[k]=gruppi[k]||[]).push(s);});
  const html=Object.entries(gruppi).map(([sede,list],gi)=>{
    const tot=list.reduce((a,s)=>a+(parseFloat(s.millesimi)||0),0);
    const ok=Math.abs(tot-1000)<0.01;
    return `<div class="card" style="margin-bottom:16px;">
      <div class="flex-between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div style="font-family:'Fraunces',serif;font-size:17px;font-weight:600;">${esc(sede)}</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:11px;color:var(--muted);">Spesa da ripartire €</span>
          <input id="mill-spesa-${gi}" type="number" step="0.01" placeholder="0.00" oninput="millRicalcola(${gi})" style="width:120px;padding:7px 10px;border:1px solid var(--border-2);border-radius:7px;font-size:12px;">
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>SUB</th><th>Millesimi ‰</th><th>Quota spesa</th></tr></thead>
        <tbody>
          ${list.map(s=>`<tr>
            <td class="td-bold" style="cursor:pointer;" onclick="openSubDetail(${s.id})">${subLabelHtml(s)}</td>
            <td><input type="number" step="0.01" value="${s.millesimi||''}" data-gi="${gi}" data-sid="${s.id}" class="mill-inp-${gi}" onchange="millSalva(${s.id},this.value,${gi})" style="width:95px;padding:6px 9px;border:1px solid var(--border-2);border-radius:7px;font-size:12px;"></td>
            <td class="mill-quota-${gi}" data-sid="${s.id}" style="font-family:monospace;color:var(--accent);">—</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr style="border-top:2px solid var(--border-2);">
          <td style="font-weight:700;">Totale sede</td>
          <td id="mill-tot-${gi}" style="font-weight:700;color:${ok?'var(--success)':'var(--warning)'};">${tot.toFixed(2)} ‰ ${ok?'✓':'(su 1000)'}</td>
          <td id="mill-tot-quota-${gi}" style="font-family:monospace;font-weight:700;">—</td>
        </tr></tfoot>
      </table></div>
    </div>`;
  }).join('')||'<div class="empty">Nessun SUB.</div>';
  _showFascicolo('Millesimi condominiali','Imposta i millesimi per unità e ripartisci le spese per sede', html);
}

async function millSalva(subId,val,gi){
  const r=await api('/api/subs/'+subId+'/millesimi',{method:'PUT',body:JSON.stringify({millesimi:val||null})});
  if(!r||r.error){toast('Errore salvataggio millesimi','error');return;}
  const s=(DB.subs||[]).find(x=>x.id==subId); if(s)s.millesimi=val;
  // aggiorna totale
  const inps=[...document.querySelectorAll('.mill-inp-'+gi)];
  const tot=inps.reduce((a,i)=>a+(parseFloat(i.value)||0),0);
  const totEl=document.getElementById('mill-tot-'+gi);
  const ok=Math.abs(tot-1000)<0.01;
  if(totEl){totEl.textContent=tot.toFixed(2)+' ‰ '+(ok?'✓':'(su 1000)');totEl.style.color=ok?'var(--success)':'var(--warning)';}
  millRicalcola(gi);
  toast('📐 Salvato ✓');
}

function millRicalcola(gi){
  const spesa=parseFloat(document.getElementById('mill-spesa-'+gi)?.value||0);
  const inps=[...document.querySelectorAll('.mill-inp-'+gi)];
  let totQ=0;
  inps.forEach(inp=>{
    const q=spesa&&inp.value?spesa*parseFloat(inp.value)/1000:0;
    totQ+=q;
    const cell=document.querySelector('.mill-quota-'+gi+'[data-sid="'+inp.dataset.sid+'"]');
    if(cell)cell.textContent=q?'€ '+q.toLocaleString('it-IT',{minimumFractionDigits:2}):'—';
  });
  const t=document.getElementById('mill-tot-quota-'+gi);
  if(t)t.textContent=totQ?'€ '+totQ.toLocaleString('it-IT',{minimumFractionDigits:2}):'—';
}

// ═══════ EMAIL CON AI ═══════
function openAiMail(prefillTo){
  const dl=document.getElementById('am-contatti');
  if(dl)dl.innerHTML=[...(DB.inquilini||[]),...(DB.fornitori||[])].filter(x=>x.email)
    .map(x=>`<option value="${esc(x.email)}">${esc(x.ragione_sociale)}</option>`).join('');
  const to=document.getElementById('am-to'); if(to)to.value=prefillTo||'';
  const bz=document.getElementById('am-bozza'); if(bz)bz.value='';
  document.getElementById('am-result').style.display='none';
  document.getElementById('am-copia').style.display='none';
  document.getElementById('am-invia').style.display='none';
  document.getElementById('am-status').textContent='';
  const m=document.getElementById('modal-aimail');
  m.style.zIndex=3000;
  m.classList.add('open');
  setTimeout(()=>bz?.focus(),150);
}

async function aiMailGenera(){
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('am-bozza').trim()){toast('Scrivi prima la bozza','error');return;}
  const st=document.getElementById('am-status');
  if(st){st.textContent='✨ Scrittura in corso…';st.style.color='var(--muted)';}
  const r=await api('/api/ai/email',{method:'POST',body:JSON.stringify({
    bozza:v('am-bozza'), tono:v('am-tono'), destinatario:v('am-to')||null,
    contesto: currentSubData?.sub ? ('Riguarda l\'unità immobiliare '+subLabel(currentSubData.sub)+(currentSubData.sub.indirizzo_completo?', '+currentSubData.sub.indirizzo_completo:'')) : null,
  })});
  if(!r||r.error){if(st){st.textContent='❌ '+(r?.error||'Generazione fallita');st.style.color='var(--danger)';}return;}
  document.getElementById('am-oggetto').value=r.oggetto||'';
  document.getElementById('am-testo').value=r.testo||'';
  document.getElementById('am-result').style.display='';
  document.getElementById('am-copia').style.display='';
  document.getElementById('am-invia').style.display='';
  if(st){st.textContent='✅ Rileggi, ritocca e invia';st.style.color='var(--success)';}
}

function aiMailCopia(){
  const t='Oggetto: '+document.getElementById('am-oggetto').value+'\n\n'+document.getElementById('am-testo').value;
  navigator.clipboard.writeText(t).then(()=>toast('📋 Copiata negli appunti ✓'));
}

async function aiMailInvia(){
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('am-to')){toast('Inserisci il destinatario','error');return;}
  if(!await appConfirm('Inviare questa email a '+v('am-to')+'?',{danger:false,icon:'✉️',title:'Invio email',okText:'Invia'}))return;
  const r=await api('/api/ai/email/invia',{method:'POST',body:JSON.stringify({to:v('am-to'),oggetto:v('am-oggetto'),testo:v('am-testo')})});
  if(!r||r.error){toast('❌ '+(r?.error||'Invio fallito'),'error');return;}
  closeM('modal-aimail');
  toast('✉️ Email inviata a '+v('am-to')+' ✓');
}
