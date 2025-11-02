// Simple astrology utilities: Sun sign + element from birth date
// Moon and Rising require ephemeris and location-time calculations; we return placeholders for now.

const SUN_SIGNS = [
  { sign: 'Capricorn', start: '12-22', end: '01-19', element: 'Earth' },
  { sign: 'Aquarius', start: '01-20', end: '02-18', element: 'Air' },
  { sign: 'Pisces', start: '02-19', end: '03-20', element: 'Water' },
  { sign: 'Aries', start: '03-21', end: '04-19', element: 'Fire' },
  { sign: 'Taurus', start: '04-20', end: '05-20', element: 'Earth' },
  { sign: 'Gemini', start: '05-21', end: '06-20', element: 'Air' },
  { sign: 'Cancer', start: '06-21', end: '07-22', element: 'Water' },
  { sign: 'Leo', start: '07-23', end: '08-22', element: 'Fire' },
  { sign: 'Virgo', start: '08-23', end: '09-22', element: 'Earth' },
  { sign: 'Libra', start: '09-23', end: '10-22', element: 'Air' },
  { sign: 'Scorpio', start: '10-23', end: '11-21', element: 'Water' },
  { sign: 'Sagittarius', start: '11-22', end: '12-21', element: 'Fire' },
];

function parseMonthDay(monthDay) {
  const [m, d] = monthDay.split('-').map((v) => parseInt(v, 10));
  return { m, d };
}

function isBetween(month, day, start, end) {
  // Handles ranges that span new year (e.g., Dec 22 - Jan 19)
  if (start.m > end.m || (start.m === end.m && start.d > end.d)) {
    return (
      (month > start.m || (month === start.m && day >= start.d)) ||
      (month < end.m || (month === end.m && day <= end.d))
    );
  }
  return (
    (month > start.m || (month === start.m && day >= start.d)) &&
    (month < end.m || (month === end.m && day <= end.d))
  );
}

export function getSunSignAndElement(dateString) {
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return { sunSign: null, element: null };
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    for (const s of SUN_SIGNS) {
      const start = parseMonthDay(s.start);
      const end = parseMonthDay(s.end);
      if (isBetween(month, day, start, end)) {
        return { sunSign: s.sign, element: s.element };
      }
    }
    return { sunSign: null, element: null };
  } catch {
    return { sunSign: null, element: null };
  }
}

export function calculateAstrology(birthDetails) {
  const { date, time, city } = birthDetails || {};
  const { sunSign, element } = getSunSignAndElement(date);
  return {
    sunSign,
    element,
    moonSign: null, // Placeholder
    risingSign: null, // Placeholder
    birthDate: date || null,
    birthTime: time || null,
    birthCity: city || null,
  };
}




