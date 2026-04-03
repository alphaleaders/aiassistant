// Admin Panel for Alpha Planner Bot
const { InlineKeyboard } = require('grammy');
const db = require('../db/database');
const { escapeHtml } = require('../utils/helpers');

const ADMIN_IDS = (process.env.ADMIN_ID || '').split(',').map(Number).filter(Boolean);

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function setupAdminPanel(bot) {

  // /admin command
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await showAdminPanel(ctx);
  });

  async function showAdminPanel(ctx) {
    const d = db.getDb();
    const usersCount = d.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const tasksCount = d.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
    const roomsCount = d.prepare('SELECT COUNT(*) as c FROM conf_rooms WHERE is_active=1').get().c;
    const todayTasks = d.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date=date('now') AND status='todo'").get().c;
    const habitsCount = d.prepare('SELECT COUNT(*) as c FROM habits').get().c;

    const kb = new InlineKeyboard()
      .text('👥 Пользователи', 'adm_users').text('📊 Статистика', 'adm_stats').row()
      .text('📋 Задачи', 'adm_tasks').text('📹 Комнаты', 'adm_rooms').row()
      .text('📢 Рассылка', 'adm_broadcast').text('⚙️ Настройки', 'adm_settings').row()
      .text('📥 Экспорт CSV', 'adm_export').text('🔑 Env/Keys', 'adm_keys').row()
      .text('◀️ Закрыть', 'adm_close');

    const text = `🔐 <b>Admin Panel</b>\n\n` +
      `👥 Пользователей: <b>${usersCount}</b>\n` +
      `📋 Задач: <b>${tasksCount}</b> (сегодня: ${todayTasks})\n` +
      `📊 Привычек: <b>${habitsCount}</b>\n` +
      `📹 Активных комнат: <b>${roomsCount}</b>`;

    if (ctx.callbackQuery) {
      try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // Stats
  bot.callbackQuery('adm_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery();
    const d = db.getDb();

    const users = d.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const usersToday = d.prepare("SELECT COUNT(*) as c FROM users WHERE date(created_at)=date('now')").get().c;
    const usersWeek = d.prepare("SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now','-7 days')").get().c;
    const tasks = d.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
    const tasksDone = d.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='done'").get().c;
    const tasksToday = d.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date=date('now')").get().c;
    const habits = d.prepare('SELECT COUNT(*) as c FROM habits').get().c;
    const rooms = d.prepare('SELECT COUNT(*) as c FROM conf_rooms').get().c;
    const roomsActive = d.prepare('SELECT COUNT(*) as c FROM conf_rooms WHERE is_active=1').get().c;
    const messages = d.prepare('SELECT COUNT(*) as c FROM chat_history').get().c;
    const workspaces = d.prepare('SELECT COUNT(*) as c FROM workspaces').get().c;

    const text = `📊 <b>Статистика</b>\n\n` +
      `<b>👥 Пользователи</b>\n` +
      `  Всего: ${users}\n` +
      `  Сегодня: +${usersToday}\n` +
      `  За неделю: +${usersWeek}\n\n` +
      `<b>📋 Задачи</b>\n` +
      `  Всего: ${tasks}\n` +
      `  Выполнено: ${tasksDone}\n` +
      `  Сегодня: ${tasksToday}\n\n` +
      `<b>📊 Привычки:</b> ${habits}\n` +
      `<b>💬 Сообщений AI:</b> ${messages}\n` +
      `<b>📹 Комнат:</b> ${rooms} (активных: ${roomsActive})\n` +
      `<b>👥 Групп:</b> ${workspaces}`;

    const kb = new InlineKeyboard().text('◀️ Назад', 'adm_back');
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
  });

  // Users list
  bot.callbackQuery(/^adm_users(_\d+)?$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery();
    const d = db.getDb();
    const offset = ctx.match[1] ? parseInt(ctx.match[1].slice(1)) : 0;
    const users = d.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 15 OFFSET ?').all(offset);
    const total = d.prepare('SELECT COUNT(*) as c FROM users').get().c;

    let text = `👥 <b>Пользователи</b> (${total})\n\n`;
    users.forEach((u, i) => {
      text += `${offset + i + 1}. <b>${escapeHtml(u.tg_first_name || '?')}</b>`;
      if (u.tg_username) text += ` @${u.tg_username}`;
      text += ` [${u.tg_id}]`;
      text += `\n   📅 ${u.created_at?.slice(0, 10) || '?'}`;
      if (u.secretary_name) text += ` | 🤖 ${u.secretary_name}`;
      text += '\n';
    });

    const kb = new InlineKeyboard();
    if (offset > 0) kb.text('⬅️ Пред', `adm_users_${offset - 15}`);
    if (offset + 15 < total) kb.text('Далее ➡️', `adm_users_${offset + 15}`);
    kb.row().text('📥 Скачать CSV', 'adm_export').text('◀️ Назад', 'adm_back');
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
  });

  // Tasks overview
  bot.callbackQuery('adm_tasks', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery();
    const d = db.getDb();

    const byStatus = d.prepare("SELECT status, COUNT(*) as c FROM tasks GROUP BY status").all();
    const byPriority = d.prepare("SELECT priority, COUNT(*) as c FROM tasks WHERE status='todo' GROUP BY priority ORDER BY priority").all();
    const overdue = d.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='todo' AND due_date < date('now')").get().c;
    const topUsers = d.prepare("SELECT u.tg_first_name, COUNT(t.id) as c FROM tasks t JOIN users u ON t.user_id=u.id GROUP BY t.user_id ORDER BY c DESC LIMIT 5").all();

    let text = `📋 <b>Задачи</b>\n\n<b>По статусу:</b>\n`;
    byStatus.forEach(s => { text += `  ${s.status}: ${s.c}\n`; });
    text += `\n⚠️ Просрочено: ${overdue}\n`;
    text += `\n<b>По приоритету (открытые):</b>\n`;
    const priNames = ['', '🔴 Критический', '🟠 Высокий', '🟡 Средний', '🟢 Низкий'];
    byPriority.forEach(p => { text += `  ${priNames[p.priority] || p.priority}: ${p.c}\n`; });
    text += `\n<b>Топ пользователей:</b>\n`;
    topUsers.forEach((u, i) => { text += `  ${i + 1}. ${escapeHtml(u.tg_first_name || '?')}: ${u.c} задач\n`; });

    const kb = new InlineKeyboard().text('◀️ Назад', 'adm_back');
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
  });

  // Rooms
  bot.callbackQuery('adm_rooms', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery();
    const d = db.getDb();

    const rooms = d.prepare('SELECT r.*, u.tg_first_name as creator_name FROM conf_rooms r LEFT JOIN users u ON r.created_by=u.id WHERE r.is_active=1 ORDER BY r.created_at DESC LIMIT 10').all();

    let text = `📹 <b>Активные комнаты</b>\n\n`;
    if (rooms.length === 0) text += 'Нет активных комнат';
    rooms.forEach(r => {
      const members = d.prepare('SELECT COUNT(*) as c FROM conf_members WHERE room_id=?').get(r.id).c;
      text += `🔑 <code>${r.id}</code> — ${escapeHtml(r.name)}\n`;
      text += `   👤 ${escapeHtml(r.creator_name || '?')} | 👥 ${members}\n`;
      text += `   📅 ${r.created_at?.slice(0, 16)}\n\n`;
    });

    const kb = new InlineKeyboard().text('◀️ Назад', 'adm_back');
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
  });

  // Broadcast
  bot.callbackQuery('adm_broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery();
    ctx.session.step = 'adm_broadcast_text';
    await ctx.editMessageText(
      '📢 <b>Рассылка</b>\n\n' +
      'Отправьте текст сообщения для рассылки всем пользователям.\n\n' +
      '<i>Поддерживается HTML разметка. Отправьте /cancel для отмены.</i>',
      { parse_mode: 'HTML' }
    );
  });

  // Export CSV
  bot.callbackQuery('adm_export', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery('📥 Генерация CSV...');
    const d = db.getDb();
    const users = d.prepare('SELECT * FROM users ORDER BY created_at DESC').all();

    const fs = require('fs');
    const tmpFile = '/tmp/users_export_' + Date.now() + '.csv';
    const header = '\uFEFF№;telegram_id;username;first_name;secretary;style;timezone;created_at\n';
    let csv = header;
    users.forEach((u, i) => {
      csv += `${i + 1};${u.tg_id};${u.tg_username || ''};${u.tg_first_name || ''};${u.secretary_name || ''};${u.secretary_style || ''};${u.timezone || ''};${u.created_at || ''}\n`;
    });
    fs.writeFileSync(tmpFile, csv);

    try {
      const { InputFile } = require('grammy');
      await ctx.replyWithDocument(new InputFile(tmpFile, `users_${new Date().toISOString().slice(0, 10)}.csv`), {
        caption: `📥 Экспорт: ${users.length} пользователей`
      });
      fs.unlinkSync(tmpFile);
    } catch (e) {
      await ctx.reply('❌ Ошибка экспорта: ' + e.message);
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

  // Settings
  bot.callbackQuery('adm_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery();

    const text = `⚙️ <b>Настройки сервера</b>\n\n` +
      `🤖 Бот: @${ctx.me?.username}\n` +
      `🌐 WebApp: ${process.env.WEBAPP_URL || 'не задан'}\n` +
      `🔑 Groq: ${process.env.GROQ_KEY ? '✅ установлен' : '❌'}\n` +
      `📹 TURN: ${process.env.TURN_SERVER || '81.91.177.204:3478'}\n` +
      `👑 Admin IDs: ${ADMIN_IDS.join(', ')}\n` +
      `⏰ Uptime: ${Math.floor(process.uptime() / 3600)}ч ${Math.floor((process.uptime() % 3600) / 60)}мин`;

    const kb = new InlineKeyboard().text('◀️ Назад', 'adm_back');
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
  });

  // Keys
  bot.callbackQuery('adm_keys', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery();

    const keys = ['BOT_TOKEN', 'GROQ_KEY', 'WEBAPP_URL', 'PORT', 'ADMIN_ID'];
    let text = '🔑 <b>Environment Variables</b>\n\n';
    keys.forEach(k => {
      const val = process.env[k];
      text += `<code>${k}</code>: ${val ? '✅ ' + val.slice(0, 10) + '...' : '❌ не задан'}\n`;
    });

    const kb = new InlineKeyboard().text('◀️ Назад', 'adm_back');
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
  });

  // Back to panel
  bot.callbackQuery('adm_back', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery();
    await showAdminPanel(ctx);
  });

  // Close
  bot.callbackQuery('adm_close', async (ctx) => {
    await ctx.answerCallbackQuery();
    try { await ctx.deleteMessage(); } catch {}
  });

  // Noop
  bot.callbackQuery('noop', async (ctx) => { await ctx.answerCallbackQuery(); });

  // Broadcast text handler (in main text handler)
  return {
    handleBroadcastText: async function(ctx) {
      if (ctx.session.step !== 'adm_broadcast_text') return false;
      if (!isAdmin(ctx.from.id)) return false;
      const text = ctx.message.text;
      if (text === '/cancel') {
        ctx.session.step = null;
        await ctx.reply('❌ Рассылка отменена');
        return true;
      }

      ctx.session.step = null;
      ctx.session.data = { broadcastText: text };

      const d = db.getDb();
      const count = d.prepare('SELECT COUNT(*) as c FROM users WHERE tg_id IS NOT NULL').get().c;

      const kb = new InlineKeyboard()
        .text(`✅ Отправить ${count} пользователям`, 'adm_broadcast_send')
        .row()
        .text('❌ Отмена', 'adm_back');

      await ctx.reply(
        `📢 <b>Предпросмотр рассылки:</b>\n\n${text}\n\n` +
        `<i>Получателей: ${count}</i>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return true;
    }
  };
}

// Broadcast send callback — needs to be registered in bot.js
function setupBroadcastSend(bot) {
  bot.callbackQuery('adm_broadcast_send', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery('📢 Рассылка запущена...');

    const text = ctx.session?.data?.broadcastText;
    if (!text) return;

    const d = db.getDb();
    const users = d.prepare('SELECT tg_id FROM users WHERE tg_id IS NOT NULL').all();

    let sent = 0, failed = 0;
    const statusMsg = await ctx.reply(`📢 Рассылка: 0/${users.length}...`);

    for (const u of users) {
      try {
        await ctx.api.sendMessage(u.tg_id, text, { parse_mode: 'HTML' });
        sent++;
      } catch { failed++; }

      // Rate limit: 30 msg/sec
      if ((sent + failed) % 30 === 0) {
        await new Promise(r => setTimeout(r, 1100));
        try {
          await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `📢 Рассылка: ${sent + failed}/${users.length}... ✅${sent} ❌${failed}`);
        } catch {}
      }
    }

    try {
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
        `📢 <b>Рассылка завершена!</b>\n\n✅ Доставлено: ${sent}\n❌ Ошибки: ${failed}\n📊 Всего: ${users.length}`,
        { parse_mode: 'HTML' }
      );
    } catch {}
  });
}

module.exports = { setupAdminPanel, setupBroadcastSend, isAdmin };
