import { GoogleGenAI } from '@google/genai';

const MOCK_MODE = String(process.env.MOCK_MODE || '').toLowerCase() === 'true' || !process.env.GEMINI_API_KEY;
const LOG_AI_VERBOSE = process.env.LOG_AI_VERBOSE === 'true';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });


function buildFallbackUrl({ gender }) {
  const style = (gender === 'Female' || gender === 'Woman') ? 'adventurer-neutral' : 'adventurer';
  const baseTemplate = process.env.FALLBACK_IMAGE_URL_TEMPLATE || 'https://api.dicebear.com/7.x/{style}/png?seed={seed}&size=512&radius=40&backgroundType=gradientLinear';
  const seed = 'soulmate';
  return baseTemplate.replace('{seed}', seed).replace('{style}', style);
}

function portraitPromptFromAnswers(answers, astrology) {
  // Prioritize "Who are you interested in?" (genderConfirm) for image generation
  const gender = answers?.genderConfirm || answers?.gender || 'Person';
  const ethnicity = answers?.ethnicity && answers.ethnicity !== 'No preference' ? answers.ethnicity : '';
  const ageRange = answers?.ageRange || '';
  const keyTraits = Array.isArray(answers?.keyTraits) && answers.keyTraits.length ? answers.keyTraits.join(', ') : '';
  const element = astrology?.element || '';
  const personalityElement = answers?.element || '';
  const appearanceImportance = answers?.appearanceImportance || '';
  const decisionMaking = answers?.decisionMaking || '';
  const challenge = answers?.challenge || '';
  const redFlag = answers?.redFlag || '';
  const partnerPreference = answers?.partnerPreference || '';
  const relationshipDynamic = answers?.relationshipDynamic || '';
  const loveLanguage = answers?.loveLanguage || '';
  const idealConnection = answers?.idealConnection || '';
  const relationshipFear = answers?.relationshipFear || '';
  const lifeGoals = Array.isArray(answers?.lifeGoals) && answers.lifeGoals.length ? answers.lifeGoals.join(', ') : '';
  const sunSign = astrology?.sunSign || '';
  const moonSign = astrology?.moonSign || '';
  const risingSign = astrology?.risingSign || '';

  const styleDirectives = `
You are a portrait artist. You are given a description of a person and you need to create a portrait of them. maintain the style directives strictly.

IMAGE STYLE DIRECTIVES:
- Create Graphite realism portrait.
- Hand-drawn graphite pencil portrait on white paper, finished artwork only. no background or any other elements.
- Only show the drawing, no other text or elements.
- Do not use colors. only black and white.
- Exactly ONE face, ONE person — a single unified portrait with no duplicates, reflections, or mirrors.
- Full face visible with natural hair, neck, a small portion of the shoulders and upper dress area. Subject perfectly centered, surrounded by a clean white background.
- Soft, delicate pencil pressure with fine linework, subtle cross-hatching, smooth tonal blending, and visible paper grain texture. Gentle shading with balanced light and shadow.
- Pure portrait sketch — fully hand-drawn appearance, with no 3D objects or drawing tools visible.
- Show the generated photo as a portrait, not a photo of the image.

ABSOLUTELY FORBIDDEN:
- Do not show the drawing tools in the image.
- Do not show the pencils in the image.
- pencils, pens, brushes, erasers, hands, arms, fingers, text, letters, numbers, logos, borders, frames, or any tools next to the portrait.
- ONLY the finished portrait drawing on a clean background.
- NO other text or elements.`;
  
  const hints = [
    "Follow the style directives strictly. Do not deviate from them.",
    'Based on ALL quiz answers and astrology data:',
    gender ? `Gender: ${gender}.` : '',
    ethnicity ? `Ethnicity hint: ${ethnicity}.` : '',
    ageRange ? `Apparent age: ${ageRange}.` : '',
    keyTraits ? `Vibe: ${keyTraits}.` : '',
    appearanceImportance ? `Appearance priority: ${appearanceImportance}.` : '',
    decisionMaking ? `Decision style: ${decisionMaking}.` : '',
    challenge ? `Personal challenge: ${challenge}.` : '',
    redFlag ? `Avoids: ${redFlag}.` : '',
    partnerPreference ? `Prefers partner: ${partnerPreference}.` : '',
    relationshipDynamic ? `Relationship dynamic: ${relationshipDynamic}.` : '',
    loveLanguage ? `Love language: ${loveLanguage}.` : '',
    idealConnection ? `Ideal connection: ${idealConnection}.` : '',
    relationshipFear ? `Biggest fear: ${relationshipFear}.` : '',
    lifeGoals ? `Life goals: ${lifeGoals}.` : '',
    element ? `Element: ${element}.` : '',
    personalityElement ? `Personality element (quiz): ${personalityElement}.` : '',
    sunSign ? `Sun sign: ${sunSign}.` : '',
    moonSign ? `Moon sign: ${moonSign}.` : '',
    risingSign ? `Rising sign: ${risingSign}.` : '',
  ].filter(Boolean).join('\n');
  
  if (LOG_AI_VERBOSE) {
    // Debug: Log what quiz data is being used
    // eslint-disable-next-line no-console
    console.log('[Image] Quiz steps included in prompt:');
    // eslint-disable-next-line no-console
    console.log('  Gender:', gender || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Ethnicity:', ethnicity || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Age Range:', ageRange || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Key Traits:', keyTraits || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Appearance:', appearanceImportance || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Decision Making:', decisionMaking || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Challenge:', challenge || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Red Flag:', redFlag || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Partner Preference:', partnerPreference || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Relationship Dynamic:', relationshipDynamic || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Love Language:', loveLanguage || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Ideal Connection:', idealConnection || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Relationship Fear:', relationshipFear || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Life Goals:', lifeGoals || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Element:', element || personalityElement || 'N/A');
    // eslint-disable-next-line no-console
    console.log('  Sun Sign:', sunSign || 'N/A');
  }
  
  const finalPrompt = `${styleDirectives}\n\n${hints}`.trim();
  if (LOG_AI_VERBOSE) {
    // eslint-disable-next-line no-console
    console.log('[Image] Generated hints length:', hints.length, 'characters');
    // eslint-disable-next-line no-console
    console.log('[Image] Full prompt length:', finalPrompt.length, 'characters');
  }
  
  return finalPrompt;
}

