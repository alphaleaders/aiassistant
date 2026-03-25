# Alpha Planner — Шпаргалка 🚀

## Быстрый старт
```bash
cd alpha-planner
npm install
# Заполни .env (BOT_TOKEN обязателен)
npm start
```

## Структура файлов
| Файл | Что делает |
|------|-----------|
| `index.js` | Запуск всего: бот + сервер + cron |
| `src/bot/bot.js` | Все команды бота и inline кнопки |
| `src/bot/ai-assistant.js` | AI через Groq (llama-3.3-70b) |
| `src/db/database.js` | SQLite CRUD (users, tasks, habits...) |
| `src/cron/reminders.js` | Напоминания + дайджесты |
| `src/utils/helpers.js` | Парсинг дат, ошибки, форматирование |
| `src/webapp/server.js` | Express API + TG WebApp auth |
| `src/webapp/public/` | Фронтенд Mini App |

## Ключевые функции

### database.js
- `ensureUser(tgUser)` — создать/обновить пользователя
- `createTask(userId, {...})` — создать задачу
- `updateTask(taskId, {...})` — обновить задачу
- `getTasksByDate(userId, date)` — задачи на дату
- `getOverdueTasks(userId, today)` — просроченные
- `getPendingReminders(now)` — неотправленные напоминания
- `createReminder(taskId, userId, fireAt, offset)` — создать напоминание

### helpers.js
- `parseDate(text, tz)` — "завтра" → "2026-03-26"
- `parseTime(text)` — "14:30" → "14:30"
- `formatTask(task)` — задача → HTML строка
- `localToUtc(date, time, tz)` — для напоминаний
- `errorResponse(code)` — красивая ошибка

### ai-assistant.js
- `callGroq(messages, key)` — вызов Groq API
- `buildUserContext(user)` — контекст задач для AI
- `parseAiCommands(response, user)` — парсинг [СОЗДАТЬ_ЗАДАЧУ] и т.д.

## API endpoints (Express)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/tasks` | Список задач (?date, ?status, ?category_id) |
| POST | `/api/tasks` | Создать задачу |
| PUT | `/api/tasks/:id` | Обновить задачу |
| DELETE | `/api/tasks/:id` | Удалить задачу |
| GET | `/api/categories` | Категории |
| POST | `/api/categories` | Создать категорию |
| GET | `/api/habits` | Привычки |
| POST | `/api/habits` | Создать привычку |
| POST | `/api/habits/:id/log` | Отметить привычку |
| GET | `/api/stats` | Статистика |
| GET | `/api/user` | Данные пользователя |
| PUT | `/api/user/settings` | Обновить настройки |

## Приоритеты задач
| Значение | Эмодзи | Уровень |
|----------|--------|---------|
| 1 | 🔴 | Срочно |
| 2 | 🟠 | Высокий |
| 3 | 🟡 | Средний |
| 4 | 🟢 | Низкий |

## Статусы задач
| Статус | Эмодзи |
|--------|--------|
| todo | ⬜ |
| in_progress | 🔄 |
| done | ✅ |
| cancelled | ❌ |

## Callback data (inline кнопки)
| Pattern | Действие |
|---------|----------|
| `done_{id}` | Завершить задачу |
| `move_today_{id}` | Перенести на сегодня |
| `move_tmr_{id}` | Перенести на завтра |
| `task_remind_{id}` | Меню напоминаний |
| `remind_{id}_{min}` | Установить напоминание |
| `snooze_{id}_{min}` | Отложить |
| `task_priority_{id}` | Меню приоритетов |
| `setpri_{id}_{pri}` | Установить приоритет |
| `task_cat_{id}` | Меню категорий |
| `setcat_{id}_{catId}` | Установить категорию |
| `task_delete_{id}` | Удалить задачу |
| `habit_done_{id}` | Отметить привычку |

## PM2 команды
```bash
pm2 start index.js --name alpha-planner
pm2 logs alpha-planner
pm2 restart alpha-planner
pm2 stop alpha-planner
```

---
*Последнее обновление: 2026-03-25 | v1.0.0*
