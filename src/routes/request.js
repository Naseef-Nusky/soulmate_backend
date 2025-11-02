import { Router } from 'express';
import { createJob, getJob, getResultById } from '../services/db.js';
import { validateGeneratePayload } from '../utils/validators.js';

const router = Router();

router.post('/', async (req, res) => {
  const { value, error } = validateGeneratePayload(req.body);
  if (error) return res.status(400).json({ error });
  const job = await createJob({ answers: value.answers, birthDetails: value.birthDetails, email: value.email || null });
  return res.json({ jobId: job?.id, etaMinutes: Number(process.env.ETA_MINUTES || 60) });
});

router.get('/status/:id', async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  return res.json({ id: job.id, status: job.status, resultId: job.result_id || null });
});

router.get('/result/:id', async (req, res) => {
  const result = await getResultById(req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  return res.json({
    id: result.id,
    createdAt: result.created_at,
    report: result.report,
    imageUrl: result.image_url,
    astrology: result.astrology,
    answers: result.answers,
    email: result.email,
  });
});

export default router;


