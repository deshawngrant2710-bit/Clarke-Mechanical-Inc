// Generates a readable one-time password (no ambiguous characters like 0/O, 1/l/I).
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function genTempPassword(len = 8) {
  let s = '';
  for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

module.exports = { genTempPassword };
