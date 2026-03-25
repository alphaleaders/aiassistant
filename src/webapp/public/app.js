// ============ Alpha Planner WebApp ============
const tg = window.Telegram?.WebApp;
let initData = '';
let currentTab = 'today';
let tasks = [];
let categories = [];
let editingTask = null;

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
  if (tg) {
    tg.ready();
    tg.expand();
    initData = tg.initData;
    // Применяем тему Telegram
    document.documentElement.style.setProperty('--bg', tg.themeParams.bg_color || '#1a1a2e');
    document.documentElement.style.setProperty('--text', tg.themeParams.text_color || '#e0e0e0');
    document.documentElement.style.setProperty('--hint', tg.themeParams.hint_color || '#8888aa');
    document.documentElement.style.setProperty('--btn-bg', tg.themeParams.button_color || '#7c4dff');
    document.documentElement.style.setProperty('--btn-text', tg.themeParams.button_text_color || '#ffffff');
    document.documentElement.style.setProperty('--secondary-bg', tg.themeParams.secondary_bg_color || '#16213e');
  }

  setupListeners();
  loadCategories();
  loadTasks();
});

// ============ API ============
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (initData) opts.headers['X-Telegram-Init-Data'] = initData;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Network error');
  }
  return res.json();
}

// ============ Data Loading ============
async function loadTasks() {
  try {
    const params = new URLSearchParams();
    const today = formatLocalDate(new Date());
    const tomorrow = formatLocalDate(addDays(new Date(), 1));

    if (currentTab === 'today') params.set('date', today);
    else if (currentTab === 'tomorrow') params.set('date', tomorrow);
    else if (currentTab === 'all') params.set('status', 'todo');

    const data = await api('GET', `/tasks?${params}`);
    tasks = data.tasks || [];
    renderTasks();
    updateStats();
  } catch (e) {
    console.error('Load tasks error:', e);
  }
}

async function loadCategories() {
  try {
    const data = await api('GET', '/categories');
    categories = data.categories || [];
    renderCategorySelect();
  } catch (e) {
    console.error('Load categories error:', e);
  }
}

