export function validateGeneratePayload(body) {
  if (!body || typeof body !== 'object') {
    return { value: null, error: 'Invalid payload' };
  }

  const answers = body.answers ?? {};
  const birthDetails = body.birthDetails ?? {};
  const email = body.email ?? null;

  if (!birthDetails.date) {
    return { value: null, error: 'birthDetails.date is required (YYYY-MM-DD)' };
  }

  return {
    value: {
      answers,
      birthDetails: {
        date: String(birthDetails.date),
        time: birthDetails.time ? String(birthDetails.time) : null,
        city: birthDetails.city ? String(birthDetails.city) : null,
      },
      email: email ? String(email) : null,
    },
    error: null,
  };
}






