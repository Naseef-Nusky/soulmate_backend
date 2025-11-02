import { calculateAstrology } from './astrology.js';
import { generatePencilSketchFromAnswers } from './openai.js';
import { pickNextJob, completeJob, failJob, saveResult } from './db.js';
import { sendTwinFlameEmail } from './email.js';

let timer;

export function startQueue() {
  const intervalMs = Number(process.env.JOB_INTERVAL_MS || 300000);
  if (timer) clearInterval(timer);
  timer = setInterval(runOnce, intervalMs);
  setTimeout(runOnce, 5000);
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
    await completeJob(job.id, { resultId: stored?.id || null });
    if (job.email) {
      // Generate image URL from result ID if image data was stored
      const imageUrl = stored?.id && image?.imageData
        ? `${process.env.APP_URL || 'http://localhost:4000'}/api/images/${stored.id}`
        : (image?.url || '');
      sendTwinFlameEmail({ to: job.email, imageUrl })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[Email] TwinFlame send failed (queue):', err?.response?.body || err?.message || err);
        });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Queue] Job failed', err);
  }
}



