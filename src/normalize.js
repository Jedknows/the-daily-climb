// One normalizer, used by the content linter, the key compiler and the live
// game. All three MUST agree or answers stop matching, so it lives alone in
// its own module with no imports.
//
// Deliberately forgiving: players are typing against a 25-second clock on a
// phone keyboard. Accents, punctuation, leading articles, "st." vs "saint"
// and a trailing plural all collapse to the same key.
const ARTICLES = /^(the|a|an|el|la|le|los|las|les)\s+/

export function normalize(input) {
  let s = String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: São -> Sao
    .replace(/[’'`´]/g, '') // don't -> dont, Rub' -> rub
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  s = s.replace(/\bsaint\b/g, 'st').replace(/\bmount\b/g, 'mt').replace(/\bdoctor\b/g, 'dr')
  while (ARTICLES.test(s)) s = s.replace(ARTICLES, '')
  s = s.replace(/\s+/g, ' ').trim()

  // Singularize the last word only, and only the safe endings. "grapes" ->
  // "grape"; "us" and "ss" words are left alone so "Belarus" survives.
  s = s.replace(/(\w+?)(?<![us])s$/, '$1')
  return s
}
