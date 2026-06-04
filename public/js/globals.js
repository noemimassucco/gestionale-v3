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
let _readNotifs    = new Set(JSON.parse(localStorage.getItem('notif_read') || '[]'));
let _allNotifiche  = [];
let _notifFiltro   = 'tutte';

// ── UI STATE ──
let sidebarOpen = false;
let _ctxActive  = null;

// ── PRIORITY COLORS & ICONS (used in interventi and manutenzioni cards) ──
const PRIOR_COLORS = { urgente:'#ef4444', alta:'#f97316', normale:'#6b8e6b', bassa:'#6b7280' };
const PRIOR_ICONS  = { urgente:'🔴', alta:'🟠', normale:'🔵', bassa:'⚪' };
const PRIOR_ICONS2 = { urgente:'🚨', alta:'⬆️', normale:'📋', bassa:'⬇️' };


const TIPI_SERVIZIO = {
  locazione_6_6:'🏢 Locazione 6+6', domiciliazione:'📮 Domiciliazione',
  sala_riunioni:'🤝 Sala riunioni', day_office:'💼 Day office',
  smart_office:'💻 Smart office', box_auto:'🚗 Box auto',
  posto_auto:'🅿️ Posto auto', locazione_tetto:'📡 Locazione tetto',
  servizio_vario:'⚙️ Servizio vario',
};
const MESI_NOMI = ['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

// ── ZUCCHETTI COLUMN MAPPING (ZM) ──
// Chiavi = campo interno, Valori = nomi colonna possibili nel file Excel
const ZM = {
  codice_zuc:      ['codice','cod.','cod ','code'],
  ragione_sociale: ['ragione sociale','ragione soc','rag.soc','ragsoc','nome cognome','nome/cognome','denominazione'],
  piva:            ['partita iva','p.iva','piva','p iva','partita_iva'],
  cf:              ['codice fiscale','c.f.','cf ','codfis','cod.fis'],
  indirizzo:       ['indirizzo','via','indirizzo completo','address'],
  cap:             ['cap'],
  citta:           ['città','citta','comune','city'],
  provincia:       ['provincia','prov.','prov '],
  tel:             ['telefono','tel.','tel ','cellulare','cell','phone'],
  email:           ['email','e-mail','posta elettronica'],
  spec:            ['specializzazione','spec.','specialità','categoria','tipo'],
};

let subImportMap = {};

// ── DATA CACHE (per rendering immediato) ──
let _cache = {};
