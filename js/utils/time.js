export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function minutesFromTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getNow(override = '') {
  if (!override) return new Date();
  const date = new Date(override);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function getClassState(classes, now) {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = classes.filter((item) => item.day === day);
  const current = today.find((item) =>
    minutes >= minutesFromTime(item.start) && minutes < minutesFromTime(item.end)
  ) || null;

  const candidates = classes
    .map((item) => {
      let dayDistance = (item.day - day + 7) % 7;
      const start = minutesFromTime(item.start);
      if (dayDistance === 0 && start <= minutes) dayDistance = 7;

      return {
        item,
        distance: dayDistance * 1440 + start - minutes,
      };
    })
    .filter(({ distance }) => distance > 0)
    .sort((a, b) => a.distance - b.distance);

  return { today, current, next: candidates[0]?.item || null };
}

export function formatTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(2000, 0, 1, hours, minutes));
}

export function formatClock(date) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
}

export function formatDate(date) {
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(date);
}

export function toDateTimeLocal(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
