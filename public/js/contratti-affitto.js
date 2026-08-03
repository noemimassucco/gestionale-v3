// ═══════════════════════════════════════════════════════════
// CONTRATTO E CANONE — tab dedicata nel dettaglio SUB.
// Il contratto di locazione diventa il punto di partenza della fatturazione del canone:
// le rate generate confluiscono nello Schema Fatturazione esistente (ordini_fatturazione),
// non in un sistema a parte.
// ═══════════════════════════════════════════════════════════

const CA_PERIODICITA_LABEL = { mensile: 'Mensile', trimestrale: 'Trimestrale', semestrale: 'Semestrale', annuale: 'Annuale' };
const CA_TIPO_LABEL = {
  locazione_commerciale: 'Locazione commerciale', locazione_abitativa: 'Locazione abitativa',
  comodato_uso: 'Comodato d\'uso', affitto_ramo: 'Affitto ramo d\'azienda',
};
const CA_RATA_STATO = {
  da_fatturare: { label: 'Da fatturare', bg: 'rgba(250,204,21,.3)',  col: '#8a6d1a' },
  esportato:    { label: 'Esportato',    bg: 'rgba(37,99,235,.12)',  col: '#2563eb' },
  fatturato:    { label: 'Fatturato',    bg: 'rgba(16,185,129,.15)', col: 'var(--green)' },
  sospeso:      { label: 'Sospeso',      bg: 'rgba(148,163,184,.2)', col: 'var(--muted)' },
};

