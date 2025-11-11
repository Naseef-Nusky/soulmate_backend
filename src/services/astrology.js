import { getPool, saveHoroscope, getHoroscope } from './db.js';
import { GoogleGenAI } from '@google/genai';

// Initialize GoogleGenAI - API key is read from GEMINI_API_KEY environment variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MOCK_MODE = String(process.env.MOCK_MODE || '').toLowerCase() === 'true' || !process.env.GEMINI_API_KEY;

async function generateAIText(prompt, returnJson = false) {
  if (MOCK_MODE) {
    if (returnJson) {
      return {
        text: {
          PersonalLife: 'This is a mock AI-generated response.',
          Profession: 'This is a mock AI-generated response.',
          Health: 'This is a mock AI-generated response.',
          Emotions: 'This is a mock AI-generated response.',
          Travel: 'This is a mock AI-generated response.',
          Luck: 'This is a mock AI-generated response.'
        },
        tokens: { prompt: 0, response: 0, total: 0 }
      };
    }
    return {
      text: 'This is a mock AI-generated response. In production, this would be generated using AI.',
      tokens: { prompt: 0, response: 0, total: 0 }
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    // Extract text from response
    const responseText = response.text || '';
    
    // Extract token usage if available
    const usage = response.usage || response.usageMetadata || {};
    const tokens = {
      prompt: usage.promptTokenCount || 0,
      response: usage.candidatesTokenCount || usage.responseTokenCount || 0,
      total: usage.totalTokenCount || (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || usage.responseTokenCount || 0)
    };
    
    // Log token usage
    console.log(`[AI] Token usage - Prompt: ${tokens.prompt}, Response: ${tokens.response}, Total: ${tokens.total}`);
    
    if (returnJson) {
      // Try to parse as JSON first
      try {
        const jsonText = responseText.trim();
        // Remove markdown code blocks if present
        const cleanedText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return {
          text: JSON.parse(cleanedText),
          tokens
        };
      } catch (parseError) {
        // If not JSON, return the text in the expected format
        console.warn('[AI] Response is not JSON, returning text format');
        return {
          text: {
            PersonalLife: responseText || 'Unable to generate content.',
            Profession: '',
            Health: '',
            Emotions: '',
            Travel: '',
            Luck: ''
          },
          tokens
        };
      }
    }
    
    return {
      text: responseText,
      tokens
    };
  } catch (error) {
    console.error('[AI] Generation error:', error);
    throw error;
  }
}

// Get user's birth details from database
async function getUserBirthDetails(userId) {
  const pool = getPool();
  if (!pool) return null;

  // First try to get from signups table (from registration)
  const userResult = await pool.query(
    'SELECT birth_date, email FROM signups WHERE id = $1',
    [userId]
  );

  let birthDetails = null;
  let userEmail = null;
  if (userResult.rows.length > 0) {
    if (userResult.rows[0].birth_date) {
    birthDetails = {
      date: userResult.rows[0].birth_date,
      time: null,
      city: null,
    };
    }
    userEmail = userResult.rows[0].email;
  }

  // Also try to get from results table (from quiz) for more complete data
  let query;
  let params;
  if (userEmail) {
    // Use email if we have it (more reliable)
    query = `SELECT step_data->'birthDetails' as birth_details, astrology 
             FROM results 
             WHERE email = $1 
             ORDER BY created_at DESC LIMIT 1`;
    params = [userEmail];
  } else {
    // Fallback: try to find by user ID through signups email
    query = `SELECT step_data->'birthDetails' as birth_details, astrology 
     FROM results 
             WHERE email IN (SELECT email FROM signups WHERE id = $1) 
             ORDER BY created_at DESC LIMIT 1`;
    params = [userId];
  }

  const result = await pool.query(query, params);

  if (result.rows.length > 0 && result.rows[0].birth_details) {
    const quizBirthDetails = result.rows[0].birth_details;
    return {
      date: quizBirthDetails.date || birthDetails?.date,
      time: quizBirthDetails.time,
      city: quizBirthDetails.city,
      astrology: result.rows[0].astrology,
    };
  }

  return birthDetails;
}

// Get user's quiz answers from database
async function getUserQuizAnswers(userId) {
  const pool = getPool();
  if (!pool) return null;

  try {
    // First get user's email from signups table
    const userResult = await pool.query(
      'SELECT email FROM signups WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    const userEmail = userResult.rows[0].email;

    // Get quiz data from results table (step_data contains all quiz answers)
    const result = await pool.query(
      `SELECT step_data, answers 
       FROM results 
       WHERE email = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [userEmail]
    );

    if (result.rows.length > 0) {
      // Prefer step_data (contains all quiz steps) over answers (legacy)
      const quizData = result.rows[0].step_data || result.rows[0].answers || {};
      
      // Extract answers from step_data if it exists
      if (result.rows[0].step_data && result.rows[0].step_data.answers) {
        return result.rows[0].step_data.answers;
      }
      
      return quizData;
    }
  } catch (error) {
    console.error('[Astrology] Error fetching quiz answers:', error);
  }

  return null;
}

function assertQuizAnswers(quizAnswers) {
  if (!quizAnswers || (typeof quizAnswers === 'object' && Object.keys(quizAnswers).length === 0)) {
    const error = new Error('QUIZ_INCOMPLETE');
    error.code = 'QUIZ_INCOMPLETE';
    throw error;
  }
}

// Calculate astrology from birth details (used in generate route)
export function calculateAstrology(birthDetails) {
  if (!birthDetails || !birthDetails.date) {
    return {
      sunSign: 'Unknown',
      moonSign: 'Unknown',
      risingSign: 'Unknown',
      element: 'Unknown',
      birthDate: null,
      birthTime: null,
      birthCity: null,
    };
  }

  const birthDate = new Date(birthDetails.date);
  const month = birthDate.getMonth() + 1;
  const day = birthDate.getDate();

  // Simple sun sign calculation
  const sunSigns = [
    { name: 'Capricorn', start: [12, 22], end: [1, 19] },
    { name: 'Aquarius', start: [1, 20], end: [2, 18] },
    { name: 'Pisces', start: [2, 19], end: [3, 20] },
    { name: 'Aries', start: [3, 21], end: [4, 19] },
    { name: 'Taurus', start: [4, 20], end: [5, 20] },
    { name: 'Gemini', start: [5, 21], end: [6, 20] },
    { name: 'Cancer', start: [6, 21], end: [7, 22] },
    { name: 'Leo', start: [7, 23], end: [8, 22] },
    { name: 'Virgo', start: [8, 23], end: [9, 22] },
    { name: 'Libra', start: [9, 23], end: [10, 22] },
    { name: 'Scorpio', start: [10, 23], end: [11, 21] },
    { name: 'Sagittarius', start: [11, 22], end: [12, 21] },
  ];

  let sunSign = 'Unknown';
  for (const sign of sunSigns) {
    if (sign.start[0] === month && day >= sign.start[1]) {
      sunSign = sign.name;
      break;
    }
    if (sign.end[0] === month && day <= sign.end[1]) {
      sunSign = sign.name;
      break;
    }
  }

  // Elements
  const elementMap = {
    Aries: 'Fire', Taurus: 'Earth', Gemini: 'Air', Cancer: 'Water',
    Leo: 'Fire', Virgo: 'Earth', Libra: 'Air', Scorpio: 'Water',
    Sagittarius: 'Fire', Capricorn: 'Earth', Aquarius: 'Air', Pisces: 'Water',
  };

  return {
    sunSign,
    moonSign: 'Calculating...', // Would need time and location for accurate calculation
    risingSign: 'Calculating...', // Would need time and location for accurate calculation
    element: elementMap[sunSign] || 'Unknown',
    birthDate: birthDetails.date,
    birthTime: birthDetails.time || null,
    birthCity: birthDetails.city || null,
  };
}

// Calculate natal chart (simplified - in production use proper astrology library)
export async function calculateNatalChart(userId) {
  const birthDetails = await getUserBirthDetails(userId);
  if (!birthDetails || !birthDetails.date) {
    throw new Error('Birth details not found. Please complete the quiz first.');
  }

  const birthDate = new Date(birthDetails.date);
  const month = birthDate.getMonth() + 1;
  const day = birthDate.getDate();
  const year = birthDate.getFullYear();

  // Simple sun sign calculation
  const sunSigns = [
    { name: 'Capricorn', start: [12, 22], end: [1, 19] },
    { name: 'Aquarius', start: [1, 20], end: [2, 18] },
    { name: 'Pisces', start: [2, 19], end: [3, 20] },
    { name: 'Aries', start: [3, 21], end: [4, 19] },
    { name: 'Taurus', start: [4, 20], end: [5, 20] },
    { name: 'Gemini', start: [5, 21], end: [6, 20] },
    { name: 'Cancer', start: [6, 21], end: [7, 22] },
    { name: 'Leo', start: [7, 23], end: [8, 22] },
    { name: 'Virgo', start: [8, 23], end: [9, 22] },
    { name: 'Libra', start: [9, 23], end: [10, 22] },
    { name: 'Scorpio', start: [10, 23], end: [11, 21] },
    { name: 'Sagittarius', start: [11, 22], end: [12, 21] },
  ];

  let sunSign = 'Unknown';
  for (const sign of sunSigns) {
    if (sign.start[0] === month && day >= sign.start[1]) {
      sunSign = sign.name;
      break;
    }
    if (sign.end[0] === month && day <= sign.end[1]) {
      sunSign = sign.name;
      break;
    }
  }

  // Elements
  const elementMap = {
    Aries: 'Fire', Taurus: 'Earth', Gemini: 'Air', Cancer: 'Water',
    Leo: 'Fire', Virgo: 'Earth', Libra: 'Air', Scorpio: 'Water',
    Sagittarius: 'Fire', Capricorn: 'Earth', Aquarius: 'Air', Pisces: 'Water',
  };

  // Simplified planet calculations (in production, use proper astrology library)
  const getPlanetSign = (baseSign, offset) => {
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 
                   'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    const baseIndex = signs.indexOf(baseSign);
    const newIndex = (baseIndex + offset + 12) % 12;
    return signs[newIndex];
  };

  // Calculate all planets (simplified - using date patterns)
  const moonOffset = Math.floor((day + month) % 12);
  const risingOffset = Math.floor((year % 12 + month) % 12);

  const detailedChart = {
    Sun: sunSign,
    Moon: getPlanetSign(sunSign, moonOffset),
    Rising: getPlanetSign(sunSign, risingOffset),
    Mercury: getPlanetSign(sunSign, (month % 3) - 1), // Usually close to Sun
    Venus: getPlanetSign(sunSign, (day % 4) - 2), // Usually within 2 signs of Sun
    Mars: getPlanetSign(sunSign, (year % 6) - 3),
    Jupiter: getPlanetSign(sunSign, (year % 7) - 3),
    Saturn: getPlanetSign(sunSign, (year % 12) - 6),
    Uranus: getPlanetSign(sunSign, (year % 7) - 3),
    Neptune: getPlanetSign(sunSign, (year % 8) - 4),
    Pluto: getPlanetSign(sunSign, (year % 9) - 4),
    element: elementMap[sunSign] || 'Unknown',
    birthDate: birthDetails.date,
    birthTime: birthDetails.time || null,
    birthCity: birthDetails.city || null,
  };

  return detailedChart;
}

// Generate detailed natal chart report with caching
export async function generateNatalChartReport(userId) {
  // Check if report already exists in database
  const cachedReport = await getHoroscope(userId, 'natal-chart', 'permanent');
  if (cachedReport) {
    return {
      report: cachedReport.guidance,
      chart: null, // Chart data can be regenerated if needed
    };
  }

  // Generate new report
  const detailedChart = await calculateNatalChart(userId);
  const quizAnswers = await getUserQuizAnswers(userId);
  assertQuizAnswers(quizAnswers);

  // Build quiz context
  let quizContext = '';
  if (quizAnswers) {
    const keyTraits = Array.isArray(quizAnswers.keyTraits) ? quizAnswers.keyTraits.join(', ') : '';
    const quizInfo = [
      quizAnswers.gender ? `Gender: ${quizAnswers.gender}` : '',
      quizAnswers.ageRange ? `Age Range: ${quizAnswers.ageRange}` : '',
      quizAnswers.ethnicity ? `Ethnicity: ${quizAnswers.ethnicity}` : '',
      keyTraits ? `Key Traits: ${keyTraits}` : '',
    ].filter(Boolean).join('\n');
    
    if (quizInfo) {
      quizContext = `\n\nAdditional Personal Information from Quiz:\n${quizInfo}`;
    }
  }

  const prompt = `Generate a detailed astrological personality report based on this natal chart:

**Astrological Chart:**
- Sun: ${detailedChart.Sun}
- Moon: ${detailedChart.Moon}
- Rising (Ascendant): ${detailedChart.Rising}
- Mercury: ${detailedChart.Mercury}
- Venus: ${detailedChart.Venus}
- Mars: ${detailedChart.Mars}
- Jupiter: ${detailedChart.Jupiter}
- Saturn: ${detailedChart.Saturn}
- Uranus: ${detailedChart.Uranus}
- Neptune: ${detailedChart.Neptune}
- Pluto: ${detailedChart.Pluto}
- Birth Date: ${detailedChart.birthDate}${quizContext}

Format the report EXACTLY as follows with these sections:

**Your core personality**
There are three key pillars to your personality

**Sun**
Your identity
[Write 4-6 sentences about their Sun sign identity, goals, relationships with groups, leadership qualities, and how they express themselves. Make it specific to ${detailedChart.Sun} sign.]

**Moon**
Your emotions
[Write 4-6 sentences about their Moon sign emotional nature, sense of security, home and family connections, work environment needs, and emotional foundations. Make it specific to ${detailedChart.Moon} sign.]

**Rising-sign**
Your image
[Write 5-7 sentences about their Rising sign, first impressions, outer personality, how others perceive them, their outlook on life, shadow side, and soul lessons. Make it specific to ${detailedChart.Rising} sign.]

**A little more about you**
Other important planetary placements

**Mercury**
Your expression
[Write 3-5 sentences about their Mercury sign, how they think and communicate, intellectual pursuits, and mental approach. Make it specific to ${detailedChart.Mercury} sign.]

**Jupiter**
Your aspirations
[Write 3-5 sentences about their Jupiter sign, philanthropic nature, faith in future, helping others, success patterns, and areas where they may be unrealistic. Make it specific to ${detailedChart.Jupiter} sign.]

**Mars**
Your fortune
[Write 3-5 sentences about their Mars sign, physical vitality, energy levels, assertiveness, independence, organizing ability, and potential challenges. Make it specific to ${detailedChart.Mars} sign.]

**Venus**
Your view on love
[Write 3-5 sentences about their Venus sign, disposition, popularity, approach to relationships, financial circumstances, and how they express love. Make it specific to ${detailedChart.Venus} sign.]

**Saturn**
Your discipline
[Write 4-6 sentences about their Saturn sign, friendships, sense of duty, patience, hard work, life lessons, and feelings of uniqueness. Make it specific to ${detailedChart.Saturn} sign.]

**Uranus**
Your individuality
[Write 4-6 sentences about their Uranus sign, independence, originality, eccentricity, intuition, leadership, pioneering spirit, and potential challenges. Make it specific to ${detailedChart.Uranus} sign.]

**Neptune**
Your imagination
[Write 4-6 sentences about their Neptune sign, artistic nature, idealism, sensitivity, psychic abilities, potential challenges with reality, and spiritual connection. Make it specific to ${detailedChart.Neptune} sign.]

**Pluto**
Your power
[Write 4-6 sentences about their Pluto sign, loyalty in friendships, intensity, charisma, transformation, leadership in groups, and dedication to ideals. Make it specific to ${detailedChart.Pluto} sign.]

Write in a warm, insightful, and deeply personalized tone. Make it feel like it was written specifically for this person by a professional astrologer. Use the exact section headers as shown above. Total length: 1500-2000 words.`;

  try {
    const result = await generateAIText(prompt, false);
    const report = result.text || result;
    
    // Save to database for caching
    await saveHoroscope({
      userId,
      type: 'natal-chart',
      date: 'permanent', // Use 'permanent' as date since this doesn't change
      guidance: report,
    });
    
    return {
      report,
      chart: detailedChart,
    };
  } catch (error) {
    console.error('[Astrology] Natal chart report generation error:', error);
    const fallback = {
      report: `Your core personality\nThere are three key pillars to your personality\n\n**Sun**\nYour identity\nBased on your ${detailedChart.Sun} sun sign, you possess unique qualities that shape your identity and how you express yourself in the world.\n\n**Moon**\nYour emotions\nYour ${detailedChart.Moon} moon sign influences your emotional nature and what makes you feel secure.\n\n**Rising-sign**\nYour image\nWith your ${detailedChart.Rising} rising sign, you present yourself to the world in a distinctive way.`,
      chart: detailedChart,
    };
    
    // Try to save fallback too
    try {
      await saveHoroscope({
        userId,
        type: 'natal-chart',
        date: 'permanent',
        guidance: fallback.report,
      });
    } catch (saveError) {
      console.error('[Astrology] Failed to save fallback natal chart report:', saveError);
    }
    
    return fallback;
  }
}

// Calculate detailed natal chart with all planets
export async function calculateDetailedNatalChart(userId) {
  const birthDetails = await getUserBirthDetails(userId);
  if (!birthDetails || !birthDetails.date) {
    throw new Error('Birth details not found. Please complete the quiz first.');
  }

  const birthDate = new Date(birthDetails.date);
  const month = birthDate.getMonth() + 1;
  const day = birthDate.getDate();
  const year = birthDate.getFullYear();

  // Simple sun sign calculation
  const sunSigns = [
    { name: 'Capricorn', start: [12, 22], end: [1, 19] },
    { name: 'Aquarius', start: [1, 20], end: [2, 18] },
    { name: 'Pisces', start: [2, 19], end: [3, 20] },
    { name: 'Aries', start: [3, 21], end: [4, 19] },
    { name: 'Taurus', start: [4, 20], end: [5, 20] },
    { name: 'Gemini', start: [5, 21], end: [6, 20] },
    { name: 'Cancer', start: [6, 21], end: [7, 22] },
    { name: 'Leo', start: [7, 23], end: [8, 22] },
    { name: 'Virgo', start: [8, 23], end: [9, 22] },
    { name: 'Libra', start: [9, 23], end: [10, 22] },
    { name: 'Scorpio', start: [10, 23], end: [11, 21] },
    { name: 'Sagittarius', start: [11, 22], end: [12, 21] },
  ];

  let sunSign = 'Unknown';
  for (const sign of sunSigns) {
    if (sign.start[0] === month && day >= sign.start[1]) {
      sunSign = sign.name;
      break;
    }
    if (sign.end[0] === month && day <= sign.end[1]) {
      sunSign = sign.name;
      break;
    }
  }

  // Elements
  const elementMap = {
    Aries: 'Fire', Taurus: 'Earth', Gemini: 'Air', Cancer: 'Water',
    Leo: 'Fire', Virgo: 'Earth', Libra: 'Air', Scorpio: 'Water',
    Sagittarius: 'Fire', Capricorn: 'Earth', Aquarius: 'Air', Pisces: 'Water',
  };

  // Simplified planet calculations (in production, use proper astrology library)
  // For now, we'll use simplified calculations based on date patterns
  const getPlanetSign = (baseSign, offset) => {
    const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 
                   'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    const baseIndex = signs.indexOf(baseSign);
    const newIndex = (baseIndex + offset) % 12;
    return signs[newIndex];
  };

  // Simplified planet positions (in real astrology, this requires complex calculations)
  // Using simplified patterns for demonstration
  const sunIndex = sunSigns.findIndex(s => s.name === sunSign);
  const moonOffset = Math.floor((day + month) % 12);
  const risingOffset = Math.floor((year % 12 + month) % 12);

  return {
    Sun: sunSign,
    Moon: getPlanetSign(sunSign, moonOffset),
    Rising: getPlanetSign(sunSign, risingOffset),
    Mercury: getPlanetSign(sunSign, (month % 3) - 1), // Usually close to Sun
    Venus: getPlanetSign(sunSign, (day % 4) - 2), // Usually within 2 signs of Sun
    Mars: getPlanetSign(sunSign, (year % 6) - 3),
    Saturn: getPlanetSign(sunSign, (year % 12) - 6),
    Uranus: getPlanetSign(sunSign, (year % 7) - 3),
    Neptune: getPlanetSign(sunSign, (year % 8) - 4),
    Pluto: getPlanetSign(sunSign, (year % 9) - 4),
    element: elementMap[sunSign] || 'Unknown',
    birthDate: birthDetails.date,
    birthTime: birthDetails.time || null,
    birthCity: birthDetails.city || null,
  };
}

// Generate detailed personality report using AI
export async function generatePersonalityReport(userId) {
  const detailedChart = await calculateDetailedNatalChart(userId);
  const quizAnswers = await getUserQuizAnswers(userId);
  assertQuizAnswers(quizAnswers);

  // Build quiz context
  let quizContext = '';
  if (quizAnswers) {
    const keyTraits = Array.isArray(quizAnswers.keyTraits) ? quizAnswers.keyTraits.join(', ') : '';
    const quizInfo = [
      quizAnswers.gender ? `Gender: ${quizAnswers.gender}` : '',
      quizAnswers.ageRange ? `Age Range: ${quizAnswers.ageRange}` : '',
      quizAnswers.ethnicity ? `Ethnicity: ${quizAnswers.ethnicity}` : '',
      keyTraits ? `Key Traits: ${keyTraits}` : '',
      quizAnswers.element ? `Personality Element: ${quizAnswers.element}` : '',
      quizAnswers.decisionMaking ? `Decision Making Style: ${quizAnswers.decisionMaking}` : '',
      quizAnswers.challenge ? `Life Challenge: ${quizAnswers.challenge}` : '',
      quizAnswers.relationshipDynamic ? `Relationship Dynamic: ${quizAnswers.relationshipDynamic}` : '',
      quizAnswers.loveLanguage ? `Love Language: ${quizAnswers.loveLanguage}` : '',
    ].filter(Boolean).join('\n');
    
    if (quizInfo) {
      quizContext = `\n\nAdditional Personal Information from Quiz:\n${quizInfo}`;
    }
  }

  const prompt = `Generate a detailed, comprehensive astrological personality profile based on this natal chart:

**Astrological Chart:**
- Sun: ${detailedChart.Sun}
- Moon: ${detailedChart.Moon}
- Rising (Ascendant): ${detailedChart.Rising}
- Mercury: ${detailedChart.Mercury}
- Venus: ${detailedChart.Venus}
- Mars: ${detailedChart.Mars}
- Saturn: ${detailedChart.Saturn}
- Uranus: ${detailedChart.Uranus}
- Neptune: ${detailedChart.Neptune}
- Pluto: ${detailedChart.Pluto}
- Element: ${detailedChart.element}
- Birth Date: ${detailedChart.birthDate}${quizContext}

Create a comprehensive personality analysis with the following sections. Write each section as a flowing, descriptive paragraph (3-5 sentences each):

**Core Personality (Sun Sign)**
Describe their core identity, ego, and how they express themselves. What drives them at their essence.

**Emotions (Moon Sign)**
Describe their emotional nature, inner needs, how they process feelings, and what makes them feel secure.

**Image & First Impressions (Rising Sign)**
Describe how others perceive them, their outer personality, and the mask they present to the world.

**Expression & Communication (Mercury)**
Describe how they think, communicate, process information, and express ideas.

**Aspirations & Values (Venus)**
Describe what they value, what they're drawn to, their approach to beauty, love, and relationships.

**Action & Drive (Mars)**
Describe how they take action, their energy, assertiveness, and what motivates them.

**Discipline & Structure (Saturn)**
Describe their approach to responsibility, limitations, discipline, and life lessons.

**Individuality & Innovation (Uranus)**
Describe their unique qualities, need for freedom, innovation, and unconventional approach.

**Imagination & Dreams (Neptune)**
Describe their intuition, creativity, spiritual side, and connection to the mystical.

**Power & Transformation (Pluto)**
Describe their depth, intensity, areas of transformation, and how they handle power.

Write in a warm, insightful, and deeply personalized tone. Make it feel like it was written specifically for this person by a professional astrologer. Each section should be detailed and meaningful. Total length: 1200-1800 words. Use descriptive, flowing language that captures the complexity of their astrological makeup.`;

  try {
    const result = await generateAIText(prompt, false);
    const report = result.text || result;
    return {
      report,
      chart: detailedChart,
    };
  } catch (error) {
    console.error('[Astrology] AI generation error:', error);
    return {
      report: `Based on your ${detailedChart.Sun} sun sign, ${detailedChart.Moon} moon sign, and ${detailedChart.Rising} rising sign, you possess a unique blend of traits that shape your personality. Your ${detailedChart.element.toLowerCase()} nature gives you a distinctive approach to life, while the planetary influences create a complex and fascinating personality profile.`,
      chart: detailedChart,
    };
  }
}

// Generate life predictions
export async function generateLifePredictions(userId) {
  const natalChart = await calculateNatalChart(userId);

  const categories = ['Career', 'Love', 'Health'];
  const predictions = {};

  for (const category of categories) {
    const prompt = `Based on the astrological profile:
- Sun Sign: ${natalChart.sunSign}
- Element: ${natalChart.element}
- Birth Date: ${natalChart.birthDate}

Generate a ${category.toLowerCase()} prediction for this person. Include:
- Current trends and opportunities
- Challenges to be aware of
- Best times to take action
- Long-term outlook

Write in a supportive, encouraging tone. Keep it between 200-300 words.`;

    try {
      const result = await generateAIText(prompt);
      const prediction = result.text || result;
      predictions[category] = prediction;
    } catch (error) {
      predictions[category] = `Your ${category.toLowerCase()} path is influenced by your ${natalChart.sunSign} nature. The ${natalChart.element.toLowerCase()} element in your chart suggests steady progress and meaningful growth in this area of your life.`;
    }
  }

  return predictions;
}

// Generate daily horoscope
export async function generateDailyHoroscope(userId) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Check if horoscope already exists for today
  const cachedHoroscope = await getHoroscope(userId, 'today', todayStr);
  if (cachedHoroscope) {
    return cachedHoroscope;
  }
  
  // After first day: Check if yesterday's "tomorrow" horoscope exists for today's date
  // This means we can reuse it instead of generating a new one
  const yesterdayTomorrowHoroscope = await getHoroscope(userId, 'tomorrow', todayStr);
  if (yesterdayTomorrowHoroscope) {
    // Copy yesterday's "tomorrow" horoscope to today's horoscope
    await saveHoroscope({
      userId,
      type: 'today',
      date: todayStr,
      guidance: yesterdayTomorrowHoroscope.guidance,
      emotionScore: yesterdayTomorrowHoroscope.emotionScore,
      energyScore: yesterdayTomorrowHoroscope.energyScore,
    });
    return {
      ...yesterdayTomorrowHoroscope,
      type: 'today',
      date: todayStr,
    };
  }
  
  // Generate new horoscope
  const natalChart = await calculateNatalChart(userId);
  const quizAnswers = await getUserQuizAnswers(userId);
  assertQuizAnswers(quizAnswers);

  // Build quiz context for prompt
  let quizContext = '';
  if (quizAnswers) {
    const keyTraits = Array.isArray(quizAnswers.keyTraits) ? quizAnswers.keyTraits.join(', ') : '';
    const quizInfo = [
      quizAnswers.gender ? `Gender: ${quizAnswers.gender}` : '',
      quizAnswers.ageRange ? `Age Range: ${quizAnswers.ageRange}` : '',
      quizAnswers.ethnicity ? `Ethnicity: ${quizAnswers.ethnicity}` : '',
      keyTraits ? `Key Traits: ${keyTraits}` : '',
      quizAnswers.element ? `Personality Element: ${quizAnswers.element}` : '',
      quizAnswers.decisionMaking ? `Decision Making Style: ${quizAnswers.decisionMaking}` : '',
      quizAnswers.challenge ? `Life Challenge: ${quizAnswers.challenge}` : '',
      quizAnswers.relationshipDynamic ? `Relationship Dynamic: ${quizAnswers.relationshipDynamic}` : '',
      quizAnswers.loveLanguage ? `Love Language: ${quizAnswers.loveLanguage}` : '',
      quizAnswers.idealConnection ? `Ideal Connection: ${quizAnswers.idealConnection}` : '',
      quizAnswers.partnerPreference ? `Partner Preference: ${quizAnswers.partnerPreference}` : '',
      quizAnswers.redFlag ? `Red Flags: ${quizAnswers.redFlag}` : '',
    ].filter(Boolean).join('\n');
    
    if (quizInfo) {
      quizContext = `\n\nAdditional Personal Information from Quiz:\n${quizInfo}`;
    }
  }

  const prompt = `Generate a personalized daily horoscope for today (${today.toLocaleDateString('en-US')}) based on:

Astrological Profile:
- Sun Sign: ${natalChart.sunSign}
- Element: ${natalChart.element}
- Birth Date: ${natalChart.birthDate || 'Not specified'}${quizContext}

Return ONLY valid JSON (no markdown, no code fences) with exactly these keys:
- PersonalLife
- Profession
- Health
- Emotions
- Travel
- Luck

Guidelines for each section:

PersonalLife: Describe relationships, family, love life, and emotional connections TODAY. Reference their ${natalChart.sunSign} traits and include guidance for couples, singles, and meaningful conversations. Mention an astrological transit influencing their connections today.

Profession: Cover work, career, business, and professional opportunities TODAY. Provide advice about teamwork, decision-making, recognition, and staying grounded. Make it specific to their ${natalChart.sunSign} strengths and note how today's planetary energy impacts productivity or visibility.

Health: Discuss physical energy, exercise, diet, wellness, and mental clarity TODAY. Offer practical tips about movement, meals, rest, and balance. Reference how today's transits affect their vitality or self-care routine.

Emotions: Explore emotional state, inner feelings, mood, and self-awareness TODAY. Include guidance about managing emotions, practicing compassion, communicating feelings, and staying centered. Tie it to their ${natalChart.sunSign}'s emotional patterns.

Travel: Mention short trips, meetings, or movement TODAY. Reference relevant astrological aspects (e.g., "Moon trine Mercury") and advise on timing, logistics, flexibility, or potential delays.

Luck: Highlight opportunities, synchronicities, and favorable moments TODAY. End with a sentence like "Luck favors [something] for ${natalChart.sunSign} natives today." Make it uplifting and specific.

Each section must be 4-6 sentences, warm, insightful, and encouraging. Total length around 400-500 words.`;

  try {
    const result = await generateAIText(prompt, true);
    const guidanceJson = result.text || result;
    const tokens = result.tokens || { prompt: 0, response: 0, total: 0 };
    
    // Log token usage for daily horoscope
    console.log(`[Astrology] Daily Horoscope Token Usage - Prompt: ${tokens.prompt}, Response: ${tokens.response}, Total: ${tokens.total}`);
    
    // Format the JSON response into the display format
    const guidance = `**Personal Life**

${guidanceJson.PersonalLife || 'Unable to generate content.'}

**Profession**

${guidanceJson.Profession || ''}

**Health**

${guidanceJson.Health || ''}

**Emotions**

${guidanceJson.Emotions || ''}

**Travel**

${guidanceJson.Travel || ''}

**Luck**

${guidanceJson.Luck || ''}`;
    
    // Generate scores based on day of week and sign
    const dayOfWeek = today.getDay();
    const emotionScore = 5 + Math.floor(Math.random() * 4); // 5-8
    const energyScore = 5 + Math.floor(Math.random() * 4); // 5-8

    const horoscopeData = {
      guidance,
      emotionScore,
      energyScore,
      date: todayStr,
      type: 'today',
      tokens, // Include token usage in response
    };
    
    // Save to database for caching
    await saveHoroscope({
      userId,
      type: 'today',
      date: todayStr,
      guidance,
      emotionScore,
      energyScore,
    });
    
    return horoscopeData;
  } catch (error) {
    if (error?.code === 'QUIZ_INCOMPLETE' || error?.message === 'QUIZ_INCOMPLETE') {
      throw error;
    }
    console.error('[Astrology] Horoscope generation error:', error);
    const fallback = {
      guidance: `Today brings new opportunities for your ${natalChart.sunSign} energy. Trust your intuition and stay open to the possibilities that come your way.`,
      emotionScore: 7,
      energyScore: 6,
      date: todayStr,
      type: 'today',
    };
    
    // Try to save fallback too
    try {
      await saveHoroscope({
        userId,
        type: 'today',
        date: todayStr,
        guidance: fallback.guidance,
        emotionScore: fallback.emotionScore,
        energyScore: fallback.energyScore,
      });
    } catch (saveError) {
      console.error('[Astrology] Failed to save fallback horoscope:', saveError);
    }
    
    return fallback;
  }
}

// Generate tomorrow's horoscope
export async function generateTomorrowHoroscope(userId) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  // Check if horoscope already exists for tomorrow
  const cachedHoroscope = await getHoroscope(userId, 'tomorrow', tomorrowStr);
  if (cachedHoroscope) {
    return cachedHoroscope;
  }
  
  // Generate new horoscope
  const natalChart = await calculateNatalChart(userId);
  const quizAnswers = await getUserQuizAnswers(userId);
  assertQuizAnswers(quizAnswers);

  // Build quiz context for prompt
  let quizContext = '';
  if (quizAnswers) {
    const keyTraits = Array.isArray(quizAnswers.keyTraits) ? quizAnswers.keyTraits.join(', ') : '';
    const quizInfo = [
      quizAnswers.gender ? `Gender: ${quizAnswers.gender}` : '',
      quizAnswers.ageRange ? `Age Range: ${quizAnswers.ageRange}` : '',
      quizAnswers.ethnicity ? `Ethnicity: ${quizAnswers.ethnicity}` : '',
      keyTraits ? `Key Traits: ${keyTraits}` : '',
      quizAnswers.element ? `Personality Element: ${quizAnswers.element}` : '',
      quizAnswers.decisionMaking ? `Decision Making Style: ${quizAnswers.decisionMaking}` : '',
      quizAnswers.challenge ? `Life Challenge: ${quizAnswers.challenge}` : '',
      quizAnswers.relationshipDynamic ? `Relationship Dynamic: ${quizAnswers.relationshipDynamic}` : '',
      quizAnswers.loveLanguage ? `Love Language: ${quizAnswers.loveLanguage}` : '',
      quizAnswers.idealConnection ? `Ideal Connection: ${quizAnswers.idealConnection}` : '',
      quizAnswers.partnerPreference ? `Partner Preference: ${quizAnswers.partnerPreference}` : '',
      quizAnswers.redFlag ? `Red Flags: ${quizAnswers.redFlag}` : '',
    ].filter(Boolean).join('\n');
    
    if (quizInfo) {
      quizContext = `\n\nAdditional Personal Information from Quiz:\n${quizInfo}`;
    }
  }

  const formattedDate = tomorrow.toLocaleDateString('en-US');
  const prompt = `Generate a personalized daily horoscope for tomorrow (${formattedDate}) based on:

Astrological Profile:
- Sun Sign: ${natalChart.sunSign}
- Element: ${natalChart.element}
- Birth Date: ${natalChart.birthDate || 'Not specified'}${quizContext}

IMPORTANT: Do NOT use the word "today" anywhere in the generated horoscope. Use "tomorrow", "on ${formattedDate}", or "on this date" instead.

Return ONLY valid JSON (no markdown, no code fences) with exactly these keys:
- PersonalLife
- Profession
- Health
- Emotions
- Travel
- Luck

Guidelines for each section:

PersonalLife: Describe relationships, family, love life, and emotional connections for tomorrow (${formattedDate}). Reference their ${natalChart.sunSign} traits and include guidance for couples, singles, and meaningful conversations. Mention a planetary transit influencing connections on that date. Do NOT mention "today".

Profession: Cover work, career, business, and professional opportunities for tomorrow (${formattedDate}). Provide advice about teamwork, decision-making, recognition, and staying grounded. Make it specific to their ${natalChart.sunSign} strengths and note how the cosmic energy for that date impacts productivity or visibility. Do NOT mention "today".

Health: Discuss physical energy, exercise, diet, wellness, and mental clarity for tomorrow (${formattedDate}). Offer practical tips about movement, meals, rest, and balance. Reference how the transits for that date affect vitality or self-care. Do NOT mention "today".

Emotions: Explore emotional state, inner feelings, mood, and self-awareness for tomorrow (${formattedDate}). Include guidance about managing emotions, communicating needs, and staying centered. Tie it to their ${natalChart.sunSign}'s emotional tendencies. Do NOT mention "today".

Travel: Mention short trips, meetings, or movement for tomorrow (${formattedDate}). Reference relevant astrological aspects (e.g., "Moon trine Mercury") and advise on timing, logistics, flexibility, or potential delays. Do NOT mention "today".

Luck: Highlight opportunities, synchronicities, and favorable moments for tomorrow (${formattedDate}). End with a sentence like "Luck favors [something] for ${natalChart.sunSign} natives on this date." Make it uplifting and specific. Do NOT mention "today".

Each section must be 4-6 sentences, warm, insightful, and encouraging. Total length around 400-500 words.`;

  try {
    const result = await generateAIText(prompt, true);
    const guidanceJson = result.text || result;
    const tokens = result.tokens || { prompt: 0, response: 0, total: 0 };
    
    // Log token usage for tomorrow horoscope
    console.log(`[Astrology] Tomorrow Horoscope Token Usage - Prompt: ${tokens.prompt}, Response: ${tokens.response}, Total: ${tokens.total}`);
    
    // Format the JSON response into the display format
    const guidance = `**Personal Life**

${guidanceJson.PersonalLife || 'Unable to generate content.'}

**Profession**

${guidanceJson.Profession || ''}

**Health**

${guidanceJson.Health || ''}

**Emotions**

${guidanceJson.Emotions || ''}

**Travel**

${guidanceJson.Travel || ''}

**Luck**

${guidanceJson.Luck || ''}`;
    
    const emotionScore = 5 + Math.floor(Math.random() * 4); // 5-8
    const energyScore = 5 + Math.floor(Math.random() * 4); // 5-8

    const horoscopeData = {
      guidance,
      emotionScore,
      energyScore,
      date: tomorrowStr,
      type: 'tomorrow',
      tokens, // Include token usage in response
    };
    
    // Save to database for caching
    await saveHoroscope({
      userId,
      type: 'tomorrow',
      date: tomorrowStr,
      guidance,
      emotionScore,
      energyScore,
    });
    
    return horoscopeData;
  } catch (error) {
    if (error?.code === 'QUIZ_INCOMPLETE' || error?.message === 'QUIZ_INCOMPLETE') {
      throw error;
    }
    console.error('[Astrology] Tomorrow horoscope generation error:', error);
    const fallback = {
      guidance: `Tomorrow holds promise for your ${natalChart.sunSign} energy. Prepare yourself for new opportunities and trust in your natural ${natalChart.element.toLowerCase()} intuition.`,
      emotionScore: 7,
      energyScore: 6,
      date: tomorrowStr,
      type: 'tomorrow',
    };
    
    // Try to save fallback too
    try {
      await saveHoroscope({
        userId,
        type: 'tomorrow',
        date: tomorrowStr,
        guidance: fallback.guidance,
        emotionScore: fallback.emotionScore,
        energyScore: fallback.energyScore,
      });
    } catch (saveError) {
      console.error('[Astrology] Failed to save fallback horoscope:', saveError);
    }
    
    return fallback;
  }
}

// Generate monthly horoscope
export async function generateMonthlyHoroscope(userId) {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1];
  const dateKey = `${year}-${month}`; // Use year-month as date key for monthly
  
  // Check if horoscope already exists for this month
  const cachedHoroscope = await getHoroscope(userId, 'monthly', dateKey);
  if (cachedHoroscope) {
    return cachedHoroscope;
  }
  
  // Generate new horoscope
  const natalChart = await calculateNatalChart(userId);
  const quizAnswers = await getUserQuizAnswers(userId);
  assertQuizAnswers(quizAnswers);

  // Build quiz context for prompt
  let quizContext = '';
  if (quizAnswers) {
    const keyTraits = Array.isArray(quizAnswers.keyTraits) ? quizAnswers.keyTraits.join(', ') : '';
    const lifeGoals = Array.isArray(quizAnswers.lifeGoals) ? quizAnswers.lifeGoals.join(', ') : '';
    const quizInfo = [
      quizAnswers.gender ? `Gender: ${quizAnswers.gender}` : '',
      quizAnswers.ageRange ? `Age Range: ${quizAnswers.ageRange}` : '',
      quizAnswers.ethnicity ? `Ethnicity: ${quizAnswers.ethnicity}` : '',
      keyTraits ? `Key Traits: ${keyTraits}` : '',
      quizAnswers.element ? `Personality Element: ${quizAnswers.element}` : '',
      quizAnswers.decisionMaking ? `Decision Making Style: ${quizAnswers.decisionMaking}` : '',
      quizAnswers.challenge ? `Life Challenge: ${quizAnswers.challenge}` : '',
      quizAnswers.relationshipDynamic ? `Relationship Dynamic: ${quizAnswers.relationshipDynamic}` : '',
      quizAnswers.loveLanguage ? `Love Language: ${quizAnswers.loveLanguage}` : '',
      quizAnswers.idealConnection ? `Ideal Connection: ${quizAnswers.idealConnection}` : '',
      quizAnswers.partnerPreference ? `Partner Preference: ${quizAnswers.partnerPreference}` : '',
      quizAnswers.redFlag ? `Red Flags: ${quizAnswers.redFlag}` : '',
      quizAnswers.relationshipFear ? `Relationship Fear: ${quizAnswers.relationshipFear}` : '',
      lifeGoals ? `Life Goals: ${lifeGoals}` : '',
    ].filter(Boolean).join('\n');
    
    if (quizInfo) {
      quizContext = `\n\nAdditional Personal Information from Quiz:\n${quizInfo}`;
    }
  }

  const prompt = `Generate a personalized monthly horoscope for ${monthName} ${year} based on:

Astrological Profile:
- Sun Sign: ${natalChart.sunSign}
- Element: ${natalChart.element}
- Birth Date: ${natalChart.birthDate || 'Not specified'}${quizContext}

Format the monthly horoscope EXACTLY as follows (no section headers, just flowing paragraphs):

**Opening Paragraph** (2-3 sentences)
Start with descriptive adjectives about their ${natalChart.sunSign} sign (e.g., "Confident, daring, impatient arian" for Aries, "Balanced, diplomatic, charming libran" for Libra). Then provide overall theme for the month, general energy, and what to expect. End with an encouraging statement about emerging as a winner or achieving desires.

**Business/Profession Paragraph** (4-5 sentences)
Write about career opportunities, business growth, revenue, sales, and professional achievements. Mention how their work attitude and skills help them succeed. Include advice about work-life balance, avoiding work addiction, and managing professional relationships. Make it specific to their sign's work style.

**Emotions & Relationships Paragraph** (3-4 sentences)
Write about emotional state, managing emotions, and avoiding overreactions. Include guidance about channeling energy positively, thinking before acting, and maintaining emotional clarity. Mention how to perceive things objectively and control emotional responses.

**Decision Making Paragraph** (2-3 sentences)
Write about how overwhelming emotions might affect decision-making this month. Include advice about seeking guidance from experienced people if needed. Mention when to act and when to wait.

**Health Paragraph** (2-3 sentences)
Write about physical energy, health concerns, and the need for attention to health. Include advice about prevention, managing exhaustion from high physical activities, and self-care. End with a statement like "Prevention is always better than cure is true in your case now."

Write in a warm, insightful, and specific tone. Use descriptive sign characteristics at the start (e.g., "Confident, daring, impatient arian"). Make it feel personal and relevant. Total length: 500-700 words. Write as flowing paragraphs without section headers - just continuous text.`;

  try {
    const result = await generateAIText(prompt, false); // Monthly doesn't need JSON format
    const guidance = result.text || result;
    const tokens = result.tokens || { prompt: 0, response: 0, total: 0 };
    
    // Log token usage for monthly horoscope
    console.log(`[Astrology] Monthly Horoscope Token Usage - Prompt: ${tokens.prompt}, Response: ${tokens.response}, Total: ${tokens.total}`);
    
    const horoscopeData = {
      guidance,
      month,
      year,
      monthName,
      date: today.toISOString().split('T')[0],
      type: 'monthly',
      tokens, // Include token usage in response
    };
    
    // Save to database for caching
    await saveHoroscope({
      userId,
      type: 'monthly',
      date: dateKey,
      guidance,
      month,
      year,
      monthName,
    });
    
    return horoscopeData;
  } catch (error) {
    if (error?.code === 'QUIZ_INCOMPLETE' || error?.message === 'QUIZ_INCOMPLETE') {
      throw error;
    }
    console.error('[Astrology] Monthly horoscope generation error:', error);
    const fallback = {
      guidance: `This ${monthName} brings significant opportunities for your ${natalChart.sunSign} energy. Your ${natalChart.element.toLowerCase()} nature will help you navigate the month with wisdom and grace. Focus on your goals and trust in the cosmic guidance that surrounds you.`,
      month,
      year,
      monthName,
      date: today.toISOString().split('T')[0],
      type: 'monthly',
    };
    
    // Try to save fallback too
    try {
      await saveHoroscope({
        userId,
        type: 'monthly',
        date: dateKey,
        guidance: fallback.guidance,
        month,
        year,
        monthName,
      });
    } catch (saveError) {
      console.error('[Astrology] Failed to save fallback horoscope:', saveError);
    }
    
    return fallback;
  }
}

// Calculate compatibility between two birth charts
export async function calculateCompatibility(userId, partnerData) {
  const userChart = await calculateNatalChart(userId);
  
  // Calculate partner's chart (simplified)
  const partnerDate = new Date(partnerData.birthDate);
  const partnerMonth = partnerDate.getMonth() + 1;
  const partnerDay = partnerDate.getDate();

  // Simple compatibility calculation
  const elementCompatibility = {
    Fire: { Fire: 85, Earth: 70, Air: 90, Water: 60 },
    Earth: { Fire: 70, Earth: 80, Air: 65, Water: 75 },
    Air: { Fire: 90, Air: 85, Earth: 65, Water: 70 },
    Water: { Fire: 60, Water: 80, Earth: 75, Air: 70 },
  };

  const emotionalScore = elementCompatibility[userChart.element]?.[userChart.element] || 75;
  const communicationScore = 70 + Math.floor(Math.random() * 20); // 70-90
  const overallScore = Math.round((emotionalScore + communicationScore) / 2);

  const prompt = `Generate a compatibility report between two people:

Person 1:
- Sun Sign: ${userChart.sunSign}
- Element: ${userChart.element}

Person 2:
- Birth Date: ${partnerData.birthDate}

Analyze their compatibility including:
- Emotional connection
- Communication dynamics
- Relationship strengths
- Potential challenges
- How they complement each other

Write in a balanced, insightful tone. Keep it between 300-500 words.`;

  try {
    const result = await generateAIText(prompt);
    const report = result.text || result;
    
    return {
      emotional: emotionalScore,
      communication: communicationScore,
      overall: overallScore,
      report,
    };
  } catch (error) {
    return {
      emotional: emotionalScore,
      communication: communicationScore,
      overall: overallScore,
      report: `Your ${userChart.element.toLowerCase()} nature creates a ${emotionalScore > 75 ? 'strong' : 'moderate'} emotional connection with your partner. Your communication styles ${communicationScore > 75 ? 'complement' : 'differ but can work together'} well, creating an overall compatibility of ${overallScore}%.`,
    };
  }
}
