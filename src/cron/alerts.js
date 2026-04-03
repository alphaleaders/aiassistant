// Task Alert Escalation System
// Уведомления с подтверждением: за N минут, повтор, будильник

const cron = require('node-cron');
const { DateTime } = require('luxon');
const db = require('../db/database');
const { escapeHtml, formatDateRu } = require('../utils/helpers');
const { InlineKeyboard } = require('grammy');

function buildAlertKeyboard(taskId, alertId, alertType) {
  const kb = new InlineKeyboard()
    .text('✅ Буду — напомни позже', `alert_ack_${taskId}_${alertId}`).row()
    .text('⏰ +15 мин', `alert_snooze_${alertId}_15`)
    .text('⏰ +30 мин', `alert_snooze_${alertId}_30`)
    .text('⏰ +1 ч', `alert_snooze_${alertId}_60`).row()
    .text('🔕 Выкл напоминания', `alert_confirm_${taskId}`);
  return kb;
}

function buildAlarmKeyboard(taskId) {
  const kb = new InlineKeyboard()
    .text('✅ Я здесь! Выключить будильник', `alert_confirm_${taskId}`).row()
    .text('⏰ +5 мин', `alert_snooze_0_5`)
    .text('⏰ +10 мин', `alert_snooze_0_10`);
  return kb;
}

async function sendAlert(bot, tgId, task, alert, isAlarm = false) {
  const pri = ['', '🔴', '🟠', '🟡', '🟢'][task.priority] || '🟡';
  let text = '';

  if (isAlarm) {
    text = `🚨 <b>Время! Сейчас ${task.due_time}</b>\n\n` +
      `${pri} <b>${escapeHtml(task.task_title || task.title)}</b>\n` +
      `📅 ${formatDateRu(task.due_date)} ⏰ ${task.due_time}\n\n` +
      `<b>Подтвердите присутствие!</b>`;
  } else {
    const mins = alert.alert_type === 'hour' ? (task.alert_before_min || 60)
      : (task.alert_before_min2 || 15);
    const label = mins >= 60 ? `за ${mins / 60} ч` : `за ${mins} мин`;
    const isRepeat = (alert.sent_count || 0) > 0;
    // Calculate time remaining
    const tz = task.timezone || 'Europe/Moscow';
    const taskDt = DateTime.fromISO(task.due_date + 'T' + task.due_time, { zone: tz });
    const nowDt = DateTime.now().setZone(tz);
    const remMin = Math.max(0, Math.floor(taskDt.diff(nowDt, 'minutes').minutes));
    const remH = Math.floor(remMin / 60);
    const remM = remMin % 60;
    const remStr = remH > 0 ? remH + ' ч ' + remM + ' мин' : remM + ' мин';

    text = `${isRepeat ? '🔔' : '⏰'} <b>${isRepeat ? 'Напоминание' : 'Предстоит'} ${label}</b>\n\n` +
      `${pri} <b>${escapeHtml(task.task_title || task.title)}</b>\n` +
      `📅 ${formatDateRu(task.due_date)} ⏰ ${task.due_time}\n\n` +
      `⏳ <b>До начала: ${remStr}</b>`;
    if (alert.alert_type === 'hour') {
      text += `\n🔔 Следующее напоминание за 15 мин (${taskDt.minus({minutes: task.alert_before_min2 || 15}).toFormat('HH:mm')})`;
      text += `\n🔔 Будильник в ${task.due_time}`;
    } else if (alert.alert_type === '15min') {
      text += `\n🔔 Будильник сработает в ${task.due_time}!`;
    }
    if (isRepeat && !isAlarm) text += `\n\n<i>Нажмите «Буду» чтобы подтвердить</i>`;
  }

  const kb = isAlarm
    ? buildAlarmKeyboard(task.task_id || task.id)
    : buildAlertKeyboard(task.task_id || task.id, alert.id, alert.alert_type);

  try {
    await bot.api.sendMessage(tgId, text, { parse_mode: 'HTML', reply_markup: kb });
    db.markAlertSent(alert.id);
    return true;
  } catch (e) {
    console.error(`[ALERTS] Send failed to ${tgId}:`, e.message);
    return false;
  }
}

