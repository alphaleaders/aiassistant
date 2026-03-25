const https = require('https');
const { InlineKeyboard } = require('grammy');
const db = require('../db/database');
const { todayStr, tomorrowStr, formatTask, escapeHtml, parseDate, parseTime, localToUtc, formatDateRu, PRIORITIES } = require('../utils/helpers');
const { SECRETARY_STYLES } = require('./bot');

const GROQ_API_URL = 'api.groq.com';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============ Groq API call ============
async function callGroq(messages, groqKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1500,
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

// ============ Контекст пользователя для AI ============
function buildUserContext(user) {
  const { DateTime } = require('luxon');
  const now = DateTime.now().setZone(user.timezone);
  const today = now.toFormat('yyyy-MM-dd');
  const tomorrow = now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
  const dayNames = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

  const todayTasks = db.getTasksByDate(user.id, today);
  const tomorrowTasks = db.getTasksByDate(user.id, tomorrow);
  const overdue = db.getOverdueTasks(user.id, today);
  const allActive = db.getAllActiveTasks(user.id);
  const habits = db.getUserHabits(user.id);
  const categories = db.getCategories(user.id);
  const memories = db.getMemories(user.id, 20);

  let ctx = `ТЕКУЩЕЕ ВРЕМЯ: ${dayNames[now.weekday - 1]}, ${today} ${now.toFormat('HH:mm')} (${user.timezone})\n`;
  ctx += `Пользователь: ${user.tg_first_name || 'Пользователь'}\n`;
  if (user.user_notes) ctx += `О пользователе: ${user.user_notes}\n`;
  ctx += '\n';

  if (memories.length > 0) {
    ctx += 'ЗАПОМНЕННОЕ О ПОЛЬЗОВАТЕЛЕ:\n';
    memories.forEach(m => { ctx += `- [${m.type}] ${m.content}\n`; });
    ctx += '\n';
  }

  if (overdue.length > 0) {
    ctx += `⚠️ ПРОСРОЧЕННЫЕ (${overdue.length}):\n`;
    overdue.forEach(t => { ctx += `  #${t.id} | ${t.title} | ${t.due_date} | pri:${t.priority}\n`; });
    ctx += '\n';
  }

  ctx += `📅 СЕГОДНЯ ${formatDateRu(today)} (${todayTasks.length} задач):\n`;
  if (todayTasks.length === 0) ctx += '  (пусто)\n';
  else todayTasks.forEach(t => {
    ctx += `  #${t.id} | ${t.status === 'done' ? '✅' : '⬜'} ${t.title}`;
    if (t.due_time) ctx += ` | ${t.due_time}`;
    ctx += ` | pri:${t.priority}`;
    if (t.category_name) ctx += ` | ${t.category_emoji}${t.category_name}`;
    ctx += '\n';
  });

  ctx += `\n📅 ЗАВТРА (${tomorrowTasks.length} задач):\n`;
  if (tomorrowTasks.length === 0) ctx += '  (пусто)\n';
  else tomorrowTasks.forEach(t => { ctx += `  #${t.id} | ${t.title}${t.due_time ? ' | ' + t.due_time : ''}\n`; });

  if (allActive.length > todayTasks.length + tomorrowTasks.length) {
    ctx += `\n📋 ДРУГИЕ АКТИВНЫЕ (${allActive.length - todayTasks.length - tomorrowTasks.length}):\n`;
    allActive.filter(t => t.due_date !== today && t.due_date !== tomorrow).slice(0, 15).forEach(t => {
      ctx += `  #${t.id} | ${t.title} | ${t.due_date || 'без даты'}\n`;
    });
  }

  if (habits.length > 0) {
    ctx += `\n📊 ПРИВЫЧКИ:\n`;
    habits.forEach(h => { ctx += `  ${h.emoji} ${h.title} | стрик: ${h.current_streak} | рекорд: ${h.best_streak}\n`; });
  }

  ctx += `\n📁 КАТЕГОРИИ: ${categories.map(c => `${c.emoji}${c.name}(id:${c.id})`).join(', ')}\n`;

  return ctx;
}

// ============ System prompt с учётом стиля секретаря ============
function getSystemPrompt(user) {
  const name = user.secretary_name || 'Секретарь';
  const style = user.secretary_style || 'friendly';

  const styleInstructions = {
    friendly: `Ты общаешься тепло и дружелюбно. Используешь лёгкий юмор, подбадриваешь. Обращаешься на "ты". Добавляешь эмодзи.`,
    business: `Ты общаешься чётко и профессионально. Краткие ответы по делу. Обращаешься на "вы". Минимум эмодзи, максимум пользы.`,
    coach: `Ты — энергичный коуч-мотиватор. Толкаешь вперёд, хвалишь за достижения, мягко подталкиваешь при лени. Используешь мотивирующие фразы.`,
    gentle: `Ты общаешься мягко и заботливо. Не давишь, не торопишь. Предлагаешь, а не приказываешь. Заботишься о самочувствии пользователя.`,
  };

  return `Ты — ${name}, персональный AI-секретарь и планировщик. ${styleInstructions[style] || styleInstructions.friendly}

ТВОИ ВОЗМОЖНОСТИ:
1. Создавать задачи (с датой, временем, приоритетом, категорией)
2. Переносить задачи на другую дату
3. Завершать задачи
4. Удалять задачи
5. Создавать привычки
6. Составлять план дня
7. Давать советы по продуктивности
8. Запоминать важную информацию о пользователе
9. Отвечать на вопросы и вести диалог

ФОРМАТ КОМАНД (вставляй в ответ когда нужно выполнить действие):
[TASK_CREATE] title | date(YYYY-MM-DD) | time(HH:MM или null) | priority(1-4) | category_id(число или null) [/TASK_CREATE]
[TASK_DONE] id [/TASK_DONE]
[TASK_MOVE] id | date(YYYY-MM-DD) [/TASK_MOVE]
[TASK_DELETE] id [/TASK_DELETE]
[HABIT_CREATE] title | emoji [/HABIT_CREATE]
[MEMORY] тип:содержание [/MEMORY]

ПРАВИЛА:
- ВСЕГДА отвечай текстом пользователю + команды если нужны действия
- Если пользователь просит создать задачу — создай через [TASK_CREATE]
- Если нет даты — ставь сегодня
- Если говорит "завтра" — вычисли дату
- Если просит перенести — используй [TASK_MOVE]
- Если завершает — [TASK_DONE]
- Запоминай важное через [MEMORY] (предпочтения:..., факт:..., привычка:...)
- Отвечай на русском
- Будь кратким но полезным
- НЕ используй markdown разметку (**, ##), используй plain text с эмодзи`;
}

// ============ Парсинг AI-команд ============
function parseAndExecuteCommands(response, user) {
  const results = [];

  // TASK_CREATE
  const creates = [...response.matchAll(/\[TASK_CREATE\]\s*(.+?)\s*\[\/TASK_CREATE\]/gs)];
  for (const m of creates) {
    const parts = m[1].split('|').map(s => s.trim());
    const title = parts[0];
    const date = parts[1] && parts[1] !== 'null' ? parts[1] : todayStr(user.timezone);
    const time = parts[2] && parts[2] !== 'null' ? parts[2] : null;
    const priority = parts[3] ? parseInt(parts[3]) || 3 : 3;
    const category_id = parts[4] && parts[4] !== 'null' ? parseInt(parts[4]) || null : null;

    if (title) {
      const task = db.createTask(user.id, { title, due_date: date, due_time: time, priority, category_id });
      // Авто-напоминание
      if (time && date) {
        const fireAt = localToUtc(date, time, user.timezone);
        if (fireAt) {
          const { DateTime } = require('luxon');
          const fireTime = DateTime.fromISO(fireAt).minus({ minutes: 15 });
          if (fireTime > DateTime.now()) db.createReminder(task.id, user.id, fireTime.toISO(), 15);
        }
      }
      results.push({ type: 'created', task });
    }
  }

  // TASK_DONE
  const dones = [...response.matchAll(/\[TASK_DONE\]\s*(\d+)\s*\[\/TASK_DONE\]/g)];
  for (const m of dones) {
    const id = parseInt(m[1]);
    const task = db.getTaskById(id);
    if (task && task.user_id === user.id) {
      db.updateTask(id, { status: 'done' });
      results.push({ type: 'done', task });
    }
  }

  // TASK_MOVE
  const moves = [...response.matchAll(/\[TASK_MOVE\]\s*(\d+)\s*\|\s*(.+?)\s*\[\/TASK_MOVE\]/g)];
  for (const m of moves) {
    const id = parseInt(m[1]);
    const date = m[2].trim();
    const task = db.getTaskById(id);
    if (task && task.user_id === user.id) {
      db.updateTask(id, { due_date: date });
      results.push({ type: 'moved', task, date });
    }
  }

  // TASK_DELETE
  const deletes = [...response.matchAll(/\[TASK_DELETE\]\s*(\d+)\s*\[\/TASK_DELETE\]/g)];
  for (const m of deletes) {
    const id = parseInt(m[1]);
    const task = db.getTaskById(id);
    if (task && task.user_id === user.id) {
      db.deleteTask(id);
      results.push({ type: 'deleted', task });
    }
  }

  // HABIT_CREATE
  const habits = [...response.matchAll(/\[HABIT_CREATE\]\s*(.+?)\s*\[\/HABIT_CREATE\]/g)];
  for (const m of habits) {
    const parts = m[1].split('|').map(s => s.trim());
    const title = parts[0];
    const emoji = parts[1] || '✅';
    if (title) {
      const habit = db.createHabit(user.id, title, emoji);
      results.push({ type: 'habit', habit });
    }
  }

  // MEMORY
  const memos = [...response.matchAll(/\[MEMORY\]\s*(.+?)\s*\[\/MEMORY\]/g)];
  for (const m of memos) {
    const content = m[1].trim();
    const [type, ...rest] = content.split(':');
    db.addMemory(user.id, type.trim(), rest.join(':').trim());
    results.push({ type: 'memory', content: rest.join(':').trim() });
  }

  // Чистим ответ от команд
  let clean = response
    .replace(/\[TASK_CREATE\][\s\S]*?\[\/TASK_CREATE\]/g, '')
    .replace(/\[TASK_DONE\][\s\S]*?\[\/TASK_DONE\]/g, '')
    .replace(/\[TASK_MOVE\][\s\S]*?\[\/TASK_MOVE\]/g, '')
    .replace(/\[TASK_DELETE\][\s\S]*?\[\/TASK_DELETE\]/g, '')
    .replace(/\[HABIT_CREATE\][\s\S]*?\[\/HABIT_CREATE\]/g, '')
    .replace(/\[MEMORY\][\s\S]*?\[\/MEMORY\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: clean, actions: results };
}

// ============ Основной conversational handler ============
function setupConversationalAI(bot, groqKey) {
  if (!groqKey) {
    console.log('[AI] No GROQ_KEY — conversational AI disabled, fallback to simple task creation');

    // Fallback без AI — простое создание задач
    bot.on('message:text', async (ctx) => {
      const user = db.ensureUser(ctx.from);
      if (!user.onboarded || ctx.message.text.startsWith('/')) return;
      // Создаём задачу из текста
      const text = ctx.message.text.trim();
      const date = parseDate(text, user.timezone) || todayStr(user.timezone);
      const time = parseTime(text);
      let title = text;
      ['сегодня', 'завтра', 'послезавтра'].forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
      title = title.replace(/\d{1,2}[:.]\d{2}/g, '').replace(/\d{1,2}\.\d{1,2}/g, '').replace(/\s+/g, ' ').trim();
      if (!title) return;

      const task = db.createTask(user.id, { title, due_date: date, due_time: time, priority: 3 });
      const kb = new InlineKeyboard()
        .text('✅', `done_${task.id}`).text('⏰', `task_remind_${task.id}`)
        .text('📅', `task_reschedule_${task.id}`).text('🗑', `task_delete_${task.id}`);
      await ctx.reply(`✅ ${formatTask(task, true)} [#${task.id}]`, { parse_mode: 'HTML', reply_markup: kb });
    });
    return;
  }

  // ====== С AI ======
  bot.on('message:text', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.message.text.trim();
    if (!user.onboarded || text.startsWith('/')) return;

    // Сохраняем сообщение пользователя
    db.addChatMessage(user.id, 'user', text);

    const thinkingMsg = await ctx.reply('💭');

    try {
      const context = buildUserContext(user);
      const history = db.getChatHistory(user.id, 10);

      const messages = [
        { role: 'system', content: getSystemPrompt(user) + '\n\n' + context },
      ];

      // Добавляем историю чата
      for (const msg of history.slice(0, -1)) { // -1 потому что текущее уже в контексте
        messages.push({ role: msg.role, content: msg.content });
      }
      messages.push({ role: 'user', content: text });

      const aiResponse = await callGroq(messages, groqKey);
      const { text: replyText, actions } = parseAndExecuteCommands(aiResponse, user);

      // Сохраняем ответ
      db.addChatMessage(user.id, 'assistant', replyText);

      // Формируем ответ
      let reply = replyText;

      // Добавляем инфо о действиях
      if (actions.length > 0) {
        reply += '\n';
        for (const a of actions) {
          if (a.type === 'created') reply += `\n✅ Создано: <b>${escapeHtml(a.task.title)}</b> 📅${formatDateRu(a.task.due_date)}${a.task.due_time ? ' ⏰' + a.task.due_time : ''} [#${a.task.id}]`;
          if (a.type === 'done') reply += `\n✅ Завершено: ${escapeHtml(a.task.title)}`;
          if (a.type === 'moved') reply += `\n📅 Перенесено: ${escapeHtml(a.task.title)} → ${formatDateRu(a.date)}`;
          if (a.type === 'deleted') reply += `\n🗑 Удалено: ${escapeHtml(a.task.title)}`;
          if (a.type === 'habit') reply += `\n📊 Привычка: ${a.habit.emoji} ${escapeHtml(a.habit.title)}`;
        }
      }

      // Кнопки для созданных задач
      const kb = new InlineKeyboard();
      const createdTasks = actions.filter(a => a.type === 'created');
      if (createdTasks.length === 1) {
        const t = createdTasks[0].task;
        kb.text('✅', `done_${t.id}`).text('⏰', `task_remind_${t.id}`)
          .text('📅', `task_reschedule_${t.id}`).text('🗑', `task_delete_${t.id}`);
      }

      await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, reply, {
        parse_mode: 'HTML',
        reply_markup: kb.inline_keyboard.length ? kb : undefined,
      });

    } catch (e) {
      console.error('[AI] Error:', e.message);
      // Fallback — пытаемся создать задачу из текста
      try {
        await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id);
      } catch {}

      const date = parseDate(text, user.timezone) || todayStr(user.timezone);
      const time = parseTime(text);
      let title = text;
      ['сегодня', 'завтра', 'послезавтра'].forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
      title = title.replace(/\d{1,2}[:.]\d{2}/g, '').replace(/\d{1,2}\.\d{1,2}/g, '').replace(/\s+/g, ' ').trim();
      if (!title) return;

      const task = db.createTask(user.id, { title, due_date: date, due_time: time, priority: 3 });
      const kb = new InlineKeyboard()
        .text('✅', `done_${task.id}`).text('⏰', `task_remind_${task.id}`)
        .text('📅', `task_reschedule_${task.id}`).text('🗑', `task_delete_${task.id}`);
      await ctx.reply(`✅ ${formatTask(task, true)} [#${task.id}]`, { parse_mode: 'HTML', reply_markup: kb });
    }
  });

  // ====== Команды AI ======
  bot.command('plan', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    await processAiCommand(ctx, user, 'Составь мне оптимальный план на сегодня. Учти приоритеты, время и просроченные задачи.', groqKey);
  });

  bot.command('breakdown', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.match?.trim();
    if (!text) return ctx.reply('Напиши: /breakdown описание большой задачи');
    await processAiCommand(ctx, user, `Разбей задачу на подзадачи и создай их: "${text}"`, groqKey);
  });

  bot.command('advice', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    await processAiCommand(ctx, user, 'Дай совет по продуктивности на основе моих задач и привычек.', groqKey);
  });

  bot.command('ai', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.match?.trim();
    if (!text) return ctx.reply('Просто напиши мне — я всегда на связи! 💬');
    await processAiCommand(ctx, user, text, groqKey);
  });

  console.log('[AI] Conversational AI enabled');
}

