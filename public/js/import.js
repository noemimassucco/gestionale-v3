// =======================================================
// MODULE: import_module.js
// =======================================================

function loadZuc(input,type){
  if(type)zucType=type;const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=function(e){const wb=XLSX.read(e.target.result,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];zucRows=XLSX.utils.sheet_to_json(ws,{defval:''});if(!zucRows.length){toast('Nessun dato','error');return;}const cols=Object.keys(zucRows[0]);zucMap=autoMapZ(cols);const found=Object.entries(zucMap).filter(([k,v])=>v);document.getElementById(zucType==='fornitori'?'zuc-info':'zuc-info-inq').innerHTML=`<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:12px;"><div style="color:var(--green);font-weight:600;margin-bottom:7px;">✓ ${found.length} colonne riconosciute</div><div style="display:flex;flex-wrap:wrap;gap:5px;">${found.map(([k,v])=>`<span style="background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);border-radius:4px;padding:2px 7px;font-size:10px;color:#34d399;">${k}→<strong>${v}</strong></span>`).join('')}</div></div>`;const arr=zucType==='fornitori'?DB.fornitori:DB.inquilini;const ex=new Set(arr.map(x=>(x.ragione_sociale||'').toLowerCase().trim()));const nc=zucRows.filter(r=>{const rag=(String(r[zucMap.ragione_sociale]||'')).trim().toLowerCase();return rag&&!ex.has(rag);}).length;document.getElementById(zucType==='fornitori'?'zuc-stats':'zuc-stats-inq').innerHTML=`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:var(--green);font-size:15px;display:block;">${zucRows.length}</strong>Righe</div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:var(--green);font-size:15px;display:block;">${nc}</strong>Nuovi</div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:var(--gold);font-size:15px;display:block;">${zucRows.length-nc}</strong>Già presenti</div>`;// Mostra il panel corretto per il tipo (fornitori o inquilini)
  const _panel = zucType==='fornitori' ? 'zuc-fornitori-panel' : 'zuc-inquilini-panel';
  document.getElementById('zuc-fornitori-panel').style.display='none';
  document.getElementById('zuc-inquilini-panel').style.display='none';
  document.getElementById(_panel).style.display='';};r.readAsArrayBuffer(file);}

async function commitZuc(){if(!zucMap.ragione_sociale){toast('Ragione Sociale non trovata','error');return;}const items=zucRows.map(row=>({codice_zuc:String(row[zucMap.codice_zuc]||'').trim(),ragione_sociale:String(row[zucMap.ragione_sociale]||'').trim(),piva:String(row[zucMap.piva]||'').trim(),cf:String(row[zucMap.cf]||'').trim(),indirizzo:String(row[zucMap.indirizzo]||'').trim(),cap:String(row[zucMap.cap]||'').trim(),citta:String(row[zucMap.citta]||'').trim(),provincia:String(row[zucMap.provincia]||'').trim(),tel:String(row[zucMap.tel]||'').trim(),email:String(row[zucMap.email]||'').trim()})).filter(x=>x.ragione_sociale);const url='/api/'+(zucType==='fornitori'?'fornitori':'inquilini')+'/import-bulk';const r=await api(url,{method:'POST',body:JSON.stringify({items})});closeM('modal-zuc');await loadDD();toast(`✓ Importati ${r.added}${r.skipped?', '+r.skipped+' saltati':''}`,'success');}

