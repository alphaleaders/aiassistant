# Alpha Planner v3.0

AI-секретарь и планировщик для Telegram с видеоконференциями.

**Бот:** @PlanDayProbot  
**WebApp:** https://app.googlegum.ru  
**Сервер:** 81.91.177.204:3300

## Возможности

### Персональный AI-секретарь
- 8 стилей общения (дружелюбный, деловой, дерзкий, по-пацански и др.)
- Голосовые сообщения (Whisper STT)
- Управление задачами текстом/голосом
- Привычки и трекер стриков

### Видеоконференции (WebRTC)
- Браузерная конференция (join.html) — вход по ссылке без Telegram
- Аудио/видео звонки, показ экрана, чат
- Аудио-индикаторы, speaker view, push-to-talk
- Громкость каждого участника до 300%
- Шумоподавление (HPF + LPF + компрессор + noise gate)
- Адаптивный битрейт, quality stats
- Запись конференции (WebM → MP4 через FFmpeg)
- Админ-панель (force mute, ban по IP, роли)
- TURN сервер (coturn на 81.91.177.204:3478)
- Мобильный UI в стиле Telegram

### Планировщик
- /daily — ежедневные дела с прогресс-баром
- /planner — планы на день/неделю/месяц/3мес/6мес/год
- Цепочка напоминаний при окончании периода
- Автоперенос невыполненных пунктов

### Мечты и цели
- /dreams — постановка целей с дедлайном
- AI-коуч (ежедневные советы через Groq)
- Автоматическая разбивка цели на шаги (AI)
- 9 категорий (бизнес, финансы, здоровье, обучение и др.)

### AI Инструменты
- /aitools — 7 инструментов:
  - 🎨 Генерация изображений (Pollinations.ai)
  - 🎤 Озвучка текста (Edge TTS)
  - 🧠 DeepSeek AI (альтернативный чат)
  - 👁 Анализ фото (Google Gemini)
  - 🔍 Апскейл фото (Real-ESRGAN)
  - ✂️ Удаление фона (BRIA RMBG)
  - 🎬 Генерация видео (AnimateDiff)

### Групповые команды
- /task, /assign, /list, /board, /done, /mytasks, /stats
- /call — быстрый видеозвонок
- /meet 15:00 Тема — запланировать конференцию
- /gs_admin — управление админами бота
- Автосинк админов из Telegram

### Админ-панель бота
- /admin — статистика, пользователи, рассылка, экспорт CSV

### Мультиязычность
- 10 языков: EN, RU, ES, FR, DE, ZH, JA, KO, PT, HI, TR
- Автоопределение языка
- Браузерная конференция + бот

## Стек
- Node.js, grammY, Express, Socket.IO
- SQLite (better-sqlite3)
- WebRTC + coturn (TURN)
- Groq (Llama 3.3), DeepSeek, Google Gemini
- FFmpeg, Edge TTS
- PM2 (process: alpha-planner, id: 11)

## Env переменные
- BOT_TOKEN — Telegram bot token
- GROQ_KEY — Groq API key
- DEEPSEEK_KEY — DeepSeek API key
- GEMINI_KEY — Google Gemini API key
- HF_TOKEN — HuggingFace token
- WEBAPP_URL — https://app.googlegum.ru
- ADMIN_ID — Telegram admin ID
- PORT — 3300

## Версии
- v3.0 (2026-04-03) — AI Tools, Dreams, Planner, Admin Panel, Мультиязычность
- v2.0 (2026-03-29) — Видеоконференции, WebRTC, TURN, чат, запись
- v1.0 (2026-03-26) — Базовый бот, задачи, привычки, AI секретарь
