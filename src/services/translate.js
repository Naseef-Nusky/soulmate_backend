import fetch from 'node-fetch';

const API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || '';
const GOOGLE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
const LIBRE_ENDPOINT = process.env.LIBRE_TRANSLATE_URL || 'https://libretranslate.de/translate';
const GOOGLE_PUBLIC_DELAY_MS = Number(process.env.GOOGLE_PUBLIC_TRANSLATE_DELAY_MS || 200);
const LIBRE_DELAY_MS = Number(process.env.LIBRE_TRANSLATE_DELAY_MS || 300);

export async function translateTexts({ texts, target, source }) {
  if (!target) throw new Error('target language is required');
  const q = Array.isArray(texts) ? texts : [String(texts ?? '')];

  // Try official Google Cloud Translate first if API key is configured
  if (API_KEY) {
    try {
      return await translateWithGoogleCloud({ q, target, source });
    } catch (err) {
      console.error('[Translate] Google Cloud translate failed, falling back:', err.message);
    }
  } else {
    console.warn('[Translate] GOOGLE_TRANSLATE_API_KEY missing, using fallback endpoint(s)');
  }

  // Fall back to the unofficial Google endpoint
  try {
    return await translateWithPublicEndpoint({ q, target, source });
  } catch (err) {
    console.error('[Translate] Public Google translate failed, trying LibreTranslate:', err.message);
  }

  // Final fallback to LibreTranslate (self-hostable) to avoid white screens
  return translateWithLibreTranslate({ q, target, source });
}

async function translateWithGoogleCloud({ q, target, source }) {
  // Google Cloud Translate API has a limit of ~100 texts per request
  // Batch large requests to avoid hitting limits
  const BATCH_SIZE = 100;
  const allTranslations = [];
  
  for (let i = 0; i < q.length; i += BATCH_SIZE) {
    const batch = q.slice(i, i + BATCH_SIZE);
    const body = new URLSearchParams();
    batch.forEach(t => body.append('q', t));
    body.append('target', String(target));
    if (source) body.append('source', String(source));
    body.append('format', 'text');

    const res = await fetch(`${GOOGLE_ENDPOINT}?key=${API_KEY}`, {
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
    allTranslations.push(...translations);
    
    // Add small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < q.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return allTranslations;
}

async function translateWithPublicEndpoint({ q, target, source }) {
  const translations = [];
  // Add delay between requests to avoid rate limiting
  for (let i = 0; i < q.length; i++) {
    const text = q[i];
    try {
      const translated = await translateSinglePublic({
        text,
        target,
        source: source || 'auto',
      });
      translations.push(translated);
      
      // Add delay between requests to avoid rate limiting (except for last item)
      if (i < q.length - 1) {
        await delay(GOOGLE_PUBLIC_DELAY_MS);
      }
    } catch (error) {
      console.error(`[Translate] Failed to translate text ${i + 1}/${q.length}:`, error.message);
      // Push original text if translation fails
      translations.push(text);
    }
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

async function translateWithLibreTranslate({ q, target, source }) {
  const translations = [];
  for (let i = 0; i < q.length; i++) {
    const text = q[i];
    try {
      const res = await fetch(LIBRE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: source || 'auto',
          target,
          format: 'text',
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`LibreTranslate failed (${res.status}): ${errText}`);
      }

      const data = await res.json();
      translations.push(data?.translatedText || text);
    } catch (err) {
      console.error('[Translate] LibreTranslate error:', err.message);
      translations.push(text);
    }

    if (i < q.length - 1) {
      await delay(LIBRE_DELAY_MS);
    }
  }

  return translations;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}