function startAlertCron(bot) {
  // Каждую минуту: создаём новые алерты и отправляем накопленные
  cron.schedule('* * * * *', async () => {
    try {
      const nowUtc = DateTime.now().toUTC();

      // 1. Проверяем задачи на сегодня и завтра у всех пользователей — создаём алерты
      const tomorrow = nowUtc.plus({ days: 1 }).toFormat('yyyy-MM-dd');
      const today = nowUtc.toFormat('yyyy-MM-dd');

      for (const dateStr of [today, tomorrow]) {
        const tasks = db.getTasksWithTimeToday(dateStr);
        for (const task of tasks) {
          try {
            const tz = task.timezone || 'Europe/Moscow';
            const nowLocal = DateTime.now().setZone(tz);
            const taskDateTime = DateTime.fromISO(`${task.due_date}T${task.due_time}`, { zone: tz });
            if (!taskDateTime.isValid) continue;

            const diffMin = taskDateTime.diff(nowLocal, 'minutes').minutes;
            const beforeMin = task.alert_before_min || 60;
            const beforeMin2 = task.alert_before_min2 || 15;

            // Создать алерт "за N минут" если пора
            if (diffMin <= beforeMin && diffMin > beforeMin2 + 1) {
              if (!db.getTaskAlertByType(task.id, 'hour') && !db.isAlertConfirmed(task.id)) {
                db.createTaskAlert(task.id, task.user_id, 'hour', taskDateTime.minus({ minutes: beforeMin }).toUTC().toISO());
              }
            }

            // Создать алерт "за 15 мин" если пора
            if (diffMin <= beforeMin2 && diffMin > 0) {
              if (!db.getTaskAlertByType(task.id, '15min') && !db.isAlertConfirmed(task.id)) {
                db.createTaskAlert(task.id, task.user_id, '15min', taskDateTime.minus({ minutes: beforeMin2 }).toUTC().toISO());
              }
            }

            // Создать alarm алерт если время пришло
            if (diffMin <= 0 && diffMin > -120) { // в пределах 2 часов после
              if (!db.getTaskAlertByType(task.id, 'start') && !db.isAlertConfirmed(task.id)) {
                db.createTaskAlert(task.id, task.user_id, 'start', taskDateTime.toUTC().toISO());
              }
            }
          } catch (e) {
            console.error(`[ALERTS] Task ${task.id} check error:`, e.message);
          }
        }
      }

      // 2. Обрабатываем активные неподтверждённые алерты
      const activeAlerts = db.getActiveAlerts();
      for (const alert of activeAlerts) {
        try {
          const tz = alert.timezone || 'Europe/Moscow';
          const nowLocal = DateTime.now().setZone(tz);

          // Проверяем snooze
          if (alert.snoozed_until) {
            const snoozeEnd = DateTime.fromISO(alert.snoozed_until);
            if (nowLocal < snoozeEnd) continue;
          }

          const taskDateTime = DateTime.fromISO(`${alert.due_date}T${alert.due_time}`, { zone: tz });
          const isAlarm = alert.alert_type === 'start' || nowLocal >= taskDateTime;
          const repeatMin = isAlarm ? (alert.alert_alarm_min || 2) : (alert.alert_repeat_min || 5);

          // Проверяем когда последний раз отправляли
          if (alert.last_sent_at) {
            const lastSent = DateTime.fromISO(alert.last_sent_at).setZone('UTC');
            const minSinceLastSent = nowUtc.diff(lastSent, 'minutes').minutes;
            if (minSinceLastSent < repeatMin) continue;
          }

          await sendAlert(bot, alert.tg_id, alert, alert, isAlarm);
        } catch (e) {
          console.error(`[ALERTS] Alert ${alert.id} process error:`, e.message);
        }
      }
    } catch (e) {
      console.error('[ALERTS CRON] Error:', e.message);
    }
  });

  console.log('[ALERTS] Escalation alert system started');
}

