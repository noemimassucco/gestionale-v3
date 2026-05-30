// =======================================================
// MODULE: navigation.js
// =======================================================

function toggleSidebar(){
  sidebarOpen=!sidebarOpen;
  document.getElementById('sidebar')?.classList.toggle('open',sidebarOpen);
  const ov=document.getElementById('sidebar-overlay');
  if(ov)ov.style.display=sidebarOpen?'block':'none';
}

function showSection(name){
  document.querySelectorAll('#app-main .section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-'+name)?.classList.add('active');
  document.getElementById('sb-'+name)?.classList.add('active');
  if(sidebarOpen)toggleSidebar();
  if(name==='dashboard')loadDashboard();
  else if(name==='interventi')loadInt();
  else if(name==='subs')renderTbSubs();
  else if(name==='documenti'){
    document.getElementById('df-sub').innerHTML='<option value="">Tutti</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
    document.getElementById('df-sede').innerHTML='<option value="">Tutte</option>'+DB.sedi.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
    loadDocs();
  }
  else if(name==='manutenzioni'){
    document.getElementById('mf-sub').innerHTML='<option value="">Tutti</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
    document.getElementById('mf-sede').innerHTML='<option value="">Tutte</option>'+DB.sedi.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
    loadMan();
  }
  else if(name==='bollette'){
    document.getElementById('bf-sub').innerHTML='<option value="">Tutti</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
    loadBollette();
  }
  else if(name==='ticket'){
    document.getElementById('tf-sub').innerHTML='<option value="">Tutti</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
    loadTicket();
  }
  else if(name==='affitti'){
    document.getElementById('af-sub').innerHTML='<option value="">Tutti</option>'+DB.subs.map(s=>`<option value="${s.id}">${s.codice}</option>`).join('');
    document.getElementById('af-anno').value=new Date().getFullYear();
    loadAffitti();
  }
  else if(name==='riepilogo')renderRiep();
  else if(name==='impostazioni')loadUsers();
  else if(name==='fatturazione'){
    document.getElementById('fatt-f-anno').value=new Date().getFullYear();
    loadFatturazione();
  }
  else if(name==='notifiche')loadNotificheSA();
  else if(name==='calendario')loadCalendario();
  else if(name==='inquilini')renderTbInq();
  else if(name==='fornitori')renderTbForn();
  else if(name==='chat'){
    setTimeout(()=>document.getElementById('chat-input-page')?.focus(),200);
  }
  else if(name==='anagrafiche'){
    renderTbSubs(); renderTbForn(); renderTbInq(); renderTbSedi(); renderTbCat();
  }
  else if(name==='import'){
    // Import page loads on demand — nothing to pre-load
  }
  else if(name==='catasto'){
    // Catasto view — renders from DB.subs
    renderTbSubs();
  }
}