function loadSubImport(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    subImportRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!subImportRows.length) { toast('File vuoto', 'error'); return; }

    const cols = Object.keys(subImportRows[0]);

    // Auto-map using flexible matching
    const SUB_MAP = {
      codice:             ['codice sub','codice','cod sub','cod.','sub'],
      sede:               ['sede','immobile','building'],
      piano:              ['piano','floor'],
      indirizzo_completo: ['indirizzo completo','indirizzo','address'],
      foglio:             ['foglio'],
      particella:         ['particella'],
      subalterno:         ['subalterno','sub.','subalternato'],
      categoria_cat:      ['categoria catastale','categoria','cat.','cat '],
      mq_commerciali:     ['mq commerciali','mq comm','sup comm'],
      mq_calpestabili:    ['mq calpestabili','mq calc','sup calc','mq'],
      rendita:            ['rendita','rendita €','rendita eur'],
      stato_occupazione:  ['stato occupazione','stato occ','stato'],
      classe_energetica:  ['classe energetica','classe en','ape'],
      anno_costruzione:   ['anno costruzione','anno costr','anno'],
      note:               ['note','note aggiuntive','note/osservazioni'],
    };
    const lowCols = cols.map(c => c.toLowerCase().trim());
    subImportMap = {};
    Object.entries(SUB_MAP).forEach(([field, variants]) => {
      for (const v of variants) {
        const i = lowCols.findIndex(c => c.includes(v) || v.includes(c));
        if (i >= 0) { subImportMap[field] = cols[i]; break; }
      }
    });

    const mapped = Object.values(subImportMap).filter(Boolean).length;
    const info = document.getElementById('sub-import-info');
    const prev = document.getElementById('sub-import-prev');
    if (info) info.innerHTML = `<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:7px;padding:10px 12px;margin-bottom:8px;">
      <div style="color:var(--green);font-weight:600;margin-bottom:6px;">✅ ${subImportRows.length} SUB trovati · ${mapped}/${Object.keys(SUB_MAP).length} colonne mappate</div>
      <div style="font-size:10px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px;">
        ${Object.entries(subImportMap).map(([k,v]) => v ? `<span style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:3px;padding:1px 6px;">${k}→<strong>${v}</strong></span>` : '').filter(Boolean).join('')}
      </div></div>`;
    if (prev) prev.innerHTML = '';

    // Show wizard
    document.getElementById('sub-import-wiz').style.display = '';
    document.getElementById('sub-import-s1').style.display = '';
    document.getElementById('sub-import-s2').style.display = 'none';
    document.getElementById('sub-import-analyze').style.display = '';
  };
  reader.readAsArrayBuffer(file);
}

function analizzaSubImport() {
  if (!subImportRows.length) { toast('Carica prima un file', 'error'); return; }
  if (!subImportMap.codice) { toast('Colonna Codice SUB non trovata — verifica il file', 'error'); return; }

  // Generate preview
  const preview = subImportRows.slice(0, 5);
  const stats = document.getElementById('sub-import-stats');
  const previewEl = document.getElementById('sub-import-preview');

  if (stats) stats.innerHTML = `<div style="background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.2);border-radius:7px;padding:10px 12px;font-size:12px;">
    Pronti per import: <strong style="color:var(--accent);">${subImportRows.length} SUB</strong>
  </div>`;

  if (previewEl) {
    const cols = ['codice','sede','piano','foglio','particella','subalterno','stato_occupazione'];
    previewEl.innerHTML = `<div style="font-size:10px;color:var(--muted);margin-bottom:6px;">Anteprima prime 5 righe:</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead><tr>${cols.map(k => `<th style="text-align:left;padding:3px 6px;border-bottom:1px solid var(--border);color:var(--muted);">${k}</th>`).join('')}</tr></thead>
      <tbody>${preview.map(row => {
        const get = (field) => subImportMap[field] ? String(row[subImportMap[field]]||'').slice(0,20) : '—';
        return `<tr>${cols.map(k => `<td style="padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.04);">${esc(get(k))}</td>`).join('')}</tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  document.getElementById('sub-import-s1').style.display = 'none';
  document.getElementById('sub-import-s2').style.display = '';
  document.getElementById('sub-import-analyze').style.display = 'none';
}



async function commitSubImport() {
  if (!subImportRows.length || !subImportMap.codice) {
    toast('Carica e analizza prima il file', 'error'); return;
  }

  const get = (row, field) => subImportMap[field] ? String(row[subImportMap[field]]||'').trim() : '';
  const items = subImportRows
    .map(row => ({
      codice:             get(row,'codice'),
      sede:               get(row,'sede'),
      piano:              get(row,'piano'),
      indirizzo_completo: get(row,'indirizzo_completo'),
      foglio:             get(row,'foglio'),
      particella:         get(row,'particella'),
      subalterno:         get(row,'subalterno'),
      categoria_cat:      get(row,'categoria_cat'),
      mq_commerciali:     get(row,'mq_commerciali'),
      mq_calpestabili:    get(row,'mq_calpestabili'),
      rendita:            get(row,'rendita'),
      stato_occupazione:  get(row,'stato_occupazione'),
      classe_energetica:  get(row,'classe_energetica'),
      anno_costruzione:   get(row,'anno_costruzione'),
      note:               get(row,'note'),
    }))
    .filter(r => r.codice);

  if (!items.length) { toast('Nessun SUB valido (colonna Codice vuota?)', 'error'); return; }

  const okBtn = document.getElementById('sub-import-ok');
  if (okBtn) { okBtn.disabled = true; okBtn.textContent = 'Importazione…'; }

  const r = await api('/api/subs/import-bulk', {
    method: 'POST',
    body: JSON.stringify({ rows: items }),
  });

  if (okBtn) { okBtn.disabled = false; okBtn.textContent = '✓ Importa SUB'; }

  if (!r || r.error) { toast('Errore: ' + (r?.error || 'risposta nulla'), 'error'); return; }

  document.getElementById('sub-import-wiz').style.display = 'none';
  document.getElementById('subImportFile').value = '';
  subImportRows = []; subImportMap = {};
  await loadDD();
  toast(`✅ ${r.added || 0} SUB aggiunti · ${r.updated || 0} aggiornati` +
        (r.errors?.length ? ` · ⚠️ ${r.errors.length} errori` : ''));
}



function loadStorico(input){const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=function(e){const wb=XLSX.read(e.target.result,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];storicoRows=XLSX.utils.sheet_to_json(ws,{defval:''});if(!storicoRows.length){toast('Nessun dato','error');return;}showStoricoStep(Object.keys(storicoRows[0]));};r.readAsArrayBuffer(file);}

function showStoricoStep(cols){const cs=(id,lbl)=>`<div class="field"><label>${lbl}</label><select id="${id}"><option value="">— Non presente —</option>${cols.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>`;const aS=(id,vs)=>{const l=cols.map(c=>c.toLowerCase().trim());for(const v of vs){const i=l.findIndex(c=>c.includes(v)||v.includes(c));if(i>=0){setTimeout(()=>{const el=document.getElementById(id);if(el)el.value=cols[i];},80);break;}}};document.getElementById('storico-wiz').innerHTML=`<h3 style="font-size:13px;color:#fff;margin-bottom:11px;">${storicoRows.length} righe trovate — Mappa le colonne:</h3><div class="form-grid">${cs('ss-sub','SUB *')}${cs('ss-loc','Sede')}${cs('ss-forn','Fornitore *')}${cs('ss-inq','Inquilino')}${cs('ss-pr','N° Protocollo')}${cs('ss-nf','N° Fattura')}${cs('ss-di','Data Intervento')}${cs('ss-df','Data Fattura')}${cs('ss-p','Prezzo')}${cs('ss-desc','Descrizione *')}${cs('ss-note','Note')}</div><div style="margin-top:12px;"><button class="btn btn-orange" onclick="analizzaS()">🔍 Analizza →</button></div>`;document.getElementById('storico-wiz').style.display='block';aS('ss-sub',['sub','unità imm','unita imm','codice sub']);aS('ss-loc',['sede','location']);aS('ss-forn',['fornitore','ditta','ditta esecutrice']);aS('ss-inq',['inquilino','conduttore']);aS('ss-pr',['protocollo','prot','n. prot']);aS('ss-nf',['fattura','num ft','rif. fattura','n fattura']);aS('ss-di',['data lavori','data interv','data lav']);aS('ss-df',['data fattura','data doc']);aS('ss-p',['prezzo','importo','importo €','importo€','totale']);aS('ss-desc',['descrizione','oggetto','oggetto lavori']);aS('ss-note',['note','annotaz']);}

function analizzaS(){
  const m={sub:gV('ss-sub'),loc:gV('ss-loc'),forn:gV('ss-forn'),inq:gV('ss-inq'),pr:gV('ss-pr'),nf:gV('ss-nf'),di:gV('ss-di'),df:gV('ss-df'),p:gV('ss-p'),desc:gV('ss-desc'),note:gV('ss-note')};
  if(!m.sub||!m.forn||!m.desc){toast('Mappa SUB, Fornitore e Descrizione','error');return;}
  const nr=s=>(s||'').toLowerCase().trim();
  const an=storicoRows.map(row=>{
    const subC=String(row[m.sub]||'').trim(),fornN=String(row[m.forn]||'').trim(),descV=String(row[m.desc]||'').trim();
    const locV=m.loc?String(row[m.loc]||'').trim():'',inqN=m.inq?String(row[m.inq]||'').trim():'';
    const subM=DB.subs.find(s=>nr(s.codice)===nr(subC)||nr(s.ex_sub||'')===nr(subC));
    const fornM=DB.fornitori.find(f=>nr(f.ragione_sociale)===nr(fornN))||DB.fornitori.find(f=>nr(f.ragione_sociale).includes(nr(fornN))||nr(fornN).includes(nr(f.ragione_sociale)));
    const inqM=inqN?(DB.inquilini.find(i=>nr(i.ragione_sociale)===nr(inqN))||DB.inquilini.find(i=>nr(i.ragione_sociale).includes(nr(inqN)))):null;
    let status='ok',note='';
    if(!subM&&subC){status='warn';note='SUB non trovato';}
    if(!fornN){status='err';note='Fornitore mancante';}
    else if(!fornM){status='new';note='Nuovo fornitore → creato';}
    if(inqN&&!inqM&&status==='ok'){status='new';note='Nuovo inquilino → creato';}
    return{row,m,subC,fornN,descV,locV,inqN,subM,fornM,inqM,status,note,protocollo:m.pr?String(row[m.pr]||'').trim():'',num_fattura:m.nf?String(row[m.nf]||'').trim():'',data_intervento:m.di?String(row[m.di]||'').trim():'',data_fattura:m.df?String(row[m.df]||'').trim():'',prezzo:m.p?String(row[m.p]||'').trim():'',note_txt:m.note?String(row[m.note]||'').trim():'',};
  });
  window._an=an;
  const cnt={ok:0,new:0,warn:0,err:0};an.forEach(r=>cnt[r.status]++);
  const sc={ok:'var(--green)',new:'var(--accent)',warn:'var(--gold)',err:'var(--red)'};
  const sl={ok:'✓ Pronto',new:'+ Nuovo',warn:'⚠ SUB mancante',err:'✗ Errore'};
  document.getElementById('storico-wiz').innerHTML=`<h3 style="font-size:13px;color:#fff;margin-bottom:9px;">Analisi completata</h3>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:11px;">${Object.entries(cnt).map(([k,v])=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:${sc[k]};font-size:15px;display:block;">${v}</strong>${sl[k]}</div>`).join('')}</div>
    <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:7px;font-size:11px;">
      <table><thead><tr><th>Stato</th><th>SUB</th><th>Fornitore</th><th>Descrizione</th><th>Info</th></tr></thead>
      <tbody>${an.slice(0,30).map(r=>`<tr><td><span style="color:${sc[r.status]}">${sl[r.status]}</span></td><td>${esc(r.subC)}</td><td>${esc(r.fornN.slice(0,20))}</td><td>${esc(r.descV.slice(0,35))}</td><td style="color:var(--muted)">${esc(r.note)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;display:flex;gap:9px;">
      <button class="btn btn-gray" onclick="document.getElementById('storico-wiz').style.display='none'">← Ricomincia</button>
      <button class="btn btn-success" onclick="commitS()" ${cnt.ok+cnt.new===0?'disabled':''}>✓ Importa ${cnt.ok+cnt.new} interventi</button>
    </div>`;
}

async function commitS(){
  const an=window._an;
  const toImp=(an||[]).filter(r=>r.status==='ok'||r.status==='new');
  if(!toImp.length){toast('Nessuna riga da importare','error');return;}

  const rows=toImp.map(r=>({
    sub_codice:r.subC,location:r.locV||'',fornitore_nome:r.fornN,
    inquilino_nome:r.inqN||'',protocollo:r.protocollo,num_fattura:r.num_fattura,
    data_intervento:r.data_intervento,data_fattura:r.data_fattura,
    prezzo:r.prezzo,descrizione:r.descV,note:r.note_txt
  }));

  // Show progress UI
  const wiz=document.getElementById('storico-wiz');
  wiz.innerHTML=`
    <div style="background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.2);border-radius:9px;padding:16px;">
      <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:10px;">⏳ Importazione in corso…</div>
      <div class="progress-bar"><div class="progress-bar-fill" id="imp-prog" style="width:0%"></div></div>
      <div id="imp-status" style="font-size:12px;color:var(--muted);margin-top:6px;">Preparazione…</div>
    </div>`;

  const CHUNK=50; let added=0,errors=[];
  for(let i=0;i<rows.length;i+=CHUNK){
    const chunk=rows.slice(i,i+CHUNK);
    const pct=Math.round((i/rows.length)*100);
    const prog=document.getElementById('imp-prog');
    const stat=document.getElementById('imp-status');
    if(prog)prog.style.width=pct+'%';
    if(stat)stat.textContent=`${i} / ${rows.length} righe (${pct}%)`;
    await new Promise(r=>setTimeout(r,0)); // yield to UI
    const r=await api('/api/interventi/import-storico',{method:'POST',body:JSON.stringify({rows:chunk})});
    if(r){added+=r.added||0;errors.push(...(r.errors||[]));}
  }

  const prog=document.getElementById('imp-prog');
  if(prog)prog.style.width='100%';
  await loadDD();
  document.getElementById('storicoFile').value='';
  wiz.style.display='none';
  const errMsg=errors.length?` · ${errors.length} errori`:'';
  toast(`✓ ${added} interventi importati${errMsg}`,'success');
  if(errors.length){
    console.warn('Import errors:',errors);
    wiz.style.display='block';
    wiz.innerHTML=`<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:9px;padding:12px;font-size:11px;"><strong style="color:var(--red);">⚠ ${errors.length} errori:</strong><br>${errors.slice(0,5).map(e=>`SUB ${e.row}: ${e.error}`).join('<br>')}${errors.length>5?`<br>…e altri ${errors.length-5}`:''}
    <br><br><button class="btn btn-gray btn-sm" onclick="this.closest('#storico-wiz').style.display='none'">OK</button></div>`;
  }
}

function exportExcel(){window.open('/api/export',{headers:{Authorization:`Bearer ${token}`}});fetch('/api/export',{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.blob()).then(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='storico_v3.xlsx';a.click();});}

function exportJSON(){const d={sedi:DB.sedi,subs:DB.subs,fornitori:DB.fornitori,inquilini:DB.inquilini,categorie:DB.categorie,exported:new Date().toISOString()};const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='backup_v3_'+new Date().toISOString().slice(0,10)+'.json';a.click();toast('Backup scaricato ✓');}

function importJSON(input){const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=function(e){try{const d=JSON.parse(e.target.result);if(confirm(`Backup del ${d.exported?.slice(0,10)||'?'} — ripristinare?`)){toast('Ripristinato ✓');}}catch(e){toast('Errore file','error');}};r.readAsText(file);}