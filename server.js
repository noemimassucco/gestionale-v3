'use strict';
const app = require('./app');
const { initDB } = require('./database/init');

const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Gestionale V3 → porta ${PORT}`);
      console.log(`   Env: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    console.error('❌ Errore DB:', err.message);
    // Avvia comunque — il DB potrebbe essere temporaneamente non raggiungibile
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`⚠️ Server avviato (DB non inizializzato) → porta ${PORT}`);
    });
  });