async function processAiCommand(ctx, user, message, groqKey) {
  const thinkingMsg = await ctx.reply('💭');
  try {
    const context = buildUserContext(user);
    const messages = [
      { role: 'system', content: getSystemPrompt(user) + '\n\n' + context },
      { role: 'user', content: message },
    ];

    const aiResponse = await callGroq(messages, groqKey);
    const { text, actions } = parseAndExecuteCommands(aiResponse, user);

    let reply = text;
    if (actions.length > 0) {
      reply += '\n';
      for (const a of actions) {
        if (a.type === 'created') reply += `\n✅ <b>${escapeHtml(a.task.title)}</b> 📅${formatDateRu(a.task.due_date)}${a.task.due_time ? ' ⏰' + a.task.due_time : ''}`;
        if (a.type === 'done') reply += `\n✅ Завершено: ${escapeHtml(a.task.title)}`;
        if (a.type === 'moved') reply += `\n📅 Перенесено: ${escapeHtml(a.task.title)}`;
      }
    }

    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, reply, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[AI] Error:', e.message);
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, `❌ ${escapeHtml(e.message)}`, { parse_mode: 'HTML' });
  }
}

module.exports = { setupConversationalAI, callGroq, buildUserContext, getSystemPrompt, parseAndExecuteCommands };
