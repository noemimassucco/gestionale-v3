// =======================================================
// MODULE: subs.js
// =======================================================

// TODO: loadSubDetail

function renderSubGrid(subs) {
  const el = document.getElementById('home-sub-grid');
  if (!subs.length) { el.innerHTML = '<div class="empty">Nessun SUB. Aggiungili da Anagrafiche.</div>'; return; }
  el.innerHTML = subs.map(s => {
    const sal = s.stato_salute==='rosso'?'🔴':s.stato_salute==='giallo'?'🟡':'🟢';
    const border = s.stato_salute==='rosso'?'rgba(239,68,68,.25)':s.stato_salute==='giallo'?'rgba(245,158,11,.2)':'var(--border)';
    return `<div onclick="goToApp('anagrafiche');setTimeout(()=>openSubDetail(${s.id}),400);" style="background:var(--surface);border:1px solid ${border};border-radius:10px;padding:14px 16px;cursor:pointer;transition:all .2s;" onmouseover="this.style.borderColor='rgba(37,99,235,.4)';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='${border}';this.style.transform=''">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span>${sal}</span>
        <strong style="color:#0f172a;font-size:14px;">${esc(s.codice)}</strong>
        ${s.manutenzioni_aperte>0?`<span style="font-size:9px;background:rgba(245,158,11,.2);color:var(--gold);padding:1px 6px;border-radius:8px;">🔨 ${s.manutenzioni_aperte}</span>`:''}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${esc(s.sede_nome||'—')}${s.piano?' · P.'+esc(s.piano):''}</div>
      <div style="font-size:11px;color:var(--text);">${esc(s.inquilino_nome||'Libero')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.05);">
        <span style="font-size:10px;color:var(--muted);">${s.num_interventi||0} int.</span>
        <span style="font-family:monospace;font-size:11px;font-weight:700;color:var(--gold);">${s.totale_spese?'€ '+parseFloat(s.totale_spese).toLocaleString('it-IT',{maximumFractionDigits:0}):'—'}</span>
      </div>
    </div>`;
  }).join('');
}

