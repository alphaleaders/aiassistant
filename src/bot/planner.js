// Period Planner + Daily Routines module
const { InlineKeyboard } = require('grammy');
const { DateTime } = require('luxon');
const db = require('../db/database');
const { escapeHtml, todayStr, formatDateRu } = require('../utils/helpers');
const cron = require('node-cron');

const PERIODS = {
  day:    { label: '📅 День',    days: 1 },
  week:   { label: '📆 Неделя', days: 7 },
  month:  { label: '📆 Месяц',  days: 30 },
  '3month':{ label: '📆 3 месяца', days: 90 },
  '6month':{ label: '📆 6 месяцев', days: 180 },
  year:   { label: '📆 12 месяцев', days: 365 },
};

function getDb() { return db.getDb(); }

function setupPlannerHandlers(bot) {
  const d = getDb;

  // ═══════ DAILY ROUTINES ═══════

  bot.command('daily', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await showDailyRoutines(ctx);
  });

  async function showDailyRoutines(ctx) {
    const user = db.ensureUser(ctx.from);
    const tz = user.timezone || 'Europe/Moscow';
    const today = DateTime.now().setZone(tz).toFormat('yyyy-MM-dd');
    const routines = d().prepare('SELECT r.*, (SELECT 1 FROM daily_routine_log l WHERE l.routine_id=r.id AND l.date=?) as done FROM daily_routines r WHERE r.user_id=? AND r.is_active=1 ORDER BY r.sort_order').all(today, user.id);

    const doneCount = routines.filter(r => r.done).length;
    const total = routines.length;
    const pct = total > 0 ? Math.round(doneCount / total * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

    let text = `📋 <b>Дела на сегодня</b> (${formatDateRu(today)})\n\n`;
    text += `${bar} ${pct}% (${doneCount}/${total})\n\n`;

    if (total === 0) {
      text += '<i>Список пуст. Добавьте ежедневные дела!</i>\n\n';
      text += '💡 Пример: зарядка, чтение, медитация';
    } else {
      routines.forEach(r => {
        text += r.done ? `✅ <s>${escapeHtml(r.title)}</s>\n` : `⬜ ${r.emoji} ${escapeHtml(r.title)}\n`;
      });
    }

    const kb = new InlineKeyboard();
    // Quick toggle buttons for each undone routine
    routines.filter(r => !r.done).forEach(r => {
      kb.text(`✅ ${r.title.slice(0,20)}`, `dr_done_${r.id}`).row();
    });
    kb.text('➕ Добавить дело', 'dr_add').row();
    if (total > 0) kb.text('📋 Управление списком', 'dr_manage').row();
    kb.text('📆 Планировщик', 'planner_menu');

    if (ctx.callbackQuery) {
      try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // Toggle daily routine done
  bot.callbackQuery(/^dr_done_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const tz = user.timezone || 'Europe/Moscow';
    const today = DateTime.now().setZone(tz).toFormat('yyyy-MM-dd');
    try {
      d().prepare('INSERT OR IGNORE INTO daily_routine_log (routine_id, user_id, date) VALUES (?, ?, ?)').run(id, user.id, today);
    } catch(e) {}
    await ctx.answerCallbackQuery('✅');
    await showDailyRoutines(ctx);
  });

  // Add routine
  bot.callbackQuery('dr_add', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'dr_add_title';
    await ctx.reply('✏️ Напишите название ежедневного дела:\n\n<i>Пример: Зарядка, Чтение 30 мин, Пить воду</i>', { parse_mode: 'HTML' });
  });

  // Manage routines list
  bot.callbackQuery('dr_manage', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const routines = d().prepare('SELECT * FROM daily_routines WHERE user_id=? AND is_active=1 ORDER BY sort_order').all(user.id);

    let text = '📋 <b>Управление делами</b>\n\nНажмите ❌ чтобы удалить:\n\n';
    const kb = new InlineKeyboard();
    routines.forEach(r => {
      text += `${r.emoji} ${escapeHtml(r.title)}\n`;
      kb.text(`❌ ${r.title.slice(0,20)}`, `dr_del_${r.id}`).row();
    });
    kb.text('◀️ Назад', 'dr_back');
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
  });

  bot.callbackQuery(/^dr_del_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);
    d().prepare('UPDATE daily_routines SET is_active=0 WHERE id=?').run(id);
    await ctx.answerCallbackQuery('✅ Удалено');
    await showDailyRoutines(ctx);
  });

  bot.callbackQuery('dr_back', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showDailyRoutines(ctx);
  });

  // ═══════ PERIOD PLANNER ═══════

  bot.command('planner', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await showPlannerMenu(ctx);
  });

  bot.callbackQuery('planner_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPlannerMenu(ctx);
  });

  async function showPlannerMenu(ctx) {
    const user = db.ensureUser(ctx.from);
    const activePlans = d().prepare("SELECT period_type, COUNT(*) as c FROM period_plans WHERE user_id=? AND status='active' GROUP BY period_type").all(user.id);
    const planMap = {};
    activePlans.forEach(p => { planMap[p.period_type] = p.c; });

    let text = '📆 <b>Планировщик</b>\n\n';
    text += 'Создавайте планы на разные периоды.\n';
    text += 'При окончании периода — напоминание составить новый.\n\n';

    const kb = new InlineKeyboard();
    Object.entries(PERIODS).forEach(([key, val]) => {
      const count = planMap[key] || 0;
      const badge = count > 0 ? ` (${count})` : '';
      kb.text(`${val.label}${badge}`, `pl_list_${key}`).row();
    });
    kb.text('📋 Дела на день', 'dr_back').row();

    // Notification toggle
    const notifyOn = user.planner_notify !== 0;
    kb.text(notifyOn ? '🔔 Уведомления: ВКЛ' : '🔕 Уведомления: ВЫКЛ', 'pl_notify_toggle');

    if (ctx.callbackQuery) {
      try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // Toggle notifications
  bot.callbackQuery('pl_notify_toggle', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const newVal = user.planner_notify === 0 ? 1 : 0;
    d().prepare('UPDATE users SET planner_notify=? WHERE id=?').run(newVal, user.id);
    await ctx.answerCallbackQuery(newVal ? '🔔 Уведомления включены' : '🔕 Уведомления выключены');
    await showPlannerMenu(ctx);
  });

  // List plans for period
  bot.callbackQuery(/^pl_list_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const periodType = ctx.match[1];
    const user = db.ensureUser(ctx.from);
    const plans = d().prepare("SELECT * FROM period_plans WHERE user_id=? AND period_type=? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at DESC LIMIT 10").all(user.id, periodType);

    const periodInfo = PERIODS[periodType] || { label: periodType };
    let text = `${periodInfo.label} <b>Планы</b>\n\n`;

    if (plans.length === 0) {
      text += '<i>Нет планов. Создайте первый!</i>';
    } else {
      plans.forEach(p => {
        const status = p.status === 'active' ? '🟢' : '✅';
        const items = d().prepare('SELECT COUNT(*) as total, SUM(is_done) as done FROM plan_items WHERE plan_id=?').get(p.id);
        const pct = items.total > 0 ? Math.round((items.done || 0) / items.total * 100) : 0;
        text += `${status} <b>${escapeHtml(p.title)}</b>\n`;
        text += `   📅 ${p.start_date} → ${p.end_date} | ${pct}%\n\n`;
      });
    }

    const kb = new InlineKeyboard()
      .text('➕ Создать план', `pl_create_${periodType}`).row();
    plans.filter(p => p.status === 'active').forEach(p => {
      kb.text(`📋 ${p.title.slice(0,25)}`, `pl_view_${p.id}`).row();
    });
    kb.text('◀️ Назад', 'planner_menu');

    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
  });

  // Create plan
  bot.callbackQuery(/^pl_create_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'pl_create_title';
    ctx.session.data = { periodType: ctx.match[1] };
    const periodInfo = PERIODS[ctx.match[1]] || { label: ctx.match[1] };
    await ctx.reply(`📝 <b>Новый план: ${periodInfo.label}</b>\n\nНапишите название плана:`, { parse_mode: 'HTML' });
  });

  // View plan
  bot.callbackQuery(/^pl_view_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const planId = parseInt(ctx.match[1]);
    await showPlanView(ctx, planId);
  });

  async function showPlanView(ctx, planId) {
    const plan = d().prepare('SELECT * FROM period_plans WHERE id=?').get(planId);
    if (!plan) return;

    const items = d().prepare('SELECT * FROM plan_items WHERE plan_id=? ORDER BY sort_order, id').all(planId);
    const doneCount = items.filter(i => i.is_done).length;
    const pct = items.length > 0 ? Math.round(doneCount / items.length * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

    // Time remaining
    const user = db.ensureUser(ctx.from);
    const tz = user.timezone || 'Europe/Moscow';
    const endDt = DateTime.fromISO(plan.end_date, { zone: tz });
    const nowDt = DateTime.now().setZone(tz);
    const daysLeft = Math.max(0, Math.ceil(endDt.diff(nowDt, 'days').days));
    const periodInfo = PERIODS[plan.period_type] || { label: plan.period_type };

    let text = `${periodInfo.label} <b>${escapeHtml(plan.title)}</b>\n\n`;
    text += `📅 ${plan.start_date} → ${plan.end_date}\n`;
    text += `⏳ Осталось: <b>${daysLeft} дн</b>\n`;
    text += `${bar} ${pct}% (${doneCount}/${items.length})\n\n`;

    if (items.length === 0) {
      text += '<i>Добавьте пункты плана!</i>';
    } else {
      items.forEach((item, i) => {
        text += item.is_done
          ? `✅ <s>${escapeHtml(item.title)}</s>\n`
          : `${i + 1}. ⬜ ${escapeHtml(item.title)}\n`;
      });
    }

    if (plan.description) text += `\n📝 ${escapeHtml(plan.description)}`;

    const kb = new InlineKeyboard();
    // Toggle items
    items.filter(i => !i.is_done).slice(0, 8).forEach(item => {
      kb.text(`✅ ${item.title.slice(0, 22)}`, `pi_done_${item.id}_${planId}`).row();
    });
    kb.text('➕ Добавить пункт', `pi_add_${planId}`).row();
    if (daysLeft === 0) kb.text('📊 Завершить и обзор', `pl_complete_${planId}`).row();
    kb.text(`◀️ К списку`, `pl_list_${plan.period_type}`);

    if (ctx.callbackQuery) {
      try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // Toggle plan item
  bot.callbackQuery(/^pi_done_(\d+)_(\d+)$/, async (ctx) => {
    const itemId = parseInt(ctx.match[1]);
    const planId = parseInt(ctx.match[2]);
    d().prepare("UPDATE plan_items SET is_done=1, completed_at=datetime('now') WHERE id=?").run(itemId);
    await ctx.answerCallbackQuery('✅');
    // Update plan progress
    const items = d().prepare('SELECT COUNT(*) as total, SUM(is_done) as done FROM plan_items WHERE plan_id=?').get(planId);
    const pct = items.total > 0 ? Math.round((items.done || 0) / items.total * 100) : 0;
    d().prepare('UPDATE period_plans SET progress=? WHERE id=?').run(pct, planId);
    await showPlanView(ctx, planId);
  });

  // Add plan item
  bot.callbackQuery(/^pi_add_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'pi_add_title';
    ctx.session.data = { planId: parseInt(ctx.match[1]) };
    await ctx.reply('✏️ Напишите пункт плана:');
  });

  // Complete plan
  bot.callbackQuery(/^pl_complete_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const planId = parseInt(ctx.match[1]);
    const plan = d().prepare('SELECT * FROM period_plans WHERE id=?').get(planId);
    if (!plan) return;

    const items = d().prepare('SELECT * FROM plan_items WHERE plan_id=?').all(planId);
    const doneCount = items.filter(i => i.is_done).length;
    const undone = items.filter(i => !i.is_done);
    const pct = items.length > 0 ? Math.round(doneCount / items.length * 100) : 0;

    d().prepare("UPDATE period_plans SET status='completed', progress=? WHERE id=?").run(pct, planId);

    let text = `📊 <b>Обзор: ${escapeHtml(plan.title)}</b>\n\n`;
    text += `📅 ${plan.start_date} → ${plan.end_date}\n`;
    text += `✅ Выполнено: ${doneCount}/${items.length} (${pct}%)\n\n`;

    if (doneCount > 0) {
      text += '<b>Сделано:</b>\n';
      items.filter(i => i.is_done).forEach(i => { text += `✅ ${escapeHtml(i.title)}\n`; });
    }
    if (undone.length > 0) {
      text += '\n<b>Не выполнено:</b>\n';
      undone.forEach(i => { text += `❌ ${escapeHtml(i.title)}\n`; });
    }

    const kb = new InlineKeyboard();
    if (undone.length > 0) {
      kb.text('📋 Перенести невыполненное', `pl_carry_${planId}`).row();
    }
    kb.text(`➕ Новый план`, `pl_create_${plan.period_type}`).row();
    kb.text('◀️ Планировщик', 'planner_menu');

    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  });

  // Carry undone items to new plan
  bot.callbackQuery(/^pl_carry_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const oldPlanId = parseInt(ctx.match[1]);
    const oldPlan = d().prepare('SELECT * FROM period_plans WHERE id=?').get(oldPlanId);
    if (!oldPlan) return;

    const user = db.ensureUser(ctx.from);
    const tz = user.timezone || 'Europe/Moscow';
    const now = DateTime.now().setZone(tz);
    const periodDays = PERIODS[oldPlan.period_type]?.days || 7;
    const startDate = now.toFormat('yyyy-MM-dd');
    const endDate = now.plus({ days: periodDays }).toFormat('yyyy-MM-dd');

    // Create new plan
    const result = d().prepare('INSERT INTO period_plans (user_id, period_type, title, start_date, end_date) VALUES (?, ?, ?, ?, ?)').run(user.id, oldPlan.period_type, oldPlan.title + ' (продолжение)', startDate, endDate);
    const newPlanId = result.lastInsertRowid;

    // Carry undone items
    const undone = d().prepare('SELECT * FROM plan_items WHERE plan_id=? AND is_done=0').all(oldPlanId);
    undone.forEach((item, i) => {
      d().prepare('INSERT INTO plan_items (plan_id, title, sort_order, carried_from) VALUES (?, ?, ?, ?)').run(newPlanId, item.title, i, item.id);
    });

    await ctx.reply(`📋 Создан новый план с ${undone.length} перенесёнными пунктами`);
    await showPlanView(ctx, newPlanId);
  });

  // ═══════ TEXT HANDLERS (called from bot.js) ═══════
  return {
    handleText: async function(ctx) {
      const user = db.ensureUser(ctx.from);
      const text = ctx.message.text.trim();

      // Add daily routine
      if (ctx.session.step === 'dr_add_title') {
        ctx.session.step = null;
        const maxOrder = d().prepare('SELECT MAX(sort_order) as m FROM daily_routines WHERE user_id=? AND is_active=1').get(user.id).m || 0;
        d().prepare('INSERT INTO daily_routines (user_id, title, sort_order) VALUES (?, ?, ?)').run(user.id, text.slice(0, 100), maxOrder + 1);
        await ctx.reply(`✅ Добавлено: ${escapeHtml(text)}`);
        await showDailyRoutines(ctx);
        return true;
      }

      // Create plan title
      if (ctx.session.step === 'pl_create_title') {
        const periodType = ctx.session.data?.periodType;
        ctx.session.step = 'pl_create_items';
        ctx.session.data.planTitle = text;

        const tz = user.timezone || 'Europe/Moscow';
        const now = DateTime.now().setZone(tz);
        const periodDays = PERIODS[periodType]?.days || 7;
        const startDate = now.toFormat('yyyy-MM-dd');
        const endDate = now.plus({ days: periodDays }).toFormat('yyyy-MM-dd');
        ctx.session.data.startDate = startDate;
        ctx.session.data.endDate = endDate;

        await ctx.reply(
          `📝 План: <b>${escapeHtml(text)}</b>\n` +
          `📅 ${startDate} → ${endDate}\n\n` +
          `Теперь напишите пункты плана (каждый с новой строки):\n\n` +
          `<i>Пример:\nСделать презентацию\nПозвонить клиенту\nОтправить отчёт</i>\n\n` +
          `Или отправьте /skip чтобы добавить позже`,
          { parse_mode: 'HTML' }
        );
        return true;
      }

      // Plan items
      if (ctx.session.step === 'pl_create_items') {
        ctx.session.step = null;
        const data = ctx.session.data;

        // Create plan
        const result = d().prepare('INSERT INTO period_plans (user_id, period_type, title, start_date, end_date) VALUES (?, ?, ?, ?, ?)').run(user.id, data.periodType, data.planTitle, data.startDate, data.endDate);
        const planId = result.lastInsertRowid;

        // Add items (if not /skip)
        if (text !== '/skip') {
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          lines.forEach((line, i) => {
            d().prepare('INSERT INTO plan_items (plan_id, title, sort_order) VALUES (?, ?, ?)').run(planId, line.slice(0, 200), i);
          });
        }

        // Create reminders
        const endDt = DateTime.fromISO(data.endDate, { zone: user.timezone || 'Europe/Moscow' });
        // Reminder 1 day before end
        const remind1 = endDt.minus({ days: 1 }).set({ hour: 10, minute: 0 }).toUTC().toISO();
        d().prepare('INSERT INTO plan_reminders (user_id, plan_id, period_type, fire_at) VALUES (?, ?, ?, ?)').run(user.id, planId, data.periodType, remind1);
        // Reminder on end day
        const remind2 = endDt.set({ hour: 9, minute: 0 }).toUTC().toISO();
        d().prepare('INSERT INTO plan_reminders (user_id, plan_id, period_type, fire_at) VALUES (?, ?, ?, ?)').run(user.id, planId, data.periodType, remind2);

        await ctx.reply('✅ План создан!');
        await showPlanView(ctx, planId);
        return true;
      }

      // Add plan item
      if (ctx.session.step === 'pi_add_title') {
        ctx.session.step = null;
        const planId = ctx.session.data?.planId;
        if (!planId) return false;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const maxOrder = d().prepare('SELECT MAX(sort_order) as m FROM plan_items WHERE plan_id=?').get(planId).m || 0;
        lines.forEach((line, i) => {
          d().prepare('INSERT INTO plan_items (plan_id, title, sort_order) VALUES (?, ?, ?)').run(planId, line.slice(0, 200), maxOrder + i + 1);
        });
        await ctx.reply(`✅ Добавлено: ${lines.length} пунктов`);
        await showPlanView(ctx, planId);
        return true;
      }

      return false;
    }
  };
}

