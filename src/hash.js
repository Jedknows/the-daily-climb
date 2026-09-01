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
