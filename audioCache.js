// services/audioCache.js
// Cache in-memory per buffer audio MP3 con TTL 2 minuti

const { randomBytes } = require("crypto");

const cache = new Map();
const TTL = 120_000; // 2 minuti

function store(buffer) {
  const token = randomBytes(16).toString("hex");
  cache.set(token, buffer);
  setTimeout(() => cache.delete(token), TTL);
  return token;
}

function get(token) {
  return cache.get(token) || null;
}

module.exports = { store, get };
