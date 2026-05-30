// ═══════════════════════════════════════════════════════════
// riaccatastamento.js — Riaccatastamento SUB + Millesimi + Timeline
// ═══════════════════════════════════════════════════════════

// ── RIACCATASTAMENTO ──
let _riaccSubId = null;
let _riacCodice = '';

function openRiaccatastamento(subId, codice) {
  _riaccSubId = subId;
  _riacCodice = codice;

  // Pre-fill with current catastali data
  const sub = DB.subs.find(s => s.id == subId);

  const sv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  sv('riacc-sub-info', codice);
  sv('riacc-foglio-prec', sub?.foglio || '');
  sv('riacc-part-prec', sub?.particella || '');
  sv('riacc-subal-prec', sub?.subalterno || '');
  sv('riacc-foglio-nuovo', '');
  sv('riacc-part-nuova', '');
  sv('riacc-subal-nuovo', '');
  sv('riacc-data', new Date().toISOString().split('T')[0]);
  sv('riacc-proto', '');
  sv('riacc-motivo', '');
  sv('riacc-note', '');

  document.getElementById('modal-riacc').classList.add('open');

  // Load existing riaccatastamenti history
  loadRiaccHistory(subId);
}

async function loadRiaccHistory(subId) {
  const data = await api('/api/riaccatastamenti/' + subId);
  const el = document.getElementById('riacc-history');
  if (!el) return;
  if (!data?.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px 0;">Nessun riaccatastamento precedente.</div>';
    return;
  }
  el.innerHTML = data.map(r => `
    <div style="display:flex;gap:8px;padding:8px 10px;background:var(--surface);border-radius:7px;margin-bottom:6px;border:1px solid var(--border);">
      <div style="font-size:18px;">🏛️</div>
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:600;color:#0f172a;">
          ${esc(r.foglio_prec||'—')}/${esc(r.particella_prec||'—')}/${esc(r.subalterno_prec||'—')}
          → ${esc(r.foglio_nuovo||'—')}/${esc(r.particella_nuova||'—')}/${esc(r.subalterno_nuovo||'—')}
        </div>
        <div style="font-size:10px;color:var(--muted);">${fmt(r.data_operazione)} · ${esc(r.operatore||'Sistema')} ${r.protocollo_catastale ? '· Prot. '+esc(r.protocollo_catastale) : ''}</div>
        ${r.motivazione ? `<div style="font-size:10px;color:var(--muted);">${esc(r.motivazione)}</div>` : ''}
      </div>
    </div>`).join('');
}

async function saveRiaccatastamento() {
  const v = id => document.getElementById(id)?.value || '';

  const foglio_nuovo = v('riacc-foglio-nuovo');
  const particella_nuova = v('riacc-part-nuova');

  if (!foglio_nuovo || !particella_nuova) {
    toast('Inserisci il nuovo foglio e la nuova particella', 'error');
    return;
  }

  const payload = {
    sub_id: _riaccSubId,
    foglio_prec: v('riacc-foglio-prec') || null,
    particella_prec: v('riacc-part-prec') || null,
    subalterno_prec: v('riacc-subal-prec') || null,
    foglio_nuovo,
    particella_nuova,
    subalterno_nuovo: v('riacc-subal-nuovo') || null,
    data_operazione: v('riacc-data') || null,
    protocollo_catastale: v('riacc-proto') || null,
    motivazione: v('riacc-motivo') || null,
    note: v('riacc-note') || null,
  };

  const r = await api('/api/riaccatastamenti', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!r || r.error) { toast('Errore: ' + (r?.error || 'risposta nulla'), 'error'); return; }

  closeM('modal-riacc');
  await loadDD();
  toast(`✅ Riaccatastamento SUB ${_riacCodice} registrato — dati catastali aggiornati`);

  // If detail is open, refresh it
  if (currentSubId == _riaccSubId) {
    openSubDetail(_riaccSubId);
  }
}