function filterNotifHome(tipo, btn) {
  _notifFiltro = tipo;
  document.querySelectorAll('#home-notifiche-wrap .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderNotificheHome();
}

function renderNotificheHome() {
  const items = _notifFiltro==='tutte' ? _allNotifiche : _allNotifiche.filter(n=>n.tipo===_notifFiltro);
  if (!_allNotifiche.length) { document.getElementById('home-notifiche-wrap').classList.add('hidden'); return; }
  document.getElementById('home-notifiche-wrap').classList.remove('hidden');
  document.getElementById('home-notif-cnt').textContent = _allNotifiche.length;

  const icons = {urgente:'⚠️',scadenza_doc:'📄',scadenza_man:'🔨',istat:'📈',incompleto:'⚠️'};
  const colors = {urgente:'var(--red)',scadenza_doc:'var(--gold)',scadenza_man:'var(--orange)',istat:'#a3e635',incompleto:'var(--muted)'};
  const labels = {urgente:'Urgente',scadenza_doc:'Scadenza documento',scadenza_man:'Scadenza manutenzione',istat:'ISTAT dovuto',incompleto:'Dati incompleti'};

  document.getElementById('home-notif-list').innerHTML = !items.length
    ? '<div class="empty">Nessuna notifica per questa categoria</div>'
    : items.slice(0,12).map(n => {
        const color = colors[n.tipo]||'var(--muted)';
        const gg = n.giorni !== undefined ? parseInt(n.giorni) : null;
        const ggLabel = gg !== null ? (gg<0?`Scaduto ${-gg}gg fa`:gg===0?'Oggi':`${gg}gg`) : '';
        return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${color};border-radius:8px;margin-bottom:7px;${n.tipo==='istat'?'cursor:pointer;':''}${n.tipo==='incompleto'?'cursor:pointer;':''}" ${n.tipo==='istat'?'onclick="showSec(\'catasto\',null);goToApp(\'catasto\')"':''} ${n.tipo==='incompleto'?'onclick="goToApp(\'anagrafiche\')"':''}>
          <span style="font-size:16px;padding-top:2px;">${icons[n.tipo]||'🔔'}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;color:#fff;margin-bottom:2px;">${esc(n.titolo||n.descrizione||'Notifica')}</div>
            <div style="font-size:11px;color:var(--muted);">${labels[n.tipo]||n.tipo}${n.sub?' · SUB '+esc(n.sub):''}${n.sede?' · '+esc(n.sede):''}${n.descrizione&&n.tipo!='incompleto'?' — '+esc(n.descrizione.slice(0,60)):''}</div>
            ${n.tipo==='istat'?`<div style="font-size:11px;color:#a3e635;margin-top:2px;">Apri calcolatore ISTAT →</div>`:''}
          </div>
          ${ggLabel?`<span style="font-weight:700;font-size:11px;color:${color};white-space:nowrap;">${ggLabel}</span>`:''}
        </div>`;
      }).join('') + (_allNotifiche.length>12?`<div style="text-align:center;font-size:12px;color:var(--muted);padding:8px;">... e altre ${_allNotifiche.length-12} notifiche</div>`:'');
}

function showSubCtx(e, subId, codice) {
  e.stopPropagation();
  closeCtx();
  const menu = document.createElement('div');
  menu.id = 'ctx-menu-active';
  menu.className = 'ctx-menu';
  menu.innerHTML = `
    <div class="ctx-item" onclick="closeCtx();openSubDetail(${subId})">🔍 Apri scheda completa</div>
    <div class="ctx-item" onclick="closeCtx();openAnaById('sub',${subId})">✏️ Modifica dati</div>
    <div class="ctx-item" onclick="closeCtx();duplicaSub(${subId},'${codice}')">📋 Duplica SUB</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" onclick="closeCtx();openModalInt();setTimeout(()=>{const el=document.getElementById('fi-sub');if(el)el.value=${subId};},100)">➕ Crea intervento</div>
    <div class="ctx-item" onclick="closeCtx();openModalDoc();setTimeout(()=>{const el=document.getElementById('doc-sub');if(el)el.value=${subId};},100)">📄 Aggiungi documento</div>
    <div class="ctx-item" onclick="closeCtx();openNewFatt(${subId})">🧾 Crea fattura/ordine</div>
    <div class="ctx-item" onclick="closeCtx();currentSubId=${subId};subActionPagamento()">💳 Registra affitto</div>
    <div class="ctx-item" onclick="closeCtx();openModalTicket(${subId})">🎫 Apri ticket</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" style="font-weight:600;color:var(--gold);" onclick="closeCtx();openRiaccatastamento(${subId},'${codice}')">🏛️ Riaccatasta SUB</div>
    <div class="ctx-item" onclick="closeCtx();quickScissione(${subId},'${codice}')">✂️ Scindi SUB</div>
    <div class="ctx-item" onclick="closeCtx();openModalFusione(${subId})">🔗 Fondi SUB</div>
    <div class="ctx-item" onclick="closeCtx();openIstatCfg(${subId})">📈 Config ISTAT</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" onclick="closeCtx();openSubTimeline(${subId},'${codice}')">📅 Storico completo</div>
    <div class="ctx-item" onclick="closeCtx();exportSubCSV(${subId},'${codice}')">⬇️ Esporta CSV</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" onclick="closeCtx();delAna('subs',${subId})">🗑 Elimina SUB</div>`;
  document.body.appendChild(menu);
  const x = Math.min(e.clientX, window.innerWidth - 230);
  const y = Math.min(e.clientY + 6, window.innerHeight - menu.scrollHeight - 10);
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  _ctxActive = menu;
  setTimeout(() => document.addEventListener('click', closeCtx, { once: true }), 50);
}

function closeCtx() {
  const m = document.getElementById('ctx-menu-active');
  if (m) m.remove();
  _ctxActive = null;
}

function toggleTableSel(table) {
  const bar = document.getElementById(table + '-mass-bar');
  const active = bar && !bar.classList.contains('hidden');
  if (active) {
    getSelSet(table).clear();
    bar.classList.add('hidden');
    document.querySelectorAll('.' + table + '-chk').forEach(el => { el.checked = false; el.style.display = 'none'; });
  } else {
    bar?.classList.remove('hidden');
    document.querySelectorAll('.' + table + '-chk').forEach(el => { el.style.display = ''; });
  }
}

function tableSelAll(table) {
  document.querySelectorAll('.' + table + '-chk').forEach(el => {
    el.checked = true; el.style.display = '';
    getSelSet(table).add(parseInt(el.dataset.id));
  });
  const cnt = document.getElementById(table + '-mass-cnt');
  if (cnt) cnt.textContent = getSelSet(table).size + ' selezionati';
  document.getElementById(table + '-mass-bar')?.classList.remove('hidden');
}

function documentiSelAll() { tableSelAll('documenti'); }

function manutenzioniSelAll() { tableSelAll('manutenzioni'); }

function ticketSelAll() { tableSelAll('ticket'); }