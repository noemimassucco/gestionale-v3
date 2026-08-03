'use strict';
const multer = require('multer');

// Blocklist mirata invece di una whitelist: l'upload serve a più flussi diversi
// (documenti, bollette, allegati, smart-zip .zip, OCR) con tipi di file legittimi
// molto vari — una whitelist rigida rischiava di bloccare file veri. Blocchiamo
// solo i tipi realmente pericolosi (SVG/HTML possono eseguire script se riaperti).
const BLOCKED_MIMETYPES = new Set([
  'image/svg+xml', 'text/html', 'application/xhtml+xml',
  'application/x-msdownload', 'application/x-executable',
  'application/javascript', 'text/javascript',
]);

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (BLOCKED_MIMETYPES.has(file.mimetype)) {
      return cb(new Error('Tipo di file non consentito per motivi di sicurezza'));
    }
    cb(null, true);
  },
});
