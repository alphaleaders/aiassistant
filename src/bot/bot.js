const { Bot, InlineKeyboard, session } = require('grammy');
const db = require('../db/database');
const { PRIORITIES, parseDate, parseTime, formatTask, todayStr, tomorrowStr, errorResponse, escapeHtml, localToUtc, formatDateRu } = require('../utils/helpers');

const SECRETARY_STYLES = {
  friendly: { name: '😊 Дружелюбный', desc: 'Тёплый, поддерживающий, с юмором' },
  business: { name: '💼 Деловой', desc: 'Чёткий, профессиональный, по делу' },
  coach:    { name: '🔥 Коуч-мотиватор', desc: 'Энергичный, мотивирующий, толкает вперёд' },
  gentle:   { name: '🌸 Мягкий', desc: 'Спокойный, заботливый, без давления' },
};

function createBot(token, webappUrl) {
  const bot = new Bot(token);

  bot.use(session({
    initial: () => ({ step: null, data: {} }),
  }));

  // ============ /start — ONBOARDING ============
  bot.command('start', async (ctx) => {
    const user = db.ensureUser(ctx.from);

    if (user.onboarded && user.secretary_name) {
      // Уже настроен — приветствие от секретаря
      const name = user.secretary_name;
      const kb = new InlineKeyboard()
        .text('📋 Мои задачи', 'today')
        .text('📊 Привычки', 'habits').row()
        .text('⚙️ Настройки', 'settings');
      if (webappUrl) kb.row().webApp('📱 Открыть планировщик', webappUrl);

      return ctx.reply(
        `👋 С возвращением, <b>${escapeHtml(ctx.from.first_name)}</b>!\n\n` +
        `Я ${escapeHtml(name)}, твой персональный секретарь.\n` +
        `Просто напиши или отправь голосовое — я всё запишу и напомню.\n\n` +
        `💡 Попробуй: <i>"завтра в 14:00 встреча с клиентом"</i>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    }

    // === ONBOARDING: Шаг 1 — Приветствие ===
    ctx.session.step = 'onboard_name';
    await ctx.reply(
      `👋 Привет, <b>${escapeHtml(ctx.from.first_name)}</b>!\n\n` +
      `Я твой AI-секретарь и планировщик.\n` +
      `Я буду управлять твоими делами, напоминать о задачах и помогать планировать день.\n\n` +
      `🎭 Для начала — <b>как ты хочешь меня называть?</b>\n\n` +
      `Выбери готовое имя или напиши своё:`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('👩‍💼 Алиса', 'name_Алиса')
          .text('👨‍💼 Макс', 'name_Макс')
          .text('🤖 Джарвис', 'name_Джарвис').row()
          .text('👩‍💻 Ева', 'name_Ева')
          .text('👨‍💻 Сэм', 'name_Сэм')
          .text('🦊 Фокси', 'name_Фокси').row()
          .text('👩‍🔬 Донна', 'name_Донна')
          .text('🧠 Нео', 'name_Нео')
          .text('✍️ Своё имя...', 'name_custom'),
      }
    );
  });

  // Выбор имени — кнопка
  bot.callbackQuery(/^name_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const name = ctx.match[1];

    if (name === 'custom') {
      ctx.session.step = 'onboard_name_input';
      return ctx.reply('✍️ Напиши имя для своего секретаря:');
    }

    const user = db.ensureUser(ctx.from);
    db.setSecretaryName(user.id, name);
    ctx.session.data.secretaryName = name;
    await showStyleSelection(ctx, name);
  });

  // Выбор стиля
  async function showStyleSelection(ctx, name) {
    ctx.session.step = 'onboard_style';
    const kb = new InlineKeyboard();
    for (const [key, style] of Object.entries(SECRETARY_STYLES)) {
      kb.text(style.name, `style_${key}`).row();
    }

    await ctx.reply(
      `✨ Отлично! Меня зовут <b>${escapeHtml(name)}</b>.\n\n` +
      `Теперь выбери мой стиль общения:`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }

  // Стиль выбран
  bot.callbackQuery(/^style_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const style = ctx.match[1];
    const user = db.ensureUser(ctx.from);
    db.setSecretaryStyle(user.id, style);

    ctx.session.step = 'onboard_about';
    await ctx.reply(
      `👍 Стиль: <b>${SECRETARY_STYLES[style]?.name || style}</b>\n\n` +
      `Последний шаг — расскажи немного о себе, чтобы я лучше помогал:\n\n` +
      `<i>Например: "Я предприниматель, работаю с 9 до 18, важны звонки клиентам и спорт по вечерам"</i>\n\n` +
      `Или нажми кнопку чтобы пропустить:`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('⏭ Пропустить', 'skip_about'),
      }
    );
  });

  bot.callbackQuery('skip_about', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    await finishOnboarding(ctx, user);
  });

  // Завершение onboarding
  async function finishOnboarding(ctx, user) {
    db.setOnboarded(user.id);
    const updatedUser = db.getUserByTgId(user.tg_id);
    const name = updatedUser.secretary_name || 'Секретарь';
    const styleName = SECRETARY_STYLES[updatedUser.secretary_style]?.name || '';

    ctx.session.step = null;
    ctx.session.data = {};

    // Первое сообщение от секретаря
    const kb = new InlineKeyboard()
      .text('📋 Мои задачи', 'today')
      .text('💡 Что ты умеешь?', 'what_can_do').row();
    if (webappUrl) kb.webApp('📱 Открыть планировщик', webappUrl);

    await ctx.reply(
      `🎉 <b>Настройка завершена!</b>\n\n` +
      `Привет! Я <b>${escapeHtml(name)}</b> ${styleName}\n` +
      `Твой персональный AI-секретарь.\n\n` +
      `📝 <b>Просто пиши мне или отправляй голосовые:</b>\n\n` +
      `• <i>"Завтра встреча в 10:00"</i> — создам задачу\n` +
      `• <i>"Что у меня на сегодня?"</i> — покажу план\n` +
      `• <i>"Перенеси встречу на пятницу"</i> — перенесу\n` +
      `• <i>"Спланируй мне день"</i> — составлю план\n` +
      `• <i>"Напомни через час позвонить"</i> — напомню\n\n` +
      `🎤 Голосовые тоже понимаю — просто наговори!\n\n` +
      `Готов к работе! Что делаем? 💪`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }

  // ============ "Что ты умеешь?" ============
  bot.callbackQuery('what_can_do', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const name = user.secretary_name || 'Секретарь';

    await ctx.reply(
      `🧠 <b>${escapeHtml(name)} умеет:</b>\n\n` +
      `📝 <b>Задачи</b>\n` +
      `• Создавать из текста и голоса\n` +
      `• Ставить дату, время, приоритет\n` +
      `• Переносить, завершать, удалять\n` +
      `• Разбивать большие задачи на шаги\n\n` +
      `⏰ <b>Напоминания</b>\n` +
      `• Автоматические перед задачей\n` +
      `• "Напомни через 2 часа"\n` +
      `• Утренний план дня\n` +
      `• Вечерний итог\n\n` +
      `📊 <b>Привычки</b>\n` +
      `• Трекер привычек со стриками\n\n` +
      `🧠 <b>AI-помощь</b>\n` +
      `• Планирование дня\n` +
      `• Советы по продуктивности\n` +
      `• Ответы на вопросы\n\n` +
      `🎤 <b>Голос</b>\n` +
      `• Распознаю голосовые сообщения\n` +
      `• Извлекаю задачи автоматически\n\n` +
      `💬 Просто общайся со мной как с настоящим секретарём!`,
      { parse_mode: 'HTML' }
    );
  });

  // ============ /help ============
  bot.command('help', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const name = user.secretary_name || 'Секретарь';
    await ctx.reply(
      `📖 <b>Команды ${escapeHtml(name)}:</b>\n\n` +
      `📋 /today — задачи на сегодня\n` +
      `📅 /tomorrow — задачи на завтра\n` +
      `📆 /week — задачи на неделю\n` +
      `📝 /all — все активные задачи\n` +
      `✅ /done — завершённые\n` +
      `⚠️ /overdue — просроченные\n\n` +
      `📊 /habits — привычки\n` +
      `📁 /categories — категории\n` +
      `⚙️ /settings — настройки\n` +
      `🎭 /rename — сменить имя секретаря\n` +
      `🔄 /style — сменить стиль общения\n\n` +
      `💡 Но лучше просто пиши мне текстом или голосом!`,
      { parse_mode: 'HTML' }
    );
  });

  // ============ /rename ============
  bot.command('rename', async (ctx) => {
    ctx.session.step = 'rename_secretary';
    await ctx.reply('✍️ Напиши новое имя для секретаря:');
  });

  // ============ /style ============
  bot.command('style', async (ctx) => {
    const kb = new InlineKeyboard();
    for (const [key, style] of Object.entries(SECRETARY_STYLES)) {
      kb.text(style.name, `style_${key}`).row();
    }
    await ctx.reply('🎭 Выбери новый стиль:', { reply_markup: kb });
  });

  // ============ /today, /tomorrow, /week, /all, /done, /overdue ============
  bot.command('today', async (ctx) => { await showTasks(ctx, 'today'); });
  bot.command('tomorrow', async (ctx) => { await showTasks(ctx, 'tomorrow'); });
  bot.command('week', async (ctx) => { await showWeek(ctx); });
  bot.command('all', async (ctx) => { await showTasks(ctx, 'all'); });
  bot.command('done', async (ctx) => { await showTasks(ctx, 'done'); });
  bot.command('overdue', async (ctx) => { await showTasks(ctx, 'overdue'); });

  async function showTasks(ctx, mode) {
    const user = db.ensureUser(ctx.from);
    const today = todayStr(user.timezone);
    const tmr = tomorrowStr(user.timezone);
    let tasks, title;

    switch (mode) {
      case 'today':
        tasks = db.getTasksByDate(user.id, today);
        title = `📅 Сегодня (${formatDateRu(today)})`;
        break;
      case 'tomorrow':
        tasks = db.getTasksByDate(user.id, tmr);
        title = `📅 Завтра (${formatDateRu(tmr)})`;
        break;
      case 'all':
        tasks = db.getAllActiveTasks(user.id);
        title = '📋 Все активные задачи';
        break;
      case 'done':
        tasks = db.getTasksByStatus(user.id, 'done').slice(0, 20);
        title = '✅ Завершённые';
        break;
      case 'overdue':
        tasks = db.getOverdueTasks(user.id, today);
        title = '⚠️ Просроченные';
        break;
    }

    let text = `<b>${title}:</b>\n\n`;
    if (tasks.length === 0) {
      text += mode === 'overdue' ? 'Нет просроченных! 🎉' : 'Список пуст ✨';
    } else {
      tasks.forEach(t => { text += formatTask(t, mode === 'all' || mode === 'overdue') + ` <i>[#${t.id}]</i>\n`; });
      if (mode === 'today') {
        const done = tasks.filter(t => t.status === 'done').length;
        text += `\n📊 ${done}/${tasks.length} выполнено`;
      }
    }

    // Overdue — кнопки для каждой задачи
    if (mode === 'overdue' && tasks.length > 0) {
      const kb = new InlineKeyboard()
        .text('📅 Всё на сегодня', `move_all_today`)
        .text('📅 Всё на завтра', `move_all_tmr_overdue`);
      return ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }

    const kb = new InlineKeyboard();
    if (mode === 'today') kb.text('➕ Добавить', 'new_task_today').text('📅 Завтра', 'show_tomorrow');
    else if (mode === 'tomorrow') kb.text('➕ Добавить', 'new_task_tomorrow');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb.inline_keyboard.length ? kb : undefined });
  }

  async function showWeek(ctx) {
    const user = db.ensureUser(ctx.from);
    const { DateTime } = require('luxon');
    const now = DateTime.now().setZone(user.timezone);
    let text = `📆 <b>Неделя:</b>\n\n`;
    let hasAny = false;

    for (let i = 0; i < 7; i++) {
      const day = now.plus({ days: i });
      const dateStr = day.toFormat('yyyy-MM-dd');
      const tasks = db.getTasksByDate(user.id, dateStr);
      if (tasks.length > 0) {
        hasAny = true;
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        const isToday = i === 0 ? ' <b>(сегодня)</b>' : '';
        text += `<b>${dayNames[day.weekday - 1]} ${formatDateRu(dateStr)}</b>${isToday}:\n`;
        tasks.forEach(t => { text += `  ${formatTask(t)} <i>[#${t.id}]</i>\n`; });
        text += '\n';
      }
    }
    if (!hasAny) text += 'На этой неделе пусто 🎉';
    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  // ============ Habits ============
  bot.command('habits', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const habits = db.getUserHabits(user.id);
    if (habits.length === 0) return ctx.reply('У тебя пока нет привычек.\nНапиши: <i>"Добавь привычку: зарядка"</i>', { parse_mode: 'HTML' });

    let text = `📊 <b>Привычки:</b>\n\n`;
    const kb = new InlineKeyboard();
    habits.forEach((h, i) => {
      text += `${h.emoji} <b>${escapeHtml(h.title)}</b> — 🔥 ${h.current_streak} дн. (рекорд: ${h.best_streak})\n`;
      kb.text(`${h.emoji} ✓`, `habit_done_${h.id}`);
      if (i % 3 === 2) kb.row();
    });
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.command('categories', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const cats = db.getCategories(user.id);
    let text = `📁 <b>Категории:</b>\n\n`;
    cats.forEach(c => { text += `${c.emoji} ${c.name}\n`; });
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ============ /settings ============
  bot.command('settings', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const name = user.secretary_name || 'Секретарь';
    const style = SECRETARY_STYLES[user.secretary_style]?.name || user.secretary_style;

    const kb = new InlineKeyboard()
      .text('🕐 Утренний дайджест', 'set_morning')
      .text('🌙 Вечерний обзор', 'set_evening').row()
      .text('🌍 Часовой пояс', 'set_timezone')
      .text('🔕 Не беспокоить', 'set_dnd').row()
      .text('🎭 Сменить имя', 'change_name')
      .text('🎨 Сменить стиль', 'change_style');

    await ctx.reply(
      `⚙️ <b>Настройки:</b>\n\n` +
      `🤖 Секретарь: <b>${escapeHtml(name)}</b>\n` +
      `🎭 Стиль: ${style}\n` +
      `🌍 Часовой пояс: <code>${user.timezone}</code>\n` +
      `🕐 Утро: <code>${user.morning_digest}</code>\n` +
      `🌙 Вечер: <code>${user.evening_review}</code>\n` +
      `🔕 DND: <code>${user.dnd_start} - ${user.dnd_end}</code>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.command('timezone', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const tz = ctx.match?.trim();
    if (!tz) return ctx.reply(`Текущий: <code>${user.timezone}</code>\n/timezone Europe/Moscow`, { parse_mode: 'HTML' });
    try {
      const { DateTime } = require('luxon');
      const test = DateTime.now().setZone(tz);
      if (!test.isValid) throw new Error();
      db.updateUserSettings(user.id, { timezone: tz });
      await ctx.reply(`✅ Часовой пояс: <code>${tz}</code>`, { parse_mode: 'HTML' });
    } catch { await ctx.reply('❌ Неверный часовой пояс'); }
  });

  // ============ INLINE CALLBACKS ============

  // Task actions
  bot.callbackQuery(/^done_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.updateTask(taskId, { status: 'done' });
    await ctx.answerCallbackQuery('✅ Готово!');
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}
  });

  bot.callbackQuery(/^move_today_(\d+)$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(parseInt(ctx.match[1]));
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.updateTask(task.id, { due_date: todayStr(user.timezone) });
    await ctx.answerCallbackQuery('📅 На сегодня');
  });

  bot.callbackQuery(/^move_tmr_(\d+)$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(parseInt(ctx.match[1]));
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.updateTask(task.id, { due_date: tomorrowStr(user.timezone) });
    await ctx.answerCallbackQuery('📅 На завтра');
  });

  bot.callbackQuery(/^task_reschedule_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const { DateTime } = require('luxon');
    const user = db.ensureUser(ctx.from);
    const now = DateTime.now().setZone(user.timezone);
    const kb = new InlineKeyboard()
      .text('Сегодня', `move_today_${taskId}`)
      .text('Завтра', `move_tmr_${taskId}`).row()
      .text('Послезавтра', `move_date_${taskId}_${now.plus({days:2}).toFormat('yyyy-MM-dd')}`)
      .text('Через неделю', `move_date_${taskId}_${now.plus({days:7}).toFormat('yyyy-MM-dd')}`);
    await ctx.reply('📅 Перенести на:', { reply_markup: kb });
  });

  bot.callbackQuery(/^move_date_(\d+)_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(parseInt(ctx.match[1]));
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.updateTask(task.id, { due_date: ctx.match[2] });
    await ctx.answerCallbackQuery(`📅 Перенесено на ${formatDateRu(ctx.match[2])}`);
  });

  bot.callbackQuery(/^move_all_today$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const today = todayStr(user.timezone);
    const overdue = db.getOverdueTasks(user.id, today);
    overdue.forEach(t => db.updateTask(t.id, { due_date: today }));
    await ctx.answerCallbackQuery(`📅 ${overdue.length} задач на сегодня`);
  });

  bot.callbackQuery(/^move_all_tmr_(.+)$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const today = todayStr(user.timezone);
    const tmr = tomorrowStr(user.timezone);
    const source = ctx.match[1];
    let tasks;
    if (source === 'overdue') {
      tasks = db.getOverdueTasks(user.id, today);
    } else {
      tasks = db.getTasksByDate(user.id, source).filter(t => t.status !== 'done');
    }
    tasks.forEach(t => db.updateTask(t.id, { due_date: tmr }));
    await ctx.answerCallbackQuery(`📅 ${tasks.length} задач на завтра`);
  });

  bot.callbackQuery(/^task_remind_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('5м', `remind_${taskId}_5`)
      .text('15м', `remind_${taskId}_15`)
      .text('30м', `remind_${taskId}_30`)
      .text('1ч', `remind_${taskId}_60`)
      .text('3ч', `remind_${taskId}_180`);
    await ctx.reply('⏰ Напомнить через:', { reply_markup: kb });
  });

  bot.callbackQuery(/^remind_(\d+)_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const minutes = parseInt(ctx.match[2]);
    const user = db.ensureUser(ctx.from);
    const { DateTime } = require('luxon');
    const fireAt = DateTime.now().plus({ minutes }).toUTC().toISO();
    db.createReminder(taskId, user.id, fireAt, minutes);
    await ctx.answerCallbackQuery(`⏰ Напомню через ${minutes} мин`);
  });

  bot.callbackQuery(/^task_priority_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('🔴 Срочно', `setpri_${taskId}_1`).text('🟠 Высокий', `setpri_${taskId}_2`).row()
      .text('🟡 Средний', `setpri_${taskId}_3`).text('🟢 Низкий', `setpri_${taskId}_4`);
    await ctx.reply('Приоритет:', { reply_markup: kb });
  });

  bot.callbackQuery(/^setpri_(\d+)_(\d+)$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(parseInt(ctx.match[1]));
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.updateTask(task.id, { priority: parseInt(ctx.match[2]) });
    await ctx.answerCallbackQuery('✅ Приоритет обновлён');
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
    await ctx.reply('Категория:', { reply_markup: kb });
  });

  bot.callbackQuery(/^setcat_(\d+)_(\d+)$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(parseInt(ctx.match[1]));
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.updateTask(task.id, { category_id: parseInt(ctx.match[2]) });
    await ctx.answerCallbackQuery('✅ Категория установлена');
  });

  bot.callbackQuery(/^task_delete_(\d+)$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(parseInt(ctx.match[1]));
    if (!task || task.user_id !== user.id) return ctx.answerCallbackQuery('Не найдена');
    db.deleteTask(task.id);
    await ctx.answerCallbackQuery('🗑 Удалена');
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}
  });

  bot.callbackQuery(/^habit_done_(\d+)$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    db.logHabit(parseInt(ctx.match[1]), todayStr(user.timezone));
    await ctx.answerCallbackQuery('✅ Привычка отмечена!');
  });

  // View callbacks
  bot.callbackQuery('today', async (ctx) => { await ctx.answerCallbackQuery(); await showTasks(ctx, 'today'); });
  bot.callbackQuery('show_tomorrow', async (ctx) => { await ctx.answerCallbackQuery(); await showTasks(ctx, 'tomorrow'); });
  bot.callbackQuery('habits', async (ctx) => { await ctx.answerCallbackQuery(); await showTasks(ctx, 'habits'); });
  bot.callbackQuery('settings', async (ctx) => { await ctx.answerCallbackQuery(); });

  bot.callbackQuery('new_task_today', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'awaiting_task_title';
    ctx.session.data = { forceDate: 'today' };
    await ctx.reply('✏️ Напиши задачу:');
  });

  bot.callbackQuery('new_task_tomorrow', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'awaiting_task_title';
    ctx.session.data = { forceDate: 'tomorrow' };
    await ctx.reply('✏️ Напиши задачу на завтра:');
  });

  // Settings callbacks
  bot.callbackQuery('set_morning', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'set_morning_time';
    await ctx.reply('🕐 Время утреннего дайджеста (HH:MM):');
  });

  bot.callbackQuery('set_evening', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'set_evening_time';
    await ctx.reply('🌙 Время вечернего обзора (HH:MM):');
  });

  bot.callbackQuery('set_timezone', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'set_tz';
    await ctx.reply('🌍 Часовой пояс (например Europe/Moscow):');
  });

  bot.callbackQuery('set_dnd', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'set_dnd_start';
    await ctx.reply('🔕 Начало "Не беспокоить" (HH:MM):');
  });

  bot.callbackQuery('change_name', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'rename_secretary';
    await ctx.reply('✍️ Новое имя секретаря:');
  });

  bot.callbackQuery('change_style', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard();
    for (const [key, style] of Object.entries(SECRETARY_STYLES)) {
      kb.text(style.name, `style_${key}`).row();
    }
    await ctx.reply('🎭 Новый стиль:', { reply_markup: kb });
  });

  // ============ TEXT MESSAGES — основной обработчик ============
  bot.on('message:text', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.message.text.trim();

    // Onboarding steps
    if (ctx.session.step === 'onboard_name_input') {
      const name = text.slice(0, 30);
      db.setSecretaryName(user.id, name);
      ctx.session.data.secretaryName = name;
      return showStyleSelection(ctx, name);
    }

    if (ctx.session.step === 'onboard_about') {
      db.setUserNotes(user.id, text);
      db.addMemory(user.id, 'user_info', text);
      return finishOnboarding(ctx, user);
    }

    if (ctx.session.step === 'rename_secretary') {
      const name = text.slice(0, 30);
      db.setSecretaryName(user.id, name);
      ctx.session.step = null;
      return ctx.reply(`✅ Теперь меня зовут <b>${escapeHtml(name)}</b>!`, { parse_mode: 'HTML' });
    }

    // Settings steps
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
        if (!test.isValid) throw new Error();
        db.updateUserSettings(user.id, { timezone: text });
        ctx.session.step = null;
        return ctx.reply(`✅ Часовой пояс: ${text}`);
      } catch {
        return ctx.reply('❌ Неверный. Примеры: Europe/Moscow, US/Eastern');
      }
    }

    if (ctx.session.step === 'set_dnd_start') {
      const time = parseTime(text);
      if (!time) return ctx.reply(errorResponse('INVALID_TIME'));
      db.updateUserSettings(user.id, { dnd_start: time });
      ctx.session.step = 'set_dnd_end';
      return ctx.reply(`🔕 Начало: ${time}. Конец (HH:MM):`);
    }

    if (ctx.session.step === 'set_dnd_end') {
      const time = parseTime(text);
      if (!time) return ctx.reply(errorResponse('INVALID_TIME'));
      db.updateUserSettings(user.id, { dnd_end: time });
      ctx.session.step = null;
      return ctx.reply(`✅ Не беспокоить: настроено!`);
    }

    if (ctx.session.step === 'awaiting_task_title') {
      ctx.session.step = null;
      // Не через AI — если пришло из кнопки "добавить задачу"
      const forceDate = ctx.session.data?.forceDate;
      ctx.session.data = {};
      const date = forceDate === 'tomorrow' ? tomorrowStr(user.timezone) : todayStr(user.timezone);
      return quickCreateTask(ctx, user, text, date);
    }

    // Игнорируем неизвестные команды
    if (text.startsWith('/')) return;

    // НЕ onboarded — направляем на /start
    if (!user.onboarded) {
      return ctx.reply('👋 Нажми /start чтобы начать!');
    }

    // ====== ВСЁ ОСТАЛЬНОЕ → AI-СЕКРЕТАРЬ ======
    // Передаём управление AI модулю (подключается в index.js)
    // AI обработчик добавляется через setupConversationalAI()
  });

  // ============ Quick task create (fallback без AI) ============
  async function quickCreateTask(ctx, user, text, forcedDate) {
    let priority = 3;
    const priMatch = text.match(/!([1-4])/);
    if (priMatch) { priority = parseInt(priMatch[1]); text = text.replace(/!([1-4])/, '').trim(); }

    let dueDate = forcedDate || parseDate(text, user.timezone) || todayStr(user.timezone);
    const dateWords = ['сегодня', 'завтра', 'послезавтра', 'today', 'tomorrow', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
    let title = text;
    dateWords.forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
    title = title.replace(/\d{1,2}\.\d{1,2}(?:\.\d{2,4})?/g, '');
    const dueTime = parseTime(text);
    if (dueTime) title = title.replace(/\d{1,2}[:.]\d{2}/g, '');
    title = title.replace(/\s+/g, ' ').trim();
    if (!title) return ctx.reply(errorResponse('EMPTY_TITLE'));

    const task = db.createTask(user.id, { title, priority, due_date: dueDate, due_time: dueTime });

    if (dueTime && dueDate) {
      const fireAt = localToUtc(dueDate, dueTime, user.timezone);
      if (fireAt) {
        const { DateTime } = require('luxon');
        const fireTime = DateTime.fromISO(fireAt).minus({ minutes: 15 });
        if (fireTime > DateTime.now()) db.createReminder(task.id, user.id, fireTime.toISO(), 15);
      }
    }

    const kb = new InlineKeyboard()
      .text('✅', `done_${task.id}`)
      .text('⏰', `task_remind_${task.id}`)
      .text('📅', `task_reschedule_${task.id}`)
      .text('🏷', `task_priority_${task.id}`)
      .text('📁', `task_cat_${task.id}`)
      .text('🗑', `task_delete_${task.id}`);

    let response = `✅ ${formatTask(task, true)} <i>[#${task.id}]</i>`;
    if (dueTime) response += `\n⏰ Напомню за 15 мин`;
    await ctx.reply(response, { parse_mode: 'HTML', reply_markup: kb });
  }

  return bot;
}

module.exports = { createBot, SECRETARY_STYLES };
