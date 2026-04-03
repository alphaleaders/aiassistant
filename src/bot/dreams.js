// Dream Planner — Goals & Dreams with AI coaching
const { InlineKeyboard } = require('grammy');
const { DateTime } = require('luxon');
const db = require('../db/database');
const { escapeHtml, formatDateRu, todayStr } = require('../utils/helpers');

function getDb() { return db.getDb(); }

// ═══════ DREAM COACHING SYSTEM PROMPT ═══════
function getDreamCoachPrompt(user, dream, progress) {
  const name = user.secretary_name || 'Коуч';
  const daysLeft = Math.max(0, Math.ceil(
    DateTime.fromISO(dream.target_date).diff(DateTime.now(), 'days').days
  ));
  const pct = progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0;

  return `Ты — ${name}, профессиональный лайф-коуч и стратег по достижению целей.

ЦЕЛЬ ПОЛЬЗОВАТЕЛЯ:
"${dream.title}"
${dream.description ? 'Описание: ' + dream.description : ''}
Категория: ${dream.category || 'общее'}
Дедлайн: ${dream.target_date} (осталось ${daysLeft} дней)
Прогресс: ${pct}% выполнено (${progress.done}/${progress.total} шагов)

${progress.steps ? 'Текущие шаги:\n' + progress.steps : ''}

ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ:
${user.user_notes || 'Нет дополнительной информации'}

ТВОЯ ЗАДАЧА:
1. Дай ОДИН конкретный, действенный совет на сегодня
2. Совет должен быть маленьким шагом — то что можно сделать за 15-30 минут
3. Объясни ПОЧЕМУ этот шаг приближает к цели
4. Добавь мотивирующую фразу
5. Если прогресс хороший — похвали
6. Если отстаёт — мягко подтолкни, без давления

ФОРМАТ ОТВЕТА:
- Обращайся на "ты"
- Будь конкретным — не абстрактные советы
- Максимум 5-6 предложений
- Используй эмодзи уместно
- НЕ используй markdown (** ## и т.д.)
- Если цель связана с бизнесом — давай бизнес-советы
- Если с здоровьем — давай практичные здоровые советы
- Если с финансами — конкретные финансовые шаги
- Если с отношениями — мудрые советы по общению`;
}