// ═══════ PLANNER CRON — reminders ═══════
function startPlannerCron(bot) {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = DateTime.utc();
      const reminders = getDb().prepare(`
        SELECT pr.*, p.title as plan_title, p.period_type, p.status as plan_status,
          u.tg_id, u.timezone, u.planner_notify
        FROM plan_reminders pr
        JOIN period_plans p ON pr.plan_id=p.id
        JOIN users u ON pr.user_id=u.id
        WHERE pr.sent=0 AND datetime(pr.fire_at) <= datetime(?)
      `).all(now.toISO());

      for (const rem of reminders) {
        if (!rem.tg_id || rem.planner_notify === 0) {
          getDb().prepare('UPDATE plan_reminders SET sent=1 WHERE id=?').run(rem.id);
          continue;
        }

        const periodInfo = PERIODS[rem.period_type] || { label: rem.period_type };
        const plan = getDb().prepare('SELECT * FROM period_plans WHERE id=?').get(rem.plan_id);
        if (!plan || plan.status !== 'active') {
          getDb().prepare('UPDATE plan_reminders SET sent=1 WHERE id=?').run(rem.id);
          continue;
        }

        const items = getDb().prepare('SELECT COUNT(*) as total, SUM(is_done) as done FROM plan_items WHERE plan_id=?').get(rem.plan_id);
        const pct = items.total > 0 ? Math.round((items.done || 0) / items.total * 100) : 0;
        const tz = rem.timezone || 'Europe/Moscow';
        const endDt = DateTime.fromISO(plan.end_date, { zone: tz });
        const nowLocal = DateTime.now().setZone(tz);
        const daysLeft = Math.max(0, Math.ceil(endDt.diff(nowLocal, 'days').days));

        let text;
        if (daysLeft <= 0) {
          text = `🔔 <b>Период завершён!</b>\n\n` +
            `${periodInfo.label}: <b>${escapeHtml(plan.title)}</b>\n` +
            `📊 Выполнено: ${pct}%\n\n` +
            `Пора составить план на новый период!`;
        } else {
          text = `📆 <b>Напоминание о плане</b>\n\n` +
            `${periodInfo.label}: <b>${escapeHtml(plan.title)}</b>\n` +
            `📊 Прогресс: ${pct}%\n` +
            `⏳ Осталось: ${daysLeft} дн\n\n` +
            `Проверьте прогресс и обновите план!`;
        }

        const kb = new InlineKeyboard()
          .text('📋 Открыть план', `pl_view_${rem.plan_id}`).row();
        if (daysLeft <= 0) kb.text('📊 Завершить и обзор', `pl_complete_${rem.plan_id}`).row();
        kb.text('🔕 Выкл уведомления', 'pl_notify_toggle');

        try {
          await bot.api.sendMessage(rem.tg_id, text, { parse_mode: 'HTML', reply_markup: kb });
        } catch(e) {}
        getDb().prepare('UPDATE plan_reminders SET sent=1 WHERE id=?').run(rem.id);

        // If period ended, create chain of follow-up reminders (every 4 hours for a day)
        if (daysLeft <= 0) {
          for (let h = 4; h <= 24; h += 4) {
            const fireAt = now.plus({ hours: h }).toISO();
            getDb().prepare('INSERT INTO plan_reminders (user_id, plan_id, period_type, fire_at) VALUES (?, ?, ?, ?)').run(rem.user_id, rem.plan_id, rem.period_type, fireAt);
          }
        }
      }
    } catch(e) {
      console.error('[PLANNER CRON] Error:', e.message);
    }
  });

  console.log('[PLANNER] Period planner reminder cron started');
}

module.exports = { setupPlannerHandlers, startPlannerCron };
