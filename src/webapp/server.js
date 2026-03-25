const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('../db/database');

function createServer(botToken) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // ============ Telegram WebApp Auth ============
  function validateTelegramWebApp(initData) {
    if (!initData) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) return null;

    // Проверяем свежесть (24 часа)
    const authDate = parseInt(params.get('auth_date') || '0');
    if (Date.now() / 1000 - authDate > 86400) return null;

    try {
      const userStr = params.get('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  // Middleware авторизации
  function authMiddleware(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    const tgUser = validateTelegramWebApp(initData);

    if (!tgUser) {
      // Для разработки — допускаем без авторизации если есть tg_id в query
      if (process.env.NODE_ENV === 'development' && req.query.tg_id) {
        const user = db.getUserByTgId(parseInt(req.query.tg_id));
        if (user) { req.user = user; return next(); }
      }
      return res.status(401).json({ error: 'Unauthorized', code: 'WEBAPP_AUTH_FAILED' });
    }

    const user = db.ensureUser(tgUser);
    req.user = user;
    next();
  }

  // ============ API Routes ============

  // Задачи
  app.get('/api/tasks', authMiddleware, (req, res) => {
    try {
      const tasks = db.getTasksForApi(req.user.id, req.query);
      res.json({ tasks });
    } catch (e) {
      console.error('[API] GET /tasks error:', e.message);
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  app.post('/api/tasks', authMiddleware, (req, res) => {
    try {
      const { title, description, priority, category_id, due_date, due_time } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'EMPTY_TITLE' });
      const task = db.createTask(req.user.id, { title: title.trim(), description, priority, category_id, due_date, due_time });
      res.json({ task });
    } catch (e) {
      console.error('[API] POST /tasks error:', e.message);
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  app.put('/api/tasks/:id', authMiddleware, (req, res) => {
    try {
      const task = db.getTaskById(parseInt(req.params.id));
      if (!task || task.user_id !== req.user.id) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
      const updated = db.updateTask(task.id, req.body);
      res.json({ task: updated });
    } catch (e) {
      console.error('[API] PUT /tasks error:', e.message);
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
    try {
      const task = db.getTaskById(parseInt(req.params.id));
      if (!task || task.user_id !== req.user.id) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
      db.deleteTask(task.id);
      res.json({ ok: true });
    } catch (e) {
      console.error('[API] DELETE /tasks error:', e.message);
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  // Категории
  app.get('/api/categories', authMiddleware, (req, res) => {
    try {
      const categories = db.getCategories(req.user.id);
      res.json({ categories });
    } catch (e) {
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  app.post('/api/categories', authMiddleware, (req, res) => {
    try {
      const { name, emoji } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'EMPTY_TITLE' });
      const cat = db.createCategory(req.user.id, name.trim(), emoji);
      res.json({ category: cat });
    } catch (e) {
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  // Привычки
  app.get('/api/habits', authMiddleware, (req, res) => {
    try {
      const habits = db.getUserHabits(req.user.id);
      res.json({ habits });
    } catch (e) {
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  app.post('/api/habits', authMiddleware, (req, res) => {
    try {
      const { title, emoji, frequency } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'EMPTY_TITLE' });
      const habit = db.createHabit(req.user.id, title.trim(), emoji, frequency);
      res.json({ habit });
    } catch (e) {
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  app.post('/api/habits/:id/log', authMiddleware, (req, res) => {
    try {
      const { date } = req.body;
      db.logHabit(parseInt(req.params.id), date || new Date().toISOString().split('T')[0]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  // Статистика
  app.get('/api/stats', authMiddleware, (req, res) => {
    try {
      const { date, start_date, end_date } = req.query;
      if (start_date && end_date) {
        const stats = db.getWeeklyStats(req.user.id, start_date, end_date);
        return res.json({ stats });
      }
      const stat = db.getDailyStats(req.user.id, date || new Date().toISOString().split('T')[0]);
      res.json({ stat: stat || { tasks_created: 0, tasks_completed: 0, tasks_overdue: 0 } });
    } catch (e) {
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  // Пользователь
  app.get('/api/user', authMiddleware, (req, res) => {
    res.json({ user: req.user });
  });

  app.put('/api/user/settings', authMiddleware, (req, res) => {
    try {
      db.updateUserSettings(req.user.id, req.body);
      const user = db.getUserByTgId(req.user.tg_id);
      res.json({ user });
    } catch (e) {
      res.status(500).json({ error: 'DB_ERROR' });
    }
  });

  // Главная страница
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

module.exports = { createServer };