export async function generatePencilSketchFromAnswers(answers, astrology) {
  let prompt = portraitPromptFromAnswers(answers, astrology);
  
  // DALL-E 3 has a hard limit of 4000 characters - truncate if needed while preserving quiz hints
  const MAX_PROMPT_LENGTH = 3950; // 50 char buffer for safety
  if (prompt.length > MAX_PROMPT_LENGTH) {
    if (LOG_AI_VERBOSE) {
      // eslint-disable-next-line no-console
      console.warn(`[Image] Prompt too long (${prompt.length} chars), truncating while preserving quiz steps...`);
    }
    // Find where quiz hints start
    const hintsStartIndex = prompt.indexOf('Based on ALL quiz answers');
    if (hintsStartIndex > 0) {
      const stylePart = prompt.substring(0, hintsStartIndex).trim();
      const hintsPart = prompt.substring(hintsStartIndex);
      // Prioritize quiz hints - keep as much as possible
      const availableSpace = MAX_PROMPT_LENGTH - stylePart.length - 50;
      const truncatedHints = hintsPart.substring(0, Math.max(availableSpace, 800)); // Keep at least 800 chars for quiz data
      prompt = `${stylePart} ${truncatedHints}`.trim();
      if (LOG_AI_VERBOSE) {
        // eslint-disable-next-line no-console
        console.warn(`[Image] Preserved ${truncatedHints.length}/${hintsPart.length} characters of quiz hints (${Math.round(truncatedHints.length/hintsPart.length*100)}%)`);
      }
    } else {
      // Fallback: truncate from end but try to keep quiz-related content
      prompt = prompt.substring(0, MAX_PROMPT_LENGTH).trim();
      if (LOG_AI_VERBOSE) {
        // eslint-disable-next-line no-console
        console.warn('[Image] Using fallback truncation (hints section not found)');
      }
    }
  }
  
  if (MOCK_MODE) {
    const fallbackUrl = buildFallbackUrl({ gender: answers?.genderConfirm || answers?.gender });
    return { url: fallbackUrl, imageData: null };
  }
  
  try {
    if (LOG_AI_VERBOSE) {
      // eslint-disable-next-line no-console
      console.log('[Image] Generating pencil sketch with Gemini gemini-2.5-flash-image model');
      // eslint-disable-next-line no-console
      console.log('[Image] Full prompt being used:');
      // eslint-disable-next-line no-console
      console.log('='.repeat(80));
      // eslint-disable-next-line no-console
      console.log(prompt);
      // eslint-disable-next-line no-console
      console.log('='.repeat(80));
    }
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
    });
    // Minimal AI usage logging
    if (response?.usageMetadata) {
      const pt = response.usageMetadata.promptTokenCount || 0;
      const ct = response.usageMetadata.candidatesTokenCount || 0;
      const tt = response.usageMetadata.totalTokenCount || 0;
      // eslint-disable-next-line no-console
      console.log(`[AI] tokens prompt=${pt} completion=${ct} total=${tt}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[AI] promptLength=${prompt.length} chars`);
    }
    
    // Handle image response
    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageData = part.inlineData.data; // Already base64
          if (LOG_AI_VERBOSE) {
            // eslint-disable-next-line no-console
            console.log('[Image] Pencil sketch generated successfully');
          }
          // Return base64 data - URL will be generated after saving to DB
          return { imageData, url: null };
        }
      }
    }
    
    // Fallback if no image in response
    if (LOG_AI_VERBOSE) {
      // eslint-disable-next-line no-console
      console.warn('[Image] No image data in response, using fallback');
    }
    const fallbackUrl = buildFallbackUrl({ gender: answers?.genderConfirm || answers?.gender });
    return { url: fallbackUrl, imageData: null };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Image] Generation failed');
    const fallbackUrl = buildFallbackUrl({ report: prompt, gender: answers?.genderConfirm || answers?.gender });
    return { url: fallbackUrl, imageData: null };
  }
}

