const { Bot, InlineKeyboard, session } = require('grammy');
const db = require('../db/database');
const { PRIORITIES, parseDate, parseTime, formatTask, todayStr, tomorrowStr, errorResponse, escapeHtml, localToUtc, formatDateRu } = require('../utils/helpers');
const { showConfMenu, setupMeetHandlers } = require('../conference/meet');
const { t, getUserLang } = require('../utils/i18n-bot');
const { setupAdminPanel, setupBroadcastSend, isAdmin } = require('./admin-panel');
const { setupPlannerHandlers } = require('./planner');
const { setupDreamHandlers, setupDreamDateCallbacks } = require('./dreams');
const { setupAIToolsHandlers } = require('./ai-tools');

const SECRETARY_STYLES = {
  friendly: { name: '😊 Дружелюбный', desc: 'Тёплый, поддерживающий, с юмором' },
  business: { name: '💼 Деловой', desc: 'Чёткий, профессиональный, по делу' },
  coach:    { name: '🔥 Коуч-мотиватор', desc: 'Энергичный, мотивирующий, толкает вперёд' },
  gentle:   { name: '🌸 Мягкий', desc: 'Спокойный, заботливый, без давления' },
  bold:     { name: '😈 Дерзкий', desc: 'Провокационный, с сарказмом, дерзит по-доброму' },
  patsansky:{ name: '🤙 По пацански', desc: 'Братский, на районе, без понтов' },
  brash:    { name: '🔥 Наглый', desc: 'Напористый, без церемоний, в лоб' },
  partner:  { name: '🤝 Партнёрский', desc: 'На равных, уважительный, как коллега' },
};

// Постоянная нижняя клавиатура (reply keyboard)
function getMainKB(lang) {
  lang = lang || 'ru';
  return {
    keyboard: [
      [{ text: t(lang,'kbToday') }, { text: t(lang,'kbTomorrow') }, { text: t(lang,'kbWeek') }],
      [{ text: t(lang,'kbHabits') }, { text: t(lang,'kbAdd') }, { text: t(lang,'kbMenu') }],
      [{ text: t(lang,'kbConf') }],
    ],
    resize_keyboard: true,
    persistent: true,
    is_persistent: true,
  };
}

