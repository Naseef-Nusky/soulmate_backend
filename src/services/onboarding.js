import { createSignup, generateToken, generateLoginToken, findSignupByEmail } from './auth.js';
import {
  generateDailyHoroscope,
  generateTomorrowHoroscope,
  generateMonthlyHoroscope,
  generateNatalChartReport,
} from './astrology.js';
import { sendLoginLinkEmail, sendSketchProcessingEmail, sendAdminNewSignupEmail } from './email.js';
import { getLatestResultByEmail, findRecentJobByEmail, createJob } from './db.js';

const SKETCH_PROMISED_HOURS = Number(process.env.SKETCH_PROMISED_HOURS || 24);

export async function provisionSignupAndSendLogin({ email, name, birthDate, sendEmails = true }) {
  if (!email) {
    throw new Error('Email is required for signup provisioning');
  }

  const cleanedEmail = email.trim().toLowerCase();

  const existingSignup = await findSignupByEmail(cleanedEmail);

  // Check if quiz data exists - if yes, use it to update signup with complete birth data
  const latestResult = await getLatestResultByEmail(cleanedEmail);
  let finalBirthDate = birthDate;
  let finalName = name;

  if (latestResult) {
    const stepData = latestResult.step_data || {};
    const answers = stepData.answers || latestResult.answers || stepData.form || {};
    
    // Use quiz data to fill in missing signup info
    if (!finalBirthDate && (answers.birthDate || stepData.birthDate)) {
      finalBirthDate = answers.birthDate || stepData.birthDate;
    }
    if (!finalName && answers.name) {
      finalName = answers.name;
    }
  }

  const signup = await createSignup({
    email: cleanedEmail,
    name: finalName,
    birthDate: finalBirthDate,
  });

  const createdTime = signup?.created_at ? new Date(signup.created_at).getTime() : null;
  const updatedTime = signup?.updated_at ? new Date(signup.updated_at).getTime() : null;
  const timestampsEqual = createdTime && updatedTime && Math.abs(updatedTime - createdTime) < 1500;
  
  // Check if signup was just created (not updated from existing)
  // If existingSignup exists, this means the signup was already in the database before this call
  const signupCreatedNow = !existingSignup && timestampsEqual;
  
  // If signup already existed when we called createSignup, emails were likely already sent
  // Only send emails if this is a brand new signup (existingSignup was null)
  const shouldSendEmails = signupCreatedNow;

  const token = generateToken(signup.email);
  let loginLink = null;

  if (signupCreatedNow) {
    const loginToken = generateLoginToken(signup.email);
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    loginLink = `${appUrl}/login?token=${loginToken}`;
  }

  // Only generate horoscopes if quiz data exists (otherwise ensurePostPaymentGeneration will handle it)
  let horoscope = null;
  if (latestResult && latestResult.step_data) {
    try {
      horoscope = await generateDailyHoroscope(signup.id);
      console.log(`[Onboarding] ✅ Daily horoscope generated for ${cleanedEmail}`);
    } catch (error) {
      // If horoscope generation fails, it's okay - ensurePostPaymentGeneration will create a job
      console.warn(`[Onboarding] Horoscope generation deferred for ${cleanedEmail}:`, error?.message || error);
    }

    // Generate other horoscopes in background (non-blocking)
    (async () => {
      try { 
        await generateTomorrowHoroscope(signup.id);
        console.log(`[Onboarding] ✅ Tomorrow horoscope generated for ${cleanedEmail}`);
      } catch (error) {
        console.warn(`[Onboarding] Tomorrow horoscope deferred for ${cleanedEmail}:`, error?.message || error);
      }
      try { 
        await generateMonthlyHoroscope(signup.id);
        console.log(`[Onboarding] ✅ Monthly horoscope generated for ${cleanedEmail}`);
      } catch (error) {
        console.warn(`[Onboarding] Monthly horoscope deferred for ${cleanedEmail}:`, error?.message || error);
      }
      try { 
        await generateNatalChartReport(signup.id);
        console.log(`[Onboarding] ✅ Natal chart generated for ${cleanedEmail}`);
      } catch (error) {
        console.warn(`[Onboarding] Natal chart deferred for ${cleanedEmail}:`, error?.message || error);
      }
    })();
  } else {
    console.log(`[Onboarding] Quiz data not found for ${cleanedEmail} - horoscope generation will happen via job queue`);
  }

  // Only send emails if:
  // 1. sendEmails is true
  // 2. Signup was just created NOW (not an existing signup that was updated)
  // 3. Login link was generated
  // This ensures emails are only sent once when the signup is first created
  if (sendEmails && shouldSendEmails && loginLink) {
    try {
      await sendLoginLinkEmail({
        to: signup.email,
        loginLink,
        name: signup.name,
      });
      console.log(`[Onboarding] ✅ Login link email sent to ${cleanedEmail}`);
    } catch (emailError) {
      console.error('[Onboarding] Failed to send login link email:', emailError?.message || emailError);
    }

    try {
      await sendSketchProcessingEmail({
        to: signup.email,
        name: signup.name,
        etaHours: SKETCH_PROMISED_HOURS,
      });
      console.log(`[Onboarding] ✅ Sketch processing email sent to ${cleanedEmail}`);
    } catch (processingError) {
      console.error('[Onboarding] Failed to send sketch processing email:', processingError?.message || processingError);
    }

    try {
      await sendAdminNewSignupEmail({
        email: signup.email,
        name: signup.name,
      });
      console.log(`[Onboarding] ✅ Admin notification sent for ${cleanedEmail}`);
    } catch (adminError) {
      console.error('[Onboarding] Failed to send admin new-signup email:', adminError?.message || adminError);
    }
  } else if (!sendEmails) {
    console.log(`[Onboarding] Emails suppressed for ${cleanedEmail} (sendEmails=false)`);
  } else if (!shouldSendEmails) {
    console.log(`[Onboarding] Signup already existed for ${cleanedEmail} (created ${existingSignup ? 'previously' : 'recently'}) - skipping duplicate emails`);
  } else if (!loginLink) {
    console.log(`[Onboarding] No login link generated for ${cleanedEmail} - skipping emails`);
  }

  return {
    signup,
    token,
    loginLink,
    horoscope,
  };
}