// ============ MEET REMINDERS CRON ============
function startMeetCron(bot, webappUrl) {
  // Каждую минуту проверяем запланированные конференции
  cron.schedule('* * * * *', async () => {
    try {
      const meets = db.getUpcomingMeets();
      const now = DateTime.utc();

      for (const meet of meets) {
        if (!meet.room_active || meet.started) continue;

        const scheduledDt = DateTime.fromISO(meet.scheduled_at, { zone: 'utc' });
        const diffMin = scheduledDt.diff(now, 'minutes').minutes;

        // За 15 минут
        if (!meet.reminded_15 && diffMin <= 15 && diffMin > 0) {
          db.markMeetReminded(meet.id, '15min');
          const time = scheduledDt.setZone('Europe/Moscow').toFormat('HH:mm');
          const kb = new InlineKeyboard();
          if (webappUrl) kb.url('🌐 Войти', `${webappUrl}/?conf=${meet.room_id}`);
          kb.text(`✋ Буду`, `meet_yes_${meet.room_id}`);

          const rsvpCount = db.getMeetRsvpCount(meet.id);

          try {
            await bot.api.sendMessage(meet.chat_id,
              `⏰ <b>Через 15 минут!</b>\n\n` +
              `📌 <b>${escapeHtml(meet.title)}</b>\n` +
              `🕐 Начало в ${time}\n` +
              `👥 Подтвердили: ${rsvpCount}\n\n` +
              `Нажмите «Войти» чтобы присоединиться:`,
              { parse_mode: 'HTML', reply_markup: kb }
            );
          } catch (e) { console.error('[MEET] 15min reminder failed:', e.message); }

          // Personal DM reminders to all RSVP users
          try {
            const rsvps15 = db.getMeetRsvps(meet.id);
            for (const r of rsvps15) {
              if (r.status !== 'yes') continue;
              const rUser = db.getDb().prepare('SELECT tg_id, timezone FROM users WHERE id=?').get(r.user_id);
              if (!rUser || !rUser.tg_id) continue;
              const personalTime = scheduledDt.setZone(rUser.timezone || 'Europe/Moscow').toFormat('HH:mm');
              const kb15 = new InlineKeyboard();
              if (webappUrl) kb15.url('🚀 Войти', webappUrl + '/?conf=' + meet.room_id);
              try {
                await bot.api.sendMessage(rUser.tg_id,
                  '⏰ <b>Через 15 минут — конференция!</b>\n\n' +
                  '📌 <b>' + escapeHtml(meet.title) + '</b>\n' +
                  '🕐 Начало в ' + personalTime + '\n\n' +
                  '🔗 ' + (webappUrl ? webappUrl + '/?conf=' + meet.room_id : ''),
                  { parse_mode: 'HTML', reply_markup: kb15 }
                );
              } catch(pe) {}
            }
          } catch(e) {}
        }

        // В момент начала
        if (!meet.reminded_start && diffMin <= 0 && diffMin > -5) {
          db.markMeetReminded(meet.id, 'start');
          db.markMeetReminded(meet.id, 'started');

          const rsvps = db.getMeetRsvps(meet.id);
          const yesNames = rsvps.filter(r => r.status === 'yes').map(r => r.tg_name).filter(Boolean);

          const kb = new InlineKeyboard();
          if (webappUrl) kb.url('🌐 Войти сейчас', `${webappUrl}/?conf=${meet.room_id}`);

          try {
            await bot.api.sendMessage(meet.chat_id,
              `🔴 <b>Конференция началась!</b>\n\n` +
              `📌 <b>${escapeHtml(meet.title)}</b>\n` +
              `🔑 ID: <code>${meet.room_id}</code>\n` +
              (yesNames.length > 0 ? `👥 Ждём: ${yesNames.join(', ')}\n` : '') +
              `\nНажмите кнопку чтобы войти:`,
              { parse_mode: 'HTML', reply_markup: kb }
            );
          } catch (e) { console.error('[MEET] Start reminder failed:', e.message); }

          // ALARM: personal DM to all RSVP users at start time
          try {
            const rsvpsStart = db.getMeetRsvps(meet.id);
            for (const r of rsvpsStart) {
              if (r.status !== 'yes') continue;
              const rUser = db.getDb().prepare('SELECT tg_id FROM users WHERE id=?').get(r.user_id);
              if (!rUser || !rUser.tg_id) continue;
              const kbAlarm = new InlineKeyboard();
              if (webappUrl) kbAlarm.url('🚀 ВОЙТИ СЕЙЧАС', webappUrl + '/?conf=' + meet.room_id);
              try {
                await bot.api.sendMessage(rUser.tg_id,
                  '🔴🔴🔴 <b>КОНФЕРЕНЦИЯ НАЧАЛАСЬ!</b> 🔴🔴🔴\n\n' +
                  '📌 <b>' + escapeHtml(meet.title) + '</b>\n\n' +
                  '⚡ Нажмите кнопку чтобы войти!\n\n' +
                  '🔗 ' + (webappUrl ? webappUrl + '/?conf=' + meet.room_id : ''),
                  { parse_mode: 'HTML', reply_markup: kbAlarm }
                );
              } catch(pe) {}
            }
          } catch(e) {}
        }

        // Через 5 минут после начала — маркируем started если ещё нет
        if (diffMin < -5 && !meet.started) {
          db.markMeetReminded(meet.id, 'started');
        }
      }
    } catch (e) {
      console.error('[MEET CRON] Error:', e.message);
    }
  });

  console.log('[MEET] Scheduled meet reminder system started');
}

