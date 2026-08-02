// =======================================================
// MODULE: spese-condominiali.js
// Import spese condominiali complessive per sede — ripartite AUTOMATICAMENTE
// per ogni SUB in base ai millesimi già impostati sulla loro scheda (item 4).
// Riusa il parser Excel robusto e _xNum già definiti in import.js.
// =======================================================

let speseCondoRows = [];

function loadSpeseCondoImport(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = function (e) {
    const parsed = _xlsSmartRows(e.target.result);
    speseCondoRows = parsed.rows;
    if (!speseCondoRows.length) { toast('Nessun dato nel file', 'error'); return; }
    if (parsed.headerRow > 0) toast('ℹ Intestazioni trovate alla riga ' + (parsed.headerRow + 1));
    showSpeseCondoStep(parsed.cols);
  };
  r.readAsArrayBuffer(file);
}

function showSpeseCondoStep(cols) {
  const cs = (id, lbl) => `<div class="field"><label>${lbl}</label><select id="${id}"><option value="">— Non presente —</option>${cols.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>`;
  const aS = (id, vs) => {
    const l = cols.map(c => c.toLowerCase().trim());
    for (const v of vs) {
      const i = l.findIndex(c => c.includes(v) || v.includes(c));
      if (i >= 0) { setTimeout(() => { const el = document.getElementById(id); if (el) el.value = cols[i]; }, 80); break; }
    }
  };
  document.getElementById('spesecondo-wiz').innerHTML = `<h3 style="font-size:13px;color:#0f172a;margin-bottom:11px;">${speseCondoRows.length} righe trovate — Mappa le colonne:</h3>
    <div class="form-grid">
      ${cs('sc-sede', 'Sede / Condominio *')}
      ${cs('sc-data', 'Data spesa')}
      ${cs('sc-forn', 'Fornitore')}
      ${cs('sc-prot', 'N° Protocollo')}
      ${cs('sc-imp', 'Importo Totale *')}
      ${cs('sc-desc', 'Descrizione *')}
      ${cs('sc-tab', 'Tabella Millesimale (facoltativa)')}
    </div>
    <div style="background:#fef3c7;border:1px solid rgba(184,134,11,.2);border-radius:7px;padding:9px 12px;margin:10px 0;font-size:11px;color:#b8860b;">📐 Ogni spesa viene ripartita automaticamente fra tutti i SUB della sede in base ai millesimi già impostati sulla loro scheda (tabella "Millesimi di proprietà" se non ne indichi un'altra). I SUB senza millesimi impostati non ricevono una quota — te lo segnalo dopo l'import, senza bloccarlo.</div>
    <div><button class="btn btn-orange" onclick="analizzaSpeseCondo()">🔍 Analizza →</button></div>`;
  document.getElementById('spesecondo-wiz').style.display = 'block';
  aS('sc-sede', ['sede', 'condominio', 'immobile', 'stabile', 'edificio', 'fabbricato']);
  aS('sc-data', ['data spesa', 'data', 'data doc']);
  aS('sc-forn', ['fornitore', 'ditta', 'fornitore nome']);
  aS('sc-prot', ['protocollo', 'prot', 'n. prot', 'n prot']);
  aS('sc-imp', ['importo totale', 'importo', 'totale', 'importo €', 'spesa']);
  aS('sc-desc', ['descrizione', 'oggetto', 'causale']);
  aS('sc-tab', ['tabella millesimale', 'tabella', 'criterio']);
}

function _scParseData(s) {
  if (!s) return null;
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  return null;
}