export async function ensurePostPaymentGeneration(email) {
  const cleanedEmail = email?.trim().toLowerCase();
  if (!cleanedEmail) {
    throw new Error('EMAIL_REQUIRED');
  }

  // Check if job already exists (avoid duplicates)
  const existingJob = await findRecentJobByEmail(cleanedEmail);
  if (existingJob && existingJob.status !== 'failed') {
    console.log(`[Onboarding] Job already exists for ${cleanedEmail}, skipping. Job ID: ${existingJob.id}`);
    return { skipped: true, reason: 'job_exists', jobId: existingJob.id };
  }

  // Get the most recent quiz completion data for this email
  console.log(`[Onboarding] Searching for quiz data for email: ${cleanedEmail}`);
  const latestResult = await getLatestResultByEmail(cleanedEmail);
  if (!latestResult) {
    console.warn(`[Onboarding] ❌ No quiz data found for ${cleanedEmail}. Quiz must be completed before payment.`);
    console.warn(`[Onboarding] Make sure the quiz was submitted with the same email address used for payment.`);
    throw new Error('QUIZ_DATA_NOT_FOUND');
  }
  
  console.log(`[Onboarding] ✅ Found quiz data for ${cleanedEmail} (result ID: ${latestResult.id}, created: ${latestResult.created_at})`);

  // Extract quiz answers and birth details from the saved quiz data
  const stepData = latestResult.step_data || {};
  const answers = stepData.answers || latestResult.answers || stepData.form || null;
  const birthDetails = stepData.birthDetails || {
    date: answers?.birthDate || stepData.birthDate || null,
    time: answers?.birthTime || stepData.birthTime || null,
    city: answers?.birthCity || stepData.birthCity || null,
  };

  if (!answers) {
    console.warn(`[Onboarding] Quiz data incomplete for ${cleanedEmail}. Missing answers.`);
    throw new Error('QUIZ_DATA_INCOMPLETE');
  }

  console.log(`[Onboarding] Creating generation job for ${cleanedEmail} using quiz data from result ID: ${latestResult.id}`);

  // Create job with quiz completion data - this will be processed by the queue worker
  const job = await createJob({
    answers,
    birthDetails,
    email: cleanedEmail,
    type: 'ai',
  });

  console.log(`[Onboarding] ✅ Generation job created successfully. Job ID: ${job?.id}`);

  return { jobId: job?.id || null };
}

