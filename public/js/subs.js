// =======================================================
// MODULE: subs.js
// =======================================================

// TODO: loadSubDetail

function renderSubGrid(subs) {
  const el = document.getElementById('home-sub-grid');
  if (!subs.length) { el.innerHTML = '<div class="empty">Nessun SUB. Aggiungili da Anagrafiche.</div>'; return; }
  el.innerHTML = subs.map(s => {
    const border = 'var(--border)';
    return `<div onclick="goToApp('anagrafiche');setTimeout(()=>openSubDetail(${s.id}),400);" style="background:var(--surface);border:1px solid ${border};border-radius:10px;padding:14px 16px;cursor:pointer;transition:all .2s;" onmouseover="this.style.borderColor='rgba(107,142,107,.4)';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='${border}';this.style.transform=''">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <strong style="color:#0f172a;font-size:14px;">${esc(s.codice)}</strong>
        ${s.manutenzioni_aperte>0?`<span style="font-size:9px;background:rgba(184,134,11,.2);color:var(--accent);padding:1px 6px;border-radius:8px;">🔨 ${s.manutenzioni_aperte}</span>`:''}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${esc(s.sede_nome||'—')}${s.piano?' · P.'+esc(s.piano):''}</div>
      <div style="font-size:11px;color:var(--text);">${esc(s.inquilino_nome||'Libero')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.05);">
        <span style="font-size:10px;color:var(--muted);">${s.num_interventi||0} int.</span>
        <span style="font-family:monospace;font-size:11px;font-weight:700;color:var(--accent);">${s.totale_spese?'€ '+parseFloat(s.totale_spese).toLocaleString('it-IT',{maximumFractionDigits:0}):'—'}</span>
      </div>
    </div>`;
  }).join('');
}

// Mostra la scheda SUB come PAGINA (sezione piena), non come popup
function _showSubPage(){
  document.querySelectorAll('#app-main .section').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-subdet')?.classList.add('active');
  document.getElementById('sb-subs')?.classList.add('active'); // il menu resta su SUB
  const main=document.getElementById('app-main'); if(main) main.scrollTop=0;
  window.scrollTo(0,0);
}

