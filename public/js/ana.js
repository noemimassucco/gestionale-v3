// =======================================================
// MODULE: ana.js
// =======================================================

function openAna(type,obj=null){
  anaType=type;anaEditId=obj?.id||null;
  const titles={sub:'SUB',fornitore:'Fornitore',inquilino:'Inquilino',sede:'Sede',categoria:'Categoria'};
  document.getElementById('m-ana-ttl').textContent=(obj?'Modifica ':'Nuovo ')+titles[type];
  const html={
    sub:`
      <div style="grid-column:1/-1;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;padding-bottom:6px;">Dati generali</div>
      <div class="field"><label>Codice SUB *</label><input id="a-cod" placeholder="es. OB-01"></div>
      <div class="field"><label>Ex SUB / Derivato da</label><input id="a-ex" placeholder="codice precedente"></div>
      <div class="field"><label>Sede *</label><select id="a-sede"><option value="">—</option>\${DB.sedi.map(s=>\`<option value="\${s.id}">\${s.nome}</option>\`).join('')}</select></div>
      <div class="field"><label>Piano / Interno</label><input id="a-piano" placeholder="es. T, 1, 2, S1"></div>
      <div class="field"><label>Indirizzo completo</label><input id="a-ind" placeholder="Via Roma 12, 10043 Orbassano (TO)"></div>
      <div class="field"><label>Inquilino attuale</label><select id="a-inq"><option value="">— Nessuno / Libero —</option>\${DB.inquilini.map(i=>\`<option value="\${i.id}">\${i.ragione_sociale}</option>\`).join('')}</select></div>
      <div class="field"><label>Stato occupazione</label>
        <select id="a-stato-occ">
          <option value="libero">Libero</option>
          <option value="occupato">Occupato</option>
          <option value="uso_proprio">Uso proprio</option>
          <option value="invenduto">Invenduto</option>
        </select>
      </div>

      <div style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:12px;margin-top:4px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;">Contratto &amp; Affitto</div>
      <div class="field"><label>Tipo contratto</label>
        <select id="a-tipo-contr" onchange="calcIstatPreview()">
          <option value="">—</option>
          <option value="locazione_commerciale">Locazione commerciale</option>
          <option value="locazione_abitativa">Locazione abitativa</option>
          <option value="comodato_uso">Comodato d'uso</option>
          <option value="affitto_ramo">Affitto ramo d'azienda</option>
          <option value="leasing">Leasing immobiliare</option>
        </select>
      </div>
      <div class="field"><label>Data inizio contratto</label><input type="date" id="a-din" onchange="calcIstatPreview()"></div>
      <div class="field"><label>Canone annuo (€)</label><div class="price-wrap"><span class="price-sym">€</span><input type="number" id="a-can" placeholder="0.00" step="0.01" oninput="calcIstatPreview()"></div></div>
      <div class="field"><label>Durata (anni)</label><input type="number" id="a-durata" placeholder="es. 6" min="1" max="30"></div>

      <div style="grid-column:1/-1;" id="istat-preview-wrap" class="hidden">
        <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:8px;padding:12px 14px;">
          <div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px;">📈 ISTAT calcolato automaticamente</div>
          <div id="istat-preview-text" style="font-size:12px;color:var(--muted);line-height:1.6;"></div>
        </div>
      </div>

      <div style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:12px;margin-top:4px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;">Dati catastali</div>
      <div class="field"><label>Foglio</label><input id="a-foglio" placeholder="es. 12"></div>
      <div class="field"><label>Particella</label><input id="a-particella" placeholder="es. 456"></div>
      <div class="field"><label>Subalterno</label><input id="a-subal" placeholder="es. 7"></div>
      <div class="field"><label>Categoria catastale</label>
        <select id="a-catcat">
          <option value="">—</option>
          <option value="A/10">A/10 — Uffici</option>
          <option value="B">B — Collettività</option>
          <option value="C/1">C/1 — Negozi</option>
          <option value="C/2">C/2 — Magazzini</option>
          <option value="C/6">C/6 — Box auto</option>
          <option value="D/1">D/1 — Opifici</option>
          <option value="D/2">D/2 — Hotel</option>
          <option value="D/8">D/8 — Centri commerciali</option>
        </select>
      </div>
      <div class="field"><label>MQ commerciali</label><input type="number" id="a-mqcom" placeholder="es. 250" step="0.5"></div>
      <div class="field"><label>MQ calpestabili</label><input type="number" id="a-mqcalp" placeholder="es. 210" step="0.5"></div>
      <div class="field"><label>Rendita catastale (€)</label><div class="price-wrap"><span class="price-sym">€</span><input type="number" id="a-rendita" placeholder="0.00" step="0.01"></div></div>
      <div class="field"><label>Classe energetica</label>
        <select id="a-classe">
          <option value="">—</option>
          <option value="A4">A4</option><option value="A3">A3</option><option value="A2">A2</option><option value="A1">A1</option>
          <option value="B">B</option><option value="C">C</option><option value="D">D</option>
          <option value="E">E</option><option value="F">F</option><option value="G">G</option>
        </select>
      </div>
      <div class="field"><label>Anno costruzione</label><input type="number" id="a-annocost" placeholder="es. 1985"></div>
      <div class="field"><label>Millesimi condominiali</label><input type="number" step="0.0001" id="a-millesimi" placeholder="es. 128.5000" title="Valore millesimale di proprietà"></div>
      <div class="field form-full"><label>Note catastali</label><textarea id="a-note-cat" rows="2" placeholder="Variazioni, pratiche aperte…"></textarea></div>
      <div class="field form-full"><label>Note generali</label><input id="a-note"></div>`,
    fornitore:`<div class="field"><label>Cod. Zucchetti</label><input id="a-czuc"></div><div class="field form-full"><label>Ragione Sociale *</label><input id="a-rag"></div><div class="field"><label>P.IVA</label><input id="a-piva"></div><div class="field"><label>Telefono</label><input id="a-tel"></div><div class="field"><label>Email</label><input id="a-email"></div><div class="field"><label>Città</label><input id="a-citta"></div><div class="field form-full"><label>Specializzazione</label><input id="a-spec"></div>`,
    inquilino:`<div class="field"><label>Cod. Zucchetti</label><input id="a-czuc"></div><div class="field form-full"><label>Ragione Sociale *</label><input id="a-rag"></div><div class="field"><label>P.IVA</label><input id="a-piva"></div><div class="field"><label>Telefono</label><input id="a-tel"></div><div class="field"><label>Email</label><input id="a-email"></div><div class="field"><label>Città</label><input id="a-citta"></div>`,
    sede:`<div class="field"><label>Nome *</label><input id="a-nome"></div><div class="field"><label>Indirizzo</label><input id="a-ind"></div><div class="field"><label>Città</label><input id="a-cit"></div><div class="field form-full"><label>Note</label><input id="a-note"></div>`,
    categoria:`<div class="field"><label>Nome *</label><input id="a-nome"></div><div class="field"><label>Icona (emoji)</label><input id="a-ico" placeholder="🔧"></div><div class="field"><label>Colore</label><input type="color" id="a-col" value="#2563eb" style="height:38px;"></div>`,
  };
  document.getElementById('m-ana-body').innerHTML=html[type];
  if(obj){
    const s=id=>document.getElementById(id);
    if(type==='sub'){
      const sv=(id,val)=>{const el=s(id);if(el)el.value=val||'';};
      sv('a-cod',obj.codice);sv('a-ex',obj.ex_sub);sv('a-sede',obj.sede_id);
      sv('a-piano',obj.piano);sv('a-inq',obj.inquilino_id);
      sv('a-ind',obj.indirizzo_completo);sv('a-stato-occ',obj.stato_occupazione||'libero');
      sv('a-tipo-contr',obj.tipo_contratto);sv('a-din',obj.data_inizio_contratto?.split('T')[0]||'');
      sv('a-can',obj.canone_annuo);sv('a-durata',obj.durata_contratto_anni);
      sv('a-foglio',obj.foglio);sv('a-particella',obj.particella);sv('a-subal',obj.subalterno);
      sv('a-catcat',obj.categoria_cat);sv('a-mqcom',obj.mq_commerciali);sv('a-mqcalp',obj.mq_calpestabili);
      sv('a-rendita',obj.rendita);sv('a-classe',obj.classe_energetica);sv('a-annocost',obj.anno_costruzione);
      sv('a-note-cat',obj.note_catastali);sv('a-millesimi',obj.millesimi||'');sv('a-note',obj.note);
      // Show ISTAT preview if data contratto present
      if(obj.data_inizio_contratto) calcIstatPreview();
    }
    else if(type==='fornitore'){s('a-czuc').value=obj.codice_zuc||'';s('a-rag').value=obj.ragione_sociale||'';s('a-piva').value=obj.piva||'';s('a-tel').value=obj.tel||'';s('a-email').value=obj.email||'';s('a-citta').value=obj.citta||'';s('a-spec').value=obj.spec||'';}
    else if(type==='inquilino'){s('a-czuc').value=obj.codice_zuc||'';s('a-rag').value=obj.ragione_sociale||'';s('a-piva').value=obj.piva||'';s('a-tel').value=obj.tel||'';s('a-email').value=obj.email||'';s('a-citta').value=obj.citta||'';}
    else if(type==='sede'){s('a-nome').value=obj.nome||'';s('a-ind').value=obj.indirizzo||'';s('a-cit').value=obj.citta||'';s('a-note').value=obj.note||'';}
    else if(type==='categoria'){s('a-nome').value=obj.nome||'';s('a-ico').value=obj.icona||'';s('a-col').value=obj.colore||'#2563eb';}
  }
  document.getElementById('modal-ana').classList.add('open');
}

