// Conference bot commands — full TeleMeet functionality
const { InlineKeyboard } = require('grammy');
const db = require('../db/database');
const { escapeHtml } = require('../utils/helpers');
const { t, getUserLang } = require('../utils/i18n-bot');

// ============ Главное меню конференций ============
async function showConfMenu(ctx, webappUrl) {
  const user = db.ensureUser(ctx.from);
  const rooms = db.getUserConfRooms(user.id);

  let text = `📹 <b>Видеоконференции</b>\n\n`;

  const kb = new InlineKeyboard()
    .text('➕ Создать комнату', 'conf_create')
    .text('🔑 Войти по ID', 'conf_join_by_id').row();

  if (rooms.length > 0) {
    text += `<b>Ваши активные комнаты:</b>\n\n`;
    rooms.slice(0, 6).forEach((r, i) => {
      text += `${i + 1}. 📹 <b>${escapeHtml(r.name)}</b>\n`;
      text += `   🔑 <code>${r.id}</code>`;
      if (r.member_count > 0) text += ` · 👥 ${r.member_count}`;
      text += '\n\n';

      const rowKb = new InlineKeyboard();
      if (webappUrl) {
        kb.webApp(`🚀 ${r.name.slice(0, 18)}`, `${webappUrl}?conf=${r.id}`)
          .text('🔗 Пригл.', `conf_invite_${r.id}`)
          .text('❌ Закр.', `conf_close_${r.id}`).row();
      } else {
        kb.text(`🚀 Войти`, `conf_enter_${r.id}`)
          .text('🔗 Пригл.', `conf_invite_${r.id}`)
          .text('❌ Закр.', `conf_close_${r.id}`).row();
      }
    });
    if (rooms.length > 6) text += `<i>...ещё ${rooms.length - 6} комнат</i>\n`;
  } else {
    text += `У вас нет активных комнат.\n\n`;
    text += `💡 <b>Как начать:</b>\n`;
    text += `• Нажмите "➕ Создать комнату"\n`;
    text += `• Поделитесь ID с участниками\n`;
    text += `• Все входят через WebApp\n`;
  }

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

function setupMeetHandlers(bot, webappUrl) {

  // ── /meet [название] ──
  bot.command('meet', async (ctx) => {
    const user = db.ensureUser(ctx.from);
    const isGroup = ctx.chat.type !== 'private';
    let roomName = ctx.match?.trim();

    if (!roomName) {
      if (isGroup) {
        roomName = `Созвон в ${ctx.chat.title || 'группе'}`;
      } else {
        // В личке — спрашиваем название
        ctx.session.step = 'conf_name';
        return ctx.reply('📹 Введите название комнаты:');
      }
    }

    let workspaceId = null;
    if (isGroup) {
      const ws = db.getWorkspace(ctx.chat.id);
      if (ws) workspaceId = ws.id;
    }

    const room = db.createConfRoom(roomName, user.id, workspaceId);
    await sendRoomCreated(ctx, room, webappUrl, isGroup);
  });

  // ── /rooms — мои комнаты ──
  bot.command('rooms', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    return showConfMenu(ctx, webappUrl);
  });

  // ── /call — быстрый созвон в группе ──
  bot.command('call', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('📹 Команда /call работает в группах.\nВ личке: нажмите 📹 Видеоконференции');
    }
    const user = db.ensureUser(ctx.from);
    const ws = db.getWorkspace(ctx.chat.id);
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const roomName = `📞 Быстрый созвон ${time}`;
    const room = db.createConfRoom(roomName, user.id, ws?.id || null);

    const kb = new InlineKeyboard();
    if (webappUrl) kb.webApp('📹 Войти в созвон', `${webappUrl}?conf=${room.id}`).row();
    kb.text(`🔑 ID: ${room.id}`, 'conf_noop');

    await ctx.reply(
      `📞 <b>${escapeHtml(ctx.from.first_name)}</b> начинает быстрый созвон!\n\n` +
      `🔑 ID комнаты: <code>${room.id}</code>\n\n` +
      `Нажмите кнопку для входа 👇`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // ── Callbacks ──

  // Главное меню
  bot.callbackQuery('conf_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    return showConfMenu(ctx, webappUrl);
  });

  // Создать комнату — начало
  bot.callbackQuery('conf_create', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'conf_name';
    await ctx.reply(
      '📹 <b>Новая конференция</b>\n\nВведите название комнаты:\n\n<i>Например: "Планёрка команды", "Созвон с клиентом"</i>',
      { parse_mode: 'HTML' }
    );
  });

  // Полный список комнат
  bot.callbackQuery('conf_rooms_full', async (ctx) => {
    await ctx.answerCallbackQuery();
    return showConfMenu(ctx, webappUrl);
  });

  // Войти по ID
  bot.callbackQuery('conf_join_by_id', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'conf_join_id';
    await ctx.reply(
      '🔑 Введите ID комнаты (8 символов):\n\n<i>ID выглядит так: A1B2C3D4</i>',
      { parse_mode: 'HTML' }
    );
  });

  // Войти в комнату без WebApp (fallback)
  bot.callbackQuery(/^conf_enter_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const roomId = ctx.match[1];
    const room = db.getConfRoom(roomId);
    if (!room) return ctx.answerCallbackQuery('Комната не найдена');
    const kb = new InlineKeyboard();
    if (webappUrl) kb.webApp('🚀 Войти', `${webappUrl}?conf=${roomId}`).row();
    kb.text('🔗 Пригласить', `conf_invite_${roomId}`).text('❌ Закрыть', `conf_close_${roomId}`).row();
    await ctx.reply(
      `📹 <b>${escapeHtml(room.name)}</b>\n🔑 ID: <code>${roomId}</code>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // Пригласить — показать ссылку
  // Пригласить / Поделиться — обе ссылки (браузер + Telegram)
  bot.callbackQuery(/^conf_(invite|share)_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const roomId = ctx.match[2];
    const room = db.getConfRoom(roomId);
    if (!room) return;

    const botUsername = ctx.me?.username || 'PlanDayProbot';
    const tgLink = `https://t.me/${botUsername}?start=conf_${roomId}`;
    const browserLink = webappUrl ? `${webappUrl}/?conf=${roomId}` : '';

    let text = `🔗 <b>Приглашение в "${escapeHtml(room.name)}"</b>\n\n`;
    text += `🔑 ID: <code>${roomId}</code>\n\n`;
    if (browserLink) text += `🌐 <b>Браузер:</b>\n<code>${browserLink}</code>\n\n`;
    text += `📱 <b>Telegram:</b>\n<code>${tgLink}</code>\n\n`;
    text += `<i>Любой может войти по ссылке — в браузере или через Telegram</i>`;

    const kb = new InlineKeyboard();
    if (browserLink) kb.url('🌐 Открыть в браузере', browserLink).row();
    kb.url('📱 Через Telegram', tgLink).row();
    kb.text('📋 Мои комнаты', 'conf_rooms_full');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Закрыть комнату
  bot.callbackQuery(/^conf_close_(.+)$/, async (ctx) => {
    const roomId = ctx.match[1];
    const user = db.ensureUser(ctx.from);
    const room = db.getConfRoom(roomId);

    if (!room) return ctx.answerCallbackQuery('Комната не найдена');
    if (room.created_by !== user.id) return ctx.answerCallbackQuery('Только создатель может закрыть');

    db.deactivateConfRoom(roomId);
    await ctx.answerCallbackQuery('✅ Комната закрыта');

    try {
      await ctx.editMessageText(
        `❌ <b>Комната закрыта</b>\n\n${escapeHtml(room.name)}`,
        { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('📹 Мои комнаты', 'conf_rooms_full') }
      );
    } catch {}
  });

  // Admin code button — показать код админа
  bot.callbackQuery(/^conf_admincode_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const roomId = ctx.match[1];
    const room = db.getConfRoom(roomId);
    if (!room) return;
    const user = db.ensureUser(ctx.from);
    if (room.created_by !== user.id) return ctx.reply('⛔ Только создатель комнаты может видеть код');
    await ctx.reply(
      t(getUserLang(ctx), 'adminCodeMsg', escapeHtml(room.name), room.admin_code),
      { parse_mode: 'HTML' }
    );
  });

  // Мои комнаты (старый callback — редирект)
  bot.callbackQuery('conf_rooms', async (ctx) => {
    await ctx.answerCallbackQuery();
    return showConfMenu(ctx, webappUrl);
  });

  // Новая комната (старый callback)
  bot.callbackQuery('conf_new', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = 'conf_name';
    await ctx.reply('📹 Введите название комнаты:');
  });

  // Заглушка для кнопки с ID
  bot.callbackQuery('conf_noop', async (ctx) => {
    await ctx.answerCallbackQuery('Это ID комнаты — скопируйте и поделитесь');
  });
}

