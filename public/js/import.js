// =======================================================
// MODULE: import_module.js
// =======================================================

// ═══════ PARSER EXCEL ROBUSTO ═══════
// Legge anche file "non impostati come vuole lui": titoli sopra la tabella,
// righe vuote, intestazioni con accenti/maiuscole diverse, numeri formato € 1.234,56.

const SUB_MAP_X = {
  codice:             ['codice sub','codice','cod sub','cod','sub','n sub','numero sub','unita','unità','n unita','id sub','identificativo'],
  ex_sub:             ['ex sub','ex','vecchio sub','sub ex','vecchio codice','cod precedente','sub precedente'],
  sede:               ['sede','immobile','edificio','stabile','fabbricato','building','palazzo','condominio'],
  piano:              ['piano','floor','livello'],
  indirizzo_completo: ['indirizzo completo','indirizzo','via','ubicazione','address'],
  foglio:             ['foglio','fg','fog'],
  particella:         ['particella','part','mappale','p.lla','plla'],
  subalterno:         ['subalterno','sub.','subalternato','subalt'],
  categoria_cat:      ['categoria catastale','categoria','cat catastale','cat','ctg'],
  mq_commerciali:     ['mq commerciali','mq comm','sup commerciale','superficie commerciale','mq lordi'],
  mq_calpestabili:    ['mq calpestabili','mq calp','sup calpestabile','superficie calpestabile','mq netti','mq','metri quadri','superficie'],
  rendita:            ['rendita catastale','rendita','rendita €','rendita eur'],
  millesimi:          ['millesimi','millesimi proprieta','tabella a','‰'],
  stato_occupazione:  ['stato occupazione','stato occ','occupazione','occupato libero','situazione'],
  classe_energetica:  ['classe energetica','classe en','ape','classe'],
  anno_costruzione:   ['anno costruzione','anno costr','anno di costruzione','costruito nel','anno'],
  note:               ['note','note aggiuntive','osservazioni','annotazioni'],
};

function _xNorm(s){return String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}

// Numeri italiani/strani → numero JS ("€ 1.234,56" → 1234.56)
function _xNum(v){
  if(v==null||v==='')return '';
  if(typeof v==='number')return v;
  let s=String(v).replace(/[€\s]/g,'').trim();
  if(!s)return '';
  if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else s=s.replace(/,/g,'');
  const n=parseFloat(s);
  return isNaN(n)?'':n;
}

function _xlsSynSet(){
  const set=new Set();
  [SUB_MAP_X, (typeof ZM!=='undefined'?ZM:{})].forEach(M=>Object.values(M).forEach(vs=>vs.forEach(v=>set.add(_xNorm(v)))));
  return set;
}