async function openSubDetail(id) {
  currentSubId=id; subDetTab='identita';
  document.getElementById('modal-sub-det').classList.add('open');
  document.getElementById('sub-det-content').innerHTML='<div class="empty" style="padding:40px;">Caricamento scheda…</div>';
  document.querySelectorAll('#sub-det-tabs .tab-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  const data=await api('/api/subs/'+id+'/detail');
  if(!data?.sub){document.getElementById('sub-det-content').innerHTML='<div class="empty">Errore caricamento</div>';return;}
  currentSubData=data;
  const s=data.sub;
  const sal=parseInt(s.manutenzioni_aperte)>0?'🟡':s.stato_occupazione==='libero'?'⚪':'🟢';
  document.getElementById('sub-det-header').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:20px;">${sal}</span>
      <span style="font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:#0f172a;">SUB ${esc(s.codice)}</span>
      ${s.ex_sub?`<span class="ex-sub">ex ${esc(s.ex_sub)}</span>`:''}
      <span class="badge badge-sede">${esc(s.sede_nome||'—')}</span>
      ${s.stato_occupazione?`<span style="font-size:11px;padding:3px 10px;border-radius:10px;background:${s.stato_occupazione==='occupato'?'rgba(16,185,129,.15)':'rgba(100,116,139,.15)'};color:${s.stato_occupazione==='occupato'?'var(--green)':'var(--muted)'};">${esc(s.stato_occupazione)}</span>`:''}
      <div style="margin-left:auto;text-align:right;">
        <div style="font-size:22px;font-weight:700;color:var(--gold);font-family:monospace;">€ ${parseFloat(s.totale_spese||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</div>
        <div style="font-size:11px;color:var(--muted);">${s.num_interventi||0} interventi · ${s.num_documenti||0} documenti</div>
      </div>
    </div>`;
  document.getElementById('sub-det-edit-btn').onclick=()=>{closeM('modal-sub-det');openAnaById('sub',id);};
  renderSubDetTab('identita');
}

function subActionPagamento() {
  const s = currentSubData?.sub;
  document.getElementById('pag-anno').value = new Date().getFullYear();
  document.getElementById('pag-mese').value = new Date().getMonth()+1;
  document.getElementById('pag-importo').value = s?.canone_annuo ? (parseFloat(s.canone_annuo)/12).toFixed(2) : '';
  document.getElementById('pag-data').value = new Date().toISOString().split('T')[0];
  document.getElementById('pag-stato').value = 'pagato';
  document.getElementById('pag-note').value = '';
  document.getElementById('modal-pagamento').classList.add('open');
}

function openIstatCfg(subId) {
  const sub = DB.subs.find(s => s.id == subId);
  document.getElementById('istat-cfg-sub-id').value = subId;
  const sv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  sv('istat-cfg-period', sub?.istat_periodicita || '12_mesi');
  sv('istat-cfg-tipo', sub?.istat_tipo || 'automatico');
  sv('istat-cfg-pct', sub?.istat_percentuale || '');
  sv('istat-cfg-ultima', sub?.istat_data_ultima_revisione?.split('T')[0] || '');
  sv('istat-cfg-prossima', sub?.istat_data_prossima_revisione?.split('T')[0] || '');
  sv('istat-cfg-note', sub?.istat_note || '');
  document.getElementById('modal-istat-cfg').classList.add('open');
}

async function saveIstatCfg() {
  const v = id => document.getElementById(id)?.value || '';
  const subId = v('istat-cfg-sub-id');
  if (!subId) return;
  await api('/api/subs/' + subId + '/istat', { method: 'PUT', body: JSON.stringify({
    periodicita: v('istat-cfg-period'), percentuale: v('istat-cfg-pct') || null,
    data_ultima: v('istat-cfg-ultima') || null, data_prossima: v('istat-cfg-prossima') || null,
    tipo: v('istat-cfg-tipo'), note: v('istat-cfg-note') || null,
  })});
  closeM('modal-istat-cfg');
  await loadDD();
  toast('✅ Configurazione ISTAT salvata');
  loadFatturazione();
}

function openModalFusione(preselSubId=null){
  const opts='<option value="">—</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
  document.getElementById('fus-sub1').innerHTML=opts;
  document.getElementById('fus-sub2').innerHTML=opts;
  if(preselSubId){ document.getElementById('fus-sub1').value=preselSubId; }
  document.getElementById('fus-codice').value='';
  document.getElementById('fus-note').value='';
  document.getElementById('modal-fusione').classList.add('open');
}

async function saveFusione(){
  const v=id=>document.getElementById(id)?.value||'';
  const sub1=v('fus-sub1'),sub2=v('fus-sub2'),codice=v('fus-codice');
  if(!sub1||!sub2||!codice){toast('Tutti i campi obbligatori','error');return;}
  if(sub1===sub2){toast('I due SUB devono essere diversi','error');return;}
  const r=await api('/api/subs/fusione',{method:'POST',body:JSON.stringify({sub_id_1:parseInt(sub1),sub_id_2:parseInt(sub2),nuovo_codice:codice,note_fusione:v('fus-note')})});
  if(r?.error){toast('Errore: '+r.error,'error');return;}
  closeM('modal-fusione');await loadDD();
  toast(`✓ Fusione completata → SUB ${codice}`);
  if(r?.nuovo?.id)openSubDetail(r.nuovo.id);
}

function quickScissione(subId, codice){
  currentSubId = subId;
  document.getElementById('sc-codice').value = '';
  document.getElementById('sc-note').value = '';
  const preview = document.getElementById('sc-preview');
  if(preview){ preview.style.display='block'; preview.innerHTML=`Scissione da <strong>${esc(codice)}</strong>. Inserisci il codice del nuovo SUB da creare.`; }
  document.getElementById('modal-scissione').classList.add('open');
}

async function saveScissione(){
  const codice=document.getElementById('sc-codice').value.trim();
  const note=document.getElementById('sc-note').value.trim();
  if(!codice){toast('Inserisci il codice del nuovo SUB','error');return;}
  const r=await api('/api/subs/'+currentSubId+'/scissione',{method:'POST',body:JSON.stringify({nuovo_codice:codice,note_scissione:note})});
  if(r?.error){toast('Errore: '+r.error,'error');return;}
  closeM('modal-scissione');
  await loadDD();
  toast(`✓ Scissione completata — creato SUB ${codice}`);
  openSubDetail(r?.nuovo?.id||currentSubId);
}

function calcIstatPreview(){
  const din=document.getElementById('a-din')?.value;
  const can=parseFloat(document.getElementById('a-can')?.value||0);
  const tipo=document.getElementById('a-tipo-contr')?.value||'';
  const wrap=document.getElementById('istat-preview-wrap');
  const txt=document.getElementById('istat-preview-text');
  if(!wrap||!txt)return;
  if(!din||!can){wrap.classList.add('hidden');return;}
  const mesiPassati=Math.floor((new Date()-new Date(din))/(1000*60*60*24*30.44));
  if(mesiPassati<12){wrap.classList.add('hidden');return;}
  const anniPassati=Math.floor(mesiPassati/12);
  const FOI=1.5; // FOI indicativo — verificare su istat.it
  const percApplicata=tipo.includes('abitativ')?FOI*0.75:FOI;
  const aumentoEuro=can*(percApplicata/100);
  const canoneNuovo=can+aumentoEuro;
  wrap.classList.remove('hidden');
  txt.innerHTML=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px;">
    <div><div style="font-size:10px;color:var(--muted);">Anni trascorsi</div><strong>${anniPassati}</strong></div>
    <div><div style="font-size:10px;color:var(--muted);">FOI (${tipo.includes('abitativ')?'75%':'100%'})</div><strong style="color:var(--orange);">${percApplicata.toFixed(2)}%</strong></div>
    <div><div style="font-size:10px;color:var(--muted);">Aumento annuo</div><strong style="color:var(--green);">+ € ${aumentoEuro.toLocaleString('it-IT',{minimumFractionDigits:2})}</strong></div>
    <div><div style="font-size:10px;color:var(--muted);">Canone attuale</div><strong>€ ${can.toLocaleString('it-IT',{minimumFractionDigits:2})}</strong></div>
    <div><div style="font-size:10px;color:var(--muted);">Nuovo canone/anno</div><strong style="color:var(--green);font-size:14px;">€ ${canoneNuovo.toLocaleString('it-IT',{minimumFractionDigits:2})}</strong></div>
    <div><div style="font-size:10px;color:var(--muted);">Nuovo canone/mese</div><strong>€ ${(canoneNuovo/12).toLocaleString('it-IT',{minimumFractionDigits:2})}</strong></div>
  </div>
  <div style="margin-top:6px;font-size:10px;color:var(--muted);">⚠️ Calcolo indicativo. Verifica il FOI aggiornato su <a href="https://www.istat.it" target="_blank" style="color:var(--teal2);">istat.it</a> prima di applicare.</div>`;
}

async function exportSubCSV(subId, codice) {
  const data = await api('/api/subs/' + subId + '/detail');
  if (!data) return;
  const s = data.sub;
  const rows = [
    ['Campo', 'Valore'],
    ['Codice', s.codice], ['Sede', s.sede_nome], ['Piano', s.piano],
    ['Indirizzo', s.indirizzo_completo], ['Stato', s.stato_occupazione],
    ['Inquilino', s.inquilino_nome], ['Categoria Cat.', s.categoria_cat],
    ['MQ Commerciali', s.mq_commerciali], ['MQ Calpestabili', s.mq_calpestabili],
    ['Rendita', s.rendita], ['Classe Energetica', s.classe_energetica],
    ['Anno Costruzione', s.anno_costruzione], ['Canone Annuo', s.canone_annuo],
    ['Tipo Contratto', s.tipo_contratto], ['Inizio Contratto', s.data_inizio_contratto],
    ['N. Interventi', s.num_interventi], ['Totale Spese', s.totale_spese],
  ];
  const csv = rows.map(r => r.map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(';')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = 'SUB_' + codice + '.csv'; a.click();
  toast('✅ Export SUB ' + codice);
}