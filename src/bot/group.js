const { InlineKeyboard } = require('grammy');

// Check if user is admin/owner in TG chat or bot workspace
async function isGroupAdmin(ctx, ws) {
  const userId = ctx.from.id;
  const user = db.ensureUser(ctx.from);

  // Check workspace role first (owner always has access)
  const wsRole = db.getWorkspaceMemberRole(ws.id, user.id);
  if (wsRole === 'owner' || wsRole === 'admin') return true;

  // Check Telegram chat admin status
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    if (['creator', 'administrator'].includes(member.status)) {
      // Auto-sync: TG admin becomes bot admin
      db.setWorkspaceMemberRole(ws.id, user.id, member.status === 'creator' ? 'owner' : 'admin');
      return true;
    }
  } catch(e) {}

  return false;
}

const db = require('../db/database');
const { escapeHtml, todayStr, tomorrowStr, formatDateRu, parseDate, parseTime, localToUtc } = require('../utils/helpers');
const https = require('https');

const GROQ_API_URL = 'api.groq.com';
const PRIORITY_EMOJI = { 1: '🔴', 2: '🟠', 3: '🟡', 4: '🟢' };
const STATUS_EMOJI = { todo: '⬜', in_progress: '🔄', done: '✅', cancelled: '❌' };
const STATUS_NAME = { todo: 'Открыта', in_progress: 'В работе', done: 'Готово', cancelled: 'Отменена' };

// ============ ФОРМАТИРОВАНИЕ ГРУППОВОЙ ЗАДАЧИ ============
function formatGroupTask(t, showWorkspace = false) {
  const pri = PRIORITY_EMOJI[t.priority] || '🟡';
  const st = STATUS_EMOJI[t.status] || '⬜';
  let line = `${st}${pri} <b>${escapeHtml(t.title)}</b> [#G${t.id}]`;
  if (t.assignee_name) line += `\n   👤 ${escapeHtml(t.assignee_name)}`;
  else line += `\n   👤 <i>не назначено</i>`;
  if (t.due_date) line += ` · 📅 ${formatDateRu(t.due_date)}`;
  if (t.due_time) line += ` ⏰ ${t.due_time}`;
  if (showWorkspace && t.workspace_name) line += `\n   💬 ${escapeHtml(t.workspace_name)}`;
  return line;
}

// ============ AI ПАРСИНГ ЗАДАЧИ ИЗ ТЕКСТА ============
async function parseGroupTaskAI(text, groqKey, timezone) {
  if (!groqKey) return null;
  const { DateTime } = require('luxon');
  const now = DateTime.now().setZone(timezone || 'Europe/Moscow');
  const today = now.toFormat('yyyy-MM-dd');

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Извлеки задачу из сообщения. Сейчас: ${today} ${now.toFormat('HH:mm')}.
Сообщение: "${text}"
Ответь JSON: {"title":"...","date":"YYYY-MM-DD или null","time":"HH:MM или null","priority":1-4,"assignee_username":"@username или null"}
Если это не задача — {"title":null}`
      }],
      temperature: 0.1, max_tokens: 200,
    });
    const options = {
      hostname: GROQ_API_URL, path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          const content = r.choices?.[0]?.message?.content || '';
          const m = content.match(/\{[\s\S]*\}/);
          if (m) resolve(JSON.parse(m[0]));
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

// ============ ПОИСК ПОЛЬЗОВАТЕЛЯ ПО @username ============
function findUserByUsername(username) {
  const clean = username.replace('@', '').toLowerCase();
  return db.getDb().prepare('SELECT * FROM users WHERE LOWER(tg_username) = ?').get(clean);
}

// ============ DM УВЕДОМЛЕНИЕ ОБ НАЗНАЧЕНИИ ============
async function notifyAssignment(bot, task, workspace, assigneeUser, assignerName) {
  if (!assigneeUser?.tg_id) return;
  try {
    const kb = new InlineKeyboard()
      .text('✅ Принять', `gt_accept_${task.id}`)
      .text('💬 Ответить', `gt_comment_${task.id}`).row()
      .text('📅 Уточнить срок', `gt_reschedule_${task.id}`)
      .text('❌ Отклонить', `gt_decline_${task.id}`);

    await bot.api.sendMessage(assigneeUser.tg_id,
      `📬 <b>Тебе назначена задача!</b>\n\n` +
      `💬 Группа: <b>${escapeHtml(workspace.name)}</b>\n` +
      `📌 <b>${escapeHtml(task.title)}</b>\n` +
      (task.due_date ? `📅 Срок: ${formatDateRu(task.due_date)}${task.due_time ? ' ⏰ ' + task.due_time : ''}\n` : '') +
      `👤 Поставил: ${escapeHtml(assignerName)}\n\n` +
      `Статус задачи будет виден в группе.`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } catch (e) {
    console.error('[GROUP] notify assign failed:', e.message);
  }
}

// ============ DM УВЕДОМЛЕНИЕ ОБ ПРОГРЕССЕ ============
async function notifyStatusChange(bot, task, workspace, changedBy, oldStatus, newStatus) {
  if (!task) return;

  // Уведомляем создателя (если не он сам меняет)
  const creatorUser = db.getDb().prepare('SELECT * FROM users WHERE id = ?').get(task.created_by);
  if (creatorUser && creatorUser.id !== changedBy.id) {
    try {
      await bot.api.sendMessage(creatorUser.tg_id,
        `📊 <b>Обновление задачи</b>\n\n` +
        `💬 ${escapeHtml(workspace.name)}\n` +
        `📌 ${escapeHtml(task.title)}\n` +
        `${STATUS_EMOJI[oldStatus]} → ${STATUS_EMOJI[newStatus]} <b>${STATUS_NAME[newStatus]}</b>\n` +
        `👤 ${escapeHtml(changedBy.tg_first_name || changedBy.tg_username || 'Участник')}`,
        { parse_mode: 'HTML' }
      );
    } catch {}
  }

  // Уведомляем назначенного (если не он сам)
  if (task.assignee_tg_id && task.assigned_to !== changedBy.id) {
    try {
      await bot.api.sendMessage(task.assignee_tg_id,
        `📊 <b>Задача обновлена</b>\n\n` +
        `📌 ${escapeHtml(task.title)}\n` +
        `${STATUS_EMOJI[newStatus]} <b>${STATUS_NAME[newStatus]}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch {}
  }
}