// ── Вспомогательная: показать созданную комнату ──
async function sendRoomCreated(ctx, room, webappUrl, isGroup = false) {
  const kb = new InlineKeyboard();
  if (webappUrl) kb.webApp('🚀 Войти в комнату', `${webappUrl}?conf=${room.id}`).row();
  kb.text('🔗 Пригласить участников', `conf_invite_${room.id}`).row()
    .text('📋 Все комнаты', 'conf_rooms_full')
    .text('❌ Закрыть', `conf_close_${room.id}`);

  const msg = isGroup
    ? `📹 <b>${escapeHtml(room.name)}</b>\n\n` +
      `🔑 ID комнаты: <code>${room.id}</code>\n` +
      `👤 Создал: <b>${escapeHtml(ctx.from.first_name)}</b>\n\n` +
      `Нажмите кнопку для входа 👇`
    : `📹 <b>Комната создана!</b>\n\n` +
      `🏷 <b>${escapeHtml(room.name)}</b>\n` +
      `🔑 ID: <code>${room.id}</code>\n\n` +
      `Нажмите "🔗 Пригласить" чтобы отправить ссылку участникам.`;

  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
}

// Admin code button handler (inside setupMeetHandlers)
// NOTE: This is added at the end of the file but called within setupMeetHandlers

module.exports = { setupMeetHandlers, showConfMenu };
