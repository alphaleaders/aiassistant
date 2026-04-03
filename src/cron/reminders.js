const cron = require('node-cron');
const { DateTime } = require('luxon');
const db = require('../db/database');
const { formatTask, todayStr, formatDateRu, escapeHtml } = require('../utils/helpers');
const { getGroupTasksSummary } = require('../bot/group');

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

  // Автоперенос незавершённых задач в полночь по часовому поясу пользователя
  cron.schedule('* * * * *', async () => {
    try {
      const allUsers = db.getDb().prepare('SELECT * FROM users WHERE tg_id IS NOT NULL').all();
      for (const user of allUsers) {
        try {
          const now = DateTime.now().setZone(user.timezone);
          if (now.toFormat('HH:mm') !== '00:05') continue;

          const yesterday = now.minus({ days: 1 }).toFormat('yyyy-MM-dd');
          const today = now.toFormat('yyyy-MM-dd');

          // Ищем незавершённые задачи вчерашнего дня
          const unfinished = db.getDb().prepare(`
            SELECT * FROM tasks
            WHERE user_id = ? AND due_date = ? AND status NOT IN ('done', 'cancelled')
          `).all(user.id, yesterday);

          if (unfinished.length === 0) continue;

          // Переносим на сегодня
          const stmt = db.getDb().prepare('UPDATE tasks SET due_date = ? WHERE id = ?');
          for (const t of unfinished) {
            stmt.run(today, t.id);
          }

          // Уведомляем пользователя
          let msg = `📅 <b>Автоперенос задач</b>\n\n`;
          msg += `Перенёс ${unfinished.length} незавершённых задач с вчера на сегодня:\n\n`;
          unfinished.forEach(t => {
            const pri = ['', '🔴', '🟠', '🟡', '🟢'][t.priority] || '🟡';
            msg += `${pri} ${escapeHtml(t.title)}\n`;
          });
          msg += `\n💪 Сегодня точно справишься!`;

          await bot.api.sendMessage(user.tg_id, msg, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '📋 Задачи на сегодня', callback_data: 'today' },
              ]]
            }
          });
        } catch (e) {
          // тихо пропускаем ошибки по отдельным пользователям
        }
      }
    } catch (e) {
      console.error('[CARRYOVER CRON] Error:', e.message);
    }
  });

  // Контроль групповых задач — каждый день в 09:00 UTC
  cron.schedule('0 9 * * *', async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const overdue = db.getDb().prepare(`
        SELECT gt.*, w.tg_group_id, w.name as ws_name,
               u2.tg_id as assignee_tg_id, u2.tg_first_name as assignee_name
        FROM group_tasks gt
        JOIN workspaces w ON gt.workspace_id = w.id
        LEFT JOIN users u2 ON gt.assigned_to = u2.id
        WHERE gt.status IN ('todo','in_progress') AND gt.due_date < ? AND gt.due_date IS NOT NULL
      `).all(today);

      // Группируем по воркспейсу
      const byWorkspace = {};
      for (const t of overdue) {
        if (!byWorkspace[t.workspace_id]) byWorkspace[t.workspace_id] = { tasks: [], tg_group_id: t.tg_group_id, name: t.ws_name };
        byWorkspace[t.workspace_id].tasks.push(t);
      }

      for (const [wsId, data] of Object.entries(byWorkspace)) {
        // Пинг в группу
        let msg = `⚠️ <b>Просроченные задачи (${data.tasks.length}):</b>\n\n`;
        data.tasks.forEach(t => {
          msg += `🔴 ${escapeHtml(t.title)} #G${t.id}`;
          if (t.assignee_name) msg += ` — ${escapeHtml(t.assignee_name)}`;
          msg += ` · 📅${formatDateRu(t.due_date)}\n`;
        });
        try { await bot.api.sendMessage(data.tg_group_id, msg, { parse_mode: 'HTML' }); } catch {}

        // DM назначенным
        const notified = new Set();
        for (const t of data.tasks) {
          if (t.assignee_tg_id && !notified.has(t.assignee_tg_id)) {
            notified.add(t.assignee_tg_id);
            try {
              await bot.api.sendMessage(t.assignee_tg_id,
                `⚠️ <b>Просроченная задача!</b>\n📌 ${escapeHtml(t.title)}\n💬 ${escapeHtml(t.ws_name)}\n📅 Срок: ${formatDateRu(t.due_date)}`,
                {
                  parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[
                    { text: '✅ Выполнено', callback_data: `gt_done_${t.id}` },
                    { text: '📊 Отчёт', callback_data: `gt_report_${t.id}` },
                  ]] }
                }
              );
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error('[GROUP OVERDUE CRON] Error:', e.message);
    }
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

    // Командные задачи
    const groupSummary = await getGroupTasksSummary(user.id);
    if (groupSummary) text += groupSummary;

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
      text += `\n<b>Не завершено (${remaining.length}):</b>\n`;
      remaining.forEach(t => {
        const pri = ['', '🔴', '🟠', '🟡', '🟢'][t.priority] || '🟡';
        text += `  ${pri} ${escapeHtml(t.title)}\n`;
      });
      text += '\n⏰ <i>Автоматически перенесу на завтра в полночь.</i>';
    } else if (tasks.length > 0) {
      text += '\n🎉 <b>Все задачи выполнены!</b> Отличная работа!';
    }

    const kb = {
      inline_keyboard: [[
        { text: '📅 Перенести сейчас', callback_data: `move_all_tmr_${today}` },
        { text: '📋 Сегодня', callback_data: 'today' },
      ]]
    };

    await bot.api.sendMessage(user.tg_id, text, { parse_mode: 'HTML', reply_markup: kb });
  } catch (e) {
    console.error(`[EVENING] Failed for user ${user.tg_id}:`, e.message);
  }
}

module.exports = { startReminderCron };
