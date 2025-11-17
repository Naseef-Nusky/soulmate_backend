import fetch from 'node-fetch';

const API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || '';
const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

export async function translateTexts({ texts, target, source }) {
  if (!API_KEY) {
    throw new Error('GOOGLE_TRANSLATE_API_KEY not configured');
  }
  const q = Array.isArray(texts) ? texts : [String(texts ?? '')];
  const body = new URLSearchParams();
  q.forEach(t => body.append('q', t));
  body.append('target', String(target));
  if (source) body.append('source', String(source));
  body.append('format', 'text');

  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Translate API failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  const translations = (data?.data?.translations || []).map(t => t.translatedText || '');
  return translations;
}





