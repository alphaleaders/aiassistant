const { Bot, InlineKeyboard, session } = require('grammy');
const db = require('../db/database');
const { PRIORITIES, parseDate, parseTime, formatTask, todayStr, tomorrowStr, errorResponse, escapeHtml, localToUtc, formatDateRu } = require('../utils/helpers');
const { createReminder } = require('../db/database');

function createBot(token, webappUrl) {
  const bot = new Bot(token);

  // Сессия для хранения состояния диалога
  bot.use(session({
    initial: () => ({ step: null, data: {} }),
  }));

  // ============ /start ============
  bot.command('start', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const kb = new InlineKeyboard()
      .text('📋 Задачи на сегодня', 'today')
      .text('➕ Новая задача', 'new_task').row()
      .text('📊 Привычки', 'habits')
      .text('⚙️ Настройки', 'settings').row();

    if (webappUrl) {
      kb.webApp('📱 Открыть планировщик', webappUrl);
    }

    await ctx.reply(
      `👋 Привет, <b>${escapeHtml(ctx.from.first_name)}</b>!\n\n` +
      `Я твой персональный планировщик дел.\n\n` +
      `🔹 Просто напиши задачу — я добавлю её на сегодня\n` +
      `🔹 Напиши "завтра купить молоко" — добавлю на завтра\n` +
      `🔹 Используй /help для списка команд\n\n` +
      `✅ Бот подключён и работает!`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // ============ /help ============
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 <b>Команды бота:</b>\n\n` +
      `📋 <b>Задачи:</b>\n` +
      `/today — задачи на сегодня\n` +
      `/tomorrow — задачи на завтра\n` +
      `/week — задачи на неделю\n` +
      `/all — все активные задачи\n` +
      `/done — завершённые задачи\n` +
      `/overdue — просроченные задачи\n\n` +
      `➕ <b>Создание:</b>\n` +
      `/add [текст] — добавить задачу\n` +
      `Или просто напиши текст — задача создастся!\n\n` +
      `📊 <b>Привычки:</b>\n` +
      `/habits — мои привычки\n` +
      `/addhabit [текст] — новая привычка\n\n` +
      `📁 <b>Категории:</b>\n` +
      `/categories — мои категории\n\n` +
      `⚙️ <b>Настройки:</b>\n` +
      `/settings — настройки бота\n` +
      `/timezone [зона] — сменить часовой пояс\n\n` +
      `💡 <b>Подсказки:</b>\n` +
      `• "завтра сходить в магазин" → задача на завтра\n` +
      `• "25.03 встреча в 14:00" → дата + время\n` +
      `• Приоритет: !1 (срочно), !2 (высокий), !3 (средний), !4 (низкий)`,
      { parse_mode: 'HTML' }
    );
  });

  // ============ /today ============
  bot.command('today', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const today = todayStr(user.timezone);
    const tasks = db.getTasksByDate(user.id, today);
    const overdue = db.getOverdueTasks(user.id, today);

    let text = `📅 <b>Сегодня (${formatDateRu(today)}):</b>\n\n`;

    if (overdue.length > 0) {
      text += `⚠️ <b>Просроченные:</b>\n`;
      overdue.forEach(t => { text += formatTask(t, true) + ` <i>[#${t.id}]</i>\n`; });
      text += '\n';
    }

    if (tasks.length === 0) {
      text += `Нет задач на сегодня 🎉\nНапиши задачу или нажми ➕`;
    } else {
      tasks.forEach(t => { text += formatTask(t) + ` <i>[#${t.id}]</i>\n`; });
      const done = tasks.filter(t => t.status === 'done').length;
      text += `\n📊 Выполнено: ${done}/${tasks.length}`;
    }

    const kb = new InlineKeyboard()
      .text('➕ Добавить', 'new_task_today')
      .text('📅 Завтра', 'show_tomorrow');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // ============ /tomorrow ============
  bot.command('tomorrow', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const tmr = tomorrowStr(user.timezone);
    const tasks = db.getTasksByDate(user.id, tmr);

    let text = `📅 <b>Завтра (${formatDateRu(tmr)}):</b>\n\n`;
    if (tasks.length === 0) {
      text += 'Нет задач на завтра';
    } else {
      tasks.forEach(t => { text += formatTask(t) + ` <i>[#${t.id}]</i>\n`; });
    }

    const kb = new InlineKeyboard().text('➕ Добавить на завтра', 'new_task_tomorrow');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // ============ /week ============
  bot.command('week', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const { DateTime } = require('luxon');
    const now = DateTime.now().setZone(user.timezone);

    let text = `📅 <b>Неделя:</b>\n\n`;
    for (let i = 0; i < 7; i++) {
      const day = now.plus({ days: i });
      const dateStr = day.toFormat('yyyy-MM-dd');
      const tasks = db.getTasksByDate(user.id, dateStr);
      const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const dayName = dayNames[day.weekday - 1];
      const isToday = i === 0 ? ' (сегодня)' : '';

      if (tasks.length > 0) {
        text += `<b>${dayName} ${formatDateRu(dateStr)}${isToday}:</b>\n`;
        tasks.forEach(t => { text += `  ${formatTask(t)} <i>[#${t.id}]</i>\n`; });
        text += '\n';
      }
    }

    if (text === `📅 <b>Неделя:</b>\n\n`) {
      text += 'На этой неделе пока нет задач 🎉';
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ============ /all ============
  bot.command('all', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const tasks = db.getAllActiveTasks(user.id);

    let text = `📋 <b>Все активные задачи (${tasks.length}):</b>\n\n`;
    if (tasks.length === 0) {
      text += 'Нет активных задач!';
    } else {
      tasks.forEach(t => { text += formatTask(t, true) + ` <i>[#${t.id}]</i>\n`; });
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ============ /done ============
  bot.command('done', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const tasks = db.getTasksByStatus(user.id, 'done');
    const recent = tasks.slice(0, 20);

    let text = `✅ <b>Завершённые задачи (${tasks.length}):</b>\n\n`;
    if (recent.length === 0) {
      text += 'Пока нет завершённых задач';
    } else {
      recent.forEach(t => { text += formatTask(t, true) + ` <i>[#${t.id}]</i>\n`; });
      if (tasks.length > 20) text += `\n... и ещё ${tasks.length - 20}`;
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ============ /overdue ============
  bot.command('overdue', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const today = todayStr(user.timezone);
    const tasks = db.getOverdueTasks(user.id, today);

    let text = `⚠️ <b>Просроченные задачи (${tasks.length}):</b>\n\n`;
    if (tasks.length === 0) {
      text += 'Нет просроченных задач 🎉';
    } else {
      tasks.forEach(t => {
        text += formatTask(t, true) + ` <i>[#${t.id}]</i>\n`;
        const kb = new InlineKeyboard()
          .text('✅ Готово', `done_${t.id}`)
          .text('📅 На сегодня', `move_today_${t.id}`)
          .text('📅 На завтра', `move_tmr_${t.id}`);
      });
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ============ /add [текст] ============
  bot.command('add', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.match?.trim();
    if (!text) {
      ctx.session.step = 'awaiting_task_title';
      ctx.session.data = {};
      return ctx.reply('✏️ Напиши название задачи:');
    }
    await quickCreateTask(ctx, user, text);
  });

  // ============ /addhabit ============
  bot.command('addhabit', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.match?.trim();
    if (!text) {
      return ctx.reply('✏️ Используй: /addhabit Название привычки');
    }
    const habit = db.createHabit(user.id, text);
    await ctx.reply(`✅ Привычка добавлена: <b>${escapeHtml(habit.title)}</b> ${habit.emoji}\nОтмечай выполнение в /habits`, { parse_mode: 'HTML' });
  });

  // ============ /habits ============
  bot.command('habits', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const habits = db.getUserHabits(user.id);

    if (habits.length === 0) {
      return ctx.reply('У тебя пока нет привычек.\nДобавь: /addhabit Зарядка');
    }

    let text = `📊 <b>Мои привычки:</b>\n\n`;
    const kb = new InlineKeyboard();
    habits.forEach((h, i) => {
      text += `${h.emoji} <b>${escapeHtml(h.title)}</b> — 🔥 ${h.current_streak} дн. (рекорд: ${h.best_streak})\n`;
      kb.text(`${h.emoji} Отметить`, `habit_done_${h.id}`);
      if (i % 2 === 1) kb.row();
    });

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // ============ /categories ============
  bot.command('categories', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const cats = db.getCategories(user.id);

    let text = `📁 <b>Категории:</b>\n\n`;
    cats.forEach(c => { text += `${c.emoji} ${c.name}\n`; });
    text += '\nДобавить: /addcat Название Эмодзи';

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ============ /addcat ============
  bot.command('addcat', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const parts = ctx.match?.trim().split(' ');
    if (!parts || parts.length === 0 || !parts[0]) {
      return ctx.reply('Используй: /addcat Название 📌');
    }
    const emoji = parts.length > 1 && /\p{Emoji}/u.test(parts[parts.length - 1]) ? parts.pop() : '📋';
    const name = parts.join(' ');
    try {
      db.createCategory(user.id, name, emoji);
      await ctx.reply(`✅ Категория добавлена: ${emoji} ${name}`);
    } catch (e) {
      await ctx.reply('❌ Такая категория уже существует');
    }
  });

  // ============ /settings ============
  bot.command('settings', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const kb = new InlineKeyboard()
      .text('🕐 Утренний дайджест', 'set_morning')
      .text('🌙 Вечерний обзор', 'set_evening').row()
      .text('🌍 Часовой пояс', 'set_timezone')
      .text('🔕 Не беспокоить', 'set_dnd');

    await ctx.reply(
      `⚙️ <b>Настройки:</b>\n\n` +
      `🌍 Часовой пояс: <code>${user.timezone}</code>\n` +
      `🕐 Утренний дайджест: <code>${user.morning_digest}</code>\n` +
      `🌙 Вечерний обзор: <code>${user.evening_review}</code>\n` +
      `🔕 Не беспокоить: <code>${user.dnd_start} - ${user.dnd_end}</code>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // ============ /timezone ============
  bot.command('timezone', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const tz = ctx.match?.trim();
    if (!tz) {
      return ctx.reply(`Текущий: <code>${user.timezone}</code>\nИзменить: /timezone Europe/Moscow`, { parse_mode: 'HTML' });
    }
    try {
      const { DateTime } = require('luxon');
      DateTime.now().setZone(tz);
      db.updateUserSettings(user.id, { timezone: tz });
      await ctx.reply(`✅ Часовой пояс: <code>${tz}</code>`, { parse_mode: 'HTML' });
    } catch (e) {
      await ctx.reply('❌ Неверный часовой пояс. Примеры: Europe/Moscow, Asia/Tokyo, America/New_York');
    }
  });

  // ============ Inline кнопки ============
  bot.callbackQuery(/^done_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Задача не найдена');
    db.updateTask(taskId, { status: 'done' });
    await ctx.answerCallbackQuery('✅ Задача выполнена!');
    await ctx.editMessageText(ctx.msg.text.replace(formatTask(task), formatTask({ ...task, status: 'done' })), { parse_mode: 'HTML' });
  });

  bot.callbackQuery(/^move_today_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Задача не найдена');
    db.updateTask(taskId, { due_date: todayStr(user.timezone) });
    await ctx.answerCallbackQuery('📅 Перенесено на сегодня');
  });

  bot.callbackQuery(/^move_tmr_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Задача не найдена');
    db.updateTask(taskId, { due_date: tomorrowStr(user.timezone) });
    await ctx.answerCallbackQuery('📅 Перенесено на завтра');
  });

  bot.callbackQuery(/^habit_done_(\d+)$/, async (ctx) => {
    const habitId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const today = todayStr(user.timezone);
    db.logHabit(habitId, today);
    await ctx.answerCallbackQuery('✅ Привычка отмечена!');
  });

  bot.callbackQuery('today', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Отправить задачи на сегодня
    const user = db.ensureUser(ctx.from);
    const today = todayStr(user.timezone);
    const tasks = db.getTasksByDate(user.id, today);
    let text = `📅 <b>Сегодня:</b>\n\n`;
    if (tasks.length === 0) text += 'Нет задач 🎉';
    else tasks.forEach(t => { text += formatTask(t) + ` <i>[#${t.id}]</i>\n`; });
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('new_task', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'awaiting_task_title';
    ctx.session.data = {};
    await ctx.reply('✏️ Напиши задачу:');
  });

  bot.callbackQuery('new_task_today', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'awaiting_task_title';
    ctx.session.data = { forceDate: 'today' };
    await ctx.reply('✏️ Напиши задачу на сегодня:');
  });

  bot.callbackQuery('new_task_tomorrow', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'awaiting_task_title';
    ctx.session.data = { forceDate: 'tomorrow' };
    await ctx.reply('✏️ Напиши задачу на завтра:');
  });

  bot.callbackQuery('show_tomorrow', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const tmr = tomorrowStr(user.timezone);
    const tasks = db.getTasksByDate(user.id, tmr);
    let text = `📅 <b>Завтра (${formatDateRu(tmr)}):</b>\n\n`;
    if (tasks.length === 0) text += 'Нет задач';
    else tasks.forEach(t => { text += formatTask(t) + ` <i>[#${t.id}]</i>\n`; });
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('habits', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const habits = db.getUserHabits(user.id);
    if (habits.length === 0) return ctx.reply('Нет привычек. Добавь: /addhabit Название');
    let text = `📊 <b>Привычки:</b>\n\n`;
    habits.forEach(h => { text += `${h.emoji} ${escapeHtml(h.title)} — 🔥 ${h.current_streak} дн.\n`; });
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    await ctx.reply(
      `⚙️ <b>Настройки:</b>\n🌍 ${user.timezone}\n🕐 Дайджест: ${user.morning_digest}\n🌙 Обзор: ${user.evening_review}`,
      { parse_mode: 'HTML' }
    );
  });

  // Настройки — callback для кнопок
  bot.callbackQuery('set_morning', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'set_morning_time';
    await ctx.reply('🕐 Введи время утреннего дайджеста (HH:MM, например 08:00):');
  });

  bot.callbackQuery('set_evening', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'set_evening_time';
    await ctx.reply('🌙 Введи время вечернего обзора (HH:MM, например 21:00):');
  });

  bot.callbackQuery('set_timezone', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'set_tz';
    await ctx.reply('🌍 Введи часовой пояс (например Europe/Moscow, Asia/Tokyo):');
  });

  bot.callbackQuery('set_dnd', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'set_dnd_start';
    await ctx.reply('🔕 Введи начало "Не беспокоить" (HH:MM, например 23:00):');
  });

  // Кнопки задачи — после создания
  bot.callbackQuery(/^task_remind_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('5 мин', `remind_${taskId}_5`)
      .text('15 мин', `remind_${taskId}_15`)
      .text('30 мин', `remind_${taskId}_30`).row()
      .text('1 час', `remind_${taskId}_60`)
      .text('3 часа', `remind_${taskId}_180`)
      .text('1 день', `remind_${taskId}_1440`);
    await ctx.reply('⏰ За сколько напомнить?', { reply_markup: kb });
  });

  bot.callbackQuery(/^remind_(\d+)_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const minutes = parseInt(ctx.match[2]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);

    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Задача не найдена');

    if (task.due_date && task.due_time) {
      const fireAt = localToUtc(task.due_date, task.due_time, user.timezone);
      if (fireAt) {
        const { DateTime } = require('luxon');
        const fireTime = DateTime.fromISO(fireAt).minus({ minutes });
        createReminder(taskId, user.id, fireTime.toISO(), minutes);
        await ctx.answerCallbackQuery(`✅ Напоминание за ${minutes} мин`);
        return;
      }
    }

    // Если нет даты/времени — напомнить через N минут от сейчас
    const { DateTime } = require('luxon');
    const fireAt = DateTime.now().plus({ minutes }).toUTC().toISO();
    createReminder(taskId, user.id, fireAt, minutes);
    await ctx.answerCallbackQuery(`✅ Напомню через ${minutes} мин`);
  });

  bot.callbackQuery(/^task_priority_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('🔴 Срочно', `setpri_${taskId}_1`)
      .text('🟠 Высокий', `setpri_${taskId}_2`).row()
      .text('🟡 Средний', `setpri_${taskId}_3`)
      .text('🟢 Низкий', `setpri_${taskId}_4`);
    await ctx.reply('Выбери приоритет:', { reply_markup: kb });
  });

  bot.callbackQuery(/^setpri_(\d+)_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const priority = parseInt(ctx.match[2]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.updateTask(taskId, { priority });
    await ctx.answerCallbackQuery(`✅ Приоритет: ${PRIORITIES[priority].label}`);
  });

  bot.callbackQuery(/^task_cat_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const cats = db.getCategories(user.id);
    const kb = new InlineKeyboard();
    cats.forEach((c, i) => {
      kb.text(`${c.emoji} ${c.name}`, `setcat_${taskId}_${c.id}`);
      if (i % 2 === 1) kb.row();
    });
    await ctx.reply('Выбери категорию:', { reply_markup: kb });
  });

  bot.callbackQuery(/^setcat_(\d+)_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const catId = parseInt(ctx.match[2]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.updateTask(taskId, { category_id: catId });
    await ctx.answerCallbackQuery('✅ Категория установлена');
  });

  bot.callbackQuery(/^task_delete_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.deleteTask(taskId);
    await ctx.answerCallbackQuery('🗑 Задача удалена');
  });

  // ============ Обработка обычных сообщений (быстрое создание задач) ============
  bot.on('message:text', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.message.text.trim();

    // Обработка шагов настроек
    if (ctx.session.step === 'set_morning_time') {
      const time = parseTime(text);
      if (!time) return ctx.reply(errorResponse('INVALID_TIME'));
      db.updateUserSettings(user.id, { morning_digest: time });
      ctx.session.step = null;
      return ctx.reply(`✅ Утренний дайджест: ${time}`);
    }

    if (ctx.session.step === 'set_evening_time') {
      const time = parseTime(text);
      if (!time) return ctx.reply(errorResponse('INVALID_TIME'));
      db.updateUserSettings(user.id, { evening_review: time });
      ctx.session.step = null;
      return ctx.reply(`✅ Вечерний обзор: ${time}`);
    }

    if (ctx.session.step === 'set_tz') {
      try {
        const { DateTime } = require('luxon');
        const test = DateTime.now().setZone(text);
        if (!test.isValid) throw new Error('Invalid');
        db.updateUserSettings(user.id, { timezone: text });
        ctx.session.step = null;
        return ctx.reply(`✅ Часовой пояс: ${text}`);
      } catch {
        return ctx.reply('❌ Неверный часовой пояс. Примеры: Europe/Moscow, US/Eastern');
      }
    }

    if (ctx.session.step === 'set_dnd_start') {
      const time = parseTime(text);
      if (!time) return ctx.reply(errorResponse('INVALID_TIME'));
      db.updateUserSettings(user.id, { dnd_start: time });
      ctx.session.step = 'set_dnd_end';
      return ctx.reply(`🔕 Начало тишины: ${time}\nТеперь введи конец (например 07:00):`);
    }

    if (ctx.session.step === 'set_dnd_end') {
      const time = parseTime(text);
      if (!time) return ctx.reply(errorResponse('INVALID_TIME'));
      db.updateUserSettings(user.id, { dnd_end: time });
      ctx.session.step = null;
      return ctx.reply(`✅ Не беспокоить: ${time} — готово!`);
    }

    // Если ожидаем название задачи
    if (ctx.session.step === 'awaiting_task_title') {
      const forceDate = ctx.session.data?.forceDate;
      ctx.session.step = null;
      ctx.session.data = {};
      if (forceDate === 'today') {
        return quickCreateTask(ctx, user, text, todayStr(user.timezone));
      } else if (forceDate === 'tomorrow') {
        return quickCreateTask(ctx, user, text, tomorrowStr(user.timezone));
      }
      return quickCreateTask(ctx, user, text);
    }

    // Обычное сообщение — создаём задачу
    if (text.startsWith('/')) return; // Игнорируем неизвестные команды
    await quickCreateTask(ctx, user, text);
  });

  // ============ Быстрое создание задачи из текста ============
  async function quickCreateTask(ctx, user, text, forcedDate) {
    // Парсим приоритет
    let priority = 3;
    const priMatch = text.match(/!([1-4])/);
    if (priMatch) {
      priority = parseInt(priMatch[1]);
      text = text.replace(/!([1-4])/, '').trim();
    }

    // Парсим дату
    let dueDate = forcedDate || parseDate(text, user.timezone) || todayStr(user.timezone);
    // Убираем слова с датой из title
    const dateWords = ['сегодня', 'завтра', 'послезавтра', 'today', 'tomorrow', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
    let title = text;
    dateWords.forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
    // Убираем дату формата DD.MM
    title = title.replace(/\d{1,2}\.\d{1,2}(?:\.\d{2,4})?/g, '');

    // Парсим время
    const dueTime = parseTime(text);
    if (dueTime) {
      title = title.replace(/\d{1,2}[:.]\d{2}/g, '');
    }

    title = title.replace(/\s+/g, ' ').trim();
    if (!title) return ctx.reply(errorResponse('EMPTY_TITLE'));

    const task = db.createTask(user.id, { title, priority, due_date: dueDate, due_time: dueTime });

    // Автоматическое напоминание если есть время
    if (dueTime && dueDate) {
      const fireAt = localToUtc(dueDate, dueTime, user.timezone);
      if (fireAt) {
        const { DateTime } = require('luxon');
        const fireTime = DateTime.fromISO(fireAt).minus({ minutes: 15 });
        if (fireTime > DateTime.now()) {
          createReminder(task.id, user.id, fireTime.toISO(), 15);
        }
      }
    }

    const kb = new InlineKeyboard()
      .text('✅ Готово', `done_${task.id}`)
      .text('⏰ Напомнить', `task_remind_${task.id}`).row()
      .text('🏷 Приоритет', `task_priority_${task.id}`)
      .text('📁 Категория', `task_cat_${task.id}`).row()
      .text('🗑 Удалить', `task_delete_${task.id}`);

    let response = `✅ Задача создана:\n\n${formatTask(task, true)} <i>[#${task.id}]</i>`;
    if (dueTime) response += `\n⏰ Напоминание за 15 мин`;

    await ctx.reply(response, { parse_mode: 'HTML', reply_markup: kb });
  }

  return bot;
}

module.exports = { createBot };
