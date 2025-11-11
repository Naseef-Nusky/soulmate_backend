import express from 'express';
import { createSignup, findSignupByEmail, generateToken, generateLoginToken, verifyLoginToken, updateProfile, getProfile, verifyToken } from '../services/auth.js';
import { sendLoginLinkEmail } from '../services/email.js';
import { generateDailyHoroscope } from '../services/astrology.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, name, birthDate } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const signup = await createSignup({ email, name, birthDate });
    const token = generateToken(signup.email);
    const loginToken = generateLoginToken(signup.email);
    
    // Generate login link
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const loginLink = `${appUrl}/login?token=${loginToken}`;
    
    // Generate horoscope if birth date is provided
    let horoscope = null;
    if (signup.birth_date) {
      try {
        horoscope = await generateDailyHoroscope(signup.id);
      } catch (horoscopeError) {
        if (horoscopeError?.code !== 'QUIZ_INCOMPLETE' && horoscopeError?.message !== 'QUIZ_INCOMPLETE') {
          console.error('[Auth] Failed to generate horoscope:', horoscopeError);
        }
        // Continue even if horoscope generation fails
      }
    }
    
    // Send login link email
    try {
      await sendLoginLinkEmail({ 
        to: signup.email, 
        loginLink,
        name: signup.name 
      });
    } catch (emailError) {
      console.error('[Auth] Failed to send login email:', emailError);
      // Continue even if email fails
    }
    
    res.json({ 
      ok: true, 
      signup,
      token,
      loginLink, // Return link in response too (for testing)
      horoscope, // Include horoscope in response
      user: {
        id: signup.id,
        email: signup.email,
        name: signup.name,
        birthDate: signup.birth_date,
      }
    });
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, token } = req.body;
    
    // If token provided, verify magic link
    if (token) {
      const emailFromToken = verifyLoginToken(token);
      if (!emailFromToken) {
        return res.status(401).json({ error: 'Invalid or expired login link' });
      }
      
      let signup = await findSignupByEmail(emailFromToken);
      if (!signup) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const authToken = generateToken(signup.email);
      
      // Generate horoscope for first login
      let horoscope = null;
      try {
        horoscope = await generateDailyHoroscope(signup.id);
      } catch (horoscopeError) {
        if (horoscopeError?.code !== 'QUIZ_INCOMPLETE' && horoscopeError?.message !== 'QUIZ_INCOMPLETE') {
          console.error('[Auth] Failed to generate horoscope:', horoscopeError);
        }
        // Continue even if horoscope generation fails
      }
      
      return res.json({ 
        ok: true, 
        signup,
        token: authToken,
        horoscope, // Include horoscope in response
        user: {
          id: signup.id,
          email: signup.email,
          name: signup.name,
          birthDate: signup.birth_date,
        }
      });
    }
    
    // Regular email login
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const signup = await findSignupByEmail(email);
    if (!signup) {
      return res.status(404).json({
        error: 'Please make sure you enter the email you used to create your GuruLink account.',
        requiresQuiz: true,
      });
    }

    // User exists, send login link
    const loginToken = generateLoginToken(signup.email);
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const loginLink = `${appUrl}/login?token=${loginToken}`;
    
    // Generate horoscope for user (will be available when they click login link)
    let horoscope = null;
    try {
      horoscope = await generateDailyHoroscope(signup.id);
    } catch (horoscopeError) {
      if (horoscopeError?.code !== 'QUIZ_INCOMPLETE' && horoscopeError?.message !== 'QUIZ_INCOMPLETE') {
        console.error('[Auth] Failed to generate horoscope:', horoscopeError);
      }
      // Continue even if horoscope generation fails
    }
    
    try {
      await sendLoginLinkEmail({ 
        to: signup.email, 
        loginLink,
        name: signup.name 
      });
    } catch (emailError) {
      console.error('[Auth] Failed to send login email:', emailError);
    }
    
    res.json({ 
      ok: true, 
      message: 'Please check your email for login link.',
      signup,
      horoscope, // Include horoscope in response (will be shown after login)
      user: {
        id: signup.id,
        email: signup.email,
        name: signup.name,
        birthDate: signup.birth_date,
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(400).json({ error: error.message || 'Login failed' });
  }
});

// Verify login token endpoint (for magic link)
router.get('/verify-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const email = verifyLoginToken(token);
    
    if (!email) {
      return res.status(401).json({ error: 'Invalid or expired login link' });
    }
    
    const signup = await findSignupByEmail(email);
    if (!signup) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const authToken = generateToken(signup.email);
    
    res.json({ 
      ok: true, 
      signup,
      token: authToken,
      user: {
        id: signup.id,
        email: signup.email,
        name: signup.name,
        birthDate: signup.birth_date,
      }
    });
  } catch (error) {
    console.error('[Auth] Token verification error:', error);
    res.status(400).json({ error: error.message || 'Token verification failed' });
  }
});

// Middleware to verify authentication
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

// Get user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error('[Auth] Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const profile = await updateProfile(req.user.id, req.body);
    res.json(profile);
  } catch (error) {
    console.error('[Auth] Update profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

export default router;



