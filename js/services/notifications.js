import { daysUntil } from './tasks.js';

const SETTINGS_KEY = 'atlas.notifications';
const SENT_KEY = 'atlas.sentNotifications';

export function loadNotificationSettings() {
  try {
    return { enabled: JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'false') === true };
  } catch {
    return { enabled: false };
  }
}

export function saveNotificationSettings(enabled) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(Boolean(enabled)));
  return { enabled: Boolean(enabled) };
}

export async function requestNotificationAccess() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Notifications are not supported in this browser.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');
  await navigator.serviceWorker.ready;
  return saveNotificationSettings(true);
}

function sentKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

async function sendOnce(key, title, body, url) {
  const sent = sentKeys();
  if (sent.has(key)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body,
    tag: key,
    icon: './assets/icons/atlas-192.png',
    badge: './assets/icons/atlas-192.png',
    data: { url },
  });
  sent.add(key);
  localStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-300)));
}

function localDateKey(now) {
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export async function checkReminders(state, now = new Date()) {
  if (!state.notificationSettings?.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;

  const today = localDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const classesToday = state.schedule.classes.filter((item) => item.day === now.getDay());

  for (const item of classesToday) {
    const [hours, minutes] = item.start.split(':').map(Number);
    const difference = hours * 60 + minutes - nowMinutes;
    if (difference > 0 && difference <= 15) {
      await sendOnce(`class-${today}-${item.id}`, `${item.code} starts in ${difference} minutes`, `${item.title} · ${item.room || 'Room not set'}`, `./#/class/${encodeURIComponent(item.id)}`);
    }
  }

  for (const task of state.tasks.filter((item) => !item.completed)) {
    const days = daysUntil(task.dueDate, now);
    if (![14, 7, 3, 1].includes(days)) continue;
    const subject = state.schedule.classes.find((item) => item.id === task.classId);
    await sendOnce(`task-${task.id}-${days}`, `Assignment due in ${days} day${days === 1 ? '' : 's'}`, `${task.title} · ${subject?.code || 'Class'}`, `./#/class/${encodeURIComponent(task.classId)}`);
  }

  const busyTasks = state.tasks.filter((task) => !task.completed && daysUntil(task.dueDate, now) >= 0 && daysUntil(task.dueDate, now) <= 7);
  if (busyTasks.length >= 3) {
    const signature = busyTasks.map((task) => task.id).sort().join('-');
    await sendOnce(`busy-${signature}`, 'A busy week is ahead', `${busyTasks.length} assignments are due in the next 7 days.`, './#/home');
  }

  for (const exam of state.exams || []) {
    const days = daysUntil(exam.date, now);
    if (days !== 7) continue;
    const subject = state.schedule.classes.find((item) => item.id === exam.classId);
    await sendOnce(`exam-${exam.id}-7`, `${exam.title} is in 7 days`, `${subject?.code || 'Class'} · ${exam.date}`, `./#/class/${encodeURIComponent(exam.classId)}`);
  }
}