function analizzaSpeseCondo() {
  const gV = id => document.getElementById(id)?.value || '';
  const m = { sede: gV('sc-sede'), data: gV('sc-data'), forn: gV('sc-forn'), prot: gV('sc-prot'), imp: gV('sc-imp'), desc: gV('sc-desc'), tab: gV('sc-tab') };
  if (!m.sede || !m.imp || !m.desc) { toast('Mappa almeno Sede, Importo Totale e Descrizione', 'error'); return; }
  const an = speseCondoRows.map(row => {
    const sedeV = String(row[m.sede] || '').trim();
    const nr = s => (s || '').toLowerCase().trim();
    const sedeM = (DB.sedi || []).find(s => nr(s.nome) === nr(sedeV)) ||
      (DB.sedi || []).find(s => nr(s.nome).includes(nr(sedeV)) || nr(sedeV).includes(nr(s.nome)));
    const impV = _xNum(row[m.imp]);
    let status = 'ok', note = '';
    if (!sedeV) { status = 'err'; note = 'Sede mancante'; }
    else if (!sedeM) { status = 'err'; note = 'Sede non trovata in anagrafica'; }
    else if (!impV) { status = 'err'; note = 'Importo totale mancante o non valido'; }
    return {
      row, sedeV, sedeM, impV, status, note,
      descrizione: m.desc ? String(row[m.desc] || '').trim() : '',
      fornitore_nome: m.forn ? String(row[m.forn] || '').trim() : '',
      protocollo: m.prot ? String(row[m.prot] || '').trim() : '',
      data_spesa: m.data ? String(row[m.data] || '').trim() : '',
      tabella_millesimale: m.tab ? String(row[m.tab] || '').trim() : '',
    };
  });
  window._anSpeseCondo = an;
  const cnt = { ok: 0, err: 0 }; an.forEach(r => cnt[r.status]++);
  document.getElementById('spesecondo-wiz').innerHTML = `<h3 style="font-size:13px;color:#0f172a;margin-bottom:9px;">Analisi completata</h3>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:11px;">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:var(--green);font-size:15px;display:block;">${cnt.ok}</strong>✓ Pronte</div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;"><strong style="color:var(--red);font-size:15px;display:block;">${cnt.err || 0}</strong>✗ Errore</div>
    </div>
    <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:7px;font-size:11px;">
      <table><thead><tr><th>Stato</th><th>Sede</th><th>Descrizione</th><th>Importo</th><th>Info</th></tr></thead>
      <tbody>${an.slice(0, 40).map(r => `<tr><td><span style="color:${r.status === 'ok' ? 'var(--green)' : 'var(--red)'}">${r.status === 'ok' ? '✓ Pronto' : '✗ Errore'}</span></td><td>${esc(r.sedeV)}</td><td>${esc(r.descrizione.slice(0, 35))}</td><td>€ ${(r.impV || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td><td style="color:var(--muted)">${esc(r.note)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;display:flex;gap:9px;">
      <button class="btn btn-gray" onclick="document.getElementById('spesecondo-wiz').style.display='none'">← Ricomincia</button>
      <button class="btn btn-success" onclick="commitSpeseCondo()" ${cnt.ok === 0 ? 'disabled' : ''}>✓ Importa e ripartisci ${cnt.ok} spese</button>
    </div>`;
}

async function commitSpeseCondo() {
  const an = window._anSpeseCondo;
  const toImp = (an || []).filter(r => r.status === 'ok');
  if (!toImp.length) { toast('Nessuna riga da importare', 'error'); return; }
  const rows = toImp.map(r => ({
    sede: r.sedeV, data_spesa: _scParseData(r.data_spesa), descrizione: r.descrizione,
    fornitore_nome: r.fornitore_nome, protocollo: r.protocollo,
    importo_totale: r.impV, tabella_millesimale: r.tabella_millesimale,
  }));

  const wiz = document.getElementById('spesecondo-wiz');
  wiz.innerHTML = `<div style="background:rgba(107,142,107,.08);border:1px solid rgba(107,142,107,.2);border-radius:9px;padding:16px;">
    <div style="font-size:13px;font-weight:600;color:#0f172a;">⏳ Importazione e ripartizione per millesimi in corso…</div>
  </div>`;

  const r = await api('/api/spese-condominiali/import-bulk', { method: 'POST', body: JSON.stringify({ rows }) });
  if (!r || r.error) { toast('Errore: ' + (r?.error || 'risposta nulla'), 'error'); return; }

  document.getElementById('speseCondoFile').value = '';
  await loadDD();
  const warnMsg = r.warnings?.length ? ` · ⚠️ ${r.warnings.length} con SUB senza millesimi` : '';
  const errMsg = r.errors?.length ? ` · ${r.errors.length} errori` : '';
  toast(`✅ ${r.added} spese importate · ${r.totale_ripartizioni} quote per SUB generate${warnMsg}${errMsg}`);

  if (r.warnings?.length || r.errors?.length) {
    wiz.style.display = 'block';
    wiz.innerHTML = `<div style="background:rgba(250,204,21,.1);border:1px solid rgba(250,204,21,.3);border-radius:9px;padding:12px;font-size:11px;">
      ${r.warnings?.length ? `<strong style="color:#b8860b;">⚠️ Da verificare — non ha bloccato l'import:</strong><br>${r.warnings.map(w => esc(w.messaggio)).join('<br>')}<br><br>` : ''}
      ${r.errors?.length ? `<strong style="color:var(--red);">✗ Righe non importate:</strong><br>${r.errors.map(e => 'Riga ' + e.riga + ': ' + esc(e.error)).join('<br>')}` : ''}
      <br><br><button class="btn btn-gray btn-sm" onclick="document.getElementById('spesecondo-wiz').style.display='none'">OK</button>
    </div>`;
  } else {
    wiz.style.display = 'none';
  }
}