// Generate monthly horoscope report
export async function generateHoroscopeReport(astrology, answers, month, year) {
  if (MOCK_MODE) {
    return `Monthly Horoscope for ${month}/${year}\n\nThis is a mock horoscope report. In production, this would be generated using AI based on your birth chart and current astrological transits.`;
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1];
  
  const sunSign = astrology?.sunSign || 'Unknown';
  const element = astrology?.element || 'Unknown';
  const birthDate = astrology?.birthDate || 'Unknown';
  
  const prompt = `Generate a personalized monthly horoscope reading for ${monthName} ${year}.

User Details:
- Sun Sign: ${sunSign}
- Element: ${element}
- Birth Date: ${birthDate}
- Key Traits: ${Array.isArray(answers?.keyTraits) ? answers.keyTraits.join(', ') : 'Not specified'}

Create a detailed, personalized monthly horoscope that includes:
1. Overall theme for the month
2. Love and relationships forecast
3. Career and financial opportunities
4. Personal growth and spiritual insights
5. Important dates and planetary influences
6. Advice for navigating challenges

Make it warm, insightful, and specific to their astrological profile. Write in a friendly, encouraging tone. Keep it between 800-1200 words.`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('[Horoscope] Generated monthly horoscope successfully');
    return text;
  } catch (err) {
    console.error('[Horoscope] Generation failed:', err?.message || err);
    return `Monthly Horoscope for ${monthName} ${year}\n\nUnfortunately, we encountered an error generating your personalized horoscope. Please try again later.`;
  }
}


