const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => {
    const unique = uuidv4() + path.extname(file.originalname);
    cb(null, unique);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', (req, res) => {
  const { status, technician_id, customer_id, date } = req.query;
  let query = `SELECT j.*, c.name as customer_name, u.name as technician_name
               FROM jobs j
               LEFT JOIN customers c ON j.customer_id = c.id
               LEFT JOIN users u ON j.technician_id = u.id
               WHERE 1=1`;
  const params = [];
  if (status) { query += ' AND j.status = ?'; params.push(status); }
  if (technician_id) { query += ' AND j.technician_id = ?'; params.push(technician_id); }
  if (customer_id) { query += ' AND j.customer_id = ?'; params.push(customer_id); }
  if (date) { query += ' AND j.scheduled_date = ?'; params.push(date); }
  query += ' ORDER BY j.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/:id', (req, res) => {
  const job = db.prepare(`
    SELECT j.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
           u.name as technician_name
    FROM jobs j
    LEFT JOIN customers c ON j.customer_id = c.id
    LEFT JOIN users u ON j.technician_id = u.id
    WHERE j.id = ?
  `).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const photos = db.prepare('SELECT * FROM job_photos WHERE job_id = ?').all(req.params.id);
  res.json({ ...job, photos });
});

router.post('/', (req, res) => {
  const { title, description, customer_id, technician_id, status, priority, job_type, scheduled_date, scheduled_time, address, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO jobs (id, title, description, customer_id, technician_id, status, priority, job_type, scheduled_date, scheduled_time, address, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, title, description || null, customer_id || null, technician_id || null,
         status || 'pending', priority || 'normal', job_type || null,
         scheduled_date || null, scheduled_time || null, address || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Job not found' });
  const { title, description, customer_id, technician_id, status, priority, job_type, scheduled_date, scheduled_time, completed_date, address, notes } = req.body;
  db.prepare(`UPDATE jobs SET title=?, description=?, customer_id=?, technician_id=?, status=?, priority=?,
              job_type=?, scheduled_date=?, scheduled_time=?, completed_date=?, address=?, notes=? WHERE id=?`)
    .run(title, description || null, customer_id || null, technician_id || null,
         status, priority, job_type || null, scheduled_date || null, scheduled_time || null,
         completed_date || null, address || null, notes || null, req.params.id);
  res.json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Job not found' });
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/:id/photos', upload.array('photos', 10), (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const inserted = req.files.map(file => {
    const photoId = uuidv4();
    db.prepare('INSERT INTO job_photos (id, job_id, filename, original_name) VALUES (?, ?, ?, ?)')
      .run(photoId, req.params.id, file.filename, file.originalname);
    return { id: photoId, filename: file.filename, original_name: file.originalname };
  });
  res.json(inserted);
});

module.exports = router;
