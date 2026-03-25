const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { escapeHtml, todayStr, formatDateRu } = require('../utils/helpers');

const GROQ_API_URL = 'api.groq.com';
const WHISPER_MODEL = 'whisper-large-v3';

// Скачать файл по URL
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : require('http');
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

// Транскрибация через Groq Whisper
async function transcribeAudio(filePath, groqKey) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Собираем multipart/form-data
    const parts = [];

    // file
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: audio/ogg\r\n\r\n`
    ));
    parts.push(fileData);
    parts.push(Buffer.from('\r\n'));

    // model
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${WHISPER_MODEL}\r\n`
    ));

    // language
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `ru\r\n`
    ));

    // response_format
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `json\r\n`
    ));

    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const options = {
      hostname: GROQ_API_URL,
      path: '/openai/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          resolve(parsed.text || '');
        } catch (e) { reject(new Error('Whisper parse error: ' + data.slice(0, 200))); }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Whisper timeout')); });
    req.write(body);
    req.end();
  });
}

// AI парсинг задачи из транскрибированного текста
async function parseTaskFromVoice(text, user, groqKey) {
  const { DateTime } = require('luxon');
  const now = DateTime.now().setZone(user.timezone);
  const todayDate = now.toFormat('yyyy-MM-dd');
  const currentTime = now.toFormat('HH:mm');
  const dayOfWeek = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'][now.weekday - 1];

  const prompt = `Ты — AI-секретарь. Пользователь надиктовал голосовое сообщение. Извлеки из него задачу(и).

Сейчас: ${dayOfWeek}, ${todayDate}, ${currentTime} (${user.timezone})

Текст голосового: "${text}"

Ответь СТРОГО в формате JSON (без markdown, без \`\`\`):
{
  "tasks": [
    {
      "title": "Название задачи (краткое, чёткое)",
      "date": "YYYY-MM-DD",
      "time": "HH:MM или null",
      "priority": 1-4 (1=срочно, 2=высокий, 3=средний, 4=низкий),
      "category": "Работа/Личное/Здоровье/Учёба/Покупки или null"
    }
  ],
  "reply": "Короткий дружелюбный ответ пользователю о том что записал"
}

Правила:
- Если не указана дата — ставь сегодня (${todayDate})
- "завтра" = следующий день, "послезавтра" = +2 дня
- Дни недели: ближайший будущий
- Если несколько задач — создай массив
- Если время не указано — time: null
- Приоритет: "важно/срочно/обязательно" = 1-2, обычное = 3, "если успею/по возможности" = 4`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 512,
    });

    const options = {
      hostname: GROQ_API_URL,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const content = parsed.choices?.[0]?.message?.content || '';
          // Парсим JSON из ответа
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) return reject(new Error('AI не вернул JSON'));
          const result = JSON.parse(jsonMatch[0]);
          resolve(result);
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('AI timeout')); });
    req.write(body);
    req.end();
  });
}

// Найти category_id по названию
function findCategoryId(userId, categoryName) {
  if (!categoryName) return null;
  const cats = db.getCategories(userId);
  const lower = categoryName.toLowerCase();
  const found = cats.find(c => c.name.toLowerCase() === lower);
  return found ? found.id : null;
}

