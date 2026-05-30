// ═══════════════════════════════════════════════════════════
// globals.js — State, constants, core helpers
// ═══════════════════════════════════════════════════════════

// ── AUTH STATE ──
let token = sessionStorage.getItem('token') || '';
let currentUser = null;

// ── DATABASE STATE (cached from API) ──
let DB = { sedi:[], subs:[], fornitori:[], inquilini:[], categorie:[] };

// ── INTERVENTI SELECTION STATE ──
let selIds = new Set();
let selMode = false;
let editId  = null;
let pending = null;

// ── SUB SELECTION STATE ──
let subSelIds  = new Set();
let subSelMode = false;
let currentSubId = null;

// ── ANA (form modal) STATE ──
let anaType   = null;
let anaEditId = null;

// ── IMPORT STATE ──
let zucType      = null;
let zucRows      = [];
let zucMap       = {};
let zucData      = [];
let storicoRows  = [];
let subImportRows = [];

// ── FATTURAZIONE STATE ──
let _fattData = [];
let _fattSel  = new Set();

// ── NOTIFICHE STATE ──
let _notifSAAll    = [];
let _notifSAFiltro = 'tutte';

// ── UI STATE ──
let sidebarOpen = false;

// ── CONSTANTS ──
const TIPI_SERVIZIO = {
  locazione_6_6:'🏢 Locazione 6+6', domiciliazione:'📮 Domiciliazione',
  sala_riunioni:'🤝 Sala riunioni', day_office:'💼 Day office',
  smart_office:'💻 Smart office', box_auto:'🚗 Box auto',
  posto_auto:'🅿️ Posto auto', locazione_tetto:'📡 Locazione tetto',
  servizio_vario:'⚙️ Servizio vario',
};
const MESI_NOMI = ['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
