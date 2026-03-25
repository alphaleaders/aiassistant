const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'planner.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER UNIQUE NOT NULL,
      tg_username TEXT,
      tg_first_name TEXT,
      tg_last_name TEXT,
      timezone TEXT DEFAULT 'Europe/Moscow',
      language TEXT DEFAULT 'ru',
      morning_digest TEXT DEFAULT '08:00',
      evening_review TEXT DEFAULT '21:00',
      dnd_start TEXT DEFAULT '23:00',
      dnd_end TEXT DEFAULT '07:00',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '📋',
      color TEXT DEFAULT '#4A90D9',
      sort_order INTEGER DEFAULT 0,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      category_id INTEGER REFERENCES categories(id),
      parent_task_id INTEGER REFERENCES tasks(id),
      title TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 3,
      status TEXT DEFAULT 'todo',
      due_date TEXT,
      due_time TEXT,
      completed_at DATETIME,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      rule_type TEXT NOT NULL,
      rule_data TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      last_generated TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      fire_at DATETIME NOT NULL,
      type TEXT DEFAULT 'before',
      offset_minutes INTEGER DEFAULT 15,
      sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      emoji TEXT DEFAULT '✅',
      frequency TEXT DEFAULT 'daily',
      frequency_data TEXT,
      current_streak INTEGER DEFAULT 0,
      best_streak INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS habit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL REFERENCES habits(id),
      date TEXT NOT NULL,
      completed INTEGER DEFAULT 1,
      UNIQUE(habit_id, date)
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      tasks_created INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      tasks_overdue INTEGER DEFAULT 0,
      UNIQUE(user_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders(fire_at, sent);
    CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, active);
  `);

  // Создаём дефолтные категории для новых пользователей (функция)
  db.prepare(`SELECT 1`).get(); // Проверяем что БД работает
}

// --- User functions ---
function ensureUser(tgUser) {
  const existing = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgUser.id);
  if (existing) {
    db.prepare(`UPDATE users SET tg_username = ?, tg_first_name = ?, tg_last_name = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`)
      .run(tgUser.username || null, tgUser.first_name || null, tgUser.last_name || null, tgUser.id);
    return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgUser.id);
  }
  db.prepare(`INSERT INTO users (tg_id, tg_username, tg_first_name, tg_last_name) VALUES (?, ?, ?, ?)`)
    .run(tgUser.id, tgUser.username || null, tgUser.first_name || null, tgUser.last_name || null);
  const user = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgUser.id);
  // Создаём дефолтные категории
  const defaultCats = [
    { name: 'Работа', emoji: '💼' },
    { name: 'Личное', emoji: '🏠' },
    { name: 'Здоровье', emoji: '💪' },
    { name: 'Учёба', emoji: '📚' },
    { name: 'Покупки', emoji: '🛒' },
  ];
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (user_id, name, emoji, sort_order) VALUES (?, ?, ?, ?)');
  defaultCats.forEach((c, i) => insertCat.run(user.id, c.name, c.emoji, i));
  return user;
}

function getUserByTgId(tgId) {
  return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId);
}

function updateUserSettings(userId, settings) {
  const allowed = ['timezone', 'language', 'morning_digest', 'evening_review', 'dnd_start', 'dnd_end'];
  const updates = [];
  const values = [];
  for (const [key, val] of Object.entries(settings)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (updates.length === 0) return;
  values.push(userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
}

// --- Category functions ---
function getCategories(userId) {
  return db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order').all(userId);
}

function createCategory(userId, name, emoji) {
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM categories WHERE user_id = ?').get(userId);
  db.prepare('INSERT INTO categories (user_id, name, emoji, sort_order) VALUES (?, ?, ?, ?)').run(userId, name, emoji || '📋', (maxOrder?.m || 0) + 1);
  return db.prepare('SELECT * FROM categories WHERE user_id = ? AND name = ?').get(userId, name);
}

// --- Task functions ---
function createTask(userId, { title, description, priority, category_id, due_date, due_time, parent_task_id }) {
  const result = db.prepare(`
    INSERT INTO tasks (user_id, title, description, priority, category_id, due_date, due_time, parent_task_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, title, description || null, priority || 3, category_id || null, due_date || null, due_time || null, parent_task_id || null);
  updateDailyStats(userId, 'tasks_created');
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
}

function getTasksByDate(userId, date) {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.emoji as category_emoji
    FROM tasks t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.due_date = ? AND t.parent_task_id IS NULL
    ORDER BY t.priority ASC, t.sort_order ASC
  `).all(userId, date);
}

function getTasksByStatus(userId, status) {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.emoji as category_emoji
    FROM tasks t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.status = ? AND t.parent_task_id IS NULL
    ORDER BY t.due_date ASC, t.priority ASC
  `).all(userId, status);
}

function getOverdueTasks(userId, today) {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.emoji as category_emoji
    FROM tasks t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.status = 'todo' AND t.due_date < ? AND t.due_date IS NOT NULL
    ORDER BY t.due_date ASC, t.priority ASC
  `).all(userId, today);
}

function getAllActiveTasks(userId) {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.emoji as category_emoji
    FROM tasks t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.status IN ('todo', 'in_progress') AND t.parent_task_id IS NULL
    ORDER BY t.due_date ASC NULLS LAST, t.priority ASC
  `).all(userId);
}