function renderTabCanone(data) {
  const s = data.sub;
  const contratto = data.contrattoAffitto;
  const storico = data.contrattiAffittoStorico || [];
  const riepilogo = data.rateCanoneRiepilogo || {};

  let html = '';

  if (!contratto) {
    html += `<div class="empty" style="margin-bottom:14px;">Nessun contratto di locazione attivo su questo SUB.</div>
      <button class="btn btn-primary btn-sm" onclick="apriModaleContratto()">+ Nuovo contratto</button>`;
  } else {
    const periodo = fmt(contratto.data_inizio) + ' → ' + (contratto.data_fine ? fmt(contratto.data_fine) : 'indeterminato');
    html += `
    <div style="border:1px solid var(--border);border-radius:9px;padding:14px 16px;margin-bottom:14px;background:var(--card-alt);">
      <div class="flex-between" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-size:13px;font-weight:700;">🏠 Contratto in corso</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${periodo}</div>
        </div>
        <span style="background:rgba(16,185,129,.15);color:var(--green);border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;">✓ Attivo</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:12px;font-size:12px;">
        <div><div style="color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:1px;">Inquilino</div><div style="font-weight:600;">${esc(contratto.inquilino_nome||'Da assegnare')}</div></div>
        <div><div style="color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:1px;">Tipo contratto</div><div style="font-weight:600;">${esc(CA_TIPO_LABEL[contratto.tipo_contratto]||contratto.tipo_contratto||'—')}</div></div>
        <div><div style="color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:1px;">Canone</div><div style="font-weight:600;">€ ${parseFloat(contratto.canone).toLocaleString('it-IT',{minimumFractionDigits:2})} / ${CA_PERIODICITA_LABEL[contratto.periodicita]||contratto.periodicita}</div></div>
        <div><div style="color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:1px;">Giorno fatturazione</div><div style="font-weight:600;">${contratto.giorno_fatturazione||'—'}</div></div>
      </div>
      ${contratto.note ? `<div style="font-size:12px;color:var(--muted);font-style:italic;margin-bottom:10px;">${esc(contratto.note)}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-xs btn-gray" onclick="apriModaleContratto(true)">✏️ Modifica</button>
        <button class="btn btn-xs btn-gray" onclick="chiudiContratto(${contratto.id})">🔒 Chiudi contratto</button>
        <button class="btn btn-xs btn-gray" onclick="document.getElementById('ca-doc-input').click()">📎 ${contratto.documento_url?'Sostituisci documento':'Carica documento'}</button>
        <button class="btn btn-xs btn-primary" onclick="previewGeneraRate(${contratto.id})">📅 Genera rate</button>
        ${contratto.documento_url ? `<a href="${esc(fileUrl(contratto.documento_url))}" target="_blank" style="font-size:11px;color:var(--primary-dark);margin-left:auto;">👁 Vedi documento</a>` : ''}
      </div>
      <input type="file" id="ca-doc-input" style="display:none;" onchange="uploadDocumentoContratto(${contratto.id},this)">
    </div>
    <div style="border:1px solid var(--border);border-radius:9px;padding:12px 16px;margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;">📊 Rate generate — Schema Fatturazione</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${['da_fatturare','esportato','fatturato','sospeso'].map(st => {
          const c = CA_RATA_STATO[st]; const n = riepilogo[st] || 0;
          return `<span style="background:${c.bg};color:${c.col};border-radius:8px;padding:4px 10px;font-size:11.5px;font-weight:600;">${c.label}: ${n}</span>`;
        }).join('')}
      </div>
      <div style="margin-top:8px;"><a href="#" onclick="event.preventDefault();showSection('fatturazione')" style="font-size:11px;color:var(--primary-dark);">→ Vedi il dettaglio nello Schema Fatturazione</a></div>
    </div>`;
  }

  // ISTAT — riusa la card già esistente (stessa fonte dati/azione, subs.canone_annuo,
  // che ora resta allineata al canone del contratto quando applichi l'adeguamento).
  html += _subIstatCard(s);

  // Storico contratti chiusi, collassato di default
  if (storico.length) {
    html += `
    <div style="margin-top:14px;">
      <div class="row-click" onclick="_caToggleStorico()" style="cursor:pointer;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:8px;">
        <span id="ca-storico-arrow">▶</span> Contratti precedenti (${storico.length})
      </div>
      <div id="ca-storico-body" style="display:none;">
        ${storico.map(c => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
            <span style="font-size:18px;">🏠</span>
            <div style="flex:1;">
              <div style="font-size:12.5px;font-weight:600;color:#0f172a;">${esc(c.inquilino_nome||'—')} <span style="font-weight:400;color:var(--muted);">— ${esc(CA_TIPO_LABEL[c.tipo_contratto]||c.tipo_contratto||'')}</span></div>
              <div style="font-size:11px;color:var(--muted);margin-top:3px;">
                ${fmt(c.data_inizio)} → ${c.data_fine?fmt(c.data_fine):'—'} · € ${parseFloat(c.canone).toLocaleString('it-IT')} / ${CA_PERIODICITA_LABEL[c.periodicita]||c.periodicita}
              </div>
              ${c.note?`<div style="font-size:11px;color:var(--muted);margin-top:2px;font-style:italic;">${esc(c.note)}</div>`:''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }

  return html;
}

function _caToggleStorico() {
  const body = document.getElementById('ca-storico-body');
  const arrow = document.getElementById('ca-storico-arrow');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (arrow) arrow.textContent = open ? '▶' : '▼';
}

function apriModaleContratto(isEdit) {
  const contratto = isEdit ? currentSubData?.contrattoAffitto : null;
  const s = currentSubData?.sub;
  document.getElementById('ca-inq').innerHTML = '<option value="">— Da assegnare —</option>' +
    (DB.inquilini||[]).map(i => `<option value="${i.id}">${esc(i.ragione_sociale)}</option>`).join('');
  document.getElementById('ca-inq').value = contratto?.inquilino_id || s?.inquilino_id || '';
  document.getElementById('ca-tipo').value = contratto?.tipo_contratto || s?.tipo_contratto || '';
  document.getElementById('ca-data-inizio').value = (contratto?.data_inizio || '').split('T')[0] || '';
  document.getElementById('ca-data-fine').value = (contratto?.data_fine || '').split('T')[0] || '';
  document.getElementById('ca-canone').value = contratto?.canone || '';
  document.getElementById('ca-periodicita').value = contratto?.periodicita || 'mensile';
  document.getElementById('ca-giorno-fatt').value = contratto?.giorno_fatturazione || '';
  document.getElementById('ca-istat-pct').value = contratto?.istat_percentuale || '';
  document.getElementById('ca-istat-period').value = contratto?.istat_periodicita || '12_mesi';
  document.getElementById('ca-note').value = contratto?.note || '';
  document.getElementById('ca-modal-title').textContent = isEdit ? '✏️ Modifica contratto' : '🏠 Nuovo contratto di locazione';
  document.getElementById('ca-modal-sub-btn').dataset.editId = isEdit ? contratto.id : '';
  document.getElementById('modal-contratto-canone').classList.add('open');
}

async function salvaContratto() {
  const v = id => document.getElementById(id)?.value || '';
  if (!v('ca-data-inizio') || !v('ca-canone')) { toast('Data inizio e canone sono obbligatori', 'error'); return; }
  const editId = document.getElementById('ca-modal-sub-btn').dataset.editId;
  const body = {
    sub_id: currentSubId,
    inquilino_id: parseInt(v('ca-inq')) || null,
    tipo_contratto: v('ca-tipo') || null,
    data_inizio: v('ca-data-inizio'),
    data_fine: v('ca-data-fine') || null,
    canone: v('ca-canone'),
    periodicita: v('ca-periodicita'),
    giorno_fatturazione: parseInt(v('ca-giorno-fatt')) || null,
    istat_percentuale: v('ca-istat-pct') || null,
    istat_periodicita: v('ca-istat-period'),
    note: v('ca-note') || null,
  };
  const r = editId
    ? await api('/api/contratti-affitto/' + editId, { method: 'PUT', body: JSON.stringify(body) })
    : await api('/api/contratti-affitto', { method: 'POST', body: JSON.stringify(body) });
  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  closeM('modal-contratto-canone');
  const data = await api('/api/subs/' + currentSubId + '/detail');
  if (data) { currentSubData = data; renderSubDetHeader(data); renderSubDetTab('canone'); }
  toast(editId ? '✓ Contratto aggiornato' : '✓ Contratto creato');
}

async function chiudiContratto(id) {
  if (!await appConfirm('Chiudere questo contratto? Le rate non ancora fatturate verranno sospese (non cancellate). Lo storico resta.', { icon: '🔒', title: 'Chiudi contratto', okText: 'Chiudi' })) return;
  const r = await api('/api/contratti-affitto/' + id + '/chiudi', { method: 'POST', body: JSON.stringify({ data_fine: new Date().toISOString().split('T')[0] }) });
  if (!r || r.error) { toast('Errore: ' + (r?.error || '?'), 'error'); return; }
  const data = await api('/api/subs/' + currentSubId + '/detail');
  if (data) { currentSubData = data; renderSubDetHeader(data); renderSubDetTab('canone'); }
  toast('Contratto chiuso ✓');
}

async function uploadDocumentoContratto(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const r = await apiUp('/api/contratti-affitto/' + id + '/documento', fd);
  input.value = '';
  if (!r || r.error) { toast('Errore upload: ' + (r?.error || '?'), 'error'); return; }
  const data = await api('/api/subs/' + currentSubId + '/detail');
  if (data) { currentSubData = data; renderSubDetTab('canone'); }
  toast('📎 Documento caricato ✓');
}

async function previewGeneraRate(contrattoId) {
  const r = await api('/api/contratti-affitto/' + contrattoId + '/genera-rate/preview');
  if (!r) return;
  const body = document.getElementById('ca-preview-body');
  if (!r.rate.length) {
    body.innerHTML = '<div class="empty">Nessuna rata da generare (contratto senza data inizio valida).</div>';
  } else {
    body.innerHTML = `
      <p style="font-size:12.5px;color:var(--muted);margin-bottom:12px;">
        ${r.nuove} rat${r.nuove===1?'a':'e'} nuov${r.nuove===1?'a':'e'} da creare${r.gia_presenti?`, ${r.gia_presenti} già presenti (non verranno duplicate)`:''}.
      </p>
      <div style="max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:8px;">
        ${r.rate.map(x => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;">
            <span>${fmt(x.periodo_dal)} → ${fmt(x.periodo_al)}</span>
            <span style="font-family:monospace;">€ ${x.importo.toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
            <span style="font-size:10.5px;color:${x.stato_esistente?'var(--muted)':'var(--green)'};">${x.stato_esistente ? 'già presente ('+(CA_RATA_STATO[x.stato_esistente]?.label||x.stato_esistente)+')' : 'nuova'}</span>
          </div>`).join('')}
      </div>`;
  }
  document.getElementById('ca-preview-confirm-btn').dataset.contrattoId = contrattoId;
  document.getElementById('ca-preview-confirm-btn').style.display = r.nuove ? '' : 'none';
  document.getElementById('modal-genera-rate').classList.add('open');
}

async function confermaGeneraRate() {
  const id = document.getElementById('ca-preview-confirm-btn').dataset.contrattoId;
  const r = await api('/api/contratti-affitto/' + id + '/genera-rate', { method: 'POST' });
  closeM('modal-genera-rate');
  if (!r) return;
  const data = await api('/api/subs/' + currentSubId + '/detail');
  if (data) { currentSubData = data; renderSubDetTab('canone'); }
  toast(`✓ ${r.create} rate create` + (r.saltate ? `, ${r.saltate} già presenti` : ''));
}
