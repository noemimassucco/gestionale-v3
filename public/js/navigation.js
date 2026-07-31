// =======================================================
// MODULE: navigation.js
// =======================================================

function toggleSidebar(){
  sidebarOpen=!sidebarOpen;
  document.getElementById('sidebar')?.classList.toggle('open',sidebarOpen);
  const ov=document.getElementById('sidebar-overlay');
  if(ov)ov.style.display=sidebarOpen?'block':'none';
}

// ═══════ MENU PERSONALIZZABILE ═══════
// Le voci nascoste dall'utente sono salvate in localStorage ('menu_hidden').
// 'sb-impostazioni' non è nascondibile (altrimenti non potresti più riattivare nulla).

function _menuHidden(){
  try { return new Set(JSON.parse(localStorage.getItem('menu_hidden')||'[]')); }
  catch(e){ return new Set(); }
}

function applyMenuPrefs(){
  const hidden=_menuHidden();
  document.querySelectorAll('.sb-item[id]').forEach(btn=>{
    btn.style.display = hidden.has(btn.id) ? 'none' : '';
  });
  // Nascondi i gruppi rimasti completamente vuoti (titolo compreso)
  document.querySelectorAll('.sb-group').forEach(g=>{
    const items=[...g.querySelectorAll('.sb-item')];
    const anyVisible=items.some(b=>b.style.display!=='none');
    g.style.display=anyVisible?'':'none';
    const prev=g.previousElementSibling;
    if(prev&&prev.classList.contains('sb-divider')) prev.style.display=anyVisible?'':'none';
  });
}

function toggleMenuItem(id, visible){
  const hidden=_menuHidden();
  if(visible) hidden.delete(id); else hidden.add(id);
  localStorage.setItem('menu_hidden', JSON.stringify([...hidden]));
  applyMenuPrefs();
}

function renderMenuPrefs(){
  const grid=document.getElementById('menu-prefs-grid');
  if(!grid) return;
  const hidden=_menuHidden();
  grid.innerHTML=[...document.querySelectorAll('.sb-item[id]')].map(btn=>{
    const id=btn.id;
    const ico=btn.querySelector('.sb-ico')?.textContent||'•';
    const lbl=btn.querySelector('.sb-lbl')?.textContent||btn.textContent.trim();
    const locked=id==='sb-impostazioni';
    const on=!hidden.has(id);
    return `<label style="display:flex;align-items:center;gap:9px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;cursor:${locked?'not-allowed':'pointer'};background:${on?'var(--card)':'var(--bg2)'};opacity:${locked?.6:1};">
      <input type="checkbox" ${on?'checked':''} ${locked?'disabled':''} onchange="toggleMenuItem('${id}',this.checked);renderMenuPrefs();">
      <span style="width:20px;text-align:center;">${ico}</span>
      <span style="font-size:12px;color:var(--text);">${lbl}</span>
    </label>`;
  }).join('');
}

function showSection(name){
  document.querySelectorAll('#app-main .section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-'+name)?.classList.add('active');
  document.getElementById('sb-'+name)?.classList.add('active');
  if(sidebarOpen)toggleSidebar();
  if(name==='dashboard')loadDashboard();
  else if(name==='interventi')loadInt();
  else if(name==='subs') loadSubs();
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
  else if(name==='impostazioni'){loadUsers();renderMenuPrefs();}
  else if(name==='fatturazione'){
    document.getElementById('fatt-f-anno').value=new Date().getFullYear();
    loadFatturazione();
  }
  else if(name==='notifiche')loadNotificheSA();
  else if(name==='calendario'){if(typeof initFullCalendar==='function'&&!window._fcInstance)initFullCalendar();loadCalendario();}
  else if(name==='inquilini'){ loadClienti(_clientiTabAttivo||'attivo'); _updateClienteTabCounts(); }
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

// (rimosse filterNotifHome/renderNotificheHome: riferivano elementi inesistenti)
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
    <div class="ctx-item" style="font-weight:600;color:var(--accent);" onclick="closeCtx();openRiaccatastamento(${subId},'${codice}')">🏛️ Riaccatasta SUB</div>
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
// Applica le preferenze del menu all'avvio (gli script sono in fondo al body, il DOM c'è già)
try { applyMenuPrefs(); } catch(e) {}