// Настройка обработки голосовых
function setupVoiceHandler(bot, groqKey) {
  if (!groqKey) {
    console.log('[VOICE] No GROQ_KEY — voice disabled');
    return;
  }

  const tmpDir = path.join(__dirname, '..', '..', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // Голосовые сообщения
  bot.on('message:voice', async (ctx) => {
    await handleVoice(ctx, ctx.message.voice.file_id, groqKey, tmpDir);
  });

  // Аудио сообщения (кружочки и аудиофайлы)
  bot.on('message:audio', async (ctx) => {
    await handleVoice(ctx, ctx.message.audio.file_id, groqKey, tmpDir);
  });

  // Видео-кружочки (video_note)
  bot.on('message:video_note', async (ctx) => {
    await handleVoice(ctx, ctx.message.video_note.file_id, groqKey, tmpDir);
  });

  console.log('[VOICE] Voice recognition enabled (Groq Whisper)');
}

async function handleVoice(ctx, fileId, groqKey, tmpDir) {
  const user = db.ensureUser(ctx.from);
  const thinkingMsg = await ctx.reply('🎤 Распознаю голос...');

  let filePath = null;
  try {
    // 1. Скачиваем файл
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    const ext = path.extname(file.file_path) || '.ogg';
    filePath = path.join(tmpDir, `voice_${ctx.from.id}_${Date.now()}${ext}`);
    await downloadFile(fileUrl, filePath);

    // 2. Транскрибация
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, '🎤 Распознаю текст...');
    const transcription = await transcribeAudio(filePath, groqKey);

    if (!transcription || transcription.trim().length === 0) {
      await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, '❌ Не удалось распознать речь. Попробуй ещё раз.');
      return;
    }

    // 3. AI парсинг задачи
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, `🎤 Распознано: "<i>${escapeHtml(transcription)}</i>"\n\n🤖 Создаю задачи...`, { parse_mode: 'HTML' });
    const result = await parseTaskFromVoice(transcription, user, groqKey);

    // 4. Создаём задачи
    const created = [];
    if (result.tasks && result.tasks.length > 0) {
      for (const t of result.tasks) {
        const categoryId = findCategoryId(user.id, t.category);
        const task = db.createTask(user.id, {
          title: t.title,
          due_date: t.date || todayStr(user.timezone),
          due_time: t.time || null,
          priority: t.priority || 3,
          category_id: categoryId,
        });

        // Авто-напоминание если есть время
        if (t.time && t.date) {
          const { localToUtc } = require('../utils/helpers');
          const { DateTime } = require('luxon');
          const fireAt = localToUtc(t.date, t.time, user.timezone);
          if (fireAt) {
            const fireTime = DateTime.fromISO(fireAt).minus({ minutes: 15 });
            if (fireTime > DateTime.now()) {
              db.createReminder(task.id, user.id, fireTime.toISO(), 15);
            }
          }
        }

        created.push(task);
      }
    }

    // 5. Ответ
    let reply = `🎤 <b>Голосовое распознано:</b>\n<i>"${escapeHtml(transcription)}"</i>\n\n`;

    if (created.length > 0) {
      reply += `✅ <b>Создано задач: ${created.length}</b>\n\n`;
      created.forEach(task => {
        const pri = ['', '🔴', '🟠', '🟡', '🟢'][task.priority] || '';
        reply += `${pri} <b>${escapeHtml(task.title)}</b>\n`;
        reply += `   📅 ${formatDateRu(task.due_date)}`;
        if (task.due_time) reply += ` ⏰ ${task.due_time}`;
        reply += ` <i>[#${task.id}]</i>\n\n`;
      });
    }

    if (result.reply) {
      reply += `🤖 ${escapeHtml(result.reply)}`;
    }

    // Кнопки для быстрых действий
    const { InlineKeyboard } = require('grammy');
    const kb = new InlineKeyboard();
    if (created.length === 1) {
      kb.text('✅ Готово', `done_${created[0].id}`)
        .text('⏰ Напомнить', `task_remind_${created[0].id}`).row()
        .text('📅 Перенести', `task_reschedule_${created[0].id}`)
        .text('🗑 Удалить', `task_delete_${created[0].id}`);
    } else if (created.length > 1) {
      kb.text('📋 Мои задачи', 'today');
    }

    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id, reply, {
      parse_mode: 'HTML',
      reply_markup: created.length > 0 ? kb : undefined,
    });

  } catch (e) {
    console.error('[VOICE] Error:', e.message);
    await ctx.api.editMessageText(ctx.chat.id, thinkingMsg.message_id,
      `❌ Ошибка: ${escapeHtml(e.message)}`,
      { parse_mode: 'HTML' }
    );
  } finally {
    // Удаляем временный файл
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
  }
}

module.exports = { setupVoiceHandler };
