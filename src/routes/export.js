import { Router } from 'express';
import { getAllResults, getResultsByEmail, getResultsByDateRange } from '../services/db.js';

const router = Router();

// Get all results as JSON
router.get('/results', async (req, res) => {
  try {
    const { email, startDate, endDate } = req.query;
    
    let results;
    
    if (email) {
      // Filter by email
      results = await getResultsByEmail(email);
    } else if (startDate || endDate) {
      // Filter by date range
      results = await getResultsByDateRange(startDate, endDate);
    } else {
      // Get all results
      results = await getAllResults();
    }
    
    if (!results) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    // Format results as clean JSON
    const formatted = results.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      report: row.report,
      imageUrl: row.image_url,
      astrology: row.astrology,
      answers: row.answers,
      email: row.email,
      stepData: row.step_data, // Include all step data as JSON
    }));
    
    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Export] Error:', error);
    res.status(500).json({ error: 'Failed to export results' });
  }
});

// Download results as JSON file
router.get('/results/download', async (req, res) => {
  try {
    const { email, startDate, endDate } = req.query;
    
    let results;
    
    if (email) {
      results = await getResultsByEmail(email);
    } else if (startDate || endDate) {
      results = await getResultsByDateRange(startDate, endDate);
    } else {
      results = await getAllResults();
    }
    
    if (!results) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const formatted = results.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      report: row.report,
      imageUrl: row.image_url,
      astrology: row.astrology,
      answers: row.answers,
      email: row.email,
      stepData: row.step_data, // Include all step data as JSON
    }));
    
    const filename = `soulmate-results-${new Date().toISOString().split('T')[0]}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(formatted);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Export] Download error:', error);
    res.status(500).json({ error: 'Failed to export results' });
  }
});

export default router;

