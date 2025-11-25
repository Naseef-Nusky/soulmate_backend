import fetch from 'node-fetch';

const API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || '';
const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

export async function translateTexts({ texts, target, source }) {
  if (!target) throw new Error('target language is required');
  const q = Array.isArray(texts) ? texts : [String(texts ?? '')];

  if (API_KEY) {
    return translateWithGoogleCloud({ q, target, source });
  }

  console.warn('[Translate] GOOGLE_TRANSLATE_API_KEY missing, using fallback endpoint');
  return translateWithPublicEndpoint({ q, target, source });
}

async function translateWithGoogleCloud({ q, target, source }) {
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

async function translateWithPublicEndpoint({ q, target, source }) {
  const translations = [];
  for (const text of q) {
    const translated = await translateSinglePublic({
      text,
      target,
      source: source || 'auto',
    });
    translations.push(translated);
  }
  return translations;
}

async function translateSinglePublic({ text, target, source }) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('dt', 't');
  url.searchParams.set('sl', source || 'auto');
  url.searchParams.set('tl', target);
  url.searchParams.set('q', text);
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('oe', 'UTF-8');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Fallback translate failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const segments = Array.isArray(data?.[0]) ? data[0] : [];
  return segments.map(seg => seg?.[0] || '').join('');
}







