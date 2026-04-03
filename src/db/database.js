const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
      secretary_name TEXT DEFAULT NULL,
      secretary_style TEXT DEFAULT 'friendly',
      onboarded INTEGER DEFAULT 0,
      user_notes TEXT DEFAULT NULL,
      alerts_enabled INTEGER DEFAULT 1,
      alert_before_min INTEGER DEFAULT 60,
      alert_before_min2 INTEGER DEFAULT 15,
      alert_repeat_min INTEGER DEFAULT 5,
      alert_alarm_min INTEGER DEFAULT 2,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS secretary_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_group_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      ai_monitor INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS group_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      created_by INTEGER NOT NULL REFERENCES users(id),
      assigned_to INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 3,
      status TEXT DEFAULT 'todo',
      due_date TEXT,
      due_time TEXT,
      completed_at DATETIME,
      tg_message_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conf_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      workspace_id INTEGER REFERENCES workspaces(id),
      is_active INTEGER DEFAULT 1,
      is_locked INTEGER DEFAULT 0,
      max_participants INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conf_members (
      room_id TEXT NOT NULL REFERENCES conf_rooms(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT DEFAULT 'user',
      is_muted_by_admin INTEGER DEFAULT 0,
      is_kicked INTEGER DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS conf_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL REFERENCES conf_rooms(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      reply_to INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meeting_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL REFERENCES conf_rooms(id),
      workspace_id INTEGER REFERENCES workspaces(id),
      group_task_id INTEGER REFERENCES group_tasks(id),
      title TEXT NOT NULL,
      assigned_to_tg_id INTEGER,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      alert_type TEXT NOT NULL,
      fire_at DATETIME NOT NULL,
      confirmed_at DATETIME DEFAULT NULL,
      snoozed_until DATETIME DEFAULT NULL,
      last_sent_at DATETIME DEFAULT NULL,
      sent_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scheduled_meets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      chat_id INTEGER,
      title TEXT NOT NULL,
      scheduled_at DATETIME NOT NULL,
      created_by INTEGER NOT NULL,
      reminded_15 INTEGER DEFAULT 0,
      reminded_start INTEGER DEFAULT 0,
      started INTEGER DEFAULT 0,
      message_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meet_rsvp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meet_id INTEGER NOT NULL REFERENCES scheduled_meets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      tg_name TEXT,
      status TEXT DEFAULT 'yes',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(meet_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_meets_time ON scheduled_meets(scheduled_at, started);
    CREATE INDEX IF NOT EXISTS idx_meet_rsvp_meet ON meet_rsvp(meet_id);
    CREATE INDEX IF NOT EXISTS idx_task_alerts_active ON task_alerts(is_active, fire_at);
    CREATE INDEX IF NOT EXISTS idx_task_alerts_task ON task_alerts(task_id, alert_type);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders(fire_at, sent);
    CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, active);
    CREATE INDEX IF NOT EXISTS idx_group_tasks_ws ON group_tasks(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_group_tasks_assigned ON group_tasks(assigned_to, status);
    CREATE INDEX IF NOT EXISTS idx_conf_messages_room ON conf_messages(room_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conf_members_user ON conf_members(user_id);
  `);

  // Миграции — добавляем новые колонки если их нет
  const migrations = [
    `ALTER TABLE users ADD COLUMN ref_code TEXT`,
    `ALTER TABLE users ADD COLUMN referred_by INTEGER`,
    `ALTER TABLE users ADD COLUMN ref_count INTEGER DEFAULT 0`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ref_code ON users(ref_code)`,
    `ALTER TABLE users ADD COLUMN alerts_enabled INTEGER DEFAULT 1`,
    `ALTER TABLE users ADD COLUMN alert_before_min INTEGER DEFAULT 60`,
    `ALTER TABLE users ADD COLUMN alert_before_min2 INTEGER DEFAULT 15`,
    `ALTER TABLE users ADD COLUMN alert_repeat_min INTEGER DEFAULT 5`,
    `ALTER TABLE users ADD COLUMN alert_alarm_min INTEGER DEFAULT 2`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch {}
  }

  // Генерируем ref_code для пользователей у которых его нет
  const usersWithoutRef = db.prepare('SELECT id, tg_id FROM users WHERE ref_code IS NULL').all();
  const genCode = (id, tgId) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    let n = parseInt(tgId) || id;
    for (let i = 0; i < 8; i++) { code += chars[n % chars.length]; n = Math.floor(n / chars.length) || (n * 31 + i); }
    return code;
  };
  const setRef = db.prepare('UPDATE users SET ref_code = ? WHERE id = ?');
  for (const u of usersWithoutRef) {
    try { setRef.run(genCode(u.id, u.tg_id), u.id); } catch {}
  }

  db.prepare(`SELECT 1`).get();
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

// --- Secretary memory ---
function addMemory(userId, type, content) {
  db.prepare('INSERT INTO secretary_memory (user_id, type, content) VALUES (?, ?, ?)').run(userId, type, content);
}

function getMemories(userId, limit = 50) {
  return db.prepare('SELECT * FROM secretary_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
}

// --- Chat history ---
function addChatMessage(userId, role, content) {
  db.prepare('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)').run(userId, role, content);
  // Оставляем только последние 50 сообщений
  db.prepare('DELETE FROM chat_history WHERE user_id = ? AND id NOT IN (SELECT id FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 50)').run(userId, userId);
}

function getChatHistory(userId, limit = 20) {
  return db.prepare('SELECT * FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit).reverse();
}

// --- Secretary setup ---
function setSecretaryName(userId, name) {
  db.prepare('UPDATE users SET secretary_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, userId);
}

function setSecretaryStyle(userId, style) {
  db.prepare('UPDATE users SET secretary_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(style, userId);
}

function setOnboarded(userId) {
  db.prepare('UPDATE users SET onboarded = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
}

function setUserNotes(userId, notes) {
  db.prepare('UPDATE users SET user_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(notes, userId);
}

// --- Workspace (group) functions ---
function ensureWorkspace(tgGroupId, name, createdByUserId) {
  const existing = db.prepare('SELECT * FROM workspaces WHERE tg_group_id = ?').get(tgGroupId);
  if (existing) return existing;
  const result = db.prepare('INSERT INTO workspaces (tg_group_id, name, created_by) VALUES (?, ?, ?)').run(tgGroupId, name, createdByUserId);
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid);
}

function getWorkspace(tgGroupId) {
  return db.prepare('SELECT * FROM workspaces WHERE tg_group_id = ?').get(tgGroupId);
}

function addWorkspaceMember(workspaceId, userId, role = 'member') {
  db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, userId, role);
}

function getWorkspaceMembers(workspaceId) {
  return db.prepare(`
    SELECT u.*, wm.role FROM workspace_members wm
    JOIN users u ON wm.user_id = u.id
    WHERE wm.workspace_id = ?
  `).all(workspaceId);
}

function getUserWorkspaces(userId) {
  return db.prepare(`
    SELECT w.*, wm.role FROM workspace_members wm
    JOIN workspaces w ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
  `).all(userId);
}

function createGroupTask(workspaceId, createdBy, { title, description, assignedTo, priority, dueDate, dueTime, tgMessageId }) {
  const result = db.prepare(`
    INSERT INTO group_tasks (workspace_id, created_by, assigned_to, title, description, priority, due_date, due_time, tg_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(workspaceId, createdBy, assignedTo || null, title, description || null, priority || 3, dueDate || null, dueTime || null, tgMessageId || null);
  return db.prepare('SELECT * FROM group_tasks WHERE id = ?').get(result.lastInsertRowid);
}

function getGroupTasks(workspaceId, status = null) {
  let sql = `
    SELECT gt.*, u1.tg_first_name as creator_name, u1.tg_username as creator_username,
           u2.tg_first_name as assignee_name, u2.tg_username as assignee_username, u2.tg_id as assignee_tg_id
    FROM group_tasks gt
    JOIN users u1 ON gt.created_by = u1.id
    LEFT JOIN users u2 ON gt.assigned_to = u2.id
    WHERE gt.workspace_id = ?
  `;
  const params = [workspaceId];
  if (status) { sql += ' AND gt.status = ?'; params.push(status); }
  else { sql += " AND gt.status != 'done' AND gt.status != 'cancelled'"; }
  sql += ' ORDER BY gt.priority ASC, gt.created_at ASC';
  return db.prepare(sql).all(...params);
}

function getMyGroupTasks(userId, workspaceId = null) {
  let sql = `
    SELECT gt.*, w.name as workspace_name, w.tg_group_id,
           u1.tg_first_name as creator_name
    FROM group_tasks gt
    JOIN workspaces w ON gt.workspace_id = w.id
    JOIN users u1 ON gt.created_by = u1.id
    WHERE gt.assigned_to = ? AND gt.status NOT IN ('done', 'cancelled')
  `;
  const params = [userId];
  if (workspaceId) { sql += ' AND gt.workspace_id = ?'; params.push(workspaceId); }
  sql += ' ORDER BY gt.due_date ASC NULLS LAST, gt.priority ASC';
  return db.prepare(sql).all(...params);
}

function getGroupTaskById(id) {
  return db.prepare(`
    SELECT gt.*, u1.tg_first_name as creator_name, u1.tg_username as creator_username,
           u2.tg_first_name as assignee_name, u2.tg_username as assignee_username, u2.tg_id as assignee_tg_id
    FROM group_tasks gt
    JOIN users u1 ON gt.created_by = u1.id
    LEFT JOIN users u2 ON gt.assigned_to = u2.id
    WHERE gt.id = ?
  `).get(id);
}

function updateGroupTask(id, fields) {
  const allowed = ['title', 'description', 'assigned_to', 'priority', 'status', 'due_date', 'due_time'];
  const updates = [];
  const values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = ?`); values.push(v); }
  }
  if (updates.length === 0) return;
  if (fields.status === 'done') { updates.push('completed_at = CURRENT_TIMESTAMP'); }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  db.prepare(`UPDATE group_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM group_tasks WHERE id = ?').get(id);
}

function setAiMonitor(workspaceId, enabled) {
  db.prepare('UPDATE workspaces SET ai_monitor = ? WHERE id = ?').run(enabled ? 1 : 0, workspaceId);
}

// --- Conference Room functions ---
function createConfRoom(name, createdByUserId, workspaceId = null) {
  const id = uuidv4().slice(0, 8).toUpperCase();
  const adminCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  db.prepare('INSERT INTO conf_rooms (id, name, created_by, workspace_id, admin_code) VALUES (?, ?, ?, ?, ?)').run(id, name, createdByUserId, workspaceId || null, adminCode);
  db.prepare('INSERT INTO conf_members (room_id, user_id, role) VALUES (?, ?, ?)').run(id, createdByUserId, 'admin');
  return db.prepare('SELECT * FROM conf_rooms WHERE id = ?').get(id);
}

function banIpInRoom(roomId, ip) {
  const room = db.prepare('SELECT banned_ips FROM conf_rooms WHERE id=?').get(roomId);
  if (!room) return;
  var ips = (room.banned_ips || '').split(',').filter(Boolean);
  if (!ips.includes(ip)) ips.push(ip);
  db.prepare('UPDATE conf_rooms SET banned_ips=? WHERE id=?').run(ips.join(','), roomId);
}

function isIpBanned(roomId, ip) {
  const room = db.prepare('SELECT banned_ips FROM conf_rooms WHERE id=?').get(roomId);
  if (!room || !room.banned_ips) return false;
  return room.banned_ips.split(',').includes(ip);
}

function setConfMemberIp(roomId, userId, ip) {
  try { db.prepare('UPDATE conf_members SET ip=? WHERE room_id=? AND user_id=?').run(ip, roomId, userId); } catch(e) {}
}

function getConfRoom(roomId) {
  return db.prepare('SELECT * FROM conf_rooms WHERE id = ?').get(roomId);
}

function getUserConfRooms(userId) {
  return db.prepare(`
    SELECT r.*, cm.role,
      (SELECT COUNT(*) FROM conf_members WHERE room_id = r.id) as member_count
    FROM conf_rooms r
    JOIN conf_members cm ON r.id = cm.room_id
    WHERE cm.user_id = ? AND r.is_active = 1
    ORDER BY r.created_at DESC
  `).all(userId);
}

function deactivateConfRoom(roomId) {
  db.prepare('UPDATE conf_rooms SET is_active = 0 WHERE id = ?').run(roomId);
}

function lockConfRoom(roomId, locked) {
  db.prepare('UPDATE conf_rooms SET is_locked = ? WHERE id = ?').run(locked ? 1 : 0, roomId);
}

function addConfMember(roomId, userId, role = 'user') {
  db.prepare('INSERT OR REPLACE INTO conf_members (room_id, user_id, role) VALUES (?, ?, ?)').run(roomId, userId, role);
}

function getConfMember(roomId, userId) {
  return db.prepare('SELECT * FROM conf_members WHERE room_id = ? AND user_id = ?').get(roomId, userId);
}

function getConfMembers(roomId) {
  return db.prepare(`
    SELECT cm.*, u.tg_id, u.tg_username, u.tg_first_name, u.tg_last_name
    FROM conf_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.room_id = ?
  `).all(roomId);
}

function kickConfMember(roomId, userId) {
  db.prepare('INSERT OR REPLACE INTO conf_members (room_id, user_id, role, is_kicked) VALUES (?, ?, \'user\', 1)').run(roomId, userId);
}

function unkickConfMember(roomId, userId) {
  db.prepare('UPDATE conf_members SET is_kicked = 0 WHERE room_id = ? AND user_id = ?').run(roomId, userId);
}

function setConfMemberRole(roomId, userId, role) {
  db.prepare('UPDATE conf_members SET role = ? WHERE room_id = ? AND user_id = ?').run(role, roomId, userId);
}

function setConfMutedByAdmin(roomId, userId, muted) {
  db.prepare('UPDATE conf_members SET is_muted_by_admin = ? WHERE room_id = ? AND user_id = ?').run(muted ? 1 : 0, roomId, userId);
}

function addConfMessage(roomId, userId, content, type = 'text', replyTo = null) {
  const result = db.prepare('INSERT INTO conf_messages (room_id, user_id, content, type, reply_to) VALUES (?, ?, ?, ?, ?)').run(roomId, userId, content, type, replyTo);
  return db.prepare(`
    SELECT m.*, u.tg_username, u.tg_first_name, u.tg_last_name
    FROM conf_messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);
}

function getConfMessages(roomId, limit = 50) {
  return db.prepare(`
    SELECT m.*, u.tg_username, u.tg_first_name, u.tg_last_name
    FROM conf_messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.room_id = ?
    ORDER BY m.id DESC LIMIT ?
  `).all(roomId, limit).reverse();
}

function deleteConfMessage(messageId) {
  db.prepare('DELETE FROM conf_messages WHERE id = ?').run(messageId);
}

function getUserIdByTgId(tgId) {
  const u = db.prepare('SELECT id FROM users WHERE tg_id = ?').get(tgId);
  return u ? u.id : null;
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

// ============ Task Alerts (escalation system) ============

function getTaskAlertByType(taskId, alertType) {
  return getDb().prepare('SELECT * FROM task_alerts WHERE task_id=? AND alert_type=? AND is_active=1').get(taskId, alertType);
}

function createTaskAlert(taskId, userId, alertType, fireAt) {
  const existing = getTaskAlertByType(taskId, alertType);
  if (existing) return existing;
  const r = getDb().prepare('INSERT INTO task_alerts (task_id,user_id,alert_type,fire_at) VALUES (?,?,?,?)').run(taskId, userId, alertType, fireAt);
  return getDb().prepare('SELECT * FROM task_alerts WHERE id=?').get(r.lastInsertRowid);
}

function markAlertSent(alertId) {
  getDb().prepare("UPDATE task_alerts SET last_sent_at=datetime('now'), sent_count=sent_count+1 WHERE id=?").run(alertId);
}

function confirmAlert(taskId, userId) {
  getDb().prepare("UPDATE task_alerts SET confirmed_at=datetime('now'), is_active=0 WHERE task_id=? AND user_id=? AND confirmed_at IS NULL").run(taskId, userId);
}

function snoozeAlert(alertId, minutes) {
  const until = new Date(Date.now() + minutes * 60000).toISOString();
  getDb().prepare('UPDATE task_alerts SET snoozed_until=? WHERE id=?').run(until, alertId);
}

function deactivateTaskAlerts(taskId) {
  getDb().prepare('UPDATE task_alerts SET is_active=0 WHERE task_id=?').run(taskId);
}

function getTasksWithTimeToday(date) {
  return getDb().prepare(`
    SELECT t.*, u.tg_id, u.timezone,
      u.alerts_enabled, u.alert_before_min, u.alert_before_min2, u.alert_repeat_min, u.alert_alarm_min
    FROM tasks t
    JOIN users u ON t.user_id = u.id
    WHERE t.due_date=? AND t.due_time IS NOT NULL AND t.status NOT IN ('done','cancelled')
      AND (u.alerts_enabled IS NULL OR u.alerts_enabled=1)
      AND u.tg_id IS NOT NULL
  `).all(date);
}

function getActiveAlerts() {
  return getDb().prepare(`
    SELECT a.*, t.title as task_title, t.due_date, t.due_time, t.user_id as task_user_id,
      u.tg_id, u.timezone, u.alert_repeat_min, u.alert_alarm_min
    FROM task_alerts a
    JOIN tasks t ON a.task_id=t.id
    JOIN users u ON a.user_id=u.id
    WHERE a.is_active=1 AND a.confirmed_at IS NULL
      AND t.status NOT IN ('done','cancelled')
  `).all();
}

function isAlertConfirmed(taskId) {
  const r = getDb().prepare('SELECT confirmed_at FROM task_alerts WHERE task_id=? AND confirmed_at IS NOT NULL').get(taskId);
  return !!r;
}

// ============ SCHEDULED MEETS ============

function createScheduledMeet(roomId, chatId, title, scheduledAt, createdBy) {
  return getDb().prepare(`
    INSERT INTO scheduled_meets (room_id, chat_id, title, scheduled_at, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(roomId, chatId, title, scheduledAt, createdBy);
}

function getScheduledMeet(roomId) {
  return getDb().prepare('SELECT * FROM scheduled_meets WHERE room_id=?').get(roomId);
}

function getUpcomingMeets() {
  return getDb().prepare(`
    SELECT sm.*, cr.is_active as room_active
    FROM scheduled_meets sm
    JOIN conf_rooms cr ON sm.room_id=cr.id
    WHERE sm.started=0
      AND datetime(sm.scheduled_at) >= datetime('now', '-30 minutes')
      AND datetime(sm.scheduled_at) <= datetime('now', '+24 hours')
  `).all();
}

function markMeetReminded(meetId, field) {
  if (field === '15min') {
    getDb().prepare("UPDATE scheduled_meets SET reminded_15=1 WHERE id=?").run(meetId);
  } else if (field === 'start') {
    getDb().prepare("UPDATE scheduled_meets SET reminded_start=1 WHERE id=?").run(meetId);
  } else if (field === 'started') {
    getDb().prepare("UPDATE scheduled_meets SET started=1 WHERE id=?").run(meetId);
  }
}

function addMeetRsvp(meetId, userId, tgName, status) {
  getDb().prepare(`
    INSERT INTO meet_rsvp (meet_id, user_id, tg_name, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(meet_id, user_id) DO UPDATE SET status=excluded.status, tg_name=excluded.tg_name
  `).run(meetId, userId, tgName, status);
}

function getMeetRsvps(meetId) {
  return getDb().prepare('SELECT * FROM meet_rsvp WHERE meet_id=?').all(meetId);
}

function getMeetRsvpCount(meetId) {
  const r = getDb().prepare("SELECT COUNT(*) as cnt FROM meet_rsvp WHERE meet_id=? AND status='yes'").get(meetId);
  return r?.cnt || 0;
}

function getWorkspaceMemberRole(workspaceId, userId) {
  const m = db.prepare('SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?').get(workspaceId, userId);
  return m ? m.role : null;
}

function setWorkspaceMemberRole(workspaceId, userId, role) {
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT(workspace_id, user_id) DO UPDATE SET role=excluded.role').run(workspaceId, userId, role);
}

function getWorkspaceAdmins(workspaceId) {
  return db.prepare("SELECT u.tg_id, u.tg_username, u.tg_first_name, wm.role FROM workspace_members wm JOIN users u ON wm.user_id=u.id WHERE wm.workspace_id=? AND wm.role IN ('owner','admin') ORDER BY CASE wm.role WHEN 'owner' THEN 0 ELSE 1 END").all(workspaceId);
}


module.exports = {
  getDb, ensureUser, getUserByTgId, updateUserSettings, getUserIdByTgId,
  getCategories, createCategory,
  createTask, getTasksByDate, getTasksByStatus, getOverdueTasks, getAllActiveTasks, getSubtasks, updateTask, deleteTask, getTaskById, getTasksForApi,
  createReminder, getPendingReminders, markReminderSent,
  createHabit, getUserHabits, logHabit, getHabitLog,
  getDailyStats, getWeeklyStats,
  addMemory, getMemories,
  addChatMessage, getChatHistory,
  setSecretaryName, setSecretaryStyle, setOnboarded, setUserNotes,
  ensureWorkspace, getWorkspace, addWorkspaceMember, getWorkspaceMembers, getUserWorkspaces,
  createGroupTask, getGroupTasks, getMyGroupTasks, getGroupTaskById, updateGroupTask, setAiMonitor,
  createConfRoom, getConfRoom, getUserConfRooms, deactivateConfRoom, lockConfRoom,
  addConfMember, getConfMember, getConfMembers, kickConfMember, unkickConfMember, setConfMemberRole, setConfMutedByAdmin,
  addConfMessage, getConfMessages, deleteConfMessage,
  createTaskAlert, getTaskAlertByType, markAlertSent, confirmAlert, snoozeAlert, deactivateTaskAlerts,
  getTasksWithTimeToday, getActiveAlerts, isAlertConfirmed,
  createScheduledMeet, getScheduledMeet, getUpcomingMeets, markMeetReminded,
  addMeetRsvp, getMeetRsvps, getMeetRsvpCount,
  banIpInRoom, isIpBanned, setConfMemberIp,
  getWorkspaceMemberRole, setWorkspaceMemberRole, getWorkspaceAdmins,
};
