require('dotenv').config();
const { createBot } = require('./src/bot/bot');
const { createServer } = require('./src/webapp/server');
const { startReminderCron } = require('./src/cron/reminders');
const { startAlertCron, setupAlertCallbacks, startMeetCron } = require('./src/cron/alerts');
const { startPlannerCron } = require('./src/bot/planner');
const { startDreamCoachCron } = require('./src/bot/dreams');
const { setupConversationalAI } = require('./src/bot/ai-assistant');
const { setupVoiceHandler } = require('./src/bot/voice');
const { setupGroupHandlers, setupReportHandler } = require('./src/bot/group');
const { setupMeetHandlers } = require('./src/conference/meet');
const db = require('./src/db/database');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3100;
const WEBAPP_URL = process.env.WEBAPP_URL || '';
const GROQ_KEY = process.env.GROQ_KEY || '';
const ADMIN_ID = process.env.ADMIN_ID || '';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан в .env');
  process.exit(1);
}

async function main() {
  console.log('🚀 Alpha Planner запускается...');

  // Инициализация БД
  db.getDb();
  console.log('✅ База данных готова');

  // Создаём бота
  const bot = createBot(BOT_TOKEN, WEBAPP_URL);

  // Подключаем обработчик отчётов (ДО всего остального — перехватывает pending)
  setupReportHandler(bot);

  // Подключаем групповые обработчики
  setupGroupHandlers(bot, GROQ_KEY);

  // Подключаем команды видеоконференций
  setupMeetHandlers(bot, WEBAPP_URL);

  // Подключаем распознавание голосовых (ДО текстового AI!)
  setupVoiceHandler(bot, GROQ_KEY);

  // Подключаем conversational AI (обрабатывает ВСЕ текстовые сообщения в личке)
  setupConversationalAI(bot, GROQ_KEY);

  // Запускаем крон напоминаний
  startReminderCron(bot);
  startAlertCron(bot);
      startPlannerCron(bot);
      startDreamCoachCron(bot, process.env.GROQ_KEY);
  setupAlertCallbacks(bot);
  startMeetCron(bot, WEBAPP_URL);

  // Запускаем веб-сервер (httpServer с Socket.IO)
  const httpServer = createServer(BOT_TOKEN);
  httpServer.listen(PORT, () => {
    console.log(`✅ Web-сервер на порту ${PORT} (WebRTC сигналинг активен)`);
  });

  // Запускаем бота
  await bot.start({
    onStart: async (botInfo) => {
      console.log(`✅ Бот @${botInfo.username} запущен`);

      // Устанавливаем меню команд бота
      try {
        await bot.api.setMyCommands([
          { command: 'start', description: '🏠 Главное меню' },
          { command: 'today', description: '📅 Задачи на сегодня' },
          { command: 'tomorrow', description: '📅 Задачи на завтра' },
          { command: 'week', description: '📆 Задачи на неделю' },
          { command: 'all', description: '📋 Все активные задачи' },
          { command: 'overdue', description: '⚠️ Просроченные задачи' },
          { command: 'habits', description: '📊 Трекер привычек' },
          { command: 'meet', description: '📹 Создать видеоконференцию' },
          { command: 'rooms', description: '📋 Мои конференц-комнаты' },
          { command: 'features', description: '🌟 Возможности бота' },
          { command: 'guide', description: '📖 Инструкции и руководство' },
          { command: 'settings', description: '⚙️ Настройки' },
          { command: 'daily', description: '📋 Дела на каждый день' },
          { command: 'planner', description: '📆 Планировщик (день/неделя/месяц/год)' },
          { command: 'dreams', description: '🌟 Мечты и цели с AI-коучем' },
          { command: 'aitools', description: '🤖 AI инструменты (фото, голос, видео)' },
          { command: 'help', description: '❓ Список всех команд' },
        ]);
        console.log('✅ Меню команд обновлено (личные)');

        // Group commands
        await bot.api.setMyCommands([
          { command: 'start', description: '📋 Все команды бота' },
          { command: 'help', description: '❓ Что я умею в группе' },
          { command: 'task', description: '📝 Создать задачу (пример: /task купить кофе)' },
          { command: 'assign', description: '👤 Поручить задачу (/assign @ivan сделать отчёт)' },
          { command: 'list', description: '📋 Показать все задачи группы' },
          { command: 'board', description: '📊 Доска задач (открыто/в работе/готово)' },
          { command: 'done', description: '✅ Выполнил задачу (/done #5)' },
          { command: 'mytasks', description: '🙋 Мои задачи в этом чате' },
          { command: 'stats', description: '📊 Сколько задач сделано' },
          { command: 'meet', description: '📹 Созвон на время (/meet 15:00 Планёрка)' },
          { command: 'call', description: '📞 Позвонить прямо сейчас' },
        ], { scope: { type: 'all_group_chats' } });
        console.log('✅ Меню команд обновлено (группы)');
      } catch (e) {
        console.log('Не удалось обновить меню команд:', e.message);
      }

      // Уведомление админу
      if (ADMIN_ID) {
        try {
          await bot.api.sendMessage(ADMIN_ID,
            `✅ <b>Alpha Planner v2.0 подключён!</b>\n\n` +
            `🤖 Бот: @${botInfo.username}\n` +
            `🌐 Сервер: порт ${PORT}\n` +
            `📅 Напоминания: активны\n` +
            `🧠 AI-секретарь: ${GROQ_KEY ? '✅ Groq' : '❌ нет ключа'}\n` +
            `🎤 Голос: ${GROQ_KEY ? '✅ Whisper' : '❌ нет ключа'}\n` +
          `📹 Конференции: ✅ WebRTC\n` +
            `⏰ ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          console.log('Не удалось отправить уведомление админу:', e.message);
        }
      }
    },
  });
}

main().catch(err => {
  console.error('💥 Критическая ошибка:', err);
  process.exit(1);
});
