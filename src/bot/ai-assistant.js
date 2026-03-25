const https = require('https');
const db = require('../db/database');
const { todayStr, tomorrowStr, formatTask, escapeHtml, parseDate, parseTime } = require('../utils/helpers');

const GROQ_API_URL = 'api.groq.com';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Вызов Groq API
async function callGroq(messages, groqKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const options = {
      hostname: GROQ_API_URL,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.choices?.[0]?.message?.content || 'Нет ответа');
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// Построить контекст пользователя для AI
function buildUserContext(user) {
  const today = todayStr(user.timezone);
  const tomorrow = tomorrowStr(user.timezone);

  const todayTasks = db.getTasksByDate(user.id, today);
  const tomorrowTasks = db.getTasksByDate(user.id, tomorrow);
  const overdue = db.getOverdueTasks(user.id, today);
  const allActive = db.getAllActiveTasks(user.id);
  const habits = db.getUserHabits(user.id);
  const categories = db.getCategories(user.id);

  let context = `Сегодня: ${today}\n`;
  context += `Часовой пояс: ${user.timezone}\n\n`;

  if (overdue.length > 0) {
    context += `⚠️ Просроченные задачи (${overdue.length}):\n`;
    overdue.forEach(t => { context += `- [#${t.id}] ${t.title} (на ${t.due_date})\n`; });
    context += '\n';
  }

  context += `📅 Задачи на сегодня (${todayTasks.length}):\n`;
  todayTasks.forEach(t => {
    context += `- [#${t.id}] ${t.title} (статус: ${t.status}, приоритет: ${t.priority}${t.due_time ? ', время: ' + t.due_time : ''})\n`;
  });

  context += `\n📅 Задачи на завтра (${tomorrowTasks.length}):\n`;
  tomorrowTasks.forEach(t => {
    context += `- [#${t.id}] ${t.title} (статус: ${t.status})\n`;
  });

  context += `\n📋 Все активные задачи (${allActive.length}):\n`;
  allActive.slice(0, 20).forEach(t => {
    context += `- [#${t.id}] ${t.title} (дата: ${t.due_date || 'не указана'}, статус: ${t.status})\n`;
  });

  if (habits.length > 0) {
    context += `\n📊 Привычки:\n`;
    habits.forEach(h => { context += `- ${h.title} (стрик: ${h.current_streak} дн.)\n`; });
  }

  context += `\n📁 Категории: ${categories.map(c => c.emoji + ' ' + c.name).join(', ')}\n`;

  return context;
}

const SYSTEM_PROMPT = `Ты — Alpha Planner, персональный AI-секретарь и помощник по планированию дел. Ты помогаешь пользователю:

1. Планировать день и неделю
2. Приоритизировать задачи
3. Давать советы по тайм-менеджменту
4. Напоминать о важных делах
5. Помогать разбивать большие задачи на подзадачи
6. Мотивировать и поддерживать

Стиль общения: дружелюбный, но профессиональный. Отвечай кратко и по делу. Используй эмодзи для наглядности.

Если пользователь просит создать задачу, ответь в формате:
[СОЗДАТЬ_ЗАДАЧУ]
title: название задачи
date: YYYY-MM-DD (или "сегодня", "завтра")
time: HH:MM (если указано)
priority: 1-4
[/СОЗДАТЬ_ЗАДАЧУ]

Если пользователь просит перенести задачу, ответь в формате:
[ПЕРЕНЕСТИ_ЗАДАЧУ]
id: номер задачи
date: YYYY-MM-DD
[/ПЕРЕНЕСТИ_ЗАДАЧУ]

Если пользователь просит завершить задачу:
[ЗАВЕРШИТЬ_ЗАДАЧУ]
id: номер задачи
[/ЗАВЕРШИТЬ_ЗАДАЧУ]

Можешь использовать несколько команд в одном ответе. Всегда добавляй текстовый ответ пользователю помимо команд.`;

// Обработка AI-команд в ответе
function parseAiCommands(response, user) {
  const results = [];

  // Создать задачу
  const createMatches = response.matchAll(/\[СОЗДАТЬ_ЗАДАЧУ\]([\s\S]*?)\[\/СОЗДАТЬ_ЗАДАЧУ\]/g);
  for (const match of createMatches) {
    const block = match[1];
    const title = block.match(/title:\s*(.+)/)?.[1]?.trim();
    const dateRaw = block.match(/date:\s*(.+)/)?.[1]?.trim();
    const timeRaw = block.match(/time:\s*(.+)/)?.[1]?.trim();
    const priorityRaw = block.match(/priority:\s*(\d)/)?.[1];

    if (title) {
      const due_date = parseDate(dateRaw || 'сегодня', user.timezone) || todayStr(user.timezone);
      const due_time = timeRaw ? parseTime(timeRaw) : null;
      const priority = priorityRaw ? parseInt(priorityRaw) : 3;
      const task = db.createTask(user.id, { title, due_date, due_time, priority });
      results.push({ type: 'created', task });
    }
  }

  // Перенести задачу
  const moveMatches = response.matchAll(/\[ПЕРЕНЕСТИ_ЗАДАЧУ\]([\s\S]*?)\[\/ПЕРЕНЕСТИ_ЗАДАЧУ\]/g);
  for (const match of moveMatches) {
    const block = match[1];
    const id = parseInt(block.match(/id:\s*(\d+)/)?.[1]);
    const dateRaw = block.match(/date:\s*(.+)/)?.[1]?.trim();
    if (id && dateRaw) {
      const task = db.getTaskById(id);
      if (task && task.user_id === user.id) {
        const due_date = parseDate(dateRaw, user.timezone) || tomorrowStr(user.timezone);
        db.updateTask(id, { due_date });
        results.push({ type: 'moved', task: { ...task, due_date } });
      }
    }
  }

  // Завершить задачу
  const doneMatches = response.matchAll(/\[ЗАВЕРШИТЬ_ЗАДАЧУ\]([\s\S]*?)\[\/ЗАВЕРШИТЬ_ЗАДАЧУ\]/g);
  for (const match of doneMatches) {
    const block = match[1];
    const id = parseInt(block.match(/id:\s*(\d+)/)?.[1]);
    if (id) {
      const task = db.getTaskById(id);
      if (task && task.user_id === user.id) {
        db.updateTask(id, { status: 'done' });
        results.push({ type: 'completed', task });
      }
    }
  }

  // Убираем команды из текста ответа
  let cleanResponse = response
    .replace(/\[СОЗДАТЬ_ЗАДАЧУ\][\s\S]*?\[\/СОЗДАТЬ_ЗАДАЧУ\]/g, '')
    .replace(/\[ПЕРЕНЕСТИ_ЗАДАЧУ\][\s\S]*?\[\/ПЕРЕНЕСТИ_ЗАДАЧУ\]/g, '')
    .replace(/\[ЗАВЕРШИТЬ_ЗАДАЧУ\][\s\S]*?\[\/ЗАВЕРШИТЬ_ЗАДАЧУ\]/g, '')
    .trim();

  return { text: cleanResponse, actions: results };
}

// Подключение AI к боту
function setupAiAssistant(bot, groqKey) {
  if (!groqKey) {
    console.log('[AI] No GROQ_KEY — AI assistant disabled');
    return;
  }

  // Команда /ai — прямой вопрос
  bot.command('ai', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const question = ctx.match?.trim();
    if (!question) {
      return ctx.reply(
        '🤖 <b>AI-Секретарь</b>\n\n' +
        'Я могу:\n' +
        '• Спланировать твой день\n' +
        '• Создать/перенести/завершить задачи\n' +
        '• Дать советы по продуктивности\n' +
        '• Разбить большую задачу на шаги\n\n' +
        'Просто напиши: /ai <i>твой вопрос</i>\n' +
        'Или используй /plan для плана дня',
        { parse_mode: 'HTML' }
      );
    }

    await processAiMessage(ctx, user, question, groqKey);
  });

  // /plan — план на день
  bot.command('plan', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const prompt = 'Посмотри мои задачи на сегодня и помоги составить оптимальный план дня. Учти приоритеты и время. Если есть просроченные — предложи что с ними делать.';
    await processAiMessage(ctx, user, prompt, groqKey);
  });

  // /breakdown — разбить задачу
  bot.command('breakdown', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.match?.trim();
    if (!text) return ctx.reply('Используй: /breakdown <i>описание большой задачи</i>', { parse_mode: 'HTML' });
    const prompt = `Разбей эту задачу на конкретные подзадачи (шаги) и создай их: "${text}"`;
    await processAiMessage(ctx, user, prompt, groqKey);
  });

  // /advice — совет по продуктивности
  bot.command('advice', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const prompt = 'Дай мне краткий совет по продуктивности на основе моих текущих задач и привычек. Что я делаю хорошо? Что можно улучшить?';
    await processAiMessage(ctx, user, prompt, groqKey);
  });

  console.log('[AI] Groq AI assistant enabled');
}

async function processAiMessage(ctx, user, message, groqKey) {
  const thinkingMsg = await ctx.reply('🤖 Думаю...');

  try {
    const context = buildUserContext(user);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\nКонтекст пользователя:\n' + context },
      { role: 'user', content: message },
    ];

    const aiResponse = await callGroq(messages, groqKey);
    const { text, actions } = parseAiCommands(aiResponse, user);

    // Формируем ответ
    let reply = `🤖 ${text}`;

    if (actions.length > 0) {
      reply += '\n\n📝 <b>Выполнено:</b>';
      for (const a of actions) {
        if (a.type === 'created') reply += `\n✅ Создана: ${escapeHtml(a.task.title)}`;
        if (a.type === 'moved') reply += `\n📅 Перенесена: ${escapeHtml(a.task.title)} → ${a.task.due_date}`;
        if (a.type === 'completed') reply += `\n✅ Завершена: ${escapeHtml(a.task.title)}`;
      }
    }

    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, reply, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[AI] Error:', e.message);
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id,
      '❌ Ошибка AI: ' + escapeHtml(e.message) + '\n💡 Проверь GROQ_KEY в .env',
      { parse_mode: 'HTML' }
    );
  }
}

module.exports = { setupAiAssistant, callGroq, buildUserContext };
