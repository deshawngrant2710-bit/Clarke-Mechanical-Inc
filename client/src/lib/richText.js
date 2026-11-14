// Keeps ONLY bold / underline / italic / line-break markup; strips everything
// else (and all attributes) so stored + rendered HTML is safe to show.
// Tag patterns require whitespace or '>' after the name, so <b> never matches
// <br>, <i> never matches <img>, and <u> never matches <ul>.
export function sanitizeRich(html) {
  if (!html) return '';
  let out = String(html)
    // contentEditable stores lines as "first<div>second</div><div>third</div>" —
    // each OPENING block starts a new line (turning only the closing tag into a
    // break glued "first" + "second" together, e.g. "CorrectiveRemoved…").
    .replace(/<\s*(div|p)(\s[^>]*)?>\s*<\s*br\s*\/?\s*>\s*<\s*\/(div|p)\s*>/gi, '<br>') // an empty line
    .replace(/<\s*(div|p)(\s[^>]*)?>/gi, '<br>').replace(/<\s*\/(div|p)\s*>/gi, '')
    .replace(/<\s*(strong|b)(\s[^>]*)?>/gi, '<b>').replace(/<\s*\/\s*(strong|b)\s*>/gi, '</b>')
    .replace(/<\s*(em|i)(\s[^>]*)?>/gi, '<i>').replace(/<\s*\/\s*(em|i)\s*>/gi, '</i>')
    .replace(/<\s*u(\s[^>]*)?>/gi, '<u>').replace(/<\s*\/\s*u\s*>/gi, '</u>')
    .replace(/<\s*br\s*\/?\s*>/gi, '<br>');
  out = out.replace(/<(?!\/?(b|i|u|br)\s*\/?>)[^>]*>/gi, '');
  return out.replace(/^(\s*<br>)+/i, '');   // a leading block shouldn't add a blank line
}
