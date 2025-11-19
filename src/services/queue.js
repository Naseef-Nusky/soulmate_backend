import { calculateAstrology } from './astrology.js';
import { generatePencilSketchFromAnswers } from './openai.js';
import { pickNextJob, completeJob, failJob, saveResult, getPendingSketchReleaseResults, updateResult } from './db.js';
import { sendTwinFlameEmail } from './email.js';

let timer;

export function startQueue() {
  const intervalMs = Number(process.env.JOB_INTERVAL_MS || 300000);
  if (timer) clearInterval(timer);
  timer = setInterval(tick, intervalMs);
  setTimeout(tick, 5000);
}

async function tick() {
  await runOnce();
  await runReleaseNotifications();
}

async function runOnce() {
  try {
    const job = await pickNextJob();
    if (!job) return;
    const astrology = calculateAstrology(job.birth_details || {});
    const image = await generatePencilSketchFromAnswers(job.answers || {}, astrology);
    const stored = await saveResult({
      report: '',
      imageUrl: image?.url || null,
      imageData: image?.imageData || null,
      astrology,
      answers: job.answers || {},
      email: job.email || null,
    });

    const releaseDelayMinutes = Number(process.env.SKETCH_RELEASE_DELAY_MINUTES || 600);
    const promisedWindowHours = Number(process.env.SKETCH_PROMISED_HOURS || 24);
    const sketchGeneratedAt = new Date();
    const sketchReleaseAt = new Date(sketchGeneratedAt.getTime() + releaseDelayMinutes * 60 * 1000);

    if (stored?.id) {
      const baseStepData = {
        answers: job.answers || {},
        birthDetails: job.birth_details || {},
        email: (job.email || '').trim().toLowerCase(),
        jobId: job.id,
        sketchGenerated: true,
        sketchGeneratedAt: sketchGeneratedAt.toISOString(),
        sketchReleaseAt: sketchReleaseAt.toISOString(),
        sketchReleaseDelayMinutes: releaseDelayMinutes,
        promisedWindowHours,
        twinFlameEmailSent: false,
        twinFlameEmailScheduled: true,
      };

      await updateResult(stored.id, {
        stepData: baseStepData,
        imageUrl: stored.image_url || null,
        imageData: stored.image_data || null,
      });
    }

    await completeJob(job.id, { resultId: stored?.id || null });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Queue] Job failed', err);
  }
}

async function runReleaseNotifications() {
  try {
    const pending = await getPendingSketchReleaseResults(5);
    if (!pending || pending.length === 0) return;
    const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
    const dashboardUrl = `${appUrl}/dashboard?tab=insight&showSoulmate=true`;

    for (const result of pending) {
      const stepData = result.step_data || {};
      const email = (result.email || stepData.email || '').trim().toLowerCase();
      if (!email) continue;
      try {
        await sendTwinFlameEmail({
          to: email,
          imageUrl: result.image_url || null,
          ctaUrl: dashboardUrl,
        });
        const updatedStepData = {
          ...stepData,
          twinFlameEmailSent: true,
          twinFlameEmailSentAt: new Date().toISOString(),
        };
        await updateResult(result.id, { stepData: updatedStepData });
        console.log(`[Queue] ✅ Twin Flame email sent after release for ${email}`);
      } catch (err) {
        console.error('[Queue] ❌ Failed to send delayed Twin Flame email:', err?.message || err);
      }
    }
  } catch (error) {
    console.error('[Queue] Failed to process pending release notifications:', error?.message || error);
  }
}



