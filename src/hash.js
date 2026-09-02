// A tiny deterministic string hash, shared by the key compiler and the live
// game. Two independent FNV-1a passes give ~64 bits, which is far more than
// enough to keep 2,600 keys collision-free (the compiler verifies that on
// every build rather than trusting the maths).
//
// This is obfuscation, not cryptography, and it is used as such: it keeps
// the answer list out of view-source so a curious player can't read the
// scoreboard, and that is the whole job.
const SALT = 'climb·1'

export function keyHash(questionId, normalized) {
  const s = SALT + '|' + questionId + '|' + normalized
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0
  }
  return a.toString(36) + b.toString(36)
}

// Canonical answer names ship in the bundle so the reveal can say "Golden
// Retriever" when you typed "golden". They are lightly scrambled — UTF-8
// bytes XORed with a per-question key, then base64 — which keeps a
// view-source skim from spoiling the board without pretending to be
// cryptography.
export function scramble(text, key) {
  const k = keyHash('name', key)
  const bytes = new TextEncoder().encode(text)
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= k.charCodeAt(i % k.length) & 0x7f
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function unscramble(enc, key) {
  const k = keyHash('name', key)
  const bin = atob(enc)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ (k.charCodeAt(i % k.length) & 0x7f)
  return new TextDecoder().decode(bytes)
}