async function saveAna(){
  let data,url,method='POST';
  const v=id=>document.getElementById(id)?.value||'';
  if(anaType==='sub'){if(!v('a-cod')||!v('a-sede')){toast('Codice e Sede obbligatori','error');return;}data={
      codice:v('a-cod'),ex_sub:v('a-ex')||null,sede_id:parseInt(v('a-sede'))||null,piano:v('a-piano')||null,
      inquilino_id:parseInt(v('a-inq'))||null,indirizzo_completo:v('a-ind')||null,
      stato_occupazione:v('a-stato-occ')||'libero',
      tipo_contratto:v('a-tipo-contr')||null,
      data_inizio_contratto:v('a-din')||null,
      canone_annuo:v('a-can')||null,
      durata_contratto_anni:v('a-durata')||null,
      foglio:v('a-foglio')||null,particella:v('a-particella')||null,subalterno:v('a-subal')||null,
      categoria_cat:v('a-catcat')||null,
      mq_commerciali:v('a-mqcom')||null,mq_calpestabili:v('a-mqcalp')||null,
      rendita:v('a-rendita')||null,
      classe_energetica:v('a-classe')||null,
      anno_costruzione:v('a-annocost')||null,
      millesimi:v('a-millesimi')||null,
      note_catastali:v('a-note-cat')||null,note:v('a-note')||null
    };url='/api/subs';}
  else if(anaType==='fornitore'){if(!v('a-rag')){toast('Ragione sociale obbligatoria','error');return;}data={codice_zuc:v('a-czuc'),ragione_sociale:v('a-rag'),piva:v('a-piva'),tel:v('a-tel'),email:v('a-email'),citta:v('a-citta'),spec:v('a-spec')};url='/api/fornitori';}
  else if(anaType==='inquilino'){if(!v('a-rag')){toast('Ragione sociale obbligatoria','error');return;}data={codice_zuc:v('a-czuc'),ragione_sociale:v('a-rag'),piva:v('a-piva'),tel:v('a-tel'),email:v('a-email'),citta:v('a-citta')};url='/api/inquilini';}
  else if(anaType==='sede'){if(!v('a-nome')){toast('Nome obbligatorio','error');return;}data={nome:v('a-nome'),indirizzo:v('a-ind'),citta:v('a-cit'),note:v('a-note')};url='/api/sedi';}
  else if(anaType==='categoria'){if(!v('a-nome')){toast('Nome obbligatorio','error');return;}data={nome:v('a-nome'),icona:v('a-ico'),colore:v('a-col')};url='/api/categorie';}
  if(anaEditId){url+='/'+anaEditId;method='PUT';}
  await api(url,{method,body:JSON.stringify(data)});
  closeM('modal-ana');await loadDD();toast('Salvato ✓');
}

async function delAna(table, id) {
  const labels = {subs:'SUB',fornitori:'fornitore',inquilini:'inquilino',sedi:'sede',categorie:'categoria'};
  if (!confirm('Eliminare questo ' + (labels[table]||table) + '? Non può essere annullato.')) return;
  const r = await api('/api/' + table + '/' + id, { method: 'DELETE' });
  if (r?.error) { toast('Errore: ' + r.error, 'error'); return; }
  await loadDD();
  toast((labels[table]||table) + ' eliminato');
}

function openAnaById(type, id) {
  const maps={sub:DB.subs,fornitore:DB.fornitori,inquilino:DB.inquilini,sede:DB.sedi,categoria:DB.categorie};
  const obj=(maps[type]||[]).find(x=>x.id==id);
  if(obj)openAna(type,obj);
}