// ============ Rendering ============
function renderTasks() {
  const list = document.getElementById('taskList');

  if (tasks.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🎉</div>
        <p>${currentTab === 'today' ? 'На сегодня задач нет!' : 'Список пуст'}</p>
        <p style="margin-top:8px;font-size:13px">Напишите задачу выше или нажмите ➕</p>
      </div>`;
    return;
  }

  if (currentTab === 'week') {
    renderWeekView(list);
    return;
  }

  list.innerHTML = tasks.map(t => renderTaskCard(t)).join('');
  attachTaskListeners();
}

function renderWeekView(list) {
  // Группируем по дням
  const groups = {};
  const today = formatLocalDate(new Date());
  tasks.forEach(t => {
    const d = t.due_date || 'Без даты';
    if (!groups[d]) groups[d] = [];
    groups[d].push(t);
  });

  let html = '';
  Object.keys(groups).sort().forEach(date => {
    const isToday = date === today;
    const dayName = date === 'Без даты' ? 'Без даты' : formatDayName(date);
    html += `<div class="day-group">
      <div class="day-group-header${isToday ? ' today' : ''}">${dayName}${isToday ? ' — Сегодня' : ''}</div>
      ${groups[date].map(t => renderTaskCard(t)).join('')}
    </div>`;
  });
  list.innerHTML = html;
  attachTaskListeners();
}

function renderTaskCard(task) {
  const checked = task.status === 'done' ? 'checked' : '';
  const doneClass = task.status === 'done' ? 'done' : '';
  const today = formatLocalDate(new Date());
  const isOverdue = task.due_date && task.due_date < today && task.status !== 'done';

  let meta = '';
  if (task.category_emoji) meta += `<span>${task.category_emoji} ${task.category_name || ''}</span>`;
  if (task.due_time) meta += `<span>⏰ ${task.due_time}</span>`;
  if (task.due_date && currentTab !== 'today' && currentTab !== 'tomorrow') meta += `<span>📅 ${formatShortDate(task.due_date)}</span>`;
  if (isOverdue) meta += `<span class="overdue-badge">просрочено</span>`;

  return `
    <div class="task-card priority-${task.priority} ${doneClass}" data-id="${task.id}">
      <div class="task-check ${checked}" data-id="${task.id}">${checked ? '✓' : ''}</div>
      <div class="task-info" data-id="${task.id}">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${meta ? `<div class="task-meta">${meta}</div>` : ''}
      </div>
    </div>`;
}

function renderCategorySelect() {
  const sel = document.getElementById('taskCategory');
  sel.innerHTML = '<option value="">Без категории</option>';
  categories.forEach(c => {
    sel.innerHTML += `<option value="${c.id}">${c.emoji} ${c.name}</option>`;
  });
}

function updateStats() {
  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  const today = formatLocalDate(new Date());
  const overdue = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length;

  document.getElementById('statsDone').textContent = `✅ ${done}`;
  document.getElementById('statsTotal').textContent = `📋 ${total}`;
  document.getElementById('statsOverdue').textContent = `⚠️ ${overdue}`;
}

// ============ Event Listeners ============
function setupListeners() {
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;

      if (currentTab === 'week') {
        loadWeekTasks();
      } else {
        loadTasks();
      }
    });
  });

  // Quick Add
  document.getElementById('quickAddBtn').addEventListener('click', quickAdd);
  document.getElementById('quickInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') quickAdd();
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('btnSaveTask').addEventListener('click', saveTask);
  document.getElementById('btnDeleteTask').addEventListener('click', deleteTask);

  // Habits
  document.getElementById('btnHabits').addEventListener('click', openHabits);
  document.getElementById('habitsClose').addEventListener('click', () => {
    document.getElementById('habitsOverlay').classList.remove('show');
  });
  document.getElementById('btnAddHabit').addEventListener('click', addHabit);

  // Settings
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', () => {
    document.getElementById('settingsOverlay').classList.remove('show');
  });
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);
}

function attachTaskListeners() {
  // Check/uncheck
  document.querySelectorAll('.task-check').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(el.dataset.id);
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      try {
        await api('PUT', `/tasks/${id}`, { status: newStatus });
        task.status = newStatus;
        renderTasks();
        updateStats();
        if (tg) tg.HapticFeedback?.impactOccurred('light');
      } catch (e) { console.error(e); }
    });
  });

  // Edit task
  document.querySelectorAll('.task-info').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id);
      const task = tasks.find(t => t.id === id);
      if (task) openEditModal(task);
    });
  });
}

// ============ Actions ============
async function quickAdd() {
  const input = document.getElementById('quickInput');
  const title = input.value.trim();
  if (!title) return;

  const today = formatLocalDate(new Date());
  const tomorrow = formatLocalDate(addDays(new Date(), 1));
  const due_date = currentTab === 'tomorrow' ? tomorrow : today;

  try {
    await api('POST', '/tasks', { title, due_date, priority: 3 });
    input.value = '';
    loadTasks();
    if (tg) tg.HapticFeedback?.impactOccurred('medium');
  } catch (e) {
    console.error('Add task error:', e);
  }
}

async function loadWeekTasks() {
  try {
    // Загружаем задачи на 7 дней
    const today = new Date();
    const weekEnd = addDays(today, 7);
    const data = await api('GET', `/tasks?status=todo`);
    tasks = (data.tasks || []).filter(t => {
      if (!t.due_date) return true;
      return t.due_date >= formatLocalDate(today) && t.due_date <= formatLocalDate(weekEnd);
    });
    renderTasks();
    updateStats();
  } catch (e) {
    console.error(e);
  }
}

function openEditModal(task) {
  editingTask = task;
  document.getElementById('modalTitle').textContent = 'Редактировать';
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDesc').value = task.description || '';
  document.getElementById('taskDate').value = task.due_date || '';
  document.getElementById('taskTime').value = task.due_time || '';
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('taskCategory').value = task.category_id || '';
  document.getElementById('btnDeleteTask').style.display = 'block';
  document.getElementById('modalOverlay').classList.add('show');
}

function openNewModal() {
  editingTask = null;
  document.getElementById('modalTitle').textContent = 'Новая задача';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDesc').value = '';
  const today = formatLocalDate(new Date());
  document.getElementById('taskDate').value = currentTab === 'tomorrow' ? formatLocalDate(addDays(new Date(), 1)) : today;
  document.getElementById('taskTime').value = '';
  document.getElementById('taskPriority').value = '3';
  document.getElementById('taskCategory').value = '';
  document.getElementById('btnDeleteTask').style.display = 'none';
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  editingTask = null;
}

async function saveTask() {
  const data = {
    title: document.getElementById('taskTitle').value.trim(),
    description: document.getElementById('taskDesc').value.trim() || null,
    due_date: document.getElementById('taskDate').value || null,
    due_time: document.getElementById('taskTime').value || null,
    priority: parseInt(document.getElementById('taskPriority').value),
    category_id: document.getElementById('taskCategory').value ? parseInt(document.getElementById('taskCategory').value) : null,
  };

  if (!data.title) return;

  try {
    if (editingTask) {
      await api('PUT', `/tasks/${editingTask.id}`, data);
    } else {
      await api('POST', '/tasks', data);
    }
    closeModal();
    loadTasks();
    if (tg) tg.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    console.error('Save task error:', e);
  }
}

async function deleteTask() {
  if (!editingTask) return;
  try {
    await api('DELETE', `/tasks/${editingTask.id}`);
    closeModal();
    loadTasks();
  } catch (e) {
    console.error('Delete task error:', e);
  }
}

// ============ Habits ============
async function openHabits() {
  document.getElementById('habitsOverlay').classList.add('show');
  try {
    const data = await api('GET', '/habits');
    const habits = data.habits || [];
    const today = formatLocalDate(new Date());
    const list = document.getElementById('habitsList');

    if (habits.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Добавь привычку ниже 👇</p></div>';
      return;
    }

    list.innerHTML = habits.map(h => `
      <div class="habit-card">
        <div class="habit-emoji">${h.emoji}</div>
        <div class="habit-info">
          <div class="habit-title">${escapeHtml(h.title)}</div>
          <div class="habit-streak">🔥 ${h.current_streak} дн. (рекорд: ${h.best_streak})</div>
        </div>
        <button class="habit-check" data-id="${h.id}" title="Отметить">✓</button>
      </div>
    `).join('');

    list.querySelectorAll('.habit-check').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api('POST', `/habits/${btn.dataset.id}/log`, { date: today });
        btn.classList.add('done');
        if (tg) tg.HapticFeedback?.impactOccurred('medium');
      });
    });
  } catch (e) {
    console.error('Load habits error:', e);
  }
}

async function addHabit() {
  const input = document.getElementById('newHabitInput');
  const title = input.value.trim();
  if (!title) return;
  try {
    await api('POST', '/habits', { title });
    input.value = '';
    openHabits();
  } catch (e) {
    console.error(e);
  }
}

// ============ Settings ============
async function openSettings() {
  document.getElementById('settingsOverlay').classList.add('show');
  try {
    const data = await api('GET', '/user');
    if (data.user) {
      document.getElementById('setTimezone').value = data.user.timezone;
      document.getElementById('setMorning').value = data.user.morning_digest;
      document.getElementById('setEvening').value = data.user.evening_review;
    }
  } catch (e) {
    console.error(e);
  }
}

async function saveSettings() {
  try {
    await api('PUT', '/user/settings', {
      timezone: document.getElementById('setTimezone').value,
      morning_digest: document.getElementById('setMorning').value,
      evening_review: document.getElementById('setEvening').value,
    });
    document.getElementById('settingsOverlay').classList.remove('show');
    if (tg) tg.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    console.error(e);
  }
}

// ============ Helpers ============
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatLocalDate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatShortDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function formatDayName(str) {
  const d = new Date(str + 'T00:00:00');
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return `${days[d.getDay()]} ${formatShortDate(str)}`;
}