async function openSubDetail(id) {
  currentSubId=id; subDetTab='overview';
  _showSubPage();
  document.getElementById('sub-det-content').innerHTML='<div class="empty" style="padding:40px;">Caricamento scheda…</div>';
  document.querySelectorAll('#sub-det-tabs .tab-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  const data=await api('/api/subs/'+id+'/detail');
  if(!data?.sub){document.getElementById('sub-det-content').innerHTML='<div class="empty">Errore caricamento</div>';return;}
  currentSubData=data;
  const s=data.sub;
  document.getElementById('sub-det-header').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-family:'Sora',sans-serif;font-size:24px;font-weight:700;color:#0f172a;">SUB ${esc(s.codice)}</span>
      ${s.ex_sub?`<span class="ex-sub">ex ${esc(s.ex_sub)}</span>`:''}
      <span class="badge badge-sede">${esc(s.sede_nome||'—')}</span>
      ${s.stato_occupazione?`<span style="font-size:11px;padding:3px 10px;border-radius:10px;background:${s.stato_occupazione==='occupato'?'rgba(16,185,129,.15)':'rgba(100,116,139,.15)'};color:${s.stato_occupazione==='occupato'?'var(--green)':'var(--muted)'};">${esc(s.stato_occupazione)}</span>`:''}
      <div style="margin-left:auto;text-align:right;">
        <div style="font-size:22px;font-weight:700;color:var(--accent);font-family:monospace;">€ ${parseFloat(s.totale_spese||0).toLocaleString('it-IT',{minimumFractionDigits:2})}</div>
        <div style="font-size:11px;color:var(--muted);">${s.num_interventi||0} interventi · ${s.num_documenti||0} documenti</div>
      </div>
    </div>`;

  // ── Banner stato non-attivo ──
  const bannerEl = document.getElementById('sub-det-banner');
  if (bannerEl) bannerEl.innerHTML = _subStatoBanner(s);
  _disableSubButtons(s);

  document.getElementById('sub-det-edit-btn').onclick=()=>{openAnaById('sub',id);};
  renderSubDetTab('overview');
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
  codice = codice || (DB.subs||[]).find(s=>s.id==subId)?.codice || '';
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
  <div style="margin-top:6px;font-size:10px;color:var(--muted);">⚠️ Calcolo indicativo. Verifica il FOI aggiornato su <a href="https://www.istat.it" target="_blank" style="color:var(--info);">istat.it</a> prima di applicare.</div>`;
}

async function exportSubCSV(subId, codice) {
  codice = codice || (DB.subs||[]).find(s=>s.id==subId)?.codice || '';
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
// ── Banner stato non-attivo ──────────────────────────────
function _subStatoBanner(sub) {
  const stato = sub.stato_sub;
  if (!stato || stato === 'attivo') return '';
  const LABELS = {
    fuso:          '⚠️ Questo SUB è stato <strong>FUSO</strong>',
    scisso:        '⚠️ Questo SUB è stato <strong>SCISSO</strong>',
    riaccatastato: '⚠️ Questo SUB è stato <strong>RIACCATASTATO</strong>',
    cessato:       '⚠️ Questo SUB è <strong>CESSATO</strong>',
  };
  const dataCambio = sub.data_cambio_stato
    ? ' dal ' + new Date(sub.data_cambio_stato).toLocaleDateString('it-IT')
    : '';
  const destLink = sub.sub_destinazione_codice
    ? ` — <a href="#" onclick="openSubDetail(${sub.sub_destinazione_id||0});return false;" style="color:inherit;font-weight:700;">→ SUB ${esc(sub.sub_destinazione_codice)}</a>`
    : '';
  return `<div class="sub-stato-banner ${stato}">
    <span style="font-size:20px;">${stato==='fuso'?'🔗':stato==='scisso'?'✂️':stato==='riaccatastato'?'🏛️':'🚫'}</span>
    <div>${LABELS[stato]||'⚠️ NON ATTIVO'}${dataCambio}${destLink} — <strong>non più operativo</strong>.</div>
  </div>`;
}

// ── Disabilita pulsanti operativi per SUB non attivi ──────
function _disableSubButtons(sub) {
  if (sub.stato_sub && sub.stato_sub !== 'attivo') {
    const ops = document.querySelectorAll('.sub-op-btn');
    ops.forEach(btn => {
      btn.disabled = true;
      btn.title = `SUB ${sub.stato_sub} — operazione non consentita`;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    });
  }
}

// ═══════════════════════════════════════════════════════════
// P18 — FUSIONE SUB
// ═══════════════════════════════════════════════════════════
function openModalFusioneSub() {
  _fillSubSelects(['fus-padre1','fus-padre2','fus-sede'], true);
  document.getElementById('modal-fusione-sub').classList.add('open');
}

function onFusioneSubChange() {
  const p1 = document.getElementById('fus-padre1').value;
  const p2 = document.getElementById('fus-padre2').value;
  if (p1 && p2 && p1 === p2) {
    toast('I due SUB devono essere diversi', 'error');
    document.getElementById('fus-padre2').value = '';
  }
}

async function eseguiFusione() {
  const p1 = document.getElementById('fus-padre1').value;
  const p2 = document.getElementById('fus-padre2').value;
  const codice = document.getElementById('fus-codice').value.trim();

  if (!p1 || !p2) { toast('Seleziona entrambi i SUB padre', 'error'); return; }
  if (!codice)    { toast('Inserisci il codice del nuovo SUB', 'error'); return; }
  if (p1 === p2)  { toast('I due SUB devono essere diversi', 'error'); return; }

  if(!await appConfirm(`Fondere SUB ${DB.subs.find(s=>s.id==p1)?.codice} + ${DB.subs.find(s=>s.id==p2)?.codice} → ${codice}?\n\nQuesta operazione è IRREVERSIBILE.`)) return;

  const r = await api('/api/subs/fusione', {
    method: 'POST',
    body: JSON.stringify({
      sub_padre_1_id: parseInt(p1),
      sub_padre_2_id: parseInt(p2),
      dati_nuovo_sub: {
        codice,
        piano:         document.getElementById('fus-piano').value    || null,
        sede_id:       document.getElementById('fus-sede').value     || null,
        categoria_cat: document.getElementById('fus-cat').value      || null,
        mq_commerciali: parseFloat(document.getElementById('fus-mq').value) || null,
        rendita:       parseFloat(document.getElementById('fus-rendita').value) || null,
      },
      note_fusione: document.getElementById('fus-note').value || null,
    }),
  });

  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  closeM('modal-fusione-sub');
  toast(`✅ Fusione eseguita → nuovo SUB ${codice}`);
  await loadDD();
}

// ═══════════════════════════════════════════════════════════
// P19 — SCISSIONE SUB
// ═══════════════════════════════════════════════════════════
function openModalScissioneSub() {
  _fillSubSelects(['sci-origine'], true);
  document.getElementById('modal-scissione-sub').classList.add('open');
}

async function eseguiScissione() {
  const origId = document.getElementById('sci-origine').value;
  const c1     = document.getElementById('sci-f1-codice').value.trim();
  const c2     = document.getElementById('sci-f2-codice').value.trim();

  if (!origId) { toast('Seleziona il SUB origine', 'error'); return; }
  if (!c1 || !c2) { toast('Inserisci i codici di entrambi i SUB figli', 'error'); return; }
  if (c1 === c2) { toast('I codici dei figli devono essere diversi', 'error'); return; }

  const origCodice = DB.subs.find(s=>s.id==origId)?.codice || origId;
  if(!await appConfirm(`Scindere SUB ${origCodice} → ${c1} + ${c2}?\n\nQuesta operazione è IRREVERSIBILE.`)) return;

  const r = await api(`/api/subs/${origId}/scissione`, {
    method: 'POST',
    body: JSON.stringify({
      sub_figlio_1: {
        codice:        c1,
        piano:         document.getElementById('sci-f1-piano').value    || null,
        mq_commerciali: parseFloat(document.getElementById('sci-f1-mq').value) || null,
        rendita:       parseFloat(document.getElementById('sci-f1-rendita').value) || null,
        categoria_cat: document.getElementById('sci-f1-cat').value      || null,
      },
      sub_figlio_2: {
        codice:        c2,
        piano:         document.getElementById('sci-f2-piano').value    || null,
        mq_commerciali: parseFloat(document.getElementById('sci-f2-mq').value) || null,
        rendita:       parseFloat(document.getElementById('sci-f2-rendita').value) || null,
        categoria_cat: document.getElementById('sci-f2-cat').value      || null,
      },
      note_scissione: document.getElementById('sci-note').value || null,
    }),
  });

  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  closeM('modal-scissione-sub');
  toast(`✅ Scissione eseguita: ${origCodice} → ${c1} + ${c2}`);
  await loadDD();
}

// ═══════════════════════════════════════════════════════════
// P20 — RIACCATASTAMENTO SUB
// ═══════════════════════════════════════════════════════════
function openModalRiaccatastamentoSub() {
  _fillSubSelects(['ria-origine'], true);
  document.getElementById('modal-riaccatastamento-sub').classList.add('open');
}

function onRiaccSubChange() {
  const id = document.getElementById('ria-origine').value;
  if (!id) return;
  const sub = DB.subs.find(s => s.id == id);
  if (!sub) return;
  // Pre-compila i campi dal SUB originale
  document.getElementById('ria-codice').value      = sub.codice + '-R';
  document.getElementById('ria-foglio').value      = sub.foglio     || '';
  document.getElementById('ria-particella').value  = sub.particella || '';
  document.getElementById('ria-subalterno').value  = sub.subalterno || '';
  document.getElementById('ria-cat').value         = sub.categoria_cat || '';
  document.getElementById('ria-rendita').value     = sub.rendita    || '';
}

async function eseguiRiaccatastamento() {
  const origId = document.getElementById('ria-origine').value;
  const codice  = document.getElementById('ria-codice').value.trim();

  if (!origId) { toast('Seleziona il SUB origine', 'error'); return; }
  if (!codice) { toast('Inserisci il nuovo codice', 'error'); return; }

  const origCodice = DB.subs.find(s=>s.id==origId)?.codice || origId;
  if(!await appConfirm(`Riaccatastate SUB ${origCodice} → ${codice}?\n\nL'originale sarà marcato come riaccatastato.`)) return;

  const r = await api('/api/subs/riaccatastamento', {
    method: 'POST',
    body: JSON.stringify({
      sub_origine_id: parseInt(origId),
      dati_nuovo_sub: {
        codice,
        foglio:       document.getElementById('ria-foglio').value      || null,
        particella:   document.getElementById('ria-particella').value  || null,
        subalterno:   document.getElementById('ria-subalterno').value  || null,
        categoria_cat: document.getElementById('ria-cat').value        || null,
        rendita:      parseFloat(document.getElementById('ria-rendita').value) || null,
        note:         document.getElementById('ria-note').value        || null,
      },
    }),
  });

  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  closeM('modal-riaccatastamento-sub');
  toast(`✅ Riaccatastamento: ${origCodice} → ${codice}`);
  await loadDD();
}

// ── Helper: popola select con SUB (solo attivi o tutti) ────
function _fillSubSelects(ids, activoOnly = true) {
  const subs = activoOnly
    ? (DB.subs || []).filter(s => !s.stato_sub || s.stato_sub === 'attivo')
    : (DB.subs || []);
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">— Seleziona —</option>' +
      subs.map(s => `<option value="${s.id}">${esc(s.codice)} — ${esc(s.sede_nome||'')}</option>`).join('');
  });
}

// Mostra/nascondi il pannello azioni rapide della scheda SUB
function toggleSubActions(){
  const b=document.getElementById('sub-action-bar');
  if(!b)return;
  const open=b.style.display==='none';
  b.style.display=open?'flex':'none';
  const t=document.getElementById('subdet-actions-toggle');
  if(t)t.textContent=open?'⚡ Chiudi azioni':'⚡ Azioni rapide';
}
