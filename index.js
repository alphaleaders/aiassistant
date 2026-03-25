require('dotenv').config();
const { createBot } = require('./src/bot/bot');
const { createServer } = require('./src/webapp/server');
const { startReminderCron } = require('./src/cron/reminders');
const { setupAiAssistant } = require('./src/bot/ai-assistant');
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

  // Подключаем AI-помощника
  setupAiAssistant(bot, GROQ_KEY);

  // Запускаем крон напоминаний
  startReminderCron(bot);

  // Запускаем веб-сервер
  const app = createServer(BOT_TOKEN);
  app.listen(PORT, () => {
    console.log(`✅ Web-сервер на порту ${PORT}`);
  });

  // Запускаем бота
  await bot.start({
    onStart: async (botInfo) => {
      console.log(`✅ Бот @${botInfo.username} запущен`);

      // Уведомление админу
      if (ADMIN_ID) {
        try {
          await bot.api.sendMessage(ADMIN_ID,
            `✅ <b>Alpha Planner подключён!</b>\n\n` +
            `🤖 Бот: @${botInfo.username}\n` +
            `🌐 Сервер: порт ${PORT}\n` +
            `📅 Напоминания: активны\n` +
            `🤖 AI: ${GROQ_KEY ? 'включён (Groq)' : 'выключен (нет GROQ_KEY)'}\n` +
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
