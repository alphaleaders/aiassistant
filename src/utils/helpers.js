const { DateTime } = require('luxon');

// Приоритеты
const PRIORITIES = {
  1: { label: '🔴 Срочно', short: '🔴' },
  2: { label: '🟠 Высокий', short: '🟠' },
  3: { label: '🟡 Средний', short: '🟡' },
  4: { label: '🟢 Низкий', short: '🟢' },
};

const STATUS_EMOJI = {
  'todo': '⬜',
  'in_progress': '🔄',
  'done': '✅',
  'cancelled': '❌',
};

// Парсинг даты из текста (ru)
function parseDate(text, timezone = 'Europe/Moscow') {
  const now = DateTime.now().setZone(timezone);
  const lower = text.toLowerCase().trim();

  if (lower === 'сегодня' || lower === 'today') return now.toFormat('yyyy-MM-dd');
  if (lower === 'завтра' || lower === 'tomorrow') return now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
  if (lower === 'послезавтра') return now.plus({ days: 2 }).toFormat('yyyy-MM-dd');

  // Дни недели
  const days = { 'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4, 'пятница': 5, 'суббота': 6, 'воскресенье': 7 };
  for (const [name, dow] of Object.entries(days)) {
    if (lower.includes(name)) {
      let target = now.set({ weekday: dow });
      if (target <= now) target = target.plus({ weeks: 1 });
      return target.toFormat('yyyy-MM-dd');
    }
  }

  // DD.MM или DD.MM.YYYY
  const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]);
    let year = dateMatch[3] ? parseInt(dateMatch[3]) : now.year;
    if (year < 100) year += 2000;
    return DateTime.fromObject({ year, month, day }, { zone: timezone }).toFormat('yyyy-MM-dd');
  }

  // YYYY-MM-DD
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  return null;
}

// Парсинг времени из текста
function parseTime(text) {
  const timeMatch = text.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1]);
    const m = parseInt(timeMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

// Форматирование задачи для отображения в боте
function formatTask(task, showDate = false) {
  const status = STATUS_EMOJI[task.status] || '⬜';
  const priority = PRIORITIES[task.priority]?.short || '';
  const cat = task.category_emoji ? `${task.category_emoji} ` : '';
  let line = `${status} ${priority} ${cat}<b>${escapeHtml(task.title)}</b>`;
  if (showDate && task.due_date) line += ` 📅 ${formatDateRu(task.due_date)}`;
  if (task.due_time) line += ` ⏰ ${task.due_time}`;
  return line;
}

function formatDateRu(dateStr) {
  if (!dateStr) return '';
  const dt = DateTime.fromISO(dateStr);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${dt.day} ${months[dt.month - 1]}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function todayStr(timezone = 'Europe/Moscow') {
  return DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');
}

function tomorrowStr(timezone = 'Europe/Moscow') {
  return DateTime.now().setZone(timezone).plus({ days: 1 }).toFormat('yyyy-MM-dd');
}

// Конвертация локального времени в UTC для напоминаний
function localToUtc(date, time, timezone) {
  if (!date || !time) return null;
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  return dt.toUTC().toISO();
}

// Система ошибок
const ERRORS = {
  TASK_NOT_FOUND: { code: 'TASK_NOT_FOUND', message: '❌ Задача не найдена', hint: 'Проверьте ID задачи или список задач /today' },
  USER_NOT_FOUND: { code: 'USER_NOT_FOUND', message: '❌ Пользователь не найден', hint: 'Нажмите /start для регистрации' },
  INVALID_DATE: { code: 'INVALID_DATE', message: '❌ Неверный формат даты', hint: 'Используйте: завтра, 25.03, 2026-03-25' },
  INVALID_TIME: { code: 'INVALID_TIME', message: '❌ Неверный формат времени', hint: 'Используйте: 14:30, 9.00' },
  EMPTY_TITLE: { code: 'EMPTY_TITLE', message: '❌ Название задачи пустое', hint: 'Введите текст задачи после команды' },
  CATEGORY_NOT_FOUND: { code: 'CATEGORY_NOT_FOUND', message: '❌ Категория не найдена', hint: 'Проверьте список категорий' },
  DB_ERROR: { code: 'DB_ERROR', message: '❌ Ошибка базы данных', hint: 'Попробуйте позже или сообщите администратору' },
  HABIT_NOT_FOUND: { code: 'HABIT_NOT_FOUND', message: '❌ Привычка не найдена', hint: 'Проверьте список привычек /habits' },
  PERMISSION_DENIED: { code: 'PERMISSION_DENIED', message: '❌ Нет доступа', hint: 'Эта задача принадлежит другому пользователю' },
  RATE_LIMIT: { code: 'RATE_LIMIT', message: '⏳ Слишком много запросов', hint: 'Подождите немного' },
  WEBAPP_AUTH_FAILED: { code: 'WEBAPP_AUTH_FAILED', message: '❌ Ошибка авторизации WebApp', hint: 'Откройте приложение из Telegram' },
};

function errorResponse(errorKey) {
  const err = ERRORS[errorKey] || { code: 'UNKNOWN', message: '❌ Неизвестная ошибка', hint: '' };
  return `${err.message}\n💡 ${err.hint}`;
}

module.exports = {
  PRIORITIES, STATUS_EMOJI, ERRORS,
  parseDate, parseTime, formatTask, formatDateRu, escapeHtml,
  todayStr, tomorrowStr, localToUtc, errorResponse
};
