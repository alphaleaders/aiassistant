const cron = require('node-cron');
const { DateTime } = require('luxon');
const db = require('../db/database');
const { formatTask, todayStr, formatDateRu, escapeHtml } = require('../utils/helpers');

function startReminderCron(bot) {
  // Проверка напоминаний каждую минуту
  cron.schedule('* * * * *', async () => {
    try {
      const now = DateTime.now().toUTC().toISO();
      const reminders = db.getPendingReminders(now);

      for (const rem of reminders) {
        try {
          await bot.api.sendMessage(rem.tg_id,
            `⏰ <b>Напоминание!</b>\n\n` +
            `📌 ${escapeHtml(rem.task_title)}\n` +
            (rem.due_date ? `📅 ${formatDateRu(rem.due_date)}` : '') +
            (rem.due_time ? ` ⏰ ${rem.due_time}` : ''),
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[
                  { text: '✅ Готово', callback_data: `done_${rem.task_id}` },
                  { text: '⏰ +30 мин', callback_data: `snooze_${rem.id}_30` },
                ]]
              }
            }
          );
          db.markReminderSent(rem.id);
        } catch (e) {
          console.error(`[REMINDER] Failed to send to ${rem.tg_id}:`, e.message);
          db.markReminderSent(rem.id); // Не повторять бесконечно
        }
      }
    } catch (e) {
      console.error('[REMINDER CRON] Error:', e.message);
    }
  });

  // Утренний дайджест — проверяем каждую минуту, совпадает ли время
  cron.schedule('* * * * *', async () => {
    try {
      const allUsers = db.getDb().prepare('SELECT * FROM users').all();
      for (const user of allUsers) {
        const now = DateTime.now().setZone(user.timezone);
        const currentTime = now.toFormat('HH:mm');

        // Утренний дайджест
        if (currentTime === user.morning_digest) {
          await sendMorningDigest(bot, user);
        }

        // Вечерний обзор
        if (currentTime === user.evening_review) {
          await sendEveningReview(bot, user);
        }
      }
    } catch (e) {
      console.error('[DIGEST CRON] Error:', e.message);
    }
  });

  // Snooze callback
  bot.callbackQuery(/^snooze_(\d+)_(\d+)$/, async (ctx) => {
    const reminderId = parseInt(ctx.match[1]);
    const minutes = parseInt(ctx.match[2]);
    const user = db.ensureUser(ctx.from);

    // Создаём новое напоминание через N минут
    const reminder = db.getDb().prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
    if (reminder) {
      const fireAt = DateTime.now().plus({ minutes }).toUTC().toISO();
      db.createReminder(reminder.task_id, user.id, fireAt, minutes);
    }
    await ctx.answerCallbackQuery(`⏰ Напомню через ${minutes} мин`);
  });

  console.log('[CRON] Reminder system started');
}

async function sendMorningDigest(bot, user) {
  try {
    const today = todayStr(user.timezone);
    const tasks = db.getTasksByDate(user.id, today);
    const overdue = db.getOverdueTasks(user.id, today);
    const habits = db.getUserHabits(user.id);

    let text = `☀️ <b>Доброе утро, ${escapeHtml(user.tg_first_name || 'друг')}!</b>\n\n`;

    if (overdue.length > 0) {
      text += `⚠️ <b>Просрочено (${overdue.length}):</b>\n`;
      overdue.slice(0, 5).forEach(t => { text += `  ${formatTask(t, true)}\n`; });
      text += '\n';
    }

    text += `📅 <b>Сегодня (${formatDateRu(today)}):</b>\n`;
    if (tasks.length === 0) {
      text += '  Нет запланированных задач\n';
    } else {
      tasks.forEach(t => { text += `  ${formatTask(t)}\n`; });
    }

    if (habits.length > 0) {
      text += `\n📊 <b>Привычки:</b>\n`;
      habits.forEach(h => { text += `  ${h.emoji} ${escapeHtml(h.title)} — 🔥${h.current_streak}\n`; });
    }

    text += '\n💪 Продуктивного дня!';

    await bot.api.sendMessage(user.tg_id, text, { parse_mode: 'HTML' });
  } catch (e) {
    console.error(`[MORNING] Failed for user ${user.tg_id}:`, e.message);
  }
}

async function sendEveningReview(bot, user) {
  try {
    const today = todayStr(user.timezone);
    const tasks = db.getTasksByDate(user.id, today);
    const done = tasks.filter(t => t.status === 'done');
    const remaining = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');

    let text = `🌙 <b>Вечерний обзор:</b>\n\n`;
    text += `✅ Выполнено: ${done.length}/${tasks.length}\n`;

    if (done.length > 0) {
      text += `\n<b>Сделано:</b>\n`;
      done.forEach(t => { text += `  ✅ ${escapeHtml(t.title)}\n`; });
    }

    if (remaining.length > 0) {
      text += `\n<b>Не завершено:</b>\n`;
      remaining.forEach(t => { text += `  ⬜ ${escapeHtml(t.title)}\n`; });
      text += '\nПеренести на завтра? 👇';
    } else if (tasks.length > 0) {
      text += '\n🎉 Все задачи выполнены! Отличная работа!';
    }

    const kb = remaining.length > 0 ? {
      inline_keyboard: [[
        { text: '📅 Всё на завтра', callback_data: `move_all_tmr_${today}` },
      ]]
    } : undefined;

    await bot.api.sendMessage(user.tg_id, text, { parse_mode: 'HTML', reply_markup: kb });
  } catch (e) {
    console.error(`[EVENING] Failed for user ${user.tg_id}:`, e.message);
  }
}

module.exports = { startReminderCron };
