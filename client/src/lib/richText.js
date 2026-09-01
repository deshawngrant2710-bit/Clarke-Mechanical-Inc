// Keeps ONLY bold / underline / italic / line-break markup; strips everything
// else (and all attributes) so stored + rendered HTML is safe to show.
export function sanitizeRich(html) {
  if (!html) return '';
  let out = String(html)
    // Preserve line breaks that contentEditable stores as <div>/<p> blocks.
    .replace(/<\s*\/(div|p)\s*>/gi, '<br>').replace(/<\s*(div|p)\s*[^>]*>/gi, '')
    .replace(/<\s*(strong|b)\s*[^>]*>/gi, '<b>').replace(/<\s*\/\s*(strong|b)\s*>/gi, '</b>')
    .replace(/<\s*(em|i)\s*[^>]*>/gi, '<i>').replace(/<\s*\/\s*(em|i)\s*>/gi, '</i>')
    .replace(/<\s*u\s*[^>]*>/gi, '<u>').replace(/<\s*\/\s*u\s*>/gi, '</u>')
    .replace(/<\s*br\s*\/?\s*>/gi, '<br>');
  out = out.replace(/<(?!\/?(b|i|u|br)\s*\/?>)[^>]*>/gi, '');
  return out;
}
