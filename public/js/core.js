// ═══════════════════════════════════════════════════════════
// core.js — API helpers, utilities, toast, closeM
// ═══════════════════════════════════════════════════════════

const API_TIMEOUT_MS = 15000; // 15 secondi

async function api(url, opts={}) {
  const h = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers||{}) };
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, headers: h, signal: ctrl.signal });
    clearTimeout(tid);
    if (r.status === 401) {
      if (token) doLogout();
      return null;
    }
    if (!r.ok) {
      const labels = { 403:'Non autorizzato', 404:'Non trovato', 500:'Errore server', 400:'Richiesta non valida' };
      toast((labels[r.status] || 'Errore ' + r.status), 'error');
      return null;
    }
    return r.json();
  } catch(e) {
    clearTimeout(tid);
    if (e.name === 'AbortError') {
      toast('Timeout — server non risponde (' + url.split('?')[0] + ')', 'error');
    } else {
      console.error('API error:', url, e.message);
      toast('Connessione persa o server non raggiungibile', 'error');
    }
    return null;
  }
}

async function apiUp(url, fd) {
  // Check file size (max 10 MB)
  for (const [, val] of fd.entries()) {
    if (val instanceof File && val.size > 10 * 1024 * 1024) {
      toast('File troppo grande (max 10 MB)', 'error');
      return null;
    }
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!r.ok) {
      toast('Upload fallito (' + r.status + ')', 'error');
      return null;
    }
    return r.json();
  } catch(e) {
    toast('Errore upload: ' + e.message, 'error');
    return null;
  }
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function fmt(d) {
  if (!d) return '—';
  const s = String(d).split('T')[0];
  const p = s.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

let tT;
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.className = type; el.style.display = 'block';
  clearTimeout(tT);
  tT = setTimeout(() => el.style.display = 'none', 4000);
}

function closeM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// ── EXPORT CSV ──
function exportCSV(rows, filename, headers) {
  if (!rows?.length) { toast('Nessun dato da esportare', 'error'); return; }
  const cols = headers || Object.keys(rows[0]);
  const csv = [cols.join(';'), ...rows.map(r => cols.map(h => '"' + String(r[h]||'').replace(/"/g,'""') + '"').join(';'))].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  toast('✅ Export: ' + filename + '.csv');
}

async function exportInterventi() {
  const p = new URLSearchParams();
  const sede = document.getElementById('ff-sede')?.value; if (sede) p.set('sede_id', sede);
  exportCSV(await api('/api/interventi?' + p), 'interventi', ['id','data_intervento','sub_codice','sede','fornitore_nome','descrizione','prezzo','num_fattura','protocollo']);
}
async function exportDocumenti()   { exportCSV(await api('/api/documenti'),    'documenti',    ['id','nome','tipo','sub_codice','sede_nome','data_documento','scadenza','importo']); }
async function exportManutenzioni(){ exportCSV(await api('/api/manutenzioni'), 'manutenzioni', ['id','tipo','sub_codice','priorita','stato','data_programmata','costo']); }
async function exportTicket()      { exportCSV(await api('/api/ticket'),       'ticket',       ['id','titolo','sub_codice','categoria','priorita','stato','created_at']); }
async function exportSubs()        { exportCSV(await api('/api/subs'),         'subs',         ['id','codice','sede_nome','piano','inquilino_nome','stato_occupazione','categoria_cat','mq_commerciali','rendita','canone_annuo']); }
async function exportFornitori()   { exportCSV(await api('/api/fornitori'),    'fornitori',    ['id','ragione_sociale','piva','citta','tel','email','spec']); }
async function exportInquilini()   { exportCSV(await api('/api/inquilini'),    'inquilini',    ['id','ragione_sociale','piva','cf','citta','tel','email']); }

// ═══════ CONFERMA IN STILE GESTIONALE (sostituisce il popup del browser) ═══════
function appConfirm(message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    let ov = document.getElementById('app-confirm-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'app-confirm-ov';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(31,41,55,.45);z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px);';
      document.body.appendChild(ov);
    }
    const danger = opts.danger !== false; // di default rosso (quasi sempre eliminazioni)
    ov.innerHTML = `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg);max-width:400px;width:100%;padding:22px;animation:fadeIn .12s ease;">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
          <div style="width:38px;height:38px;border-radius:10px;background:${danger?'var(--danger-bg)':'var(--primary-bg)'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${opts.icon||(danger?'🗑':'❓')}</div>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:14px;color:var(--text-strong);margin-bottom:4px;">${opts.title||'Confermi?'}</div>
            <div style="font-size:12.5px;color:var(--muted);line-height:1.5;white-space:pre-line;">${message}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="app-confirm-no" class="btn btn-gray btn-sm">Annulla</button>
          <button id="app-confirm-yes" class="btn btn-sm" style="background:${danger?'var(--danger)':'var(--primary)'};color:#fff;border:none;">${opts.okText||(danger?'Elimina':'Conferma')}</button>
        </div>
      </div>`;
    ov.style.display = 'flex';
    const done = val => { ov.style.display = 'none'; ov.innerHTML=''; document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    document.addEventListener('keydown', onKey);
    ov.querySelector('#app-confirm-yes').onclick = () => done(true);
    ov.querySelector('#app-confirm-no').onclick  = () => done(false);
    ov.onclick = e => { if (e.target === ov) done(false); };
    setTimeout(()=>ov.querySelector('#app-confirm-no')?.focus(),50);
  });
}