// ── TIMELINE COMPLETA ──
async function openSubTimeline(subId, codice) {
  const data = await api('/api/subs/' + subId + '/timeline');
  if (!data) return;

  const ICONS = {
    riaccatastamento: { ico: '🏛️', col: 'var(--gold)' },
    intervento:       { ico: '🔨', col: 'var(--teal2)' },
    documento:        { ico: '📄', col: '#a78bfa' },
    manutenzione:     { ico: '⚙️', col: 'var(--orange)' },
    creazione:        { ico: '🏢', col: 'var(--green)' },
    fusione:          { ico: '🔗', col: '#f472b6' },
    scissione:        { ico: '✂️', col: '#fb7185' },
    modifica:         { ico: '✏️', col: 'var(--muted)' },
    storia:           { ico: '📌', col: 'var(--muted)' },
  };

  const container = document.getElementById('sub-timeline-list');
  const title = document.getElementById('sub-timeline-title');
  if (title) title.textContent = `📅 Storico SUB ${codice}`;

  if (!data.length) {
    if (container) container.innerHTML = '<div class="empty">Nessun evento registrato.</div>';
    document.getElementById('modal-timeline').classList.add('open');
    return;
  }

  container.innerHTML = data.map((ev, i) => {
    const tipo = ev.tipo || ev.fonte || 'storia';
    const icon = ICONS[tipo] || ICONS['storia'];
    const date = ev.data || ev.created_at;
    return `
    <div style="display:flex;gap:12px;position:relative;padding-bottom:16px;">
      ${i < data.length - 1 ? `<div style="position:absolute;left:16px;top:32px;bottom:0;width:2px;background:var(--border);"></div>` : ''}
      <div style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.06);border:2px solid ${icon.col};display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;z-index:1;">${icon.ico}</div>
      <div style="flex:1;padding-top:4px;">
        <div style="font-size:12px;font-weight:600;color:#0f172a;">${esc(ev.titolo || tipo)}</div>
        ${ev.descrizione ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${esc(String(ev.descrizione).slice(0,120))}</div>` : ''}
        <div style="font-size:10px;color:var(--muted);margin-top:3px;">${date ? fmt(date) : '—'} · <span style="color:${icon.col};text-transform:capitalize;">${tipo}</span></div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('modal-timeline').classList.add('open');
}

// ── DUPLICA SUB ──
async function duplicaSub(subId, codice) {
  if (!confirm(`Duplicare il SUB ${codice}? Verrà creato un nuovo SUB con gli stessi dati catastali.`)) return;

  const sub = DB.subs.find(s => s.id == subId);
  if (!sub) { toast('SUB non trovato', 'error'); return; }

  const newCodice = codice + '-COPIA';
  const payload = {
    codice: newCodice,
    ex_sub: codice,
    sede_id: sub.sede_id,
    piano: sub.piano,
    indirizzo_completo: sub.indirizzo_completo,
    foglio: sub.foglio,
    particella: sub.particella,
    subalterno: sub.subalterno,
    categoria_cat: sub.categoria_cat,
    mq_commerciali: sub.mq_commerciali,
    mq_calpestabili: sub.mq_calpestabili,
    rendita: sub.rendita,
    classe_energetica: sub.classe_energetica,
    anno_costruzione: sub.anno_costruzione,
    stato_occupazione: 'libero',
    note: `Duplicato da ${codice}`,
  };

  const r = await api('/api/subs', { method: 'POST', body: JSON.stringify(payload) });
  if (!r || r.error) { toast('Errore: ' + (r?.error || ''), 'error'); return; }

  await loadDD();
  renderTbSubs();
  toast(`✅ SUB ${newCodice} creato — apri per modificare il codice`);
}

// ── CREA FATTURA DAL MENU ⋮ ──
function openNewFatt(subId) {
  const sub = DB.subs.find(s => s.id == subId);
  showSection('fatturazione');
  setTimeout(() => {
    openModalFatt();
    if (sub) {
      setTimeout(() => {
        const el = document.getElementById('fatt-sub');
        if (el) el.value = subId;
        const inqEl = document.getElementById('fatt-inq');
        if (inqEl && sub.inquilino_id) inqEl.value = sub.inquilino_id;
      }, 150);
    }
  }, 200);
}

// ── MILLESIMI ──
let _millTabelle = [];
let _millSubId = null;

async function loadMillesimiTabelle() {
  const data = await api('/api/millesimi/tabelle');
  _millTabelle = data || [];
  return _millTabelle;
}

async function openMillesimi(subId, codice) {
  _millSubId = subId;
  document.getElementById('mill-sub-title').textContent = `Millesimi — SUB ${codice}`;

  await loadMillesimiTabelle();

  const [valori] = await Promise.all([
    api('/api/millesimi/' + subId),
  ]);

  // Build millesimi form
  const container = document.getElementById('mill-values');
  if (!container) return;

  container.innerHTML = _millTabelle.map(t => {
    const existing = (valori || []).find(v => v.tabella_id == t.id);
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(t.nome)}</div>
        ${t.descrizione ? `<div style="font-size:11px;color:var(--muted);">${esc(t.descrizione)}</div>` : ''}
      </div>
      <input type="number" step="0.0001" min="0" max="1000"
        class="mill-input" data-tabella="${t.id}"
        value="${existing ? existing.valore : ''}"
        placeholder="0.0000"
        style="width:110px;text-align:right;font-family:monospace;">
    </div>`;
  }).join('') + `
  <div style="margin-top:12px;">
    <button class="btn btn-sm btn-gray" onclick="aggiungiTabellaMill()">+ Nuova tabella millesimale</button>
  </div>`;

  document.getElementById('modal-millesimi').classList.add('open');
}

async function saveMillesimi() {
  const inputs = document.querySelectorAll('.mill-input');
  const promises = [];

  inputs.forEach(inp => {
    const tabellaId = inp.dataset.tabella;
    const valore = parseFloat(inp.value);
    if (!isNaN(valore) && tabellaId) {
      promises.push(api('/api/millesimi/' + _millSubId, {
        method: 'PUT',
        body: JSON.stringify({ tabella_id: parseInt(tabellaId), valore }),
      }));
    }
  });

  if (!promises.length) { toast('Nessun valore da salvare', 'error'); return; }

  await Promise.all(promises);
  closeM('modal-millesimi');
  await loadDD();
  toast('✅ Millesimi salvati');
}

async function aggiungiTabellaMill() {
  const nome = prompt('Nome della nuova tabella millesimale:');
  if (!nome?.trim()) return;
  const r = await api('/api/millesimi/tabelle', {
    method: 'POST',
    body: JSON.stringify({ nome: nome.trim() }),
  });
  if (r?.error) { toast('Errore: ' + r.error, 'error'); return; }
  toast('✅ Tabella creata');
  // Reload the millesimi form
  if (_millSubId) {
    const sub = DB.subs.find(s => s.id == _millSubId);
    openMillesimi(_millSubId, sub?.codice || '');
  }
}