function getSubtasks(taskId) {
  return db.prepare('SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY sort_order').all(taskId);
}

function updateTask(taskId, updates) {
  const allowed = ['title', 'description', 'priority', 'status', 'due_date', 'due_time', 'category_id', 'sort_order'];
  const parts = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      parts.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (updates.status === 'done') {
    parts.push('completed_at = CURRENT_TIMESTAMP');
    // Обновляем статистику
    const task = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(taskId);
    if (task) updateDailyStats(task.user_id, 'tasks_completed');
  }
  parts.push('updated_at = CURRENT_TIMESTAMP');
  values.push(taskId);
  db.prepare(`UPDATE tasks SET ${parts.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
}

function deleteTask(taskId) {
  db.prepare('DELETE FROM reminders WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM tasks WHERE parent_task_id = ?').run(taskId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}

function getTaskById(taskId) {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.emoji as category_emoji
    FROM tasks t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?
  `).get(taskId);
}

// --- Reminder functions ---
function createReminder(taskId, userId, fireAt, offsetMinutes) {
  db.prepare('INSERT INTO reminders (task_id, user_id, fire_at, offset_minutes) VALUES (?, ?, ?, ?)').run(taskId, userId, fireAt, offsetMinutes || 15);
}

function getPendingReminders(now) {
  return db.prepare(`
    SELECT r.*, t.title as task_title, t.due_date, t.due_time, u.tg_id
    FROM reminders r
    JOIN tasks t ON r.task_id = t.id
    JOIN users u ON r.user_id = u.id
    WHERE r.fire_at <= ? AND r.sent = 0 AND t.status != 'done'
  `).all(now);
}

function markReminderSent(reminderId) {
  db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').run(reminderId);
}

// --- Habit functions ---
function createHabit(userId, title, emoji, frequency) {
  const result = db.prepare('INSERT INTO habits (user_id, title, emoji, frequency) VALUES (?, ?, ?, ?)').run(userId, title, emoji || '✅', frequency || 'daily');
  return db.prepare('SELECT * FROM habits WHERE id = ?').get(result.lastInsertRowid);
}

function getUserHabits(userId) {
  return db.prepare('SELECT * FROM habits WHERE user_id = ? AND active = 1 ORDER BY created_at').all(userId);
}

function logHabit(habitId, date) {
  db.prepare('INSERT OR REPLACE INTO habit_log (habit_id, date, completed) VALUES (?, ?, 1)').run(habitId, date);
  // Обновляем стрик
  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(habitId);
  if (habit) {
    const streak = calculateStreak(habitId);
    db.prepare('UPDATE habits SET current_streak = ?, best_streak = MAX(best_streak, ?) WHERE id = ?').run(streak, streak, habitId);
  }
}

function calculateStreak(habitId) {
  const logs = db.prepare('SELECT date FROM habit_log WHERE habit_id = ? AND completed = 1 ORDER BY date DESC').all(habitId);
  if (logs.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < logs.length; i++) {
    const prev = new Date(logs[i - 1].date);
    const curr = new Date(logs[i].date);
    const diff = (prev - curr) / (1000 * 60 * 60 * 24);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function getHabitLog(habitId, startDate, endDate) {
  return db.prepare('SELECT * FROM habit_log WHERE habit_id = ? AND date BETWEEN ? AND ? ORDER BY date').all(habitId, startDate, endDate);
}

// --- Stats ---
function updateDailyStats(userId, field) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`INSERT INTO daily_stats (user_id, date, ${field}) VALUES (?, ?, 1) ON CONFLICT(user_id, date) DO UPDATE SET ${field} = ${field} + 1`).run(userId, today);
}

function getDailyStats(userId, date) {
  return db.prepare('SELECT * FROM daily_stats WHERE user_id = ? AND date = ?').get(userId, date);
}

function getWeeklyStats(userId, startDate, endDate) {
  return db.prepare('SELECT * FROM daily_stats WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date').all(userId, startDate, endDate);
}

// --- Для API (webapp) ---
function getTasksForApi(userId, { date, status, category_id, search }) {
  let sql = `SELECT t.*, c.name as category_name, c.emoji as category_emoji FROM tasks t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = ? AND t.parent_task_id IS NULL`;
  const params = [userId];
  if (date) { sql += ' AND t.due_date = ?'; params.push(date); }
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
  if (search) { sql += ' AND t.title LIKE ?'; params.push(`%${search}%`); }
  sql += ' ORDER BY t.due_date ASC NULLS LAST, t.priority ASC';
  return db.prepare(sql).all(...params);
}

module.exports = {
  getDb, ensureUser, getUserByTgId, updateUserSettings,
  getCategories, createCategory,
  createTask, getTasksByDate, getTasksByStatus, getOverdueTasks, getAllActiveTasks, getSubtasks, updateTask, deleteTask, getTaskById, getTasksForApi,
  createReminder, getPendingReminders, markReminderSent,
  createHabit, getUserHabits, logHabit, getHabitLog,
  getDailyStats, getWeeklyStats
};