// ============ SETUP GROUP HANDLERS ============
function setupGroupHandlers(bot, groqKey) {

  // ---- Бот добавлен в группу ----
  bot.on('my_chat_member', async (ctx) => {
    const chat = ctx.chat;
    const newStatus = ctx.myChatMember?.new_chat_member?.status;
    if (!['member', 'administrator'].includes(newStatus)) return;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const user = db.ensureUser(ctx.from);
    const ws = db.ensureWorkspace(chat.id, chat.title || 'Группа', user.id);
    db.addWorkspaceMember(ws.id, user.id, 'owner');

    await ctx.api.sendMessage(chat.id,
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
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().url('💬 Написать мне в личку', 'https://t.me/PlanDayProbot') }
    );
  });

  // ---- Новый участник в группе ----
  bot.on('message:new_chat_members', async (ctx) => {
    const ws = db.getWorkspace(ctx.chat.id);
    if (!ws) return;
    for (const member of ctx.message.new_chat_members) {
      if (member.is_bot) continue;
      const user = db.ensureUser(member);
      db.addWorkspaceMember(ws.id, user.id, 'member');
    }
  });

  // ---- /task — создать задачу в группе ----
  bot.command('task', async (ctx) => {
    if (ctx.chat.type === 'private') return; // только в группах
    const ws = db.getWorkspace(ctx.chat.id);
    if (!ws) return ctx.reply('⚠️ Сначала перезапустите бота в группе.');

    const user = db.ensureUser(ctx.from);
    db.addWorkspaceMember(ws.id, user.id, 'member');

    let text = ctx.message.text.replace(/^\/task\s*/i, '').trim();
    if (!text) return ctx.reply('📝 Укажи задачу: /task Написать отчёт к пятнице');

    // Проверяем реплай — добавляем как описание
    let description = null;
    if (ctx.message.reply_to_message?.text) {
      description = ctx.message.reply_to_message.text.slice(0, 500);
    }

    const dueDate = parseDate(text, ws.timezone || 'Europe/Moscow') || todayStr('Europe/Moscow');
    const dueTime = parseTime(text);
    let title = text;
    ['сегодня', 'завтра', 'послезавтра'].forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
    title = title.replace(/\d{1,2}[:.]\d{2}/g, '').replace(/\d{1,2}\.\d{1,2}/g, '').replace(/\s+/g, ' ').trim();

    const task = db.createGroupTask(ws.id, user.id, { title, description, priority: 3, dueDate, dueTime });

    const kb = new InlineKeyboard()
      .text('👤 Взять задачу', `gt_claim_${task.id}`)
      .text('📋 Назначить', `gt_assign_menu_${task.id}`).row()
      .text('✅ Готово', `gt_done_${task.id}`)
      .text('🔄 В работе', `gt_progress_${task.id}`)
      .text('🗑', `gt_delete_${task.id}`);

    const msg = await ctx.reply(
      `📋 <b>Новая задача #G${task.id}</b>\n\n` +
      `📌 ${escapeHtml(title)}\n` +
      (description ? `💬 <i>${escapeHtml(description.slice(0, 100))}</i>\n` : '') +
      `📅 ${formatDateRu(dueDate)}${dueTime ? ' ⏰ ' + dueTime : ''}\n` +
      `👤 <i>Не назначена — нажми "Взять задачу"</i>\n` +
      `👤 Создал: ${escapeHtml(ctx.from.first_name || 'Участник')}`,
      { parse_mode: 'HTML', reply_markup: kb }
    );

    // Сохраняем ID сообщения
    db.getDb().prepare('UPDATE group_tasks SET tg_message_id = ? WHERE id = ?').run(msg.message_id, task.id);
  });

  // ---- /assign @user задача ----
  bot.command('assign', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const ws = db.getWorkspace(ctx.chat.id);
    if (!ws) return;

    const user = db.ensureUser(ctx.from);
    const text = ctx.message.text.replace(/^\/assign\s*/i, '').trim();
    const usernameMatch = text.match(/@(\w+)/);
    if (!usernameMatch) return ctx.reply('📝 Формат: /assign @username задача к пятнице');

    const username = usernameMatch[1];
    const taskText = text.replace(/@\w+/, '').trim();
    if (!taskText) return ctx.reply('📝 Укажи задачу после @username');

    const assignee = findUserByUsername(username);
    const dueDate = parseDate(taskText, 'Europe/Moscow') || todayStr('Europe/Moscow');
    const dueTime = parseTime(taskText);
    let title = taskText;
    ['сегодня', 'завтра', 'послезавтра'].forEach(w => { title = title.replace(new RegExp(w, 'gi'), ''); });
    title = title.replace(/\d{1,2}[:.]\d{2}/g, '').replace(/\d{1,2}\.\d{1,2}/g, '').replace(/\s+/g, ' ').trim();

    const task = db.createGroupTask(ws.id, user.id, {
      title, priority: 3, dueDate, dueTime,
      assignedTo: assignee?.id || null,
    });

    if (assignee) db.addWorkspaceMember(ws.id, assignee.id, 'member');

    const kb = new InlineKeyboard()
      .text('✅ Готово', `gt_done_${task.id}`)
      .text('🔄 В работе', `gt_progress_${task.id}`).row()
      .text('📊 Отчёт', `gt_report_${task.id}`)
      .text('🗑', `gt_delete_${task.id}`);

    const msg = await ctx.reply(
      `📋 <b>Задача #G${task.id} назначена</b>\n\n` +
      `📌 ${escapeHtml(title)}\n` +
      `📅 ${formatDateRu(dueDate)}${dueTime ? ' ⏰ ' + dueTime : ''}\n` +
      `👤 Исполнитель: ${assignee ? '<b>' + escapeHtml(assignee.tg_first_name || username) + '</b>' : `@${username} <i>(не в боте)</i>`}\n` +
      `👤 Поставил: ${escapeHtml(ctx.from.first_name || 'Участник')}`,
      { parse_mode: 'HTML', reply_markup: kb }
    );

    db.getDb().prepare('UPDATE group_tasks SET tg_message_id = ? WHERE id = ?').run(msg.message_id, task.id);

    // DM назначенному
    if (assignee) {
      await notifyAssignment(bot, task, ws, assignee, ctx.from.first_name || 'Участник');
    }
  });

  // ---- /list — список задач группы ----
  bot.command(['list', 'gs_list'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const ws = db.getWorkspace(ctx.chat.id);
    if (!ws) return;

    const tasks = db.getGroupTasks(ws.id);
    if (tasks.length === 0) return ctx.reply('📋 Нет открытых задач.\n/task — создать задачу');

    let text = `📋 <b>Задачи группы "${escapeHtml(ws.name)}":</b>\n\n`;
    tasks.forEach(t => { text += formatGroupTask(t) + '\n\n'; });
    text += `Всего: ${tasks.length}`;

    const kb = new InlineKeyboard()
      .text('🔄 Обновить', `gs_refresh_list_${ws.id}`)
      .text('📊 Доска', `gs_board_${ws.id}`);

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // ---- /board — канбан ----
  bot.command(['board', 'gs_board'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    await showBoard(ctx, ctx.chat.id);
  });

  async function showBoard(ctx, groupId) {
    const ws = db.getWorkspace(groupId);
    if (!ws) return;

    const allTasks = db.getDb().prepare(`
      SELECT gt.*, u2.tg_first_name as assignee_name
      FROM group_tasks gt LEFT JOIN users u2 ON gt.assigned_to = u2.id
      WHERE gt.workspace_id = ? AND gt.status != 'cancelled'
      ORDER BY gt.priority ASC
    `).all(ws.id);

    const todo = allTasks.filter(t => t.status === 'todo');
    const inProg = allTasks.filter(t => t.status === 'in_progress');
    const done = allTasks.filter(t => t.status === 'done').slice(0, 5);

    let text = `📊 <b>Доска "${escapeHtml(ws.name)}"</b>\n\n`;

    text += `📋 <b>Очередь (${todo.length}):</b>\n`;
    if (todo.length === 0) text += '  <i>пусто</i>\n';
    todo.slice(0, 8).forEach(t => {
      text += `  ${PRIORITY_EMOJI[t.priority]} ${escapeHtml(t.title)} #G${t.id}`;
      if (t.assignee_name) text += ` — ${escapeHtml(t.assignee_name)}`;
      text += '\n';
    });

    text += `\n🔄 <b>В работе (${inProg.length}):</b>\n`;
    if (inProg.length === 0) text += '  <i>пусто</i>\n';
    inProg.forEach(t => {
      text += `  ${escapeHtml(t.title)} #G${t.id}`;
      if (t.assignee_name) text += ` — ${escapeHtml(t.assignee_name)}`;
      if (t.due_date) text += ` · 📅${formatDateRu(t.due_date)}`;
      text += '\n';
    });

    text += `\n✅ <b>Готово (последние ${done.length}):</b>\n`;
    if (done.length === 0) text += '  <i>пусто</i>\n';
    done.forEach(t => { text += `  ✅ ${escapeHtml(t.title)}\n`; });

    const kb = new InlineKeyboard()
      .text('🔄 Обновить', `gs_board_${ws.id}`)
      .text('➕ Задача', `gs_new_task_${ws.id}`);

    try {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    } catch (e) {
      await ctx.reply(text.slice(0, 4000), { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // ---- /mytasks — мои задачи в группе ----
  bot.command('mytasks', async (ctx) => {
    if (ctx.chat.type === 'private') return; // в личке уже есть
    const ws = db.getWorkspace(ctx.chat.id);
    if (!ws) return;
    const user = db.ensureUser(ctx.from);
    const tasks = db.getMyGroupTasks(user.id, ws.id);

    if (tasks.length === 0) return ctx.reply('✨ У тебя нет задач в этой группе.');

    let text = `📋 <b>Твои задачи в "${escapeHtml(ws.name)}":</b>\n\n`;
    tasks.forEach(t => { text += `${STATUS_EMOJI[t.status]}${PRIORITY_EMOJI[t.priority]} ${escapeHtml(t.title)} #G${t.id}\n`; });
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ---- /done #Gid ----
  bot.command('done', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const match = ctx.message.text.match(/#?G?(\d+)/i);
    if (!match) return ctx.reply('📝 Укажи номер задачи: /done #G5');

    const taskId = parseInt(match[1]);
    const task = db.getGroupTaskById(taskId);
    const ws = db.getWorkspace(ctx.chat.id);
    if (!task || !ws || task.workspace_id !== ws.id) return ctx.reply('❌ Задача не найдена');

    const user = db.ensureUser(ctx.from);
    db.updateGroupTask(taskId, { status: 'done' });

    await ctx.reply(
      `✅ <b>Задача #G${taskId} выполнена!</b>\n📌 ${escapeHtml(task.title)}\n👤 ${escapeHtml(ctx.from.first_name || 'Участник')}`,
      { parse_mode: 'HTML' }
    );

    // Уведомляем участников
    await notifyStatusChange(bot, task, ws, user, task.status, 'done');
  });

  // ---- /stats — статистика группы ----
  bot.command(['stats', 'gs_stats'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const ws = db.getWorkspace(ctx.chat.id);
    if (!ws) return;

    const all = db.getDb().prepare('SELECT * FROM group_tasks WHERE workspace_id = ?').all(ws.id);
    const done = all.filter(t => t.status === 'done');
    const open = all.filter(t => t.status === 'todo');
    const inProg = all.filter(t => t.status === 'in_progress');
    const members = db.getWorkspaceMembers(ws.id);

    // Топ исполнителей
    const byUser = {};
    done.forEach(t => {
      if (t.assigned_to) {
        byUser[t.assigned_to] = (byUser[t.assigned_to] || 0) + 1;
      }
    });
    const topUsers = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 3);

    let text = `📊 <b>Статистика "${escapeHtml(ws.name)}"</b>\n\n`;
    text += `📋 Всего задач: ${all.length}\n`;
    text += `✅ Выполнено: ${done.length}\n`;
    text += `🔄 В работе: ${inProg.length}\n`;
    text += `⬜ Очередь: ${open.length}\n`;
    text += `👥 Участников: ${members.length}\n`;

    if (done.length > 0 && all.length > 0) {
      text += `📈 Завершено: ${Math.round(done.length / all.length * 100)}%\n`;
    }

    if (topUsers.length > 0) {
      text += '\n🏆 <b>Топ исполнителей:</b>\n';
      for (const [uid, count] of topUsers) {
        const u = members.find(m => m.id === parseInt(uid));
        if (u) text += `  ${escapeHtml(u.tg_first_name || u.tg_username || 'Участник')}: ${count} задач\n`;
      }
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // ---- /gs_admin — manage bot admins in group ----
  bot.command('gs_admin', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const ws = db.ensureWorkspace(ctx.chat.id, ctx.chat.title || 'Group');
    if (!await isGroupAdmin(ctx, ws)) return ctx.reply('⛔ Только администраторы могут управлять правами', { reply_to_message_id: ctx.message.message_id });

    const cmdArg = ctx.match?.trim() || '';

    if (!cmdArg) {
      const admins = db.getWorkspaceAdmins(ws.id);
      let msg = '👑 <b>Администраторы бота в этом чате:</b>\n\n';
      admins.forEach(a => {
        const role = a.role === 'owner' ? '👑 Владелец' : '🛡 Админ';
        msg += role + ': ' + (a.tg_first_name || '?') + (a.tg_username ? ' @' + a.tg_username : '') + '\n';
      });
      if (admins.length === 0) msg += '<i>Пока нет</i>\n';
      msg += '\n<b>Управление:</b>\n';
      msg += '/gs_admin add @username — <i>добавить админа</i>\n';
      msg += '/gs_admin remove @username — <i>убрать админа</i>\n';
      msg += '/gs_admin add 123456789 — <i>добавить по Telegram ID</i>\n';
      msg += '\n💡 Админы чата Telegram автоматически получают права.';
      return ctx.reply(msg, { parse_mode: 'HTML' });
    }

    const parts = cmdArg.split(/\s+/);
    const action = parts[0]?.toLowerCase();
    const target = parts.slice(1).join(' ');

    if (!target) return ctx.reply('Формат: /gs_admin add @username');

    if (action === 'add') {
      let targetUser;
      if (target.startsWith('@')) {
        targetUser = db.getDb().prepare('SELECT * FROM users WHERE tg_username=?').get(target.slice(1));
      } else {
        targetUser = db.getDb().prepare('SELECT * FROM users WHERE tg_id=?').get(parseInt(target));
      }
      if (!targetUser) return ctx.reply('⚠️ Пользователь не найден. Он должен сначала написать боту /start');
      db.setWorkspaceMemberRole(ws.id, targetUser.id, 'admin');
      return ctx.reply('✅ ' + (targetUser.tg_first_name || target) + ' назначен администратором бота');
    }

    if (action === 'remove') {
      const user = db.ensureUser(ctx.from);
      const myRole = db.getWorkspaceMemberRole(ws.id, user.id);
      if (myRole !== 'owner') return ctx.reply('⛔ Только владелец может убирать админов');
      let targetUser;
      if (target.startsWith('@')) {
        targetUser = db.getDb().prepare('SELECT * FROM users WHERE tg_username=?').get(target.slice(1));
      } else {
        targetUser = db.getDb().prepare('SELECT * FROM users WHERE tg_id=?').get(parseInt(target));
      }
      if (!targetUser) return ctx.reply('⚠️ Пользователь не найден');
      const targetRole = db.getWorkspaceMemberRole(ws.id, targetUser.id);
      if (targetRole === 'owner') return ctx.reply('⛔ Нельзя убрать владельца');
      db.setWorkspaceMemberRole(ws.id, targetUser.id, 'member');
      return ctx.reply('✅ ' + (targetUser.tg_first_name || target) + ' больше не администратор');
    }

    return ctx.reply('Команды: add, remove\nПример: /gs_admin add @username');
  });

  // ---- /gs_settings — настройки группы ----
  bot.command('gs_settings', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    const ws = db.getWorkspace(ctx.chat.id);
    if (!ws) return;

    const kb = new InlineKeyboard()
      .text(ws.ai_monitor ? '🧠 AI-мониторинг: ВКЛ' : '🧠 AI-мониторинг: ВЫКЛ', `gs_toggle_ai_${ws.id}`).row()
      .text('📋 Список задач', `gs_refresh_list_${ws.id}`)
      .text('📊 Доска', `gs_board_${ws.id}`);

    await ctx.reply(
      `⚙️ <b>Настройки группы</b>\n\n` +
      `💬 ${escapeHtml(ws.name)}\n` +
      `🧠 AI-мониторинг: ${ws.ai_monitor ? '<b>включён</b> — бот ищет задачи в сообщениях' : '<b>выключен</b> — только /команды'}\n\n` +
      `При включённом AI-мониторинге бот анализирует сообщения и предлагает создать задачу когда видит "нужно сделать", "не забудь", "кто возьмёт" и т.д.`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // ============ CALLBACKS ============

  // Взять задачу (claim)
  bot.callbackQuery(/^gt_claim_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const taskId = parseInt(ctx.match[1]);
    const task = db.getGroupTaskById(taskId);
    if (!task) return;

    const ws = db.getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(task.workspace_id);
    const user = db.ensureUser(ctx.from);
    db.addWorkspaceMember(ws.id, user.id, 'member');

    if (task.assigned_to && task.assigned_to !== user.id) {
      return ctx.answerCallbackQuery(`⚠️ Задача уже у ${task.assignee_name || 'участника'}`, { show_alert: true });
    }

    db.updateGroupTask(taskId, { assigned_to: user.id, status: 'in_progress' });

    const kb = new InlineKeyboard()
      .text('✅ Выполнено', `gt_done_${taskId}`)
      .text('📊 Отчёт', `gt_report_${taskId}`).row()
      .text('📅 Перенести', `gt_reschedule_${taskId}`)
      .text('❌ Отказаться', `gt_unclaim_${taskId}`);

    try {
      await ctx.editMessageText(
        ctx.message?.text?.replace('👤 <i>Не назначена', `👤 <b>${escapeHtml(ctx.from.first_name)}</b>`) ||
        `📋 <b>Задача #G${taskId}</b>\n📌 ${escapeHtml(task.title)}\n👤 <b>${escapeHtml(ctx.from.first_name)}</b> — 🔄 В работе`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } catch {}

    // Уведомить создателя в личку
    const creator = db.getDb().prepare('SELECT * FROM users WHERE id = ?').get(task.created_by);
    if (creator && creator.id !== user.id) {
      try {
        await bot.api.sendMessage(creator.tg_id,
          `🔄 <b>Задача взята в работу</b>\n\n📌 ${escapeHtml(task.title)}\n👤 Взял: <b>${escapeHtml(ctx.from.first_name)}</b>`,
          { parse_mode: 'HTML' }
        );
      } catch {}
    }
  });

  // Отказаться от задачи
  bot.callbackQuery(/^gt_unclaim_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('↩️ Задача возвращена в очередь');
    const taskId = parseInt(ctx.match[1]);
    db.updateGroupTask(taskId, { assigned_to: null, status: 'todo' });
    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[
          { text: '👤 Взять задачу', callback_data: `gt_claim_${taskId}` },
          { text: '📋 Назначить', callback_data: `gt_assign_menu_${taskId}` },
        ], [
          { text: '✅ Готово', callback_data: `gt_done_${taskId}` },
          { text: '🗑', callback_data: `gt_delete_${taskId}` },
        ]]
      });
    } catch {}
  });

  // Выполнено
  bot.callbackQuery(/^gt_done_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('✅ Отлично!');
    const taskId = parseInt(ctx.match[1]);
    const task = db.getGroupTaskById(taskId);
    if (!task) return;
    const user = db.ensureUser(ctx.from);
    const oldStatus = task.status;
    db.updateGroupTask(taskId, { status: 'done' });

    try {
      await ctx.editMessageText(
        `✅ <b>Задача #G${taskId} выполнена!</b>\n\n📌 ${escapeHtml(task.title)}\n👤 ${escapeHtml(ctx.from.first_name || 'Участник')}`,
        { parse_mode: 'HTML' }
      );
    } catch {}

    const ws = db.getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(task.workspace_id);
    await notifyStatusChange(bot, task, ws, user, oldStatus, 'done');
  });

  // В работе
  bot.callbackQuery(/^gt_progress_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('🔄 Статус обновлён');
    const taskId = parseInt(ctx.match[1]);
    const task = db.getGroupTaskById(taskId);
    if (!task) return;
    const user = db.ensureUser(ctx.from);

    // Если задача не назначена — назначаем на себя
    const updateFields = { status: 'in_progress' };
    if (!task.assigned_to) updateFields.assigned_to = user.id;
    db.updateGroupTask(taskId, updateFields);

    const kb = new InlineKeyboard()
      .text('✅ Выполнено', `gt_done_${taskId}`)
      .text('📊 Отчёт', `gt_report_${taskId}`).row()
      .text('📅 Перенести', `gt_reschedule_${taskId}`)
      .text('❌ Отказаться', `gt_unclaim_${taskId}`);

    try { await ctx.editMessageReplyMarkup(kb); } catch {}

    const ws = db.getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(task.workspace_id);
    await notifyStatusChange(bot, task, ws, user, task.status, 'in_progress');
  });

  // Отчёт по задаче — просит написать в личку
  bot.callbackQuery(/^gt_report_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const taskId = parseInt(ctx.match[1]);
    const task = db.getGroupTaskById(taskId);
    if (!task) return;
    const user = db.ensureUser(ctx.from);

    // Отправляем в личку запрос на отчёт
    try {
      await bot.api.sendMessage(user.tg_id,
        `📊 <b>Напиши отчёт по задаче #G${taskId}</b>\n\n` +
        `📌 ${escapeHtml(task.title)}\n\n` +
        `Опиши что сделано, какой прогресс или если есть блокеры. Я перешлю в группу.`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('❌ Отмена', 'gt_report_cancel')
        }
      );

      // Сохраняем ожидание отчёта (через глобальный Map)
      pendingReports.set(user.tg_id, { taskId, groupId: task.workspace_id });

      await ctx.answerCallbackQuery('📬 Отправил тебе в личку — напиши отчёт там!', { show_alert: true });
    } catch (e) {
      await ctx.answerCallbackQuery('⚠️ Сначала напиши мне в личку /start', { show_alert: true });
    }
  });

  // Удалить задачу
  bot.callbackQuery(/^gt_delete_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1]);
    const task = db.getGroupTaskById(taskId);
    const user = db.ensureUser(ctx.from);
    if (!task || (task.created_by !== user.id)) {
      return ctx.answerCallbackQuery('❌ Только создатель может удалить задачу', { show_alert: true });
    }
    db.getDb().prepare('DELETE FROM group_tasks WHERE id = ?').run(taskId);
    await ctx.answerCallbackQuery('🗑 Удалено');
    try { await ctx.deleteMessage(); } catch {}
  });

  // Обновить доску
  bot.callbackQuery(/^gs_board_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wsId = parseInt(ctx.match[1]);
    const ws = db.getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(wsId);
    if (!ws) return;
    await showBoard(ctx, ws.tg_group_id);
  });

  // Обновить список
  bot.callbackQuery(/^gs_refresh_list_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('🔄 Обновлено');
    const wsId = parseInt(ctx.match[1]);
    const ws = db.getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(wsId);
    if (!ws) return;
    const tasks = db.getGroupTasks(ws.id);
    let text = `📋 <b>Задачи "${escapeHtml(ws.name)}":</b>\n\n`;
    if (tasks.length === 0) text += 'Нет открытых задач.';
    else tasks.forEach(t => { text += formatGroupTask(t) + '\n\n'; });
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: ctx.callbackQuery.message?.reply_markup }); } catch {}
  });

  // Toggle AI monitor
  bot.callbackQuery(/^gs_toggle_ai_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wsId = parseInt(ctx.match[1]);
    const ws = db.getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(wsId);
    if (!ws) return;
    db.setAiMonitor(ws.id, !ws.ai_monitor);
    const updated = db.getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(ws.id);
    const kb = new InlineKeyboard()
      .text(updated.ai_monitor ? '🧠 AI-мониторинг: ВКЛ' : '🧠 AI-мониторинг: ВЫКЛ', `gs_toggle_ai_${ws.id}`);
    try {
      await ctx.editMessageReplyMarkup(kb);
    } catch {}
  });

  // Принять задачу (из DM)
  bot.callbackQuery(/^gt_accept_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('✅ Принята!');
    const taskId = parseInt(ctx.match[1]);
    const user = db.ensureUser(ctx.from);
    db.updateGroupTask(taskId, { status: 'in_progress', assigned_to: user.id });
    const task = db.getGroupTaskById(taskId);
    try {
      await ctx.editMessageText(
        `✅ <b>Задача #G${taskId} принята в работу</b>\n📌 ${escapeHtml(task?.title || '')}`,
        { parse_mode: 'HTML' }
      );
    } catch {}
  });

  // Отклонить задачу (из DM)
  bot.callbackQuery(/^gt_decline_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('❌ Отклонено');
    const taskId = parseInt(ctx.match[1]);
    db.updateGroupTask(taskId, { assigned_to: null, status: 'todo' });
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}
  });

  // ============ AI-МОНИТОРИНГ ГРУППЫ ============
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    const ws = db.getWorkspace(ctx.chat.id);
    if (!ws || !ws.ai_monitor) return next();

    const text = ctx.message.text;
    if (text.startsWith('/')) return next();

    // Ищем паттерны задач
    const taskPatterns = /нужно|надо|сделать|не забудь|кто возьмёт|поручи|задача|todo|action|выполни/i;
    if (!taskPatterns.test(text)) return next();

    // Спрашиваем AI
    const parsed = await parseGroupTaskAI(text, groqKey, 'Europe/Moscow');
    if (!parsed?.title) return next();

    const kb = new InlineKeyboard()
      .text('✅ Создать задачу', `gs_ai_create_${ctx.message.message_id}`)
      .text('❌ Нет', `gs_ai_skip_${ctx.message.message_id}`);

    // Сохраняем данные временно
    pendingAiTasks.set(ctx.message.message_id, { parsed, wsId: ws.id, chatId: ctx.chat.id });

    await ctx.reply(
      `🧠 <i>Создать задачу?</i>\n📌 <b>${escapeHtml(parsed.title)}</b>${parsed.date ? '\n📅 ' + formatDateRu(parsed.date) : ''}`,
      { parse_mode: 'HTML', reply_markup: kb, reply_to_message_id: ctx.message.message_id }
    );

    return next();
  });

  bot.callbackQuery(/^gs_ai_create_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const msgId = parseInt(ctx.match[1]);
    const data = pendingAiTasks.get(msgId);
    if (!data) return;
    pendingAiTasks.delete(msgId);

    const user = db.ensureUser(ctx.from);
    const { parsed, wsId } = data;
    const task = db.createGroupTask(wsId, user.id, {
      title: parsed.title, priority: parsed.priority || 3,
      dueDate: parsed.date, dueTime: parsed.time,
    });

    const kb = new InlineKeyboard()
      .text('👤 Взять задачу', `gt_claim_${task.id}`)
      .text('✅ Готово', `gt_done_${task.id}`);

    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply(
      `📋 <b>Задача #G${task.id} создана</b>\n📌 ${escapeHtml(task.title)}`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery(/^gs_ai_skip_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Ок, пропустил');
    pendingAiTasks.delete(parseInt(ctx.match[1]));
    try { await ctx.deleteMessage(); } catch {}
  });

  console.log('[GROUP] Group handlers enabled');
}