// ═══════ SETUP ═══════
function setupDreamHandlers(bot, groqKey) {

  // /dreams command
  bot.command('dreams', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await showDreamsMenu(ctx);
  });

  bot.callbackQuery('dreams_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showDreamsMenu(ctx);
  });

  async function showDreamsMenu(ctx) {
    const user = db.ensureUser(ctx.from);
    const dreams = getDb().prepare("SELECT * FROM dreams WHERE user_id=? AND status='active' ORDER BY created_at DESC").all(user.id);

    let text = '🌟 <b>Планировщик мечты</b>\n\n';
    text += 'Поставьте цель — я буду давать ежедневные советы как её достичь.\n\n';

    if (dreams.length === 0) {
      text += '<i>У вас пока нет целей. Создайте первую!</i>';
    } else {
      dreams.forEach(d => {
        const items = getDb().prepare('SELECT COUNT(*) as total, SUM(is_done) as done FROM dream_steps WHERE dream_id=?').get(d.id);
        const pct = items.total > 0 ? Math.round((items.done || 0) / items.total * 100) : 0;
        const daysLeft = Math.max(0, Math.ceil(DateTime.fromISO(d.target_date).diff(DateTime.now(), 'days').days));
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        const cat = d.category ? getCategoryEmoji(d.category) + ' ' : '';
        text += `${cat}<b>${escapeHtml(d.title)}</b>\n`;
        text += `${bar} ${pct}% | ⏳ ${daysLeft} дн\n\n`;
      });
    }

    const kb = new InlineKeyboard()
      .text('➕ Новая цель', 'dream_create').row();
    dreams.forEach(d => {
      kb.text(`🎯 ${d.title.slice(0, 25)}`, `dream_view_${d.id}`).row();
    });
    kb.text('📆 Планировщик', 'planner_menu');

    if (ctx.callbackQuery) {
      try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // Create dream
  bot.callbackQuery('dream_create', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'dream_title';
    ctx.session.data = {};
    await ctx.reply(
      '🌟 <b>Новая цель / мечта</b>\n\n' +
      'Напишите вашу цель:\n\n' +
      '<i>Примеры:\n' +
      '• Выучить английский до B2\n' +
      '• Открыть свой бизнес\n' +
      '• Похудеть на 10 кг\n' +
      '• Накопить 1 000 000 ₽\n' +
      '• Пробежать марафон</i>',
      { parse_mode: 'HTML' }
    );
  });

  // View dream
  bot.callbackQuery(/^dream_view_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showDreamView(ctx, parseInt(ctx.match[1]));
  });

  async function showDreamView(ctx, dreamId) {
    const dream = getDb().prepare('SELECT * FROM dreams WHERE id=?').get(dreamId);
    if (!dream) return;

    const steps = getDb().prepare('SELECT * FROM dream_steps WHERE dream_id=? ORDER BY sort_order, id').all(dreamId);
    const doneCount = steps.filter(s => s.is_done).length;
    const pct = steps.length > 0 ? Math.round(doneCount / steps.length * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    const daysLeft = Math.max(0, Math.ceil(DateTime.fromISO(dream.target_date).diff(DateTime.now(), 'days').days));
    const cat = dream.category ? getCategoryEmoji(dream.category) + ' ' : '🎯 ';

    let text = `${cat}<b>${escapeHtml(dream.title)}</b>\n\n`;
    text += `📅 Цель: ${formatDateRu(dream.target_date)}\n`;
    text += `⏳ Осталось: <b>${daysLeft} дн</b>\n`;
    text += `${bar} ${pct}%\n\n`;

    if (dream.description) text += `📝 ${escapeHtml(dream.description)}\n\n`;

    if (steps.length > 0) {
      text += '<b>Шаги к цели:</b>\n';
      steps.forEach((s, i) => {
        text += s.is_done ? `✅ <s>${escapeHtml(s.title)}</s>\n` : `${i + 1}. ⬜ ${escapeHtml(s.title)}\n`;
      });
    } else {
      text += '<i>Добавьте шаги или попросите AI разбить цель на шаги!</i>';
    }

    // Last AI advice
    const lastAdvice = getDb().prepare("SELECT * FROM dream_advice WHERE dream_id=? ORDER BY id DESC LIMIT 1").get(dreamId);
    if (lastAdvice) {
      text += `\n\n💡 <b>Совет дня:</b>\n<i>${escapeHtml(lastAdvice.advice.slice(0, 300))}</i>`;
    }

    const kb = new InlineKeyboard();
    // Toggle undone steps
    steps.filter(s => !s.is_done).slice(0, 6).forEach(s => {
      kb.text(`✅ ${s.title.slice(0, 22)}`, `ds_done_${s.id}_${dreamId}`).row();
    });
    kb.text('➕ Добавить шаг', `ds_add_${dreamId}`)
      .text('🤖 AI разбивка', `dream_ai_steps_${dreamId}`).row();
    kb.text('💡 Совет от AI', `dream_advice_${dreamId}`).row();
    kb.text('🗑 Удалить цель', `dream_delete_${dreamId}`)
      .text('◀️ Назад', 'dreams_menu');

    if (ctx.callbackQuery) {
      try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // Toggle dream step
  bot.callbackQuery(/^ds_done_(\d+)_(\d+)$/, async (ctx) => {
    const stepId = parseInt(ctx.match[1]);
    const dreamId = parseInt(ctx.match[2]);
    getDb().prepare("UPDATE dream_steps SET is_done=1, completed_at=datetime('now') WHERE id=?").run(stepId);
    await ctx.answerCallbackQuery('✅');
    await showDreamView(ctx, dreamId);
  });

  // Add step
  bot.callbackQuery(/^ds_add_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'ds_add_title';
    ctx.session.data = { dreamId: parseInt(ctx.match[1]) };
    await ctx.reply('✏️ Напишите шаг к цели (или несколько с новой строки):');
  });

  // Delete dream
  bot.callbackQuery(/^dream_delete_(\d+)$/, async (ctx) => {
    const dreamId = parseInt(ctx.match[1]);
    getDb().prepare("UPDATE dreams SET status='deleted' WHERE id=?").run(dreamId);
    await ctx.answerCallbackQuery('🗑 Цель удалена');
    await showDreamsMenu(ctx);
  });

  // AI break down into steps
  bot.callbackQuery(/^dream_ai_steps_(\d+)$/, async (ctx) => {
    if (!groqKey) return ctx.answerCallbackQuery('AI недоступен');
    await ctx.answerCallbackQuery('🤖 Генерирую план...');
    const dreamId = parseInt(ctx.match[1]);
    const dream = getDb().prepare('SELECT * FROM dreams WHERE id=?').get(dreamId);
    if (!dream) return;

    const user = db.ensureUser(ctx.from);

    try {
      const response = await callGroq([
        { role: 'system', content: 'Ты — профессиональный коуч. Разбей цель пользователя на 5-10 конкретных шагов. Каждый шаг — одна строка, начинается с номера. Только шаги, без вступлений и заключений. Шаги должны быть конкретными и выполнимыми.' },
        { role: 'user', content: `Моя цель: "${dream.title}"\n${dream.description ? 'Описание: ' + dream.description : ''}\nДедлайн: ${dream.target_date}\n\nРазбей на конкретные шаги:` }
      ], groqKey);

      const lines = response.split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(l => l.length > 3 && l.length < 200);
      const maxOrder = getDb().prepare('SELECT MAX(sort_order) as m FROM dream_steps WHERE dream_id=?').get(dreamId).m || 0;

      lines.forEach((line, i) => {
        getDb().prepare('INSERT INTO dream_steps (dream_id, title, sort_order) VALUES (?, ?, ?)').run(dreamId, line, maxOrder + i + 1);
      });

      await ctx.reply(`✅ Добавлено ${lines.length} шагов от AI!`);
      await showDreamView(ctx, dreamId);
    } catch(e) {
      await ctx.reply('❌ Ошибка AI: ' + e.message);
    }
  });

  // AI daily advice
  bot.callbackQuery(/^dream_advice_(\d+)$/, async (ctx) => {
    if (!groqKey) return ctx.answerCallbackQuery('AI недоступен');
    await ctx.answerCallbackQuery('💡 Генерирую совет...');
    const dreamId = parseInt(ctx.match[1]);
    const dream = getDb().prepare('SELECT * FROM dreams WHERE id=?').get(dreamId);
    if (!dream) return;

    const user = db.ensureUser(ctx.from);
    const steps = getDb().prepare('SELECT * FROM dream_steps WHERE dream_id=?').all(dreamId);
    const done = steps.filter(s => s.is_done).length;
    const stepsText = steps.map(s => (s.is_done ? '✅ ' : '⬜ ') + s.title).join('\n');

    try {
      const response = await callGroq([
        { role: 'system', content: getDreamCoachPrompt(user, dream, { total: steps.length, done, steps: stepsText }) },
        { role: 'user', content: 'Дай мне совет на сегодня для достижения моей цели.' }
      ], groqKey);

      // Clean response
      const clean = response.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').trim();

      // Save advice
      getDb().prepare('INSERT INTO dream_advice (dream_id, user_id, advice, date) VALUES (?, ?, ?, ?)').run(dreamId, user.id, clean, todayStr(user.timezone));

      const kb = new InlineKeyboard()
        .text('🎯 К цели', `dream_view_${dreamId}`)
        .text('💡 Другой совет', `dream_advice_${dreamId}`);

      await ctx.reply(`💡 <b>Совет дня</b>\n\n${escapeHtml(clean)}`, { parse_mode: 'HTML', reply_markup: kb });
    } catch(e) {
      await ctx.reply('❌ Ошибка AI: ' + e.message);
    }
  });

  // ═══════ TEXT HANDLERS ═══════
  return {
    handleText: async function(ctx) {
      const user = db.ensureUser(ctx.from);
      const text = ctx.message.text.trim();

      // Dream title
      if (ctx.session.step === 'dream_title') {
        ctx.session.step = 'dream_date';
        ctx.session.data.dreamTitle = text;

        const kb = new InlineKeyboard()
          .text('3 месяца', 'dream_date_90').text('6 месяцев', 'dream_date_180').row()
          .text('1 год', 'dream_date_365').text('2 года', 'dream_date_730').row()
          .text('5 лет', 'dream_date_1825');

        await ctx.reply(
          `🎯 Цель: <b>${escapeHtml(text)}</b>\n\n` +
          `📅 Когда хотите достичь? Выберите или напишите дату (ДД.ММ.ГГГГ):`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
        return true;
      }

      // Dream date (text input)
      if (ctx.session.step === 'dream_date') {
        const match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!match) {
          await ctx.reply('❌ Формат: ДД.ММ.ГГГГ (например 31.12.2027)');
          return true;
        }
        const dateStr = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        await createDream(ctx, user, dateStr);
        return true;
      }

      // Dream category
      if (ctx.session.step === 'dream_category') {
        ctx.session.step = 'dream_description';
        ctx.session.data.category = text.toLowerCase();
        await ctx.reply('📝 Опишите подробнее вашу цель (или /skip):');
        return true;
      }

      // Dream description
      if (ctx.session.step === 'dream_description') {
        ctx.session.step = null;
        const data = ctx.session.data;
        const desc = text === '/skip' ? null : text;
        const result = getDb().prepare('INSERT INTO dreams (user_id, title, description, category, target_date) VALUES (?, ?, ?, ?, ?)').run(user.id, data.dreamTitle, desc, data.category || null, data.targetDate);

        await ctx.reply('🌟 Цель создана! Теперь добавьте шаги или попросите AI разбить на шаги.');
        await showDreamView(ctx, result.lastInsertRowid);
        return true;
      }

      // Add dream step
      if (ctx.session.step === 'ds_add_title') {
        ctx.session.step = null;
        const dreamId = ctx.session.data?.dreamId;
        if (!dreamId) return false;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const maxOrder = getDb().prepare('SELECT MAX(sort_order) as m FROM dream_steps WHERE dream_id=?').get(dreamId).m || 0;
        lines.forEach((line, i) => {
          getDb().prepare('INSERT INTO dream_steps (dream_id, title, sort_order) VALUES (?, ?, ?)').run(dreamId, line.slice(0, 200), maxOrder + i + 1);
        });
        await ctx.reply(`✅ Добавлено: ${lines.length} шагов`);
        await showDreamView(ctx, dreamId);
        return true;
      }

      return false;
    }
  };
}

// Date callbacks
function setupDreamDateCallbacks(bot) {
  bot.callbackQuery(/^dream_date_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const days = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const tz = user.timezone || 'Europe/Moscow';
    const dateStr = DateTime.now().setZone(tz).plus({ days }).toFormat('yyyy-MM-dd');
    await createDream(ctx, user, dateStr);
  });

  bot.callbackQuery(/^dream_cat_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.data.category = ctx.match[1];
    ctx.session.step = 'dream_description';
    await ctx.reply('📝 Опишите подробнее вашу цель (или /skip):');
  });
}

