/**
 * AI Tools Module for grammY Telegram Bot
 * Features: Image Gen, TTS, DeepSeek Chat, Gemini Vision, Upscale, RemBG, Video Gen
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { InputFile, InlineKeyboard } = require('grammy');

// ── Lazy-load edge-tts ──────────────────────────────────────────────
let edgeTts = null;
function getEdgeTts() {
  if (edgeTts) return edgeTts;
  try {
    edgeTts = require('edge-tts');
  } catch {
    console.log('[ai-tools] Installing edge-tts...');
    require('child_process').execSync('npm install edge-tts', { stdio: 'inherit' });
    edgeTts = require('edge-tts');
  }
  return edgeTts;
}

// ── HTTP helpers (no axios) ─────────────────────────────────────────

function httpGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: opts.timeout || 120000 }, (res) => {
      if (opts.binary) {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks), headers: res.headers }));
      } else {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers }); }
          catch { resolve({ status: res.statusCode, data: body, headers: res.headers }); }
        });
      }
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTP GET timeout')); });
  });
}

function httpPost(url, body, headers = {}, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...headers,
    };
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: reqHeaders,
      timeout: opts.timeout || 120000,
    }, (res) => {
      if (opts.binary) {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks), headers: res.headers }));
      } else {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
          catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
        });
      }
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTP POST timeout')); });
    req.write(payload);
    req.end();
  });
}

function httpPostBinary(url, binaryData, headers = {}, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqHeaders = {
      'Content-Length': binaryData.length,
      ...headers,
    };
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: reqHeaders,
      timeout: opts.timeout || 120000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTP POST timeout')); });
    req.write(binaryData);
    req.end();
  });
}

// Download file from Telegram file API
async function downloadTgFile(ctx, fileId) {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const res = await httpGet(url, { binary: true });
  if (res.status !== 200) throw new Error(`Download failed: ${res.status}`);
  return res.data;
}

// ── Session helpers ─────────────────────────────────────────────────

function getSession(ctx) {
  if (!ctx.session) ctx.session = {};
  return ctx.session;
}

function setStep(ctx, step, extra = {}) {
  const s = getSession(ctx);
  s.aiStep = step;
  Object.assign(s, extra);
}

function clearStep(ctx) {
  const s = getSession(ctx);
  delete s.aiStep;
  delete s.aiTtsVoice;
}

// ── TTS Voice list ──────────────────────────────────────────────────

const TTS_VOICES = [
  { id: 'ru-RU-DmitryNeural', label: '🇷🇺 Дмитрий (муж.)' },
  { id: 'ru-RU-SvetlanaNeural', label: '🇷🇺 Светлана (жен.)' },
  { id: 'en-US-GuyNeural', label: '🇺🇸 Guy (male)' },
  { id: 'en-US-JennyNeural', label: '🇺🇸 Jenny (female)' },
];

// ═══════════════════════════════════════════════════════════════════
// MAIN SETUP
// ═══════════════════════════════════════════════════════════════════

function setupAIToolsHandlers(bot) {

  // ── Menu ────────────────────────────────────────────────────────

  async function showAIToolsMenu(ctx) {
    const kb = new InlineKeyboard()
      .text('🎨 Генерация изображений', 'aitool_imagine').row()
      .text('🎤 Озвучка текста', 'aitool_tts').row()
      .text('🧠 DeepSeek AI', 'aitool_deepseek').row()
      .text('👁 Анализ фото', 'aitool_vision').row()
      .text('🔍 Апскейл фото', 'aitool_upscale').row()
      .text('✂️ Удаление фона', 'aitool_rembg').row()
      .text('🎬 Генерация видео (бета)', 'aitool_video');

    const text =
      '🤖 <b>AI Инструменты</b>\n\n' +
      '🎨 <b>Генерация изображений</b> — опишите и получите картинку\n' +
      '🎤 <b>Озвучка текста</b> — текст в речь на разных языках\n' +
      '🧠 <b>DeepSeek AI</b> — умный помощник\n' +
      '👁 <b>Анализ фото</b> — отправьте фото для анализа\n' +
      '🔍 <b>Апскейл фото</b> — увеличить без потери качества\n' +
      '✂️ <b>Удаление фона</b> — убрать фон с фото\n' +
      '🎬 <b>Генерация видео</b> — видео из текста (бета)';

    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
    clearStep(ctx);
  }

  bot.command('aitools', showAIToolsMenu);
  bot.callbackQuery('aitools_menu', showAIToolsMenu);

  // Back-to-menu button helper
  function backKb() {
    return new InlineKeyboard().text('« Назад к AI-инструментам', 'aitools_menu');
  }

  // ── 1. Image Generation (Pollinations.ai) ──────────────────────

  bot.callbackQuery('aitool_imagine', async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx, 'ai_imagine_prompt');
    await ctx.editMessageText(
      '🎨 <b>Генерация изображений</b>\n\nОпишите, что хотите увидеть на картинке (на любом языке):',
      { parse_mode: 'HTML', reply_markup: backKb() }
    );
  });

  async function handleImagine(ctx) {
    const prompt = ctx.message.text.trim();
    if (!prompt) return ctx.reply('Пожалуйста, введите описание картинки.');

    clearStep(ctx);
    const wait = await ctx.reply('⏳ Генерирую изображение...');

    try {
      const encoded = encodeURIComponent(prompt);
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;

      // Download image first, then send (Telegram URL fetch can timeout)
      const https = require('https');
      const tmpPath = '/tmp/img_' + ctx.from.id + '_' + Date.now() + '.jpg';
      await new Promise((resolve, reject) => {
        const file = require('fs').createWriteStream(tmpPath);
        https.get(url, { timeout: 60000 }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            // Follow redirect
            https.get(res.headers.location, { timeout: 60000 }, (res2) => {
              res2.pipe(file);
              file.on('finish', () => { file.close(); resolve(); });
            }).on('error', reject);
          } else {
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }
        }).on('error', reject);
      });

      const { InputFile } = require('grammy');
      await ctx.replyWithPhoto(new InputFile(tmpPath), {
        caption: `🎨 <b>Prompt:</b> ${prompt.substring(0, 800)}`,
        parse_mode: 'HTML',
        reply_markup: backKb(),
      });
      try { require('fs').unlinkSync(tmpPath); } catch {}
    } catch (err) {
      console.error('[ai-tools] imagine error:', err.message, err.stack);
      await ctx.reply('❌ Ошибка при генерации изображения. Попробуйте другой промпт.', { reply_markup: backKb() });
    }

    try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
  }

  // ── 2. Text-to-Speech (Edge TTS) ──────────────────────────────

  bot.callbackQuery('aitool_tts', async (ctx) => {
    await ctx.answerCallbackQuery();
    setStep(ctx, 'ai_tts_voice');

    const kb = new InlineKeyboard();
    for (const v of TTS_VOICES) {
      kb.text(v.label, `tts_voice_${v.id}`).row();
    }
    kb.text('« Назад', 'aitools_menu');

    await ctx.editMessageText(
      '🎤 <b>Озвучка текста</b>\n\nВыберите голос:',
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // Voice selection callbacks
  for (const v of TTS_VOICES) {
    bot.callbackQuery(`tts_voice_${v.id}`, async (ctx) => {
      await ctx.answerCallbackQuery();
      setStep(ctx, 'ai_tts_text', { aiTtsVoice: v.id });
      await ctx.editMessageText(
        `🎤 <b>Голос:</b> ${v.label}\n\nТеперь отправьте текст для озвучки (до 3000 символов):`,
        { parse_mode: 'HTML', reply_markup: backKb() }
      );
    });
  }

  async function handleTts(ctx) {
    const text = ctx.message.text.trim().substring(0, 3000);
    if (!text) return ctx.reply('Отправьте текст для озвучки.');

    const s = getSession(ctx);
    const voice = s.aiTtsVoice || 'ru-RU-DmitryNeural';
    clearStep(ctx);

    const wait = await ctx.reply('⏳ Генерирую аудио...');
    const filePath = `/tmp/tts_${ctx.from.id}_${Date.now()}.mp3`;

    try {
      const tts = getEdgeTts();
      await tts.ttsPromise(text, filePath, { voice });
      await ctx.replyWithAudio(new InputFile(filePath), {
        title: 'TTS Audio',
        performer: voice,
        reply_markup: backKb(),
      });
    } catch (err) {
      console.error('[ai-tools] tts error:', err.message);
      await ctx.reply('❌ Ошибка при генерации аудио. Попробуйте снова.', { reply_markup: backKb() });
    }

    try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
    try { fs.unlinkSync(filePath); } catch {}
  }

  // ── 3. DeepSeek Chat ──────────────────────────────────────────

  bot.callbackQuery('aitool_deepseek', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!process.env.DEEPSEEK_KEY) {
      return ctx.editMessageText('❌ DeepSeek API ключ не настроен.', { reply_markup: backKb() });
    }
    setStep(ctx, 'ai_deepseek_prompt');
    await ctx.editMessageText(
      '🧠 <b>DeepSeek AI</b>\n\nЗадайте вопрос или опишите задачу:',
      { parse_mode: 'HTML', reply_markup: backKb() }
    );
  });

  async function handleDeepseek(ctx) {
    const prompt = ctx.message.text.trim();
    if (!prompt) return ctx.reply('Введите ваш вопрос.');

    clearStep(ctx);
    const wait = await ctx.reply('⏳ Думаю...');

    try {
      const res = await httpPost(
        'https://api.deepseek.com/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a helpful assistant. Reply in the same language as the user.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        },
        { Authorization: `Bearer ${process.env.DEEPSEEK_KEY}` }
      );

      if (res.status !== 200) throw new Error(`API ${res.status}: ${JSON.stringify(res.data).substring(0, 200)}`);

      const answer = res.data.choices?.[0]?.message?.content || 'Нет ответа.';
      // Split long messages (TG limit 4096)
      const chunks = splitMessage(answer, 4000);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { reply_markup: backKb() });
      }
    } catch (err) {
      console.error('[ai-tools] deepseek error:', err.message);
      await ctx.reply('❌ Ошибка DeepSeek API. Попробуйте позже.', { reply_markup: backKb() });
    }

    try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
  }

  // ── 4. Gemini Vision ──────────────────────────────────────────

  bot.callbackQuery('aitool_vision', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!process.env.GEMINI_KEY) {
      return ctx.editMessageText('❌ Gemini API ключ не настроен.', { reply_markup: backKb() });
    }
    setStep(ctx, 'ai_vision_photo');
    await ctx.editMessageText(
      '👁 <b>Анализ фото</b>\n\nОтправьте фотографию, и я опишу что на ней:',
      { parse_mode: 'HTML', reply_markup: backKb() }
    );
  });

  async function handleVision(ctx) {
    clearStep(ctx);
    const wait = await ctx.reply('⏳ Анализирую изображение...');

    try {
      const photo = ctx.message.photo;
      const fileId = photo[photo.length - 1].file_id; // largest size
      const imageData = await downloadTgFile(ctx, fileId);
      const base64 = imageData.toString('base64');

      const res = await httpPost(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_KEY}`,
        {
          contents: [{
            parts: [
              { text: 'Подробно опиши что изображено на этой фотографии. Отвечай на русском языке.' },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          }],
        },
        {},
        { timeout: 60000 }
      );

      if (res.status !== 200) throw new Error(`Gemini API ${res.status}`);

      const answer = res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Не удалось проанализировать фото.';
      const chunks = splitMessage(answer, 4000);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { reply_markup: backKb() });
      }
    } catch (err) {
      console.error('[ai-tools] vision error:', err.message);
      await ctx.reply('❌ Ошибка анализа фото. Попробуйте снова.', { reply_markup: backKb() });
    }

    try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
  }

  // ── 5. Image Upscale (HuggingFace) ───────────────────────────

  bot.callbackQuery('aitool_upscale', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!process.env.HF_TOKEN) {
      return ctx.editMessageText('❌ HuggingFace токен не настроен.', { reply_markup: backKb() });
    }
    setStep(ctx, 'ai_upscale_photo');
    await ctx.editMessageText(
      '🔍 <b>Апскейл фото</b>\n\nОтправьте фотографию для увеличения (до 4x):',
      { parse_mode: 'HTML', reply_markup: backKb() }
    );
  });

  async function handleUpscale(ctx) {
    clearStep(ctx);
    const wait = await ctx.reply('⏳ Увеличиваю изображение... Это может занять 30-60 секунд.');

    try {
      const photo = ctx.message.photo;
      const fileId = photo[photo.length - 1].file_id;
      const imageData = await downloadTgFile(ctx, fileId);

      const res = await httpPostBinary(
        'https://api-inference.huggingface.co/models/nightmareai/Real-ESRGAN',
        imageData,
        {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          'Content-Type': 'image/jpeg',
        },
        { timeout: 180000 }
      );

      if (res.status === 503) {
        // Model loading
        await ctx.reply('⏳ Модель загружается, попробуйте через 30 секунд...', { reply_markup: backKb() });
        try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
        return;
      }

      if (res.status !== 200) throw new Error(`HF API ${res.status}: ${res.data.toString().substring(0, 200)}`);

      const tmpFile = `/tmp/upscale_${ctx.from.id}_${Date.now()}.png`;
      fs.writeFileSync(tmpFile, res.data);

      await ctx.replyWithDocument(new InputFile(tmpFile, 'upscaled.png'), {
        caption: '🔍 Увеличенное изображение (Real-ESRGAN)',
        reply_markup: backKb(),
      });

      try { fs.unlinkSync(tmpFile); } catch {}
    } catch (err) {
      console.error('[ai-tools] upscale error:', err.message);
      await ctx.reply('❌ Ошибка при апскейле. Попробуйте снова или с другой фотографией.', { reply_markup: backKb() });
    }

    try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
  }

  // ── 6. Background Removal (HuggingFace BRIA RMBG) ────────────

  bot.callbackQuery('aitool_rembg', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!process.env.HF_TOKEN) {
      return ctx.editMessageText('❌ HuggingFace токен не настроен.', { reply_markup: backKb() });
    }
    setStep(ctx, 'ai_rembg_photo');
    await ctx.editMessageText(
      '✂️ <b>Удаление фона</b>\n\nОтправьте фотографию для удаления фона:',
      { parse_mode: 'HTML', reply_markup: backKb() }
    );
  });

  async function handleRembg(ctx) {
    clearStep(ctx);
    const wait = await ctx.reply('⏳ Удаляю фон... Это может занять 20-40 секунд.');

    try {
      const photo = ctx.message.photo;
      const fileId = photo[photo.length - 1].file_id;
      const imageData = await downloadTgFile(ctx, fileId);

      const res = await httpPostBinary(
        'https://api-inference.huggingface.co/models/briaai/RMBG-2.0',
        imageData,
        {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          'Content-Type': 'image/jpeg',
        },
        { timeout: 180000 }
      );

      if (res.status === 503) {
        await ctx.reply('⏳ Модель загружается, попробуйте через 30 секунд...', { reply_markup: backKb() });
        try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
        return;
      }

      if (res.status !== 200) throw new Error(`HF API ${res.status}: ${res.data.toString().substring(0, 200)}`);

      const tmpFile = `/tmp/rembg_${ctx.from.id}_${Date.now()}.png`;
      fs.writeFileSync(tmpFile, res.data);

      await ctx.replyWithDocument(new InputFile(tmpFile, 'no_background.png'), {
        caption: '✂️ Фон удален (BRIA RMBG-2.0)',
        reply_markup: backKb(),
      });

      try { fs.unlinkSync(tmpFile); } catch {}
    } catch (err) {
      console.error('[ai-tools] rembg error:', err.message);
      await ctx.reply('❌ Ошибка при удалении фона. Попробуйте снова.', { reply_markup: backKb() });
    }

    try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
  }

  // ── 7. Video Generation (HuggingFace) ─────────────────────────

  bot.callbackQuery('aitool_video', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!process.env.HF_TOKEN) {
      return ctx.editMessageText('❌ HuggingFace токен не настроен.', { reply_markup: backKb() });
    }
    setStep(ctx, 'ai_video_prompt');
    await ctx.editMessageText(
      '🎬 <b>Генерация видео (бета)</b>\n\n' +
      '⚠️ Экспериментальная функция. Генерация может занять 2-5 минут.\n\n' +
      'Опишите, какое видео хотите получить (на английском для лучшего результата):',
      { parse_mode: 'HTML', reply_markup: backKb() }
    );
  });

  async function handleVideo(ctx) {
    const prompt = ctx.message.text.trim();
    if (!prompt) return ctx.reply('Введите описание видео.');

    clearStep(ctx);
    const wait = await ctx.reply('⏳ Генерирую видео... Это может занять 2-5 минут. Пожалуйста, подождите.');

    try {
      // Use HuggingFace Inference API with a text-to-video model
      const res = await httpPost(
        'https://api-inference.huggingface.co/models/ali-vilab/text-to-video-ms-1.7b',
        { inputs: prompt },
        {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        { timeout: 300000, binary: true }
      );

      // HF may return JSON error or binary video
      if (res.status === 503) {
        let msg = '⏳ Модель загружается. Это может занять несколько минут. Попробуйте позже.';
        try {
          const errData = JSON.parse(res.data.toString());
          if (errData.estimated_time) {
            msg = `⏳ Модель загружается. Ожидаемое время: ~${Math.ceil(errData.estimated_time)} сек. Попробуйте позже.`;
          }
        } catch {}
        await ctx.reply(msg, { reply_markup: backKb() });
        try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
        return;
      }

      if (res.status !== 200) {
        let errMsg = `HF API ${res.status}`;
        try { errMsg += ': ' + JSON.parse(res.data.toString()).error; } catch {}
        throw new Error(errMsg);
      }

      const tmpFile = `/tmp/video_${ctx.from.id}_${Date.now()}.mp4`;
      fs.writeFileSync(tmpFile, res.data);

      const stats = fs.statSync(tmpFile);
      if (stats.size < 1000) {
        // Probably an error response, not a real video
        const content = res.data.toString().substring(0, 500);
        throw new Error(`Response too small (${stats.size}b): ${content}`);
      }

      await ctx.replyWithVideo(new InputFile(tmpFile), {
        caption: `🎬 <b>Prompt:</b> ${prompt.substring(0, 800)}`,
        parse_mode: 'HTML',
        reply_markup: backKb(),
      });

      try { fs.unlinkSync(tmpFile); } catch {}
    } catch (err) {
      console.error('[ai-tools] video error:', err.message);
      await ctx.reply(
        '❌ Ошибка генерации видео. Модель может быть перегружена или недоступна.\n' +
        'Попробуйте позже или используйте более простой промпт.',
        { reply_markup: backKb() }
      );
    }

    try { await ctx.api.deleteMessage(ctx.chat.id, wait.message_id); } catch {}
  }

  // ═══════════════════════════════════════════════════════════════
  // TEXT / PHOTO DISPATCHERS (called from bot's main message handler)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle incoming text message. Returns true if handled, false otherwise.
   */
  async function handleText(ctx) {
    const s = getSession(ctx);
    if (!s.aiStep) return false;

    switch (s.aiStep) {
      case 'ai_imagine_prompt':
        await handleImagine(ctx);
        return true;
      case 'ai_tts_text':
        await handleTts(ctx);
        return true;
      case 'ai_deepseek_prompt':
        await handleDeepseek(ctx);
        return true;
      case 'ai_video_prompt':
        await handleVideo(ctx);
        return true;
      default:
        return false;
    }
  }

  /**
   * Handle incoming photo message. Returns true if handled, false otherwise.
   */
  async function handlePhoto(ctx) {
    const s = getSession(ctx);
    if (!s.aiStep) return false;

    switch (s.aiStep) {
      case 'ai_vision_photo':
        await handleVision(ctx);
        return true;
      case 'ai_upscale_photo':
        await handleUpscale(ctx);
        return true;
      case 'ai_rembg_photo':
        await handleRembg(ctx);
        return true;
      default:
        return false;
    }
  }

  return { handleText, handlePhoto };
}

// ── Utility ─────────────────────────────────────────────────────────

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    // Try to split at newline
    let idx = remaining.lastIndexOf('\n', maxLen);
    if (idx < maxLen * 0.3) idx = remaining.lastIndexOf(' ', maxLen);
    if (idx < maxLen * 0.3) idx = maxLen;
    parts.push(remaining.substring(0, idx));
    remaining = remaining.substring(idx).trimStart();
  }
  return parts;
}

module.exports = { setupAIToolsHandlers };