// ============ УТРЕННИЙ ДАЙДЖЕСТ — ГРУППОВЫЕ ЗАДАЧИ ============
async function getGroupTasksSummary(userId) {
  const tasks = db.getMyGroupTasks(userId);
  if (tasks.length === 0) return null;
  let text = `\n👥 <b>Командные задачи (${tasks.length}):</b>\n`;
  tasks.slice(0, 5).forEach(t => {
    text += `  ${PRIORITY_EMOJI[t.priority]} ${escapeHtml(t.title)}`;
    if (t.workspace_name) text += ` <i>[${escapeHtml(t.workspace_name)}]</i>`;
    if (t.due_date) text += ` · 📅${formatDateRu(t.due_date)}`;
    text += '\n';
  });
  return text;
}

// In-memory хранилище для pending действий
const pendingReports = new Map();
const pendingAiTasks = new Map();

// Обработка отчётов в личке
function setupReportHandler(bot) {
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    const pending = pendingReports.get(ctx.from.id);
    if (!pending) return next();

    pendingReports.delete(ctx.from.id);
    const task = db.getGroupTaskById(pending.taskId);
    const ws = db.getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(pending.groupId);
    if (!task || !ws) return next();

    const user = db.ensureUser(ctx.from);
    const reportText = ctx.message.text;

    // Отправляем в группу
    try {
      await bot.api.sendMessage(ws.tg_group_id,
        `📊 <b>Отчёт по задаче #G${task.id}</b>\n\n` +
        `📌 ${escapeHtml(task.title)}\n` +
        `👤 ${escapeHtml(ctx.from.first_name || 'Участник')}:\n\n` +
        `<i>${escapeHtml(reportText)}</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('✅ Принять', `gt_done_${task.id}`)
            .text('🔄 Продолжить', `gt_progress_${task.id}`)
        }
      );
      await ctx.reply('✅ Отчёт отправлен в группу!');
    } catch (e) {
      await ctx.reply('❌ Не удалось отправить в группу: ' + e.message);
    }

    return; // Не передаём дальше — это был отчёт
  });
}

module.exports = { setupGroupHandlers, setupReportHandler, getGroupTasksSummary };