function setupAlertCallbacks(bot) {
  // ✅ "Буду" — acknowledge this alert, but keep future ones active
  bot.callbackQuery(/^alert_ack_(\d+)_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const alertId = parseInt(ctx.match[2]);
    // Mark only this alert as sent, don't deactivate others
    db.markAlertSent(alertId);
    // Calculate next reminder
    const task = db.getTaskById(taskId);
    let nextInfo = '🔔 Напомню ещё раз позже';
    if (task && task.due_time) {
      const tz = task.timezone || 'Europe/Moscow';
      const taskDt = DateTime.fromISO(task.due_date + 'T' + task.due_time, { zone: tz });
      const nowDt = DateTime.now().setZone(tz);
      const remMin = Math.max(0, Math.floor(taskDt.diff(nowDt, 'minutes').minutes));
      const remH = Math.floor(remMin / 60);
      const remM = remMin % 60;
      const remStr = remH > 0 ? remH + ' ч ' + remM + ' мин' : remM + ' мин';
      if (remMin <= 15) {
        nextInfo = '🔔 Будильник сработает через ' + remStr + ' (в ' + task.due_time + ')';
      } else {
        const nextRemMin = Math.min(remMin, task.alert_before_min2 || 15);
        nextInfo = '🔔 Следующее напоминание через ' + (remMin - nextRemMin) + ' мин\n⏰ Будильник в ' + task.due_time;
      }
    }
    await ctx.answerCallbackQuery('✅ Принято! Напомню позже');
    try {
      await ctx.editMessageText(
        '✅ <b>Вы подтвердили</b>\n\n' +
        '⏳ ' + nextInfo + '\n\n' +
        '💡 Напоминание включено — ничего нажимать не надо!',
        { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔕 Выкл все напоминания', 'alert_confirm_' + taskId) }
      );
    } catch {}
  });

  // 🔕 Выключить все напоминания для задачи
  bot.callbackQuery(/^alert_confirm_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    db.confirmAlert(taskId, user.id);
    await ctx.answerCallbackQuery('🔕 Все напоминания выключены');
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [
        [{ text: '🔕 Напоминания выключены', callback_data: 'noop' }]
      ]});
    } catch {}
  });

  // ⏰ Отложить
  bot.callbackQuery(/^alert_snooze_(\d+)_(\d+)$/, async (ctx) => {
    const alertId = parseInt(ctx.match[1]);
    const minutes = parseInt(ctx.match[2]);
    db.snoozeAlert(alertId, minutes);
    await ctx.answerCallbackQuery(`⏰ Напомню через ${minutes} мин`);
  });

  // ❌ Отменить задачу/алерт
  bot.callbackQuery(/^alert_cancel_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    const task = db.getTaskById(taskId);
    if (task && task.user_id === user.id) {
      db.updateTask(taskId, { status: 'cancelled' });
      db.deactivateTaskAlerts(taskId);
    }
    await ctx.answerCallbackQuery('❌ Задача отменена');
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}
  });
}

module.exports = { startAlertCron, setupAlertCallbacks, startMeetCron };
