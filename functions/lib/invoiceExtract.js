// Extract structured invoice fields from a vendor-invoice PDF using Gemini
// (same GEMINI_API_KEY as the rest of the app). Returns best-effort data that a
// human confirms before the bill counts as owed.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const PROMPT = `You are reading a vendor's invoice/bill (PDF). Extract the billing details.
Return ONLY a JSON object with these keys:
- vendor_name: the company that SENT the invoice (the biller), as a string
- invoice_number: the invoice/bill number as a string, or null
- amount: the TOTAL AMOUNT DUE as a plain number (no currency symbol). Use the final total/balance due, not a subtotal.
- bill_date: invoice date in YYYY-MM-DD, or null
- due_date: payment due date in YYYY-MM-DD, or null
- line_items: array of { description: string, amount: number } for the main line items (max 12), or []
If a field is not present, use null. Do not guess the total — use the number labeled total/balance due/amount due.`;

// pdfBase64: standard base64 string of the PDF bytes.
async function extractInvoice(pdfBase64) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const body = {
    contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  };
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
  const call = (m) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  let r = await call(model);
  if (!r.ok && (r.status === 404 || r.status === 429 || r.status >= 500)) r = await call(fallback);
  if (!r.ok) throw new Error(`Gemini error (${r.status})`);
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }

  return {
    vendor_name: parsed.vendor_name ? String(parsed.vendor_name).trim() : null,
    invoice_number: parsed.invoice_number ? String(parsed.invoice_number).trim() : null,
    amount: parsed.amount != null ? round2(parsed.amount) : 0,
    bill_date: parsed.bill_date || null,
    due_date: parsed.due_date || null,
    line_items: Array.isArray(parsed.line_items)
      ? parsed.line_items.slice(0, 12).map(li => ({ description: String(li.description || '').slice(0, 200), amount: round2(li.amount) }))
      : [],
  };
}

module.exports = { extractInvoice };
