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


const TIPI_SERVIZIO = {
  locazione_6_6:'🏢 Locazione 6+6', domiciliazione:'📮 Domiciliazione',
  sala_riunioni:'🤝 Sala riunioni', day_office:'💼 Day office',
  smart_office:'💻 Smart office', box_auto:'🚗 Box auto',
  posto_auto:'🅿️ Posto auto', locazione_tetto:'📡 Locazione tetto',
  servizio_vario:'⚙️ Servizio vario', rifatturazione_spesa:'🔄 Rifatturazione spesa',
  canone_locazione:'🏠 Canone di locazione',
};
const MESI_NOMI = ['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

// ── ZUCCHETTI COLUMN MAPPING (ZM) ──
// Chiavi = campo interno, Valori = nomi colonna possibili nel file Excel
const ZM = {
  codice_zuc:      ['codice','cod.','cod ','code','id'],
  ragione_sociale: ['ragione sociale','ragione soc','rag.soc','ragsoc','nome cognome','nome/cognome','denominazione','nominativo','cliente','fornitore','intestatario','ditta','societa','società','nome'],
  piva:            ['partita iva','p.iva','piva','p iva','partita_iva','vat'],
  cf:              ['codice fiscale','c.f.','cf ','codfis','cod.fis','cod fiscale'],
  indirizzo:       ['indirizzo','via','indirizzo completo','residenza','domicilio','address'],
  cap:             ['cap','c.a.p'],
  citta:           ['città','citta','comune','localita','località','city'],
  provincia:       ['provincia','prov.','prov ','pr'],
  tel:             ['telefono','tel.','tel ','cellulare','cell','mobile','phone'],
  email:           ['email','e-mail','mail','posta elettronica'],
  spec:            ['specializzazione','spec.','specialità','categoria','settore','attivita','attività','tipo'],
};

let subImportMap = {};

// ── DATA CACHE (per rendering immediato) ──
let _cache = {};


// ═══ Costanti mancanti (riferite ma mai definite → sezioni morte) ═══
const STATO_COLORS={programmata:'rgba(184,134,11,.25)',in_corso:'rgba(90,138,138,.25)',completata:'rgba(79,127,79,.25)',annullata:'rgba(160,72,72,.2)'};
const BOLL_ICONS={luce:'💡',energia:'💡',gas:'🔥',acqua:'💧',rifiuti:'🗑️',telefono:'📞',internet:'🌐',condominio:'🏢',altro:'📄'};
const DOC_ICONS={fattura:'🧾',contratto:'📄',preventivo:'💼',verbale:'📋',bolletta:'⚡',catastale:'🏛️',planimetria:'📐',visura:'📑',ape:'⚡',certificazione:'🏆',agibilita:'🏠',collaudo:'📋',foto:'📷',condominiale:'🏢',certif:'🏆',documento:'📂'};
// ═══ Globali usati tra più file (prima erano impliciti) ═══
let sT=null;                 // debounce ricerca globale
let currentRiepTab='fornitori';
let currentSubData=null;
let subDetTab='overview';
let manEditId=null;
let docFileInput=null;
let timelineSubId=null;
