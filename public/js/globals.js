// ═══════════════════════════════════════════════════════════
// globals.js — State, constants, core helpers
// ═══════════════════════════════════════════════════════════


let token=sessionStorage.getItem('token')||'';
let currentUser=null;
let DB={sedi:[],subs:[],fornitori:[],inquilini:[],categorie:[]};
let selIds=new Set(),selMode=false,editId=null,pending=null;
let zucType=null,zucRows=[],zucMap={};
let storicoRows=[];

// ── API ──

// ── EXPORT HELPERS ──
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
  const p=new URLSearchParams(); const sede=document.getElementById('ff-sede')?.value; if(sede)p.set('sede_id',sede);
  const data=await api('/api/interventi?'+p);
  exportCSV(data,'interventi',['id','data_intervento','anno_fattura','sub_codice','sede','fornitore_nome','categoria_nome','descrizione','prezzo','num_fattura','protocollo']);
}
async function exportDocumenti() { exportCSV(await api('/api/documenti'),'documenti',['id','nome','tipo','sub_codice','sede_nome','data_documento','scadenza','importo']); }
async function exportManutenzioni() { exportCSV(await api('/api/manutenzioni'),'manutenzioni',['id','tipo','sub_codice','priorita','stato','data_programmata','costo']); }
async function exportTicket() { exportCSV(await api('/api/ticket'),'ticket',['id','titolo','sub_codice','categoria','priorita','stato','created_at']); }
async function exportSubs() { exportCSV(await api('/api/subs'),'subs',['id','codice','sede_nome','piano','inquilino_nome','stato_occupazione','categoria_cat','mq_commerciali','rendita','canone_annuo']); }
async function exportFornitori() { exportCSV(await api('/api/fornitori'),'fornitori',['id','ragione_sociale','piva','citta','tel','email','spec']); }
async function exportInquilini() { exportCSV(await api('/api/inquilini'),'inquilini',['id','ragione_sociale','piva','cf','citta','tel','email']); }
