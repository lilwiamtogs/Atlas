const TASKS_KEY = 'atlas.tasks';

function normalizeTask(task) {
  if (!task?.id || !task.classId || !task.title || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || '')) {
    throw new Error('A task is missing its subject, title, or due date.');
  }

  return {
    id: String(task.id),
    classId: String(task.classId),
    title: String(task.title).trim(),
    dueDate: task.dueDate,
    dueTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime || '') ? task.dueTime : '',
    completed: Boolean(task.completed),
    createdAt: String(task.createdAt || new Date().toISOString()),
  };
}

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) =>
    Number(a.completed) - Number(b.completed)
      || a.dueDate.localeCompare(b.dueDate)
      || (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59')
      || a.title.localeCompare(b.title)
  );
}

export function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
    return Array.isArray(saved) ? sortTasks(saved.map(normalizeTask)) : [];
  } catch {
    return [];
  }
}

export function saveTasks(tasks) {
  const normalized = sortTasks(tasks.map(normalizeTask));
  localStorage.setItem(TASKS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function createTask({ classId, title, dueDate, dueTime }) {
  return normalizeTask({
    id: globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    classId,
    title,
    dueDate,
    dueTime,
    completed: false,
    createdAt: new Date().toISOString(),
  });
}

export function daysUntil(dueDate, now = new Date()) {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((due - today) / 86400000);
}

export function urgencyFor(task, now = new Date()) {
  if (task.completed) return 'complete';
  const days = daysUntil(task.dueDate, now);
  if (days <= 7) return 'urgent';
  if (days <= 14) return 'soon';
  return 'later';
}