async function createDream(ctx, user, dateStr) {
  ctx.session.data.targetDate = dateStr;
  ctx.session.step = 'dream_category';

  const kb = new InlineKeyboard()
    .text('💼 Бизнес/Карьера', 'dream_cat_business')
    .text('💰 Финансы', 'dream_cat_finance').row()
    .text('🏃 Здоровье/Спорт', 'dream_cat_health')
    .text('📚 Обучение', 'dream_cat_education').row()
    .text('❤️ Отношения', 'dream_cat_relationships')
    .text('🏠 Дом/Быт', 'dream_cat_home').row()
    .text('🎨 Творчество', 'dream_cat_creative')
    .text('🌍 Путешествия', 'dream_cat_travel').row()
    .text('⭐ Другое', 'dream_cat_other');

  await ctx.reply(
    `📅 Дедлайн: <b>${formatDateRu(dateStr)}</b>\n\nВыберите категорию:`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

function getCategoryEmoji(cat) {
  const map = { business: '💼', finance: '💰', health: '🏃', education: '📚', relationships: '❤️', home: '🏠', creative: '🎨', travel: '🌍', other: '⭐' };
  return map[cat] || '🎯';
}

// Groq API call
async function callGroq(messages, groqKey) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.7, max_tokens: 500 });
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}`, 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.choices?.[0]?.message?.content || 'Нет ответа');
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ═══════ DAILY COACHING CRON ═══════
function startDreamCoachCron(bot, groqKey) {
  if (!groqKey) { console.log('[DREAMS] No GROQ_KEY — daily coaching disabled'); return; }

  const cron = require('node-cron');
  // Every day at 9:00 UTC (12:00 Moscow)
  cron.schedule('0 9 * * *', async () => {
    try {
      const dreams = getDb().prepare(`
        SELECT d.*, u.tg_id, u.timezone, u.user_notes, u.secretary_name, u.planner_notify
        FROM dreams d JOIN users u ON d.user_id=u.id
        WHERE d.status='active' AND u.tg_id IS NOT NULL AND u.planner_notify != 0
      `).all();

      for (const dream of dreams) {
        // Check if already sent today
        const today = DateTime.now().setZone(dream.timezone || 'Europe/Moscow').toFormat('yyyy-MM-dd');
        const existing = getDb().prepare('SELECT id FROM dream_advice WHERE dream_id=? AND date=?').get(dream.id, today);
        if (existing) continue;

        const steps = getDb().prepare('SELECT * FROM dream_steps WHERE dream_id=?').all(dream.id);
        const done = steps.filter(s => s.is_done).length;
        const stepsText = steps.map(s => (s.is_done ? '✅ ' : '⬜ ') + s.title).join('\n');

        try {
          const advice = await callGroq([
            { role: 'system', content: getDreamCoachPrompt(dream, dream, { total: steps.length, done, steps: stepsText }) },
            { role: 'user', content: 'Дай мне совет на сегодня.' }
          ], groqKey);

          const clean = advice.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').trim();
          getDb().prepare('INSERT INTO dream_advice (dream_id, user_id, advice, date) VALUES (?, ?, ?, ?)').run(dream.id, dream.user_id, clean, today);

          const daysLeft = Math.max(0, Math.ceil(DateTime.fromISO(dream.target_date).diff(DateTime.now(), 'days').days));
          const pct = steps.length > 0 ? Math.round(done / steps.length * 100) : 0;
          const cat = dream.category ? getCategoryEmoji(dream.category) : '🎯';

          const kb = new InlineKeyboard().text('🎯 К цели', `dream_view_${dream.id}`);
          await bot.api.sendMessage(dream.tg_id,
            `${cat} <b>${escapeHtml(dream.title)}</b>\n` +
            `⏳ ${daysLeft} дн | ${pct}%\n\n` +
            `💡 <b>Совет дня:</b>\n${escapeHtml(clean)}`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
        } catch(e) { console.error(`[DREAMS] Advice for dream ${dream.id} failed:`, e.message); }

        // Rate limit
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch(e) { console.error('[DREAMS CRON] Error:', e.message); }
  });

  console.log('[DREAMS] Daily coaching cron started (9:00 UTC)');
}

module.exports = { setupDreamHandlers, setupDreamDateCallbacks, startDreamCoachCron };