function createBot(token, webappUrl) {
  const bot = new Bot(token);

  const isPrivate = (ctx) => ctx.chat?.type === 'private';
  const isGroup = (ctx) => ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

  bot.use(session({
    initial: () => ({ step: null, data: {} }),
  }));

  // ============ GROUP GUARD — блокируем личные команды в группах ============
  const PRIVATE_ONLY_COMMANDS = new Set([
    'today', 'tomorrow', 'week', 'all', 'overdue',
    'habits', 'categories', 'settings', 'timezone', 'rename', 'style',
    'features', 'guide'
  ]);

  bot.use(async (ctx, next) => {
    // DEBUG: логируем все входящие сообщения
    if (ctx.message?.text) {
      console.log(`[MSG] chat=${ctx.chat?.id} type=${ctx.chat?.type} text="${ctx.message.text.slice(0,50)}"`);
    }
    if (isGroup(ctx) && ctx.message?.text) {
      const match = ctx.message.text.match(/^\/(\w+)/);
      if (match && PRIVATE_ONLY_COMMANDS.has(match[1])) {
        return ctx.reply('💡 Эта команда работает только в личном чате. Напишите мне в ЛС!', {
          reply_to_message_id: ctx.message.message_id
        });
      }
    }
    return next();
  });

  // ============ /start — ONBOARDING + deep links ============
  bot.command('start', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const payload = ctx.match?.trim();

    // Deep link: /start conf_ROOMID
    if (payload && payload.startsWith('conf_')) {
      const roomId = payload.slice(5).toUpperCase();
      const room = db.getConfRoom(roomId);
      const kb = new InlineKeyboard();
      if (room && webappUrl) {
        if (isGroup(ctx)) kb.url('🚀 Войти в конференцию', `${webappUrl}?conf=${roomId}`);
        else kb.webApp('🚀 Войти в конференцию', `${webappUrl}?conf=${roomId}`);
      }
      else if (!room) return ctx.reply('❌ Комната не найдена или закрыта.');
      return ctx.reply(
        `📹 <b>Приглашение в конференцию</b>\n\n<b>${escapeHtml(room.name)}</b>\n🔑 ID: <code>${roomId}</code>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    }

    // В группах — только краткая info, без MAIN_KB и onboarding
    if (isGroup(ctx)) {
      const inlineKb = new InlineKeyboard()
        .url('💬 Написать в личку', 'https://t.me/' + (ctx.me?.username || 'PlanDayProbot')).row()
        .text('📹 Созвать звонок', 'group_call');
      if (webappUrl) inlineKb.row().url('📱 Открыть планировщик', webappUrl);
      return ctx.reply(
        `👋 Привет! Я <b>Alpha Planner</b> — AI-помощник для вашей команды.\n\n` +
        `Помогу организовать работу прямо здесь — задачи, созвоны, напоминания.\n\n` +
        `📋 <b>Задачи</b>\n` +
        `/task купить воду — <i>создать задачу</i>\n` +
        `/assign @user отчёт — <i>поручить человеку</i>\n` +
        `/done #5 — <i>отметить выполненной</i>\n` +
        `/list — <i>все задачи</i>\n` +
        `/mytasks — <i>только мои</i>\n` +
        `/board — <i>доска: открыто / в работе / готово</i>\n` +
        `/stats — <i>сколько сделано</i>\n\n` +
        `📹 <b>Видеозвонки</b>\n` +
        `/call — <i>позвонить сейчас</i>\n` +
        `/meet 15:00 Тема — <i>запланировать</i>\n\n` +
        `⚙️ /gs_settings — <i>настройки чата</i>\n` +
        `👑 /gs_admin — <i>управление админами бота</i>`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
    }

    if (user.onboarded && user.secretary_name) {
      // Уже настроен — показываем главное меню с reply keyboard
      const name = user.secretary_name;
      const inlineKb = new InlineKeyboard()
        .text('📋 Задачи сегодня', 'today')
        .text('📊 Привычки', 'habits').row()
        .text('☀️ Итог дня', 'stats_today')
        .text('⚙️ Настройки', 'settings').row()
        .text('🌟 Возможности', 'features_menu')
        .text('📖 Инструкции', 'guide_menu');
      if (webappUrl) inlineKb.row().webApp('📱 Открыть планировщик', webappUrl);

      return ctx.reply(
        `👋 С возвращением, <b>${escapeHtml(ctx.from.first_name)}</b>!\n\n` +
        `Я ${escapeHtml(name)}, твой персональный секретарь.\n` +
        `Просто напиши или отправь голосовое — я всё запишу и напомню.\n\n` +
        `💡 Попробуй: <i>"завтра в 14:00 встреча с клиентом"</i>`,
        { parse_mode: 'HTML', reply_markup: getMainKB(getUserLang(ctx)) }
      ).then(() => ctx.reply('Что делаем?', { reply_markup: inlineKb }));
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
      .text('📋 Задачи сегодня', 'today')
      .text('💡 Что ты умеешь?', 'what_can_do').row();
    if (webappUrl) kb.webApp('📱 Открыть планировщик', webappUrl);

    // Показываем reply keyboard
    await ctx.reply('🎉 Отлично! Готов к работе.', { reply_markup: getMainKB(getUserLang(ctx)) });

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
    const kb = new InlineKeyboard()
      .text('🌟 Возможности', 'features_menu')
      .text('📖 Инструкции', 'guide_menu').row();
    if (webappUrl) kb.url('🌐 Открыть руководство', `${webappUrl}/guide`);

    await ctx.reply(
      `📖 <b>Команды ${escapeHtml(name)}:</b>\n\n` +
      `<b>Задачи:</b>\n` +
      `📋 /today · /tomorrow · /week · /all\n` +
      `✅ /done · ⚠️ /overdue\n\n` +
      `<b>Планировщик:</b>\n` +
      `📊 /habits — привычки\n` +
      `📁 /categories — категории\n` +
      `⚙️ /settings — настройки\n\n` +
      `<b>Конференции:</b>\n` +
      `📹 /meet [название] — создать комнату\n` +
      `📋 /rooms — мои комнаты\n\n` +
      `<b>Группы:</b>\n` +
      `📌 /task · /assign · /list · /board · /stats\n\n` +
      `<b>Прочее:</b>\n` +
      `🎭 /rename · /style · /features · /guide\n\n` +
      `💡 Просто пиши текстом или голосом!`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // ============ /features — Возможности бота ============
  bot.command('features', async (ctx) => {
    await showFeaturesMenu(ctx);
  });

  bot.callbackQuery('features_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFeaturesMenu(ctx);
  });

  async function showFeaturesMenu(ctx) {
    const kb = new InlineKeyboard()
      .text('🧠 AI-секретарь', 'feat_ai')
      .text('📋 Задачи', 'feat_tasks').row()
      .text('⏰ Напоминания', 'feat_reminders')
      .text('📊 Привычки', 'feat_habits').row()
      .text('👥 Группы', 'feat_groups')
      .text('📹 Конференции', 'feat_conf').row()
      .text('🎤 Голос', 'feat_voice')
      .text('📱 WebApp', 'feat_webapp').row()
      .text('🏠 Главная', 'main_menu');
    if (webappUrl) kb.url('📖 Полное руководство', `${webappUrl}/guide`);

    await ctx.reply(
      `🌟 <b>Alpha Planner — все возможности</b>\n\n` +
      `Выбери раздел чтобы узнать подробнее:\n\n` +
      `🧠 AI-секретарь — умный помощник на Groq\n` +
      `📋 Задачи — планирование и приоритеты\n` +
      `⏰ Напоминания — никогда не забудешь\n` +
      `📊 Привычки — трекер со стриками\n` +
      `👥 Группы — совместное планирование\n` +
      `📹 Конференции — видеозвонки внутри Telegram\n` +
      `🎤 Голос — распознавание речи\n` +
      `📱 WebApp — удобный интерфейс`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }

  // main_menu callback
  bot.callbackQuery('main_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const name = user.secretary_name || 'Секретарь';
    const inlineKb = new InlineKeyboard()
      .text('📋 Задачи сегодня', 'today').text('📊 Привычки', 'habits').row()
      .text('☀️ Итог дня', 'stats_today').text('⚙️ Настройки', 'settings').row()
      .text('🌟 Возможности', 'features_menu').text('📖 Инструкции', 'guide_menu');
    if (webappUrl) inlineKb.row().webApp('📱 Открыть планировщик', webappUrl);
    await ctx.reply(
      `🏠 <b>Главное меню</b>\n\nЯ ${escapeHtml(name)}, твой персональный секретарь.`,
      { parse_mode: 'HTML', reply_markup: inlineKb }
    );
  });

  // Подробности по каждому разделу
  bot.callbackQuery('feat_ai', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← Назад', 'features_menu').text('📋 Задачи →', 'feat_tasks');
    await ctx.reply(
      `🧠 <b>AI-секретарь</b>\n\n` +
      `Работает на базе <b>Groq llama-3.3-70b</b> — один из самых быстрых AI.\n\n` +
      `<b>Что умеет:</b>\n` +
      `• Понимает любой текст и голос\n` +
      `• Создаёт задачи из диалога\n` +
      `• Переносит, завершает, удаляет задачи\n` +
      `• Разбивает большие задачи на шаги\n` +
      `• Составляет план дня\n` +
      `• Даёт советы по продуктивности\n` +
      `• Запоминает о тебе важное\n` +
      `• Видит историю последних 50 сообщений\n\n` +
      `<b>4 стиля общения:</b>\n` +
      `😊 Дружелюбный · 💼 Деловой · 🔥 Коуч · 🌸 Мягкий\n\n` +
      `<b>Примеры:</b>\n` +
      `<i>"Завтра в 14:00 встреча с Иваном"</i>\n` +
      `<i>"Что у меня на этой неделе?"</i>\n` +
      `<i>"Помоги разбить задачу по запуску сайта"</i>\n` +
      `<i>"Как лучше организовать рабочий день?"</i>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('feat_tasks', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← AI', 'feat_ai').text('↩ Меню', 'features_menu').text('Напомин. →', 'feat_reminders');
    await ctx.reply(
      `📋 <b>Управление задачами</b>\n\n` +
      `<b>Создание:</b>\n` +
      `• Просто напиши — задача создаётся мгновенно\n` +
      `• Через AI-диалог или голосовое\n` +
      `• <i>"завтра в 14:00 встреча"</i> → задача с датой и временем\n` +
      `• <i>"25.03 отчёт !1"</i> → высокий приоритет, конкретная дата\n\n` +
      `<b>Приоритеты:</b>\n` +
      `🔴 Срочно · 🟠 Высокий · 🟡 Средний · 🟢 Низкий\n\n` +
      `<b>Управление:</b>\n` +
      `• Завершить / перенести / удалить\n` +
      `• Разбить на подзадачи\n` +
      `• Категории (Работа, Личное, Здоровье...)\n\n` +
      `<b>Команды:</b>\n` +
      `/today · /tomorrow · /week · /all\n` +
      `/done · /overdue · /add`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('feat_reminders', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← Задачи', 'feat_tasks').text('↩ Меню', 'features_menu').text('Привычки →', 'feat_habits');
    await ctx.reply(
      `⏰ <b>Система напоминаний</b>\n\n` +
      `<b>Автоматические:</b>\n` +
      `• За 15 минут до задачи с временем\n` +
      `• Напоминаю только если задача не выполнена\n\n` +
      `<b>Ручные:</b>\n` +
      `• Кнопка ⏰ на задаче → 5м / 15м / 30м / 1ч / 3ч\n` +
      `• <i>"Напомни через 2 часа позвонить врачу"</i>\n\n` +
      `<b>Snooze:</b>\n` +
      `• Отложить напоминание на 30 минут\n\n` +
      `<b>Дайджесты:</b>\n` +
      `🌅 <b>Утренний</b> — план дня (настраивается время)\n` +
      `🌙 <b>Вечерний</b> — итоги + перенос невыполненного\n\n` +
      `<b>Не беспокоить:</b>\n` +
      `• Тихие часы — напоминания замолкают\n` +
      `• Настройка: /settings`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('feat_habits', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← Напомин.', 'feat_reminders').text('↩ Меню', 'features_menu').text('Группы →', 'feat_groups');
    await ctx.reply(
      `📊 <b>Трекер привычек</b>\n\n` +
      `<b>Как работает:</b>\n` +
      `• Создавай привычки с любой эмодзи\n` +
      `• Отмечай выполнение каждый день\n` +
      `• Система считает стрики автоматически\n\n` +
      `<b>Стрики:</b>\n` +
      `🔥 Текущий стрик — дней подряд\n` +
      `🏆 Рекорд — максимальный стрик\n\n` +
      `<b>Частота:</b>\n` +
      `• Ежедневно\n` +
      `• По будням\n` +
      `• Произвольно\n\n` +
      `<b>Создание:</b>\n` +
      `• <i>"Добавь привычку: зарядка каждый день"</i>\n` +
      `• /addhabit зарядка\n` +
      `• Кнопка в /habits\n\n` +
      `📱 Детальная статистика в WebApp`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('feat_groups', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← Привычки', 'feat_habits').text('↩ Меню', 'features_menu').text('Конф. →', 'feat_conf');
    await ctx.reply(
      `👥 <b>Совместное планирование в группах</b>\n\n` +
      `Добавь бота в Telegram-группу — группа становится воркспейсом!\n\n` +
      `<b>Команды в группе:</b>\n` +
      `/task [описание] — создать задачу для группы\n` +
      `/assign @user [задача] — назначить участнику\n` +
      `/list — все открытые задачи\n` +
      `/board — канбан: Очередь / В работе / Готово\n` +
      `/mytasks — мои задачи в этой группе\n` +
      `/stats — статистика + топ исполнителей\n\n` +
      `<b>Кнопки на задаче:</b>\n` +
      `👤 Взять задачу — самоназначение\n` +
      `📊 Отчёт — бот пишет в личку, ты пишешь отчёт → публикуется в группу\n` +
      `✅ Выполнено — завершить + уведомить создателя\n` +
      `❌ Отказаться — вернуть задачу в очередь\n\n` +
      `<b>Просроченные:</b>\n` +
      `• Каждое утро бот пингует в группу\n` +
      `• И пишет исполнителю лично`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('feat_conf', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← Группы', 'feat_groups').text('↩ Меню', 'features_menu').text('Голос →', 'feat_voice');
    await ctx.reply(
      `📹 <b>Видеоконференции</b>\n\n` +
      `Полноценные видеозвонки прямо внутри Telegram!\n\n` +
      `<b>Команды:</b>\n` +
      `/meet [название] — создать комнату\n` +
      `/rooms — список моих комнат\n` +
      `/call — быстрый созвон (в группе)\n\n` +
      `<b>Возможности в комнате:</b>\n` +
      `🎤 Микрофон — вкл/выкл\n` +
      `📷 Камера — вкл/выкл\n` +
      `🖥 Демонстрация экрана\n` +
      `✋ Поднять руку\n` +
      `😀 Реакции в эфире\n` +
      `💬 Зашифрованный чат\n\n` +
      `<b>Безопасность:</b>\n` +
      `• E2E шифрование чата (AES-256-GCM)\n` +
      `• Блокировка комнаты\n` +
      `• Кик участников\n` +
      `• Роли: Admin / Helper / User\n\n` +
      `<b>Технологии:</b>\n` +
      `WebRTC + STUN/TURN — работает за NAT`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('feat_voice', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← Конф.', 'feat_conf').text('↩ Меню', 'features_menu').text('WebApp →', 'feat_webapp');
    await ctx.reply(
      `🎤 <b>Голосовые сообщения</b>\n\n` +
      `Просто наговори — бот всё поймёт!\n\n` +
      `<b>Как работает:</b>\n` +
      `1. Отправь голосовое сообщение\n` +
      `2. Groq Whisper распознаёт речь\n` +
      `3. AI-секретарь анализирует текст\n` +
      `4. Создаёт задачи / отвечает на вопрос\n\n` +
      `<b>Примеры что можно надиктовать:</b>\n` +
      `• <i>"Напомни завтра в десять утра позвонить клиенту"</i>\n` +
      `• <i>"Что у меня запланировано на эту неделю?"</i>\n` +
      `• <i>"Добавь привычку делать зарядку каждое утро"</i>\n` +
      `• <i>"Перенеси встречу с Иваном на пятницу"</i>\n\n` +
      `<b>Качество:</b>\n` +
      `• Модель whisper-large-v3\n` +
      `• Распознаёт русский и другие языки\n` +
      `• Работает даже при шуме\n\n` +
      `🔒 Голосовые не хранятся на сервере`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('feat_webapp', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard();
    if (webappUrl) kb.webApp('📱 Открыть WebApp', webappUrl).row();
    kb.text('← Голос', 'feat_voice').text('↩ Меню', 'features_menu');
    await ctx.reply(
      `📱 <b>WebApp — планировщик</b>\n\n` +
      `Удобный графический интерфейс прямо в Telegram!\n\n` +
      `<b>Вкладки:</b>\n` +
      `📅 Сегодня / Завтра / Неделя / Все\n` +
      `📹 Конференции (вкладка 📹)\n\n` +
      `<b>Функции:</b>\n` +
      `• Быстрое добавление задач\n` +
      `• Редактирование с деталями\n` +
      `• Категории и приоритеты\n` +
      `• Трекер привычек\n` +
      `• Настройки часового пояса\n` +
      `• Создание и вход в конференции\n\n` +
      `<b>Тёмная тема</b> — адаптируется под Telegram\n` +
      `<b>Мобильный</b> — оптимизирован для телефона`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // ============ /guide — Инструкции ============
  bot.command('guide', async (ctx) => {
    await showGuide(ctx);
  });

  bot.callbackQuery('guide_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showGuide(ctx);
  });

  async function showGuide(ctx) {
    const kb = new InlineKeyboard()
      .text('🚀 Быстрый старт', 'guide_start')
      .text('📋 Задачи', 'guide_tasks').row()
      .text('👥 Группы', 'guide_groups')
      .text('📹 Конференции', 'guide_conf').row()
      .text('⚙️ Настройки', 'guide_settings')
      .text('🏠 Главная', 'main_menu');
    if (webappUrl) kb.row().url('🌐 Полное руководство', `${webappUrl}/guide`);

    await ctx.reply(
      `📖 <b>Инструкции по использованию</b>\n\n` +
      `Выбери раздел:`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }

  bot.callbackQuery('guide_start', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← К инструкциям', 'guide_menu');
    await ctx.reply(
      `🚀 <b>Быстрый старт</b>\n\n` +
      `<b>Шаг 1. Знакомство</b>\n` +
      `Нажми /start → выбери имя секретаря → стиль общения → расскажи о себе.\n\n` +
      `<b>Шаг 2. Создай первую задачу</b>\n` +
      `Просто напиши боту:\n` +
      `<i>"Завтра в 10:00 встреча с командой"</i>\n` +
      `Секретарь создаст задачу и поставит напоминание.\n\n` +
      `<b>Шаг 3. Голосовые</b>\n` +
      `Отправь голосовое — бот распознает и создаст задачу.\n\n` +
      `<b>Шаг 4. Открой WebApp</b>\n` +
      `Кнопка "Открыть планировщик" → удобный интерфейс.\n\n` +
      `<b>Шаг 5. Добавь в группу</b>\n` +
      `Добавь бота в рабочий чат → совместные задачи.\n\n` +
      `💡 <b>Главное правило:</b> просто общайся с ботом как с секретарём!`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('guide_tasks', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← К инструкциям', 'guide_menu');
    await ctx.reply(
      `📋 <b>Работа с задачами</b>\n\n` +
      `<b>Создание (3 способа):</b>\n\n` +
      `1️⃣ <b>Текстом напрямую:</b>\n` +
      `<code>купить молоко</code> → задача на сегодня\n` +
      `<code>завтра встреча в 14:00</code> → задача с датой\n` +
      `<code>25.03 отчёт !1</code> → дата + приоритет 1\n\n` +
      `2️⃣ <b>Через AI-диалог:</b>\n` +
      `<i>"Добавь задачу позвонить врачу послезавтра в 11"</i>\n\n` +
      `3️⃣ <b>Голосом:</b>\n` +
      `Надиктуй — бот сам создаст.\n\n` +
      `<b>Приоритеты в тексте:</b>\n` +
      `<code>!1</code> = 🔴 срочно · <code>!2</code> = 🟠 высокий\n` +
      `<code>!3</code> = 🟡 средний · <code>!4</code> = 🟢 низкий\n\n` +
      `<b>Управление задачей (кнопки):</b>\n` +
      `✅ Выполнить · ⏰ Напоминание\n` +
      `📅 Перенести · 🏷 Приоритет · 📁 Категория · 🗑 Удалить`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('guide_groups', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← К инструкциям', 'guide_menu');
    await ctx.reply(
      `👥 <b>Групповое планирование</b>\n\n` +
      `<b>Как подключить:</b>\n` +
      `1. Добавь бота в Telegram-группу\n` +
      `2. Выдай права администратора\n` +
      `3. Напиши /task в группе\n\n` +
      `<b>Сценарий использования:</b>\n\n` +
      `Менеджер:\n` +
      `<code>/task Подготовить презентацию к пятнице</code>\n` +
      `→ Бот создаёт задачу с кнопками\n\n` +
      `Исполнитель:\n` +
      `→ Нажимает 👤 <b>Взять задачу</b>\n` +
      `→ Статус меняется на "В работе"\n` +
      `→ Создатель получает уведомление\n\n` +
      `Готово:\n` +
      `→ Нажимает 📊 <b>Отчёт</b> → пишет в личку\n` +
      `→ Отчёт публикуется в группу\n` +
      `→ Нажимает ✅ <b>Выполнено</b>\n\n` +
      `📊 /board — канбан-доска группы\n` +
      `📈 /stats — кто сколько сделал`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('guide_conf', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← К инструкциям', 'guide_menu');
    await ctx.reply(
      `📹 <b>Видеоконференции</b>\n\n` +
      `<b>Создать созвон:</b>\n` +
      `<code>/meet Планёрка команды</code>\n` +
      `→ Бот создаёт комнату и даёт ссылку\n\n` +
      `<b>Войти в комнату:</b>\n` +
      `• Нажать кнопку "Войти в комнату"\n` +
      `• Или /rooms → выбрать комнату\n` +
      `• Или ввести ID: /meet → поле "Введите ID"\n\n` +
      `<b>В конференции:</b>\n` +
      `🎤 Нажми на микрофон чтобы заговорить\n` +
      `📷 Включи камеру кнопкой 📷\n` +
      `🖥 Демонстрация экрана — кнопка 🖥\n` +
      `✋ Поднять руку — кнопка ✋\n` +
      `💬 Чат — кнопка 💬 (зашифрован!)\n\n` +
      `<b>Быстрый созвон в группе:</b>\n` +
      `<code>/call</code> → мгновенная комната для всех\n\n` +
      `<b>Приглашение:</b>\n` +
      `Поделись ID комнаты (8 символов) — участник вводит его в WebApp`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('guide_settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text('← К инструкциям', 'guide_menu');
    await ctx.reply(
      `⚙️ <b>Настройки</b>\n\n` +
      `<b>Команда /settings:</b>\n` +
      `• 🕐 Время утреннего дайджеста\n` +
      `• 🌙 Время вечернего обзора\n` +
      `• 🌍 Часовой пояс\n` +
      `• 🔕 Режим "Не беспокоить"\n` +
      `• 🎭 Имя и стиль секретаря\n\n` +
      `<b>Часовой пояс:</b>\n` +
      `<code>/timezone Europe/Moscow</code>\n` +
      `<code>/timezone Asia/Almaty</code>\n` +
      `<code>/timezone US/Eastern</code>\n\n` +
      `<b>Стиль секретаря (/style):</b>\n` +
      `😊 Дружелюбный — тёплый, с юмором\n` +
      `💼 Деловой — чёткий, по делу\n` +
      `🔥 Коуч — энергичный, мотивирующий\n` +
      `🌸 Мягкий — спокойный, без давления\n\n` +
      `<b>Переименовать секретаря:</b>\n` +
      `<code>/rename Макс</code>`,
      { parse_mode: 'HTML', reply_markup: kb }
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

    // Пустые состояния
    if (tasks.length === 0) {
      let emptyText, kb;
      if (mode === 'overdue') {
        emptyText = `⚠️ <b>Просроченных нет!</b>\n\n🎉 Отличная работа — всё в срок!`;
        kb = new InlineKeyboard().text('📋 Сегодня', 'today');
      } else if (mode === 'today') {
        emptyText = `📅 <b>${title}</b>\n\nСписок пуст — день свободен! ✨\n\nДобавь первую задачу:`;
        kb = new InlineKeyboard()
          .text('➕ Добавить задачу', 'new_task_today').row()
          .text('💡 Примеры задач', 'task_examples');
      } else if (mode === 'tomorrow') {
        emptyText = `📅 <b>${title}</b>\n\nНа завтра пусто ✨\n\nЗапланировать что-нибудь?`;
        kb = new InlineKeyboard().text('➕ Добавить на завтра', 'new_task_tomorrow');
      } else {
        emptyText = `<b>${title}</b>\n\nСписок пуст ✨`;
        kb = new InlineKeyboard().text('➕ Добавить', 'new_task_today');
      }
      return ctx.reply(emptyText, { parse_mode: 'HTML', reply_markup: kb });
    }

    // Заголовок со статистикой
    let text = `<b>${title}</b>`;
    if (mode === 'today') {
      const done = tasks.filter(t => t.status === 'done').length;
      const pct = Math.round(done / tasks.length * 100);
      text += `  ·  ✅ ${done}/${tasks.length}`;
      if (pct === 100) text += ` 🏆`;
    }
    text += '\n\n';

    // Показываем первые 8 задач с inline кнопками
    const MAX_TASKS = 8;
    const showTasks = tasks.slice(0, MAX_TASKS);
    const hiddenCount = tasks.length - showTasks.length;

    showTasks.forEach(t => { text += formatTask(t, mode === 'all' || mode === 'overdue') + '\n'; });
    if (hiddenCount > 0) text += `\n<i>... ещё ${hiddenCount} задач</i>`;

    // Кнопки на каждую задачу (✅ + имя)
    const kb = new InlineKeyboard();
    showTasks.filter(t => t.status !== 'done').forEach((t, i) => {
      const shortTitle = t.title.length > 22 ? t.title.slice(0, 22) + '…' : t.title;
      kb.text(`✅ ${shortTitle}`, `done_${t.id}`)
        .text('⏰', `task_remind_${t.id}`)
        .text('📅', `task_reschedule_${t.id}`)
        .text('🗑', `task_delete_${t.id}`)
        .row();
    });

    // Overdue — массовые действия
    if (mode === 'overdue') {
      kb.text('📅 Всё на сегодня', 'move_all_today')
        .text('📅 Всё на завтра', 'move_all_tmr_overdue');
    } else if (mode === 'today') {
      kb.text('➕ Добавить', 'new_task_today').text('☀️ Итог', 'stats_today');
    } else if (mode === 'tomorrow') {
      kb.text('➕ Добавить', 'new_task_tomorrow');
    }

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
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
  async function showHabits(ctx) {
    const user = db.ensureUser(ctx.from);
    const habits = db.getUserHabits(user.id);
    const today = todayStr(user.timezone);

    if (habits.length === 0) {
      return ctx.reply(
        '📊 <b>Привычки</b>\n\nУ тебя пока нет привычек.\n\nНапиши: <i>"Добавь привычку: зарядка каждый день"</i>\nИли скажи голосом 🎤',
        { parse_mode: 'HTML' }
      );
    }

    let text = `📊 <b>Привычки — ${formatDateRu(today)}:</b>\n\n`;
    const kb = new InlineKeyboard();
    habits.forEach((h, i) => {
      const doneToday = h.last_logged === today;
      const streakBar = h.current_streak > 0 ? `🔥 ${h.current_streak}` : '➖';
      const status = doneToday ? '✅' : '⬜';
      text += `${status} ${h.emoji} <b>${escapeHtml(h.title)}</b>  ${streakBar} дн.\n`;
      if (!doneToday) {
        kb.text(`${h.emoji} Отметить`, `habit_done_${h.id}`);
        if (i % 2 === 1) kb.row();
      }
    });

    const allDone = habits.every(h => h.last_logged === today);
    if (allDone) text += '\n🏆 Все привычки отмечены!';

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb.inline_keyboard.flat().length ? kb : undefined });
  }

  bot.command('habits', async (ctx) => { await showHabits(ctx); });

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

    const alertsOn = user.alerts_enabled !== 0;
    const alertMin1 = user.alert_before_min || 60;
    const alertMin2 = user.alert_before_min2 || 15;
    const alertRepeat = user.alert_repeat_min || 5;
    const alertAlarm = user.alert_alarm_min || 2;

    const kb = new InlineKeyboard()
      .text('🕐 Утренний дайджест', 'set_morning')
      .text('🌙 Вечерний обзор', 'set_evening').row()
      .text('🌍 Часовой пояс', 'set_timezone')
      .text('🔕 Не беспокоить', 'set_dnd').row()
      .text('🔔 Уведомления о задачах', 'set_alerts').row()
      .text('🎭 Сменить имя', 'change_name')
      .text('🎨 Сменить стиль', 'change_style');

    await ctx.reply(
      `⚙️ <b>Настройки:</b>\n\n` +
      `🤖 Секретарь: <b>${escapeHtml(name)}</b>\n` +
      `🎭 Стиль: ${style}\n` +
      `🌍 Часовой пояс: <code>${user.timezone}</code>\n` +
      `🕐 Утро: <code>${user.morning_digest}</code>\n` +
      `🌙 Вечер: <code>${user.evening_review}</code>\n` +
      `🔕 DND: <code>${user.dnd_start} - ${user.dnd_end}</code>\n` +
      `🔔 Алерты: ${alertsOn ? `✅ за ${alertMin1}мин, за ${alertMin2}мин, повтор/${alertRepeat}мин, будильник/${alertAlarm}мин` : '❌ выкл'}`,
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
  bot.callbackQuery('habits', async (ctx) => { await ctx.answerCallbackQuery(); await showHabits(ctx); });
  bot.callbackQuery('settings', async (ctx) => {
    await ctx.answerCallbackQuery();
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
      `🌙 Вечер: <code>${user.evening_review}</code>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // ☀️ Итог дня
  bot.callbackQuery('stats_today', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const today = todayStr(user.timezone);
    const tasks = db.getTasksByDate(user.id, today);
    const overdue = db.getOverdueTasks(user.id, today);
    const habits = db.getUserHabits(user.id);
    const done = tasks.filter(t => t.status === 'done').length;
    const pending = tasks.filter(t => t.status !== 'done').length;
    const habitsToday = habits.filter(h => h.last_logged === today).length;

    let text = `☀️ <b>Итог дня — ${formatDateRu(today)}</b>\n\n`;
    text += `📋 <b>Задачи:</b>\n`;
    text += `  ✅ Выполнено: ${done}\n`;
    text += `  ⏳ Осталось: ${pending}\n`;
    if (overdue.length > 0) text += `  ⚠️ Просрочено: ${overdue.length}\n`;
    text += `\n📊 <b>Привычки:</b> ${habitsToday}/${habits.length} отмечено\n`;
    if (habits.length > 0) {
      const pct = Math.round(habitsToday / habits.length * 100);
      text += `  ${'🟩'.repeat(Math.round(pct/20))}${'⬜'.repeat(5 - Math.round(pct/20))} ${pct}%\n`;
    }
    if (done === tasks.length && tasks.length > 0) text += `\n🏆 <b>Все задачи выполнены!</b>`;
    else if (pending > 0) text += `\n💪 Ещё ${pending} задач до конца дня`;

    const kb = new InlineKeyboard()
      .text('📋 Сегодня', 'today').text('⚠️ Просроченные', 'overdue_cb').row()
      .text('📊 Привычки', 'habits');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery('overdue_cb', async (ctx) => { await ctx.answerCallbackQuery(); await showTasks(ctx, 'overdue'); });
  bot.callbackQuery('show_today', async (ctx) => { await ctx.answerCallbackQuery(); await showTasks(ctx, 'today'); });
  bot.callbackQuery('show_tomorrow', async (ctx) => { await ctx.answerCallbackQuery(); await showTasks(ctx, 'tomorrow'); });
  bot.callbackQuery('show_week', async (ctx) => { await ctx.answerCallbackQuery(); await showWeek(ctx); });
  bot.callbackQuery('show_all', async (ctx) => { await ctx.answerCallbackQuery(); await showTasks(ctx, 'all'); });
  bot.callbackQuery('show_overdue', async (ctx) => { await ctx.answerCallbackQuery(); await showTasks(ctx, 'overdue'); });

  // 💡 Примеры задач
  bot.callbackQuery('task_examples', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `💡 <b>Примеры — просто напиши:</b>\n\n` +
      `• <code>Встреча с Иваном завтра в 15:00</code>\n` +
      `• <code>Купить молоко сегодня</code>\n` +
      `• <code>Позвонить врачу 28.03 в 10:00 !1</code>\n` +
      `• <code>Сдать отчёт до пятницы !2</code>\n\n` +
      `Или голосом — просто наговори задачу! 🎤`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('➕ Добавить', 'new_task_today') }
    );
  });

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
    const kb = new InlineKeyboard()
      .text('🇷🇺 Калининград +2', 'tz_Europe/Kaliningrad').text('🇷🇺 Москва +3', 'tz_Europe/Moscow').row()
      .text('🇷🇺 Саратов +4', 'tz_Europe/Saratov').text('🇷🇺 Екатеринбург +5', 'tz_Asia/Yekaterinburg').row()
      .text('🇷🇺 Омск +6', 'tz_Asia/Omsk').text('🇷🇺 Новосибирск +7', 'tz_Asia/Novosibirsk').row()
      .text('🇷🇺 Иркутск +8', 'tz_Asia/Irkutsk').text('🇷🇺 Якутск +9', 'tz_Asia/Yakutsk').row()
      .text('🇷🇺 Владивосток +10', 'tz_Asia/Vladivostok').text('🇷🇺 Магадан +11', 'tz_Asia/Magadan').row()
      .text('🇷🇺 Камчатка +12', 'tz_Asia/Kamchatka').row()
      .text('🕐 По GMT смещению', 'tz_mode_gmt').row()
      .text('✏️ Свой вариант (ввести GMT)', 'tz_mode_custom');
    await ctx.reply(
      '🌍 <b>Выберите часовой пояс:</b>\n\n' +
      '⬇️ Выберите свой город или укажите GMT вручную',
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // GMT offset выбор — кнопки
  bot.callbackQuery('tz_mode_gmt', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('+0', 'tzgmt_Etc/GMT').text('+1', 'tzgmt_Etc/GMT-1').text('+2', 'tzgmt_Etc/GMT-2').text('+3', 'tzgmt_Etc/GMT-3').row()
      .text('+4', 'tzgmt_Etc/GMT-4').text('+5', 'tzgmt_Etc/GMT-5').text('+6', 'tzgmt_Etc/GMT-6').text('+7', 'tzgmt_Etc/GMT-7').row()
      .text('+8', 'tzgmt_Etc/GMT-8').text('+9', 'tzgmt_Etc/GMT-9').text('+10', 'tzgmt_Etc/GMT-10').text('+11', 'tzgmt_Etc/GMT-11').row()
      .text('+12', 'tzgmt_Etc/GMT-12').text('-1', 'tzgmt_Etc/GMT+1').text('-2', 'tzgmt_Etc/GMT+2').text('-3', 'tzgmt_Etc/GMT+3').row()
      .text('-4', 'tzgmt_Etc/GMT+4').text('-5', 'tzgmt_Etc/GMT+5').text('-6', 'tzgmt_Etc/GMT+6').text('-7', 'tzgmt_Etc/GMT+7').row()
      .text('-8', 'tzgmt_Etc/GMT+8').text('-9', 'tzgmt_Etc/GMT+9').text('-10', 'tzgmt_Etc/GMT+10').text('-11', 'tzgmt_Etc/GMT+11').row()
      .text('⬅️ Назад', 'set_timezone');
    await ctx.editMessageText(
      '🕐 <b>Выберите GMT смещение:</b>\n\n' +
      '<i>Москва +3, Саратов +4, Екатеринбург +5</i>',
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // Свой вариант — ввод GMT вручную
  bot.callbackQuery('tz_mode_custom', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'tz_custom_gmt';
    await ctx.reply(
      '✏️ <b>Введите ваш GMT:</b>\n\n' +
      'Напишите число от -12 до +14\n' +
      'Например: <code>+4</code> или <code>-5</code> или <code>3</code>\n\n' +
      '<i>Москва = +3, Саратов = +4, Камчатка = +12</i>',
      { parse_mode: 'HTML' }
    );
  });

  bot.callbackQuery(/^tzgmt_(.+)$/, async (ctx) => {
    const tz = ctx.match[1];
    const user = db.ensureUser(ctx.from);
    try {
      const { DateTime } = require('luxon');
      const test = DateTime.now().setZone(tz);
      if (!test.isValid) throw new Error();
      db.updateUserSettings(user.id, { timezone: tz });
      ctx.session.step = null;
      // Показываем понятное смещение
      const offset = test.offset / 60;
      const sign = offset >= 0 ? '+' : '';
      await ctx.answerCallbackQuery('✅ Сохранено');
      await ctx.editMessageText(`✅ Часовой пояс: <b>GMT${sign}${offset}</b>\n<code>${tz}</code>`, { parse_mode: 'HTML' });
    } catch { await ctx.answerCallbackQuery('❌ Ошибка'); }
  });

  bot.callbackQuery(/^tz_(.+)$/, async (ctx) => {
    const tz = ctx.match[1];
    const user = db.ensureUser(ctx.from);
    try {
      const { DateTime } = require('luxon');
      const test = DateTime.now().setZone(tz);
      if (!test.isValid) throw new Error();
      db.updateUserSettings(user.id, { timezone: tz });
      ctx.session.step = null;
      await ctx.answerCallbackQuery('✅ Сохранено');
      await ctx.editMessageText(`✅ Часовой пояс: <code>${tz}</code>`, { parse_mode: 'HTML' });
    } catch { await ctx.answerCallbackQuery('❌ Ошибка'); }
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

  // ============ Alert settings ============
  bot.callbackQuery('set_alerts', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const alertsOn = user.alerts_enabled !== 0;
    const kb = new InlineKeyboard()
      .text(alertsOn ? '🔕 Выключить уведомления' : '🔔 Включить уведомления', 'alert_toggle').row()
      .text('⏰ За сколько мин (1-й)', 'alert_set_min1')
      .text('⏰ За сколько мин (2-й)', 'alert_set_min2').row()
      .text('🔁 Интервал повтора', 'alert_set_repeat')
      .text('🚨 Интервал будильника', 'alert_set_alarm').row()
      .text('← Назад', 'settings');
    await ctx.reply(
      `🔔 <b>Настройки уведомлений о задачах</b>\n\n` +
      `Статус: ${alertsOn ? '✅ Включены' : '❌ Выключены'}\n\n` +
      `📍 Принцип работы:\n` +
      `• <b>1-е уведомление</b> — за ${user.alert_before_min || 60} мин (повтор каждые ${user.alert_repeat_min || 5} мин)\n` +
      `• <b>2-е уведомление</b> — за ${user.alert_before_min2 || 15} мин\n` +
      `• <b>Будильник</b> — в момент начала, каждые ${user.alert_alarm_min || 2} мин пока не подтвердишь`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery('alert_toggle', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const newVal = user.alerts_enabled === 0 ? 1 : 0;
    db.updateUserSettings(user.id, { alerts_enabled: newVal });
    await ctx.reply(newVal ? '🔔 Уведомления включены' : '🔕 Уведомления выключены');
  });

  bot.callbackQuery('alert_set_min1', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'alert_set_min1';
    const kb = new InlineKeyboard()
      .text('30 мин', 'alert_min1_30').text('45 мин', 'alert_min1_45')
      .text('60 мин', 'alert_min1_60').text('90 мин', 'alert_min1_90').row()
      .text('2 часа', 'alert_min1_120').text('3 часа', 'alert_min1_180');
    await ctx.reply('⏰ За сколько минут до начала 1-е уведомление?\n\nИли введите число минут вручную:', { reply_markup: kb });
  });

  bot.callbackQuery(/^alert_min1_(\d+)$/, async (ctx) => {
    const min = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    db.updateUserSettings(user.id, { alert_before_min: min });
    ctx.session.step = null;
    await ctx.answerCallbackQuery(`✅ За ${min} мин`);
    await ctx.reply(`✅ 1-е уведомление — за <b>${min} мин</b>`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('alert_set_min2', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'alert_set_min2';
    const kb = new InlineKeyboard()
      .text('5 мин', 'alert_min2_5').text('10 мин', 'alert_min2_10')
      .text('15 мин', 'alert_min2_15').text('20 мин', 'alert_min2_20');
    await ctx.reply('⏰ За сколько минут 2-е уведомление?\nИли введите число вручную:', { reply_markup: kb });
  });

  bot.callbackQuery(/^alert_min2_(\d+)$/, async (ctx) => {
    const min = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    db.updateUserSettings(user.id, { alert_before_min2: min });
    ctx.session.step = null;
    await ctx.answerCallbackQuery(`✅ За ${min} мин`);
    await ctx.reply(`✅ 2-е уведомление — за <b>${min} мин</b>`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('alert_set_repeat', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('3 мин', 'alert_repeat_3').text('5 мин', 'alert_repeat_5')
      .text('10 мин', 'alert_repeat_10').text('15 мин', 'alert_repeat_15');
    await ctx.reply('🔁 Как часто повторять если не подтвердил?', { reply_markup: kb });
  });

  bot.callbackQuery(/^alert_repeat_(\d+)$/, async (ctx) => {
    const min = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    db.updateUserSettings(user.id, { alert_repeat_min: min });
    await ctx.answerCallbackQuery(`✅ Каждые ${min} мин`);
    await ctx.reply(`✅ Повтор каждые <b>${min} мин</b>`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('alert_set_alarm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('1 мин', 'alert_alarm_1').text('2 мин', 'alert_alarm_2')
      .text('3 мин', 'alert_alarm_3').text('5 мин', 'alert_alarm_5');
    await ctx.reply('🚨 Интервал будильника (в момент начала):', { reply_markup: kb });
  });

  bot.callbackQuery(/^alert_alarm_(\d+)$/, async (ctx) => {
    const min = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    db.updateUserSettings(user.id, { alert_alarm_min: min });
    await ctx.answerCallbackQuery(`✅ Каждые ${min} мин`);
    await ctx.reply(`✅ Будильник каждые <b>${min} мин</b>`, { parse_mode: 'HTML' });
  });

  // ============ /meet — запланировать конференцию ============
  bot.command('meet', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const raw = (ctx.match || '').trim();
    if (!raw) {
      return ctx.reply(
        '📹 <b>Запланировать конференцию:</b>\n\n' +
        '<code>/meet 14:00 Тема звонка</code> — сегодня\n' +
        '<code>/meet завтра 10:00 Планёрка</code>\n' +
        '<code>/meet 28.03 16:30 Обсуждение</code>\n\n' +
        '⚡ <code>/call</code> — мгновенный звонок',
        { parse_mode: 'HTML' }
      );
    }

    // Парсим дату, время и название
    let text = raw;
    let date = null;
    let time = null;
    let title = '';

    const { DateTime } = require('luxon');
    const tz = user.timezone || 'Europe/Moscow';
    const now = DateTime.now().setZone(tz);

    // Дата: "завтра", "послезавтра", "28.03", "28.03.2026"
    if (/^завтра\b/i.test(text)) {
      date = now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
      text = text.replace(/^завтра\s*/i, '');
    } else if (/^послезавтра\b/i.test(text)) {
      date = now.plus({ days: 2 }).toFormat('yyyy-MM-dd');
      text = text.replace(/^послезавтра\s*/i, '');
    } else {
      const dateMatch = text.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.year;
        date = DateTime.fromObject({ year, month, day }, { zone: tz }).toFormat('yyyy-MM-dd');
        text = text.slice(dateMatch[0].length);
      }
    }

    // Время: "14:00" или "14.00"
    const timeMatch = text.match(/^(\d{1,2})[:.:](\d{2})\s*/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        text = text.slice(timeMatch[0].length);
      }
    }

    if (!time) {
      return ctx.reply('❌ Укажите время. Пример: <code>/meet 14:00 Тема</code>', { parse_mode: 'HTML' });
    }

    if (!date) date = now.toFormat('yyyy-MM-dd');
    title = text.trim() || 'Конференция';

    // Собираем ISO дату-время для scheduled_at
    const scheduledAt = `${date}T${time}:00`;
    const scheduledDt = DateTime.fromISO(scheduledAt, { zone: tz });
    if (!scheduledDt.isValid) {
      return ctx.reply('❌ Неверная дата/время');
    }

    // UTC для хранения
    const scheduledUtc = scheduledDt.toUTC().toISO();

    // Создаём комнату
    const room = db.createConfRoom(title, user.id, null);

    // Сохраняем запланированную встречу
    const chatId = ctx.chat.id;
    db.createScheduledMeet(room.id, chatId, title, scheduledUtc, user.id);

    // Красивая дата
    const dayNames = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' };
    const dayOfWeek = dayNames[scheduledDt.weekday] || '';
    const dateStr = scheduledDt.toFormat('dd.MM.yyyy');
    const isToday = date === now.toFormat('yyyy-MM-dd');
    const isTomorrow = date === now.plus({ days: 1 }).toFormat('yyyy-MM-dd');
    const dateLabel = isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : `${dayOfWeek} ${dateStr}`;

    const browserLink = webappUrl ? `${webappUrl}/?conf=${room.id}` : '';
    const tgLink = `https://t.me/${ctx.me.username}?start=conf_${room.id}`;

    const kb = new InlineKeyboard();
    if (browserLink) kb.url('🌐 Войти (браузер)', browserLink).row();
    kb.url('📱 Войти (Telegram)', tgLink).row();
    kb.text('✅ Буду — напомни!', `meet_yes_${room.id}`).text('❌ Не смогу', `meet_no_${room.id}`).row();
    kb.text('🔗 Поделиться', `conf_share_${room.id}`);

    const msg = await ctx.reply(
      `📹 <b>Конференция запланирована!</b>\n\n` +
      `📌 <b>${escapeHtml(title)}</b>\n` +
      `📅 ${dateLabel} в ${time}\n` +
      `🔑 ID: <code>${room.id}</code>\n` +
      `👤 Организатор: ${escapeHtml(ctx.from.first_name)}\n` +
      `👥 Участники: 0\n\n` +
      `🌐 <a href="${browserLink}">Открыть в браузере</a>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );

    // Сохраняем message_id для обновления
    try {
      const meet = db.getScheduledMeet(room.id);
      if (meet) {
        const d = require('../db/database');
        d.getDb().prepare('UPDATE scheduled_meets SET message_id=? WHERE id=?').run(msg.message_id, meet.id);
      }
    } catch {}
  });

  // ============ MEET RSVP callbacks ============
  bot.callbackQuery(/^meet_yes_(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const meet = db.getScheduledMeet(roomId);
    if (!meet) return ctx.answerCallbackQuery('Встреча не найдена');
    const user = db.ensureUser(ctx.from);
    db.addMeetRsvp(meet.id, user.id, ctx.from.first_name, 'yes');
    const count = db.getMeetRsvpCount(meet.id);
    await ctx.answerCallbackQuery('✅ Вы подтвердили участие! Напомню в личку.');

    // Send personal reminder in DM with countdown
    try {
      const { DateTime } = require('luxon');
      const schedDt = DateTime.fromISO(meet.scheduled_at, { zone: 'utc' });
      const nowDt = DateTime.utc();
      const diffMs = schedDt.diff(nowDt).milliseconds;
      const diffMin = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      const timeLeft = hours > 0 ? hours + ' ч ' + mins + ' мин' : mins + ' мин';
      const timeStr = schedDt.setZone(user.timezone || 'Europe/Moscow').toFormat('HH:mm');
      const dateStr = schedDt.setZone(user.timezone || 'Europe/Moscow').toFormat('dd.MM.yyyy');

      const dmKb = new InlineKeyboard();
      if (webappUrl) dmKb.url('🌐 Войти в конференцию', webappUrl + '/?conf=' + roomId).row();
      dmKb.text('🔕 Отменить напоминание', 'meet_cancel_' + roomId);

      // Smart reminder text based on time left
      var reminderInfo;
      if (diffMin <= 0) {
        reminderInfo = '🔴 <b>Конференция уже началась! Войдите прямо сейчас.</b>';
      } else if (diffMin <= 5) {
        reminderInfo = '⚡ <b>До начала: ' + diffMin + ' мин</b>\n🔔 Будильник сработает через ' + diffMin + ' мин!';
      } else if (diffMin <= 15) {
        reminderInfo = '⏰ <b>До начала: ' + timeLeft + '</b>\n🔔 Следующее напоминание — будильник ровно в ' + timeStr + '!';
      } else if (diffMin <= 60) {
        reminderInfo = '⏰ <b>До начала: ' + timeLeft + '</b>\n🔔 Напомню за 15 минут (в ' + schedDt.minus({minutes:15}).setZone(user.timezone||'Europe/Moscow').toFormat('HH:mm') + ') и будильник в ' + timeStr;
      } else {
        reminderInfo = '⏰ <b>До начала: ' + timeLeft + '</b>\n🔔 Напомню за 15 минут и будильник в момент начала';
      }

      await ctx.api.sendMessage(user.tg_id,
        '✅ <b>Вы подтвердили участие!</b>\n\n' +
        '📌 <b>' + escapeHtml(meet.title) + '</b>\n' +
        '📅 ' + dateStr + ' в ' + timeStr + '\n\n' +
        reminderInfo + '\n\n' +
        '💡 Напоминание включено — ничего нажимать не надо!',
        { parse_mode: 'HTML', reply_markup: dmKb }
      );
    } catch(e) { /* user may not have DM with bot */ }

    // Обновляем счётчик в сообщении
    try {
      const rsvps = db.getMeetRsvps(meet.id);
      const names = rsvps.filter(r => r.status === 'yes').map(r => r.tg_name || 'Участник');
      const text = ctx.callbackQuery.message.text || '';
      const html = ctx.callbackQuery.message.caption || '';
      // Обновляем сообщение
      const { DateTime } = require('luxon');
      const scheduledDt = DateTime.fromISO(meet.scheduled_at);
      const time = scheduledDt.setZone('Europe/Moscow').toFormat('HH:mm');

      const kb = new InlineKeyboard();
      if (webappUrl) {
        if (isGroup(ctx)) {
          kb.url('🚀 Войти', `${webappUrl}?conf=${roomId}`);
        } else {
          kb.webApp('🚀 Войти', `${webappUrl}?conf=${roomId}`);
        }
      }
      kb.text(`✅ Буду (${count}) — напомню!`, `meet_yes_${roomId}`).text('❌ Не смогу', `meet_no_${roomId}`).row();
      kb.text('🔗 Пригласить', `conf_invite_${roomId}`);

      await ctx.editMessageText(
        `📹 <b>Конференция запланирована!</b>\n\n` +
        `📌 <b>${escapeHtml(meet.title)}</b>\n` +
        `📅 ${scheduledDt.toFormat('dd.MM.yyyy')} в ${time}\n` +
        `🔑 ID: <code>${roomId}</code>\n` +
        `👥 Участники (${count}): ${names.join(', ')}\n\n` +
        `🌐 ${webappUrl}/?conf=${roomId}\n` +
        `📱 https://t.me/${ctx.me?.username || 'PlanDayProbot'}?start=conf_${roomId}`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } catch {}
  });

  bot.callbackQuery(/^meet_cancel_(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const meet = db.getScheduledMeet(roomId);
    if (!meet) return ctx.answerCallbackQuery('Не найдена');
    const user = db.ensureUser(ctx.from);
    db.addMeetRsvp(meet.id, user.id, ctx.from.first_name, 'cancelled');
    await ctx.answerCallbackQuery('🔕 Напоминание отменено');
    try { await ctx.editMessageText('🔕 Напоминание о конференции отменено.'); } catch {}
  });

  bot.callbackQuery(/^meet_no_(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const meet = db.getScheduledMeet(roomId);
    if (!meet) return ctx.answerCallbackQuery('Встреча не найдена');
    const user = db.ensureUser(ctx.from);
    db.addMeetRsvp(meet.id, user.id, ctx.from.first_name, 'no');
    await ctx.answerCallbackQuery('Вы отказались от участия');
  });

  // ============ GROUP: inline кнопка "Созвать звонок" ============
  bot.callbackQuery('group_call', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const chatTitle = ctx.chat?.title || 'группе';
    const room = db.createConfRoom(`Звонок в ${chatTitle}`, user.id, null);
    const browserLink = webappUrl ? `${webappUrl}/?conf=${room.id}` : '';
    const tgLink = `https://t.me/${ctx.me.username}?start=conf_${room.id}`;
    const kb = new InlineKeyboard();
    if (browserLink) kb.url('🌐 Войти (браузер)', browserLink).row();
    kb.url('📱 Войти (Telegram)', tgLink).row();
    kb.text('🔗 Поделиться', `conf_share_${room.id}`);
    await ctx.reply(
      `📹 <b>Видеозвонок создан!</b>\n🔑 ID: <code>${room.id}</code>\n\n` +
      `🌐 ${webappUrl}/?conf=${room.id}\n` +
      `📱 https://t.me/${ctx.me.username}?start=conf_${room.id}`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // ============ GROUP MESSAGES — only commands and mentions ============
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
      const text = ctx.message.text.trim();
      const botUsername = ctx.me?.username;
      const isMentioned = botUsername && text.includes(`@${botUsername}`);
      // В группах обрабатываем только команды и упоминания
      if (!isMentioned && !text.startsWith('/')) return;
      // /meet — запланировать конференцию (обрабатывается через bot.command)
      if (text.startsWith('/meet') || text.startsWith(`/meet@${botUsername}`)) {
        return next(); // пропускаем к bot.command('meet')
      }
      // /call — быстрый созыв конференции в группе
      if (text === '/call' || text === `/call@${botUsername}`) {
        const user = db.ensureUser(ctx.from);
        const room = db.createConfRoom(`Звонок в ${ctx.chat.title || 'группе'}`, user.id, null);
        const browserLink = webappUrl ? `${webappUrl}/?conf=${room.id}` : '';
        const tgLink = `https://t.me/${botUsername}?start=conf_${room.id}`;
        const kb = new InlineKeyboard();
        if (browserLink) kb.url('🌐 Войти (браузер)', browserLink).row();
        kb.url('📱 Войти (Telegram)', tgLink).row();
        kb.text('🔗 Поделиться', `conf_share_${room.id}`);
        return ctx.reply(
          `📹 <b>Видеозвонок создан!</b>\n🔑 ID: <code>${room.id}</code>\n\nНажмите кнопку чтобы войти:`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
      }
      // Group commands — handle here
      const cmd = text.split(/[@\s]/)[0].slice(1).toLowerCase();
      const cmdArg = text.replace(/^\/\w+(@\w+)?\s*/, '').trim();

      if (cmd === 'start' || cmd === 'help') {
        return ctx.reply(
          `👋 Привет! Я <b>Alpha Planner</b> — AI-помощник для вашей команды.\n\n` +
          `Помогу организовать работу прямо здесь — задачи, созвоны, напоминания.\n\n` +
          `📋 <b>Задачи</b>\n` +
          `/task купить воду — <i>создать задачу для группы</i>\n` +
          `/assign @user отчёт — <i>поручить задачу человеку</i>\n` +
          `/done #5 — <i>отметить задачу выполненной</i>\n` +
          `/list — <i>посмотреть все задачи</i>\n` +
          `/mytasks — <i>только мои задачи</i>\n` +
          `/board — <i>доска: открыто / в работе / готово</i>\n` +
          `/stats — <i>сколько задач сделано</i>\n\n` +
          `📹 <b>Видеозвонки</b>\n` +
          `/call — <i>позвонить прямо сейчас</i>\n` +
          `/meet 15:00 Планёрка — <i>запланировать на время</i>\n\n` +
          `⚙️ /gs_settings — <i>настройки чата</i>\n\n` +
          `💡 <b>Совет:</b> напишите мне в личку — там личные задачи, привычки и AI-секретарь. Личное и групповое не смешивается!`,
          { parse_mode: 'HTML', reply_markup: new InlineKeyboard().url('💬 Написать в личку', 'https://t.me/PlanDayProbot') }
        );
      }

      if (cmd === 'task' && cmdArg) {
        const user = db.ensureUser(ctx.from);
        const ws = db.ensureWorkspace(ctx.chat.id, ctx.chat.title || 'Group');
        const task = db.createGroupTask(ws.id, user.id, {
          title: cmdArg.slice(0, 200),
          priority: 3,
          tgMessageId: ctx.message.message_id,
        });
        const kb = new InlineKeyboard()
          .text('✅ Готово', `gdone_${task.id}`)
          .text('🙋 Взять', `gtake_${task.id}`);
        return ctx.reply(`📋 Задача <b>#${task.id}</b> создана\n\n${escapeHtml(cmdArg)}`, { parse_mode: 'HTML', reply_markup: kb, reply_to_message_id: ctx.message.message_id });
      }

      if (cmd === 'assign') {
        const user = db.ensureUser(ctx.from);
        const ws = db.ensureWorkspace(ctx.chat.id, ctx.chat.title || 'Group');
        // Parse @username and task text
        const assignMatch = cmdArg.match(/^@(\w+)\s+(.+)/);
        if (!assignMatch) return ctx.reply('Формат: /assign @username задача', { reply_to_message_id: ctx.message.message_id });
        const targetUsername = assignMatch[1];
        const taskTitle = assignMatch[2];
        // Find target user by username
        const targetUser = db.getDb().prepare('SELECT id FROM users WHERE tg_username=?').get(targetUsername);
        const task = db.createGroupTask(ws.id, user.id, {
          title: taskTitle.slice(0, 200),
          assignedTo: targetUser ? targetUser.id : null,
          priority: 3,
          tgMessageId: ctx.message.message_id,
        });
        return ctx.reply(`📋 Задача <b>#${task.id}</b> назначена @${targetUsername}\n\n${escapeHtml(taskTitle)}`, { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id });
      }

      if (cmd === 'list') {
        const ws = db.ensureWorkspace(ctx.chat.id, ctx.chat.title || 'Group');
        const tasks = db.getGroupTasks(ws.id, 'open');
        if (!tasks.length) return ctx.reply('📋 Нет открытых задач');
        let msg = `📋 <b>Задачи группы</b> (${tasks.length}):\n\n`;
        tasks.slice(0, 20).forEach(t => {
          const assignee = t.assigned_to_name || '—';
          msg += `<b>#${t.id}</b> ${escapeHtml(t.title)}\n   👤 ${assignee} · ${t.status}\n\n`;
        });
        if (tasks.length > 20) msg += `... и ещё ${tasks.length - 20}`;
        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      if (cmd === 'board') {
        const ws = db.ensureWorkspace(ctx.chat.id, ctx.chat.title || 'Group');
        const all = db.getGroupTasks(ws.id);
        const open = all.filter(t => t.status === 'open');
        const progress = all.filter(t => t.status === 'in_progress');
        const done = all.filter(t => t.status === 'done');
        let msg = '📊 <b>Канбан-доска</b>\n\n';
        msg += `📋 <b>Открыто</b> (${open.length}):\n`;
        open.slice(0, 10).forEach(t => { msg += `  #${t.id} ${escapeHtml(t.title)}\n`; });
        msg += `\n🔄 <b>В работе</b> (${progress.length}):\n`;
        progress.slice(0, 10).forEach(t => { msg += `  #${t.id} ${escapeHtml(t.title)}\n`; });
        msg += `\n✅ <b>Готово</b> (${done.length}):\n`;
        done.slice(0, 5).forEach(t => { msg += `  #${t.id} ${escapeHtml(t.title)}\n`; });
        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      if (cmd === 'done') {
        const idMatch = cmdArg.match(/#?(\d+)/);
        if (!idMatch) return ctx.reply('Формат: /done #id', { reply_to_message_id: ctx.message.message_id });
        const task = db.getGroupTaskById(parseInt(idMatch[1]));
        if (!task) return ctx.reply('Задача не найдена');
        db.updateGroupTask(task.id, { status: 'done' });
        return ctx.reply(`✅ Задача <b>#${task.id}</b> выполнена!\n${escapeHtml(task.title)}`, { parse_mode: 'HTML' });
      }

      if (cmd === 'mytasks') {
        const user = db.ensureUser(ctx.from);
        const ws = db.ensureWorkspace(ctx.chat.id, ctx.chat.title || 'Group');
        const tasks = db.getMyGroupTasks(user.id, ws.id);
        if (!tasks.length) return ctx.reply('📋 У вас нет задач в этой группе');
        let msg = `📋 <b>Ваши задачи</b> (${tasks.length}):\n\n`;
        tasks.forEach(t => { msg += `<b>#${t.id}</b> ${escapeHtml(t.title)} · ${t.status}\n`; });
        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      if (cmd === 'stats') {
        const ws = db.ensureWorkspace(ctx.chat.id, ctx.chat.title || 'Group');
        const all = db.getGroupTasks(ws.id);
        const open = all.filter(t => t.status === 'open').length;
        const progress = all.filter(t => t.status === 'in_progress').length;
        const done = all.filter(t => t.status === 'done').length;
        return ctx.reply(`📊 <b>Статистика группы</b>\n\n📋 Открыто: ${open}\n🔄 В работе: ${progress}\n✅ Завершено: ${done}\n📈 Всего: ${all.length}`, { parse_mode: 'HTML' });
      }

      if (cmd === 'gs_admin') {
        return next(); // handled by group.js bot.command('gs_admin')
      }

      if (cmd === 'gs_settings') {
        const ws = db.ensureWorkspace(ctx.chat.id, ctx.chat.title || 'Group');
        return ctx.reply(`⚙️ <b>Настройки группы</b>\n\nГруппа: ${escapeHtml(ctx.chat.title || 'Group')}\nWorkspace ID: ${ws.id}\n\nAI мониторинг: ${ws.ai_monitor ? '✅' : '❌'}`, { parse_mode: 'HTML' });
      }

      // Unknown group command — ignore
      return;
    }
    return next();
  });

  // ============ Group task callbacks ============
  bot.callbackQuery(/^gdone_(\d+)$/, async (ctx) => {
    const task = db.getGroupTaskById(parseInt(ctx.match[1]));
    if (!task) return ctx.answerCallbackQuery('Не найдена');
    db.updateGroupTask(task.id, { status: 'done' });
    await ctx.answerCallbackQuery('✅ Готово!');
    try { await ctx.editMessageText(`✅ <b>#${task.id}</b> ${escapeHtml(task.title)} — выполнена!`, { parse_mode: 'HTML' }); } catch {}
  });

  bot.callbackQuery(/^gtake_(\d+)$/, async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const task = db.getGroupTaskById(parseInt(ctx.match[1]));
    if (!task) return ctx.answerCallbackQuery('Не найдена');
    db.updateGroupTask(task.id, { assigned_to: user.id, status: 'in_progress' });
    await ctx.answerCallbackQuery('🙋 Взяли!');
    try {
      const kb = new InlineKeyboard().text('✅ Готово', `gdone_${task.id}`);
      await ctx.editMessageText(`🔄 <b>#${task.id}</b> ${escapeHtml(task.title)}\n👤 Взял: ${escapeHtml(ctx.from.first_name)}`, { parse_mode: 'HTML', reply_markup: kb });
    } catch {}
  });

  // ============ TEXT MESSAGES — основной обработчик (только private) ============
  bot.on('message:text', async (ctx, next) => {
    const user = db.ensureUser(ctx.from);
    const text = ctx.message.text.trim();

    // AI Tools text handling
    if (typeof aiToolsHandlers !== 'undefined' && aiToolsHandlers.handleText) {
      const handled = await aiToolsHandlers.handleText(ctx);
      if (handled) return;
    }

    // Dream text handling
    if (typeof dreamHandlers !== 'undefined' && dreamHandlers.handleText) {
      const handled = await dreamHandlers.handleText(ctx);
      if (handled) return;
    }

    // Planner text handling
    if (typeof plannerHandlers !== 'undefined' && plannerHandlers.handleText) {
      const handled = await plannerHandlers.handleText(ctx);
      if (handled) return;
    }

    // Admin broadcast
    if (typeof adminHandlers !== 'undefined' && adminHandlers.handleBroadcastText) {
      const handled = await adminHandlers.handleBroadcastText(ctx);
      if (handled) return;
    }

    // ── Reply keyboard кнопки ──
    if (text === t(getUserLang(ctx),'kbToday')) return showTasks(ctx, 'today');
    if (text === t(getUserLang(ctx),'kbTomorrow')) return showTasks(ctx, 'tomorrow');
    if (text === t(getUserLang(ctx),'kbWeek')) return showWeek(ctx);
    if (text === t(getUserLang(ctx),'kbHabits')) return showHabits(ctx);
    if (text === t(getUserLang(ctx),'kbConf')) return showConfMenu(ctx, webappUrl);
    if (text === '📋 Дела' || text === '📋 Daily') { const { showDailyRoutines } = require('./planner'); /* handled by command */ return ctx.reply('/daily'); }
    if (text === t(getUserLang(ctx),'kbMenu')) {
      const name = user.secretary_name || 'Секретарь';
      const inlineKb = new InlineKeyboard()
        .text('📋 Задачи сегодня', 'today').text('📊 Привычки', 'habits').row()
        .text('☀️ Итог дня', 'stats_today').text('⚙️ Настройки', 'settings').row()
        .text('🌟 Возможности', 'features_menu').text('📖 Инструкции', 'guide_menu');
      if (webappUrl) inlineKb.row().webApp('📱 Открыть планировщик', webappUrl);
      return ctx.reply(
        `🏠 <b>Главное меню</b>\n\nЯ ${escapeHtml(name)}, твой персональный секретарь.\n\nПросто напиши мне что нужно сделать!`,
        { parse_mode: 'HTML', reply_markup: inlineKb }
      );
    }
    if (text === t(getUserLang(ctx),'kbAdd')) {
      ctx.session.step = 'awaiting_task_title';
      ctx.session.data = {};
      return ctx.reply('✏️ Напиши задачу:\n\n<i>Пример: "Встреча завтра в 14:00" или просто "Купить хлеб"</i>', { parse_mode: 'HTML' });
    }

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

    if (ctx.session.step === 'tz_custom_gmt') {
      ctx.session.step = null;
      const num = parseInt(text.replace(/[^-+\d]/g, ''));
      if (isNaN(num) || num < -12 || num > 14) {
        return ctx.reply('❌ Введите число от -12 до +14. Например: +4');
      }
      // Etc/GMT uses inverted sign: GMT+4 → Etc/GMT-4
      const tz = num === 0 ? 'Etc/GMT' : (num > 0 ? `Etc/GMT-${num}` : `Etc/GMT+${Math.abs(num)}`);
      const { DateTime } = require('luxon');
      const test = DateTime.now().setZone(tz);
      if (!test.isValid) return ctx.reply('❌ Ошибка, попробуйте ещё раз');
      db.updateUserSettings(user.id, { timezone: tz });
      const sign = num >= 0 ? '+' : '';
      return ctx.reply(`✅ Часовой пояс: <b>GMT${sign}${num}</b>`, { parse_mode: 'HTML' });
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

    // ── Конференции — создание комнаты ──
    if (ctx.session.step === 'conf_name') {
      ctx.session.step = null;
      const roomName = text.slice(0, 50) || `Комната ${ctx.from.first_name}`;
      const room = db.createConfRoom(roomName, user.id, null);
      const kb = new InlineKeyboard();
      if (webappUrl) kb.webApp('🚀 Войти в комнату', `${webappUrl}?conf=${room.id}`).row();
      if (room.admin_code) kb.text('👑 Код админа', `conf_admincode_${room.id}`).row();
      kb.text('🔗 Пригласить', `conf_invite_${room.id}`)
        .text('📋 Все комнаты', 'conf_rooms_full').row()
        .text('❌ Закрыть комнату', `conf_close_${room.id}`);
      return ctx.reply(
        `📹 <b>Комната создана!</b>\n\n` +
        `🏷 <b>${escapeHtml(roomName)}</b>\n` +
        `🔑 ID: <code>${room.id}</code>\n\n` +
        `Поделитесь ID с участниками — они введут его чтобы войти.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    }

    // ── Конференции — вход по ID ──
    if (ctx.session.step === 'conf_join_id') {
      ctx.session.step = null;
      const roomId = text.trim().toUpperCase().slice(0, 8);
      const room = db.getConfRoom(roomId);
      if (!room) return ctx.reply('❌ Комната не найдена. Проверьте ID и попробуйте снова.');
      const kb = new InlineKeyboard();
      if (webappUrl) kb.webApp('🚀 Войти в комнату', `${webappUrl}?conf=${roomId}`).row();
      kb.text('📹 Все конференции', 'conf_menu');
      return ctx.reply(
        `📹 Комната найдена!\n\n<b>${escapeHtml(room.name)}</b>\n🔑 ID: <code>${roomId}</code>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
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
    // Передаём управление следующему обработчику (setupConversationalAI)
    return next();
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

  // Planner
  const plannerHandlers = setupPlannerHandlers(bot);

  // AI Tools
  const aiToolsHandlers = setupAIToolsHandlers(bot);

  // Dreams
  const groqKeyForDreams = process.env.GROQ_KEY;
  const dreamHandlers = setupDreamHandlers(bot, groqKeyForDreams);
  setupDreamDateCallbacks(bot);

  // Admin panel
  const adminHandlers = setupAdminPanel(bot);
  setupBroadcastSend(bot);

  // AI Tools photo handler
  bot.on('message:photo', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    if (typeof aiToolsHandlers !== 'undefined' && aiToolsHandlers.handlePhoto) {
      await aiToolsHandlers.handlePhoto(ctx);
    }
  });

  // Регистрируем конференц-коллбеки (conf_close, conf_invite, conf_enter и т.д.)
  setupMeetHandlers(bot, webappUrl);

  return bot;
}

module.exports = { createBot, SECRETARY_STYLES };
