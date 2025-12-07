// In-memory storage for verification codes
// In production, consider using Redis or a database
const verificationCodes = new Map();

// Code expiration time: 10 minutes
const CODE_EXPIRATION_MS = 10 * 60 * 1000;

/**
 * Generate a 6-digit verification code
 */
export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store verification code for an email
 */
export function storeVerificationCode(email, code) {
  const normalizedEmail = email.trim().toLowerCase();
  const expiresAt = Date.now() + CODE_EXPIRATION_MS;
  
  verificationCodes.set(normalizedEmail, {
    code,
    expiresAt,
    createdAt: Date.now(),
  });
  
  // Clean up expired codes periodically
  cleanupExpiredCodes();
  
  return { code, expiresAt };
}

/**
 * Verify a code for an email
 */
export function verifyCode(email, code) {
  const normalizedEmail = email.trim().toLowerCase();
  const stored = verificationCodes.get(normalizedEmail);
  
  if (!stored) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }
  
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(normalizedEmail);
    return { valid: false, error: 'Verification code has expired. Please request a new one.' };
  }
  
  if (stored.code !== code) {
    return { valid: false, error: 'Invalid verification code. Please try again.' };
  }
  
  // Code is valid - remove it so it can't be reused
  verificationCodes.delete(normalizedEmail);
  
  return { valid: true };
}

/**
 * Remove verification code (after successful verification or cancellation)
 */
export function removeVerificationCode(email) {
  const normalizedEmail = email.trim().toLowerCase();
  verificationCodes.delete(normalizedEmail);
}

/**
 * Clean up expired codes
 */
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expiresAt) {
      verificationCodes.delete(email);
    }
  }
}

// Clean up expired codes every 5 minutes
setInterval(cleanupExpiredCodes, 5 * 60 * 1000);







