'use strict';

function required(val, name) {
  if (val === undefined || val === null || val === '') {
    throw new Error(`Campo obbligatorio mancante: ${name}`);
  }
  return val;
}

function toInt(val) {
  const n = parseInt(val);
  return isNaN(n) ? null : n;
}

function toFloat(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function sanitize(obj, fields) {
  const out = {};
  for (const [key, def] of Object.entries(fields)) {
    out[key] = obj[key] !== undefined ? obj[key] : def;
  }
  return out;
}

module.exports = { required, toInt, toFloat, sanitize };