// Legge il primo foglio trovando DA SOLO la riga delle intestazioni
function _xlsSmartRows(arrayBuffer){
  const wb=XLSX.read(arrayBuffer,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  const dict=[..._xlsSynSet()];
  let best=0,bestScore=-1;
  for(let i=0;i<Math.min(grid.length,15);i++){
    const cells=(grid[i]||[]).map(_xNorm).filter(Boolean);
    if(cells.length<2)continue;
    let score=0;
    cells.forEach(c=>{
      if(dict.some(s=>c===s||c.includes(s)||s.includes(c)))score+=2;
      else if(isNaN(parseFloat(c)))score+=0.25;
    });
    if(score>bestScore){bestScore=score;best=i;}
  }
  const headerRaw=(grid[best]||[]).map(h=>String(h??'').trim());
  const seen={};
  const header=headerRaw.map((h,i)=>{let n=h||('Colonna '+(i+1));if(seen[n]!=null){seen[n]++;n=n+' ('+seen[n]+')';}else seen[n]=1;return n;});
  const rows=[];
  for(let i=best+1;i<grid.length;i++){
    const r=grid[i]||[];
    if(!r.some(c=>String(c??'').trim()!==''))continue;               // riga vuota
    const obj={};header.forEach((h,j)=>obj[h]=r[j]??'');
    if(_xNorm(Object.values(obj).join(' '))===_xNorm(headerRaw.join(' ')))continue; // intestazione ripetuta
    rows.push(obj);
  }
  return {rows,cols:header,headerRow:best};
}

// Mappa colonne → campi: match esatto batte match parziale, sinonimo più lungo vince
function _xMapCols(cols,MAP){
  const m={};const low=cols.map(_xNorm);const usati=new Set();
  Object.entries(MAP).forEach(([field,variants])=>{
    let bi=-1,bScore=-1;
    variants.forEach(v=>{
      const nv=_xNorm(v);
      low.forEach((c,i)=>{
        if(usati.has(i)||!c)return;
        let score=-1;
        if(c===nv)score=1000+nv.length;
        else if(c.includes(nv)||nv.includes(c))score=nv.length;
        if(score>bScore){bScore=score;bi=i;}
      });
    });
    if(bi>=0&&bScore>=0){m[field]=cols[bi];usati.add(bi);}
  });
  return m;
}

// "2 ADESSO 730-731" / "730-731 EX 2" / "SUB 5" → { codice, ex_sub }
function _xParseCodice(raw){
  let codice=String(raw||'').trim().replace(/^sub\.?\s*/i,'');
  let ex='';
  let m=codice.match(/^(.+?)\s+adesso\s+(.+)$/i);
  if(m){ex=m[1].trim();codice=m[2].trim();}
  else{m=codice.match(/^(.+?)\s+ex\.?\s+(.+)$/i);if(m){codice=m[1].trim();ex=m[2].trim();}}
  return {codice,ex_sub:ex};
}

function loadZuc(input,type){
  if(type)zucType=type;const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=function(e){const parsed=_xlsSmartRows(e.target.result);zucRows=parsed.rows;if(!zucRows.length){toast('Nessun dato nel file','error');return;}const cols=parsed.cols;zucMap=_xMapCols(cols,ZM);if(parsed.headerRow>0)toast('ℹ Intestazioni trovate alla riga '+(parsed.headerRow+1));const found=Object.entries(zucMap).filter(([k,v])=>v);document.getElementById(zucType==='fornitori'?'zuc-info':'zuc-info-inq').innerHTML=`<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:12px;"><div style="color:var(--green);font-weight:600;margin-bottom:7px;">✓ ${found.length} colonne riconosciute</div><div style="display:flex;flex-wrap:wrap;gap:5px;">${found.map(([k,v])=>`<span style="background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);border-radius:4px;padding:2px 7px;font-size:10px;color:var(--success);">${k}→<strong>${v}</strong></span>`).join('')}</div></div>`;const arr=zucType==='fornitori'?DB.fornitori:DB.inquilini;const ex=new Set(arr.map(x=>(x.ragione_sociale||'').toLowerCase().trim()));const nc=zucRows.filter(r=>{const rag=(String(r[zucMap.ragione_sociale]||'')).trim().toLowerCase();return rag&&!ex.has(rag);}).length;document.getElementById(zucType==='fornitori'?'zuc-stats':'zuc-stats-inq').innerHTML=`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:var(--green);font-size:15px;display:block;">${zucRows.length}</strong>Righe</div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:var(--green);font-size:15px;display:block;">${nc}</strong>Nuovi</div><div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:var(--accent);font-size:15px;display:block;">${zucRows.length-nc}</strong>Già presenti</div>`;// Mostra il panel corretto per il tipo (fornitori o inquilini)
  const _panel = zucType==='fornitori' ? 'zuc-fornitori-panel' : 'zuc-inquilini-panel';
  document.getElementById('zuc-fornitori-panel').style.display='none';
  document.getElementById('zuc-inquilini-panel').style.display='none';
  document.getElementById(_panel).style.display='';};r.readAsArrayBuffer(file);}

async function commitZuc(){if(!zucMap.ragione_sociale){toast('Ragione Sociale non trovata','error');return;}const items=zucRows.map(row=>({codice_zuc:String(row[zucMap.codice_zuc]||'').trim(),ragione_sociale:String(row[zucMap.ragione_sociale]||'').trim(),piva:String(row[zucMap.piva]||'').trim(),cf:String(row[zucMap.cf]||'').trim(),indirizzo:String(row[zucMap.indirizzo]||'').trim(),cap:String(row[zucMap.cap]||'').trim(),citta:String(row[zucMap.citta]||'').trim(),provincia:String(row[zucMap.provincia]||'').trim(),tel:String(row[zucMap.tel]||'').trim(),email:String(row[zucMap.email]||'').trim()})).filter(x=>x.ragione_sociale);const url='/api/'+(zucType==='fornitori'?'fornitori':'inquilini')+'/import-bulk';const r=await api(url,{method:'POST',body:JSON.stringify({items})});if(!r||r.error){toast('Errore import: '+(r?.error||'server non raggiungibile'),'error');return;}await loadDD();toast(`✓ Importati ${r.added}${r.skipped?', '+r.skipped+' saltati':''}`,'success');}

function loadSubImport(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const parsed = _xlsSmartRows(e.target.result);
    subImportRows = parsed.rows;
    if (!subImportRows.length) { toast('File vuoto', 'error'); return; }
    const cols = parsed.cols;
    subImportMap = _xMapCols(cols, SUB_MAP_X);
    if (parsed.headerRow > 0) toast('ℹ Intestazioni trovate alla riga ' + (parsed.headerRow + 1));

    const mapped = Object.values(subImportMap).filter(Boolean).length;
    const info = document.getElementById('sub-import-info');
    const prev = document.getElementById('sub-import-prev');
    // Se il codice non è stato trovato da solo, si sceglie a mano — mai più bloccati
    const selCol = (field, label) => `<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);">${label}
      <select onchange="subImportMap.${field}=this.value||undefined" style="font-size:11px;padding:4px 7px;border:1px solid var(--border-2);border-radius:6px;background:var(--card);max-width:150px;">
        <option value="">— nessuna —</option>
        ${cols.map(c => `<option value="${esc(c)}"${subImportMap[field]===c?' selected':''}>${esc(c)}</option>`).join('')}
      </select></label>`;
    if (info) info.innerHTML = `<div style="background:${subImportMap.codice?'rgba(16,185,129,.08)':'rgba(194,84,46,.08)'};border:1px solid ${subImportMap.codice?'rgba(16,185,129,.2)':'rgba(194,84,46,.3)'};border-radius:7px;padding:10px 12px;margin-bottom:8px;">
      <div style="color:${subImportMap.codice?'var(--green)':'var(--terra,#c2542e)'};font-weight:600;margin-bottom:6px;">${subImportMap.codice?`✅ ${subImportRows.length} righe trovate · ${mapped}/${Object.keys(SUB_MAP_X).length} colonne riconosciute`:`⚠ ${subImportRows.length} righe trovate, ma non ho capito quale colonna è il codice SUB — sceglila qui sotto`}</div>
      <div style="font-size:10px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
        ${Object.entries(subImportMap).map(([k,v]) => v ? `<span style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:3px;padding:1px 6px;">${k}→<strong>${esc(v)}</strong></span>` : '').filter(Boolean).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${selCol('codice','Colonna codice SUB:')}
        ${selCol('sede','Sede:')}
        ${selCol('ex_sub','Ex SUB:')}
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

  if (stats) stats.innerHTML = `<div style="background:rgba(107,142,107,.08);border:1px solid rgba(107,142,107,.2);border-radius:7px;padding:10px 12px;font-size:12px;">
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
    .map(row => {
      // Codice: capisce anche "2 ADESSO 730-731" e "730-731 EX 2"
      const pc = _xParseCodice(get(row,'codice'));
      return {
        codice:             pc.codice,
        ex_sub:             get(row,'ex_sub') || pc.ex_sub,
        sede:               get(row,'sede'),
        piano:              get(row,'piano'),
        indirizzo_completo: get(row,'indirizzo_completo'),
        foglio:             get(row,'foglio'),
        particella:         get(row,'particella'),
        subalterno:         get(row,'subalterno'),
        categoria_cat:      get(row,'categoria_cat'),
        mq_commerciali:     _xNum(subImportMap.mq_commerciali ? row[subImportMap.mq_commerciali] : ''),
        mq_calpestabili:    _xNum(subImportMap.mq_calpestabili ? row[subImportMap.mq_calpestabili] : ''),
        rendita:            _xNum(subImportMap.rendita ? row[subImportMap.rendita] : ''),
        millesimi:          _xNum(subImportMap.millesimi ? row[subImportMap.millesimi] : ''),
        stato_occupazione:  get(row,'stato_occupazione'),
        classe_energetica:  get(row,'classe_energetica'),
        anno_costruzione:   parseInt(_xNum(subImportMap.anno_costruzione ? row[subImportMap.anno_costruzione] : ''))||'',
        note:               get(row,'note'),
      };
    })
    .filter(r => r.codice && !/^(tot|totale|somma)/i.test(r.codice));

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



function loadStorico(input){const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=function(e){const parsed=_xlsSmartRows(e.target.result);storicoRows=parsed.rows;if(!storicoRows.length){toast('Nessun dato','error');return;}showStoricoStep(parsed.cols);};r.readAsArrayBuffer(file);}

function showStoricoStep(cols){const cs=(id,lbl)=>`<div class="field"><label>${lbl}</label><select id="${id}"><option value="">— Non presente —</option>${cols.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>`;const aS=(id,vs)=>{const l=cols.map(c=>c.toLowerCase().trim());for(const v of vs){const i=l.findIndex(c=>c.includes(v)||v.includes(c));if(i>=0){setTimeout(()=>{const el=document.getElementById(id);if(el)el.value=cols[i];},80);break;}}};document.getElementById('storico-wiz').innerHTML=`<h3 style="font-size:13px;color:#0f172a;margin-bottom:11px;">${storicoRows.length} righe trovate — Mappa le colonne:</h3><div class="form-grid">${cs('ss-sub','SUB *')}${cs('ss-loc','Sede')}${cs('ss-forn','Fornitore *')}${cs('ss-inq','Inquilino')}${cs('ss-pr','N° Protocollo')}${cs('ss-nf','N° Fattura')}${cs('ss-di','Data Intervento')}${cs('ss-df','Data Fattura')}${cs('ss-p','Prezzo')}${cs('ss-desc','Descrizione *')}${cs('ss-note','Note')}</div><div style="margin-top:12px;"><button class="btn btn-orange" onclick="analizzaS()">🔍 Analizza →</button></div>`;document.getElementById('storico-wiz').style.display='block';aS('ss-sub',['sub','unità imm','unita imm','codice sub']);aS('ss-loc',['sede','location']);aS('ss-forn',['fornitore','ditta','ditta esecutrice']);aS('ss-inq',['inquilino','conduttore']);aS('ss-pr',['protocollo','prot','n. prot']);aS('ss-nf',['fattura','num ft','rif. fattura','n fattura']);aS('ss-di',['data lavori','data interv','data lav']);aS('ss-df',['data fattura','data doc']);aS('ss-p',['prezzo','importo','importo €','importo€','totale']);aS('ss-desc',['descrizione','oggetto','oggetto lavori']);aS('ss-note',['note','annotaz']);}

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
  const sc={ok:'var(--green)',new:'var(--accent)',warn:'var(--accent)',err:'var(--red)'};
  const sl={ok:'✓ Pronto',new:'+ Nuovo',warn:'⚠ SUB mancante',err:'✗ Errore'};
  document.getElementById('storico-wiz').innerHTML=`<h3 style="font-size:13px;color:#0f172a;margin-bottom:9px;">Analisi completata</h3>
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
    <div style="background:rgba(107,142,107,.08);border:1px solid rgba(107,142,107,.2);border-radius:9px;padding:16px;">
      <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:10px;">⏳ Importazione in corso…</div>
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

async function exportExcel() {
  toast('⏳ Generazione Excel…');
  try {
    const r = await fetch('/api/export', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) { toast('Errore export: ' + r.status, 'error'); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gestionale_export_' + new Date().toISOString().slice(0,10) + '.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('✅ Excel scaricato');
  } catch(e) {
    toast('Errore: ' + e.message, 'error');
  }
}

async function exportJSON() {
  toast('⏳ Backup in corso…');
  try {
    const r = await fetch('/api/backup', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) { toast('Errore backup: ' + r.status, 'error'); return; }
    const data = await r.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gestionale_backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`✅ Backup scaricato — ${data.totalRows || '?'} righe totali`);
  } catch(e) {
    toast('Errore: ' + e.message, 'error');
  }
}

async function importJSON(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch(_) {
      toast('❌ File JSON non valido', 'error');
      return;
    }

    const exportedAt = data.exported?.slice(0,10) || '?';
    const tables = Object.keys(data.tables || {});
    const totalRows = data.totalRows || '?';

    if(!await appConfirm(
      `⚠️ ATTENZIONE — RESTORE COMPLETO\n\n` +
      `Backup del: ${exportedAt}\n` +
      `Tabelle: ${tables.length}\n` +
      `Righe totali: ${totalRows}\n\n` +
      `Questa operazione CANCELLA tutti i dati attuali\n` +
      `e li sostituisce con il backup.\n\n` +
      `Procedere?`
    )) return;

    toast('⏳ Ripristino in corso…');

    try {
      const r = await api('/api/restore', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      if (!r || r.error) {
        toast('❌ Restore fallito: ' + (r?.error || 'errore sconosciuto'), 'error');
        return;
      }

      // Show counts
      const lines = Object.entries(r.counts || {})
        .filter(([,v]) => v > 0)
        .map(([t,n]) => `${t}: ${n}`)
        .join(' · ');

      toast(`✅ ${r.message}`);
      if (r.errors?.length) {
        console.warn('Restore warnings:', r.errors);
      }

      // Reload all data
      await loadDD();
      showSection('dashboard');
    } catch(err) {
      toast('❌ Errore: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ═══════ SMART UPLOAD: riconosce il documento e lo archivia nel posto giusto ═══════
let _smartFile=null,_smartDati=null;

function _smartMatchSub(d){
  const subs=DB.subs||[];
  // 1) codice scritto sul documento (anche a mano)
  if(d.sub_codice){
    const c=String(d.sub_codice).toUpperCase().replace(/\s+/g,'');
    const m=subs.find(x=>(x.codice||'').toUpperCase().replace(/\s+/g,'')===c);
    if(m)return{sub:m,via:'codice scritto sul documento'};
  }
  // 2) indirizzo di fornitura
  if(d.indirizzo_fornitura){
    const ind=String(d.indirizzo_fornitura).toLowerCase();
    const m=subs.find(x=>x.indirizzo_completo&&ind.includes(String(x.indirizzo_completo).toLowerCase().split(',')[0].trim().slice(0,12)));
    if(m)return{sub:m,via:'indirizzo di fornitura'};
  }
  return null;
}

async function smartUpload(input){
  _smartFile=input.files[0];
  if(!_smartFile)return;
  const st=document.getElementById('smart-status');
  const zone=document.getElementById('smart-zone');
  const res=document.getElementById('smart-result');

  // ── ZIP: estrazione e archiviazione multipla lato server ──
  if(/\.zip$/i.test(_smartFile.name)){
    if(zone)zone.innerHTML='<div style="font-size:13px;font-weight:600;">📦 '+esc(_smartFile.name)+' ('+Math.round(_smartFile.size/1024)+' KB)</div>';
    if(res)res.style.display='none';
    if(st){st.textContent='🤖 Estraggo lo ZIP e leggo ogni documento… (può volerci un minuto)';st.style.color='var(--muted)';}
    const fd=new FormData();fd.append('file',_smartFile);
    const r=await apiUp('/api/smart-zip',fd);
    if(!r||r.error){if(st){st.textContent='❌ '+(r?.error||'Elaborazione fallita');st.style.color='var(--danger)';}return;}
    if(st)st.textContent='';
    res.innerHTML='<div style="background:var(--success-bg);border:1px solid var(--border-2);border-radius:9px;padding:12px 14px;margin-bottom:10px;font-size:13px;font-weight:700;">📦 '+r.salvati+' documenti su '+r.totale+' archiviati automaticamente</div>'
      +'<div class="table-wrap"><table><thead><tr><th>File</th><th>Riconosciuto</th><th>SUB</th><th>Importo</th><th>Scadenza</th><th>Esito</th></tr></thead><tbody>'
      +r.risultati.map(x=>'<tr>'
        +'<td style="font-size:11px;">'+esc(x.file)+'</td>'
        +'<td>'+esc(x.tipo||'—')+'</td>'
        +'<td>'+(x.sub?'<strong>'+esc(x.sub)+'</strong>'+(x.via?' <span style="font-size:10px;color:var(--success);">('+x.via+')</span>':''):'—')+'</td>'
        +'<td style="font-family:monospace;">'+(x.importo?'€ '+x.importo:'—')+'</td>'
        +'<td>'+(x.scadenza||'—')+'</td>'
        +'<td style="font-weight:600;color:'+(x.salvato?'var(--success)':'var(--danger)')+';">'+(x.salvato?'✓ archiviato':esc(x.errore||'errore'))+'</td>'
        +'</tr>').join('')
      +'</tbody></table></div>'
      +'<div style="margin-top:10px;"><button class="btn btn-gray btn-sm" onclick="smartReset()">Carica un altro</button></div>';
    res.style.display='';
    if(typeof loadDD==='function')loadDD();
    return;
  }
  if(zone)zone.innerHTML='<div style="font-size:13px;font-weight:600;">✓ '+esc(_smartFile.name)+' ('+Math.round(_smartFile.size/1024)+' KB)</div>';
  if(res)res.style.display='none';
  if(st){st.textContent='🤖 Lettura in corso… (qualche secondo)';st.style.color='var(--muted)';}
  const fd=new FormData();fd.append('file',_smartFile);
  const r=await apiUp('/api/ocr',fd);
  const d=r?.dati;
  if(!d||!Object.keys(d).some(k=>d[k])){
    if(st){st.textContent='❌ '+(r?.error||'Lettura fallita: PDF protetto o illeggibile — prova con una foto del documento');st.style.color='var(--danger)';}
    return;
  }
  _smartDati=d;
  if(st)st.textContent='';
  const match=_smartMatchSub(d);
  const isBolletta=d.tipo_documento==='bolletta';
  const TIPI={fattura:'🧾 Fattura',bolletta:'⚡ Bolletta',contratto:'📄 Contratto',ape:'⚡ APE',visura:'📑 Visura',planimetria:'📐 Planimetria',certificazione:'🏆 Certificazione',polizza:'🛡️ Polizza',verbale:'📋 Verbale',preventivo:'💼 Preventivo',condominiale:'🏢 Condominiale',altro:'📂 Documento'};
  const riga=(l,v)=>v?'<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12.5px;"><span style="color:var(--muted);">'+l+'</span><span style="font-weight:600;">'+esc(String(v))+'</span></div>':'';
  res.innerHTML=
    '<div style="background:var(--primary-bg);border:1px solid var(--primary-2);border-radius:9px;padding:12px 14px;margin-bottom:10px;font-size:13px;font-weight:700;">Riconosciuto: '+(TIPI[d.tipo_documento]||'📂 Documento')+(d.categoria_bolletta?' — '+esc(d.categoria_bolletta):'')+'</div>'
    +riga('Fornitore',d.fornitore)
    +riga('Numero',d.num_fattura)
    +riga('Data',d.data_fattura)
    +riga('Periodo',(d.periodo_dal&&d.periodo_al)?d.periodo_dal+' → '+d.periodo_al:null)
    +riga('Scadenza',d.scadenza)
    +riga('Importo',d.importo?'€ '+d.importo:null)
    +riga('Descrizione',d.descrizione)
    +'<div style="display:flex;align-items:center;gap:9px;margin:12px 0;flex-wrap:wrap;">'
    +'<span style="font-size:12px;color:var(--muted);">SUB:</span>'
    +'<select id="smart-sub" style="font-size:12px;padding:7px 10px;border:1px solid var(--border-2);border-radius:7px;background:var(--card);">'
    +'<option value="">— Nessuno —</option>'
    +(DB.subs||[]).map(x=>'<option value="'+x.id+'"'+((match&&match.sub.id===x.id)?' selected':'')+'>'+esc(x.codice)+'</option>').join('')
    +'</select>'
    +(match?'<span style="font-size:11px;color:var(--success);font-weight:600;">✓ agganciato dal '+match.via+'</span>':'<span style="font-size:11px;color:var(--muted);">nessun SUB riconosciuto — scegli tu</span>')
    +'</div>'
    +(isBolletta?'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;font-size:12px;">'
      +'<span style="color:var(--muted);">Stato:</span>'
      +'<select id="smart-stato" onchange="document.getElementById(\'smart-dpag-wrap\').style.display=this.value===\'pagato\'?\'inline-flex\':\'none\'" style="font-size:12px;padding:7px 10px;border:1px solid var(--border-2);border-radius:7px;background:var(--card);">'
      +'<option value="da_pagare">Da pagare</option><option value="pagato">Già pagata</option></select>'
      +'<span id="smart-dpag-wrap" style="display:none;align-items:center;gap:6px;"><span style="color:var(--muted);">il</span>'
      +'<input type="date" id="smart-dpag" value="'+new Date().toISOString().slice(0,10)+'" style="font-size:12px;padding:6px 8px;border:1px solid var(--border-2);border-radius:7px;background:var(--card);"></span>'
      +'<span style="color:var(--muted);margin-left:6px;">Periodo:</span>'
      +'<input type="date" id="smart-pdal" value="'+(d.periodo_dal||'')+'" style="font-size:12px;padding:6px 8px;border:1px solid var(--border-2);border-radius:7px;background:var(--card);">'
      +'<span style="color:var(--muted);">→</span>'
      +'<input type="date" id="smart-pal" value="'+(d.periodo_al||'')+'" style="font-size:12px;padding:6px 8px;border:1px solid var(--border-2);border-radius:7px;background:var(--card);">'
      +'</div>':'')
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    +(isBolletta?'<button class="btn btn-success btn-sm" onclick="smartSalva(\'bolletta\')">✓ Salva come bolletta</button>':'')
    +'<button class="btn '+(isBolletta?'btn-gray':'btn-success')+' btn-sm" onclick="smartSalva(\'documento\')">✓ Salva come documento</button>'
    +'<button class="btn btn-gray btn-sm" onclick="smartReset()">Annulla</button>'
    +'</div>';
  res.style.display='';
}

function smartReset(){
  _smartFile=null;_smartDati=null;
  document.getElementById('smart-result').style.display='none';
  document.getElementById('smart-file').value='';
  document.getElementById('smart-zone').innerHTML='<div style="font-size:24px;margin-bottom:5px;">📥</div><div style="font-size:13px;font-weight:600;">Seleziona PDF o foto del documento</div>';
  document.getElementById('smart-status').textContent='';
}

async function smartSalva(come){
  const d=_smartDati; if(!d||!_smartFile)return;
  const subId=document.getElementById('smart-sub')?.value||'';
  const st=document.getElementById('smart-status');
  if(st){st.textContent='Salvataggio…';st.style.color='var(--muted)';}
  const fd=new FormData();
  fd.append('file',_smartFile);
  if(subId)fd.append('sub_id',subId);
  let r;
  if(come==='bolletta'){
    fd.append('tipo',d.categoria_bolletta||'altro');
    if(d.fornitore)fd.append('fornitore_nome',d.fornitore);
    if(d.num_fattura)fd.append('numero',d.num_fattura);
    if(d.importo)fd.append('importo',parseFloat(String(d.importo).replace(',','.'))||'');
    const pdal=document.getElementById('smart-pdal')?.value||d.periodo_dal||'';
    const pal=document.getElementById('smart-pal')?.value||d.periodo_al||'';
    if(pdal)fd.append('periodo_dal',pdal);
    if(pal)fd.append('periodo_al',pal);
    if(d.scadenza)fd.append('scadenza',d.scadenza);
    const stato=document.getElementById('smart-stato')?.value||'da_pagare';
    fd.append('stato',stato);
    if(stato==='pagato'){
      const dpag=document.getElementById('smart-dpag')?.value||new Date().toISOString().slice(0,10);
      fd.append('data_pagamento',dpag);
    }
    r=await apiUp('/api/bollette',fd);
  }else{
    fd.append('tipo',(d.tipo_documento&&d.tipo_documento!=='bolletta')?d.tipo_documento:'documento');
    fd.append('nome',d.descrizione||((d.tipo_documento||'Documento')+(d.fornitore?' — '+d.fornitore:'')));
    if(d.data_fattura)fd.append('data_documento',d.data_fattura);
    if(d.scadenza)fd.append('scadenza',d.scadenza);
    if(d.importo)fd.append('importo',parseFloat(String(d.importo).replace(',','.'))||'');
    if(d.fornitore)fd.append('descrizione','Fornitore: '+d.fornitore+(d.num_fattura?' · N. '+d.num_fattura:''));
    r=await apiUp('/api/documenti',fd);
  }
  if(!r||r.error){if(st){st.textContent='❌ '+(r?.error||'Salvataggio fallito');st.style.color='var(--danger)';}return;}
  toast('✅ Archiviato'+(subId?' nel SUB giusto':'')+' ✓');
  if(st){st.textContent='';}
  smartReset();
}


// ═══ Drag & drop sulla zona di riconoscimento ═══
(function(){
  const zone=document.getElementById('smart-zone');
  if(!zone||typeof zone.addEventListener!=='function')return;
  ;['dragover','dragenter'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.style.borderColor='var(--primary)';zone.style.background='var(--primary-bg)';}));
  ;['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.style.borderColor='';zone.style.background='';}));
  zone.addEventListener('drop',e=>{
    const f=e.dataTransfer?.files?.[0];
    if(!f)return;
    const inp=document.getElementById('smart-file');
    const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;
    smartUpload(inp);
  });
})();
