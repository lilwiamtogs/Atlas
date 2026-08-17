import PathSection from '../components/pathSection.js';
import Icon from '../components/icon.js';
import { Button, Card } from '../components/ui.js';
import { escapeHtml } from '../utils/html.js';
import { daysUntil, saveTasks, sortTasks, urgencyFor } from '../services/tasks.js';
import { DAY_NAMES, formatDate, formatTime, getClassState, minutesFromTime } from '../utils/time.js';
import Store from '../store.js';
import { createExam, EXAM_TYPES, saveExams } from '../services/exams.js';
import { transitionTaskRow } from '../utils/animations.js';
import { withAutoSave } from '../services/autosave.js';

let examMessage = '';
let feedback = null;
let pendingTaskUndo = null;
let feedbackTimer = 0;
const TASK_FEEDBACK_DURATION = 3200;
const UNDO_FEEDBACK_DURATION = 2400;

function dateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function empty(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function countdownTo(item, now) {
  if (!item || item.day !== now.getDay()) return '';
  const seconds = Math.max(0, minutesFromTime(item.start) * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours ? `${hours}h ` : ''}${String(minutes).padStart(hours ? 2 : 1, '0')}m ${String(remainder).padStart(2, '0')}s`;
}

function classMeta(item, includeDay = false) {
  const day = includeDay ? `${DAY_NAMES[item.day]} · ` : '';
  return `${day}${formatTime(item.start)} — ${formatTime(item.end)}${item.room ? ` · ${escapeHtml(item.room)}` : ''}`;
}

function todayTimeline(today, current, now) {
  if (!today.length) return empty('No classes are scheduled today.');
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  return `<div class="today-timeline" aria-label="Today’s classes">${today.map((item) => {
    const finished = minutesFromTime(item.end) <= currentMinute;
    const status = item.id === current?.id ? 'Now' : finished ? 'Done' : formatTime(item.start);
    return `<button class="today-timeline-item ${item.id === current?.id ? 'is-current' : ''} ${finished ? 'is-finished' : ''}" type="button" data-open-class="${escapeHtml(item.id)}" aria-label="Open ${escapeHtml(item.code)} details">
      <span class="today-timeline-time">${escapeHtml(status)}</span><span><strong>${escapeHtml(item.code)}</strong><small>${escapeHtml(item.title)}</small></span>${Icon('arrow-right')}
    </button>`;
  }).join('')}</div>`;
}

function todayCard(classes, today, current, next, now) {
  const nextIsToday = next?.day === now.getDay();
  let stateClass = 'is-complete';
  let eyebrow = 'Today at a glance';
  let primary = `<div class="today-primary"><span class="today-state-icon">${Icon('check')}</span><div><h1 id="today-card-title">All clear for today.</h1><p>${next ? `Next: ${escapeHtml(next.code)} · ${classMeta(next, true)}` : 'Nothing else is scheduled. Take the space you earned.'}</p></div></div>`;
  let secondary = '';

  if (current) {
    stateClass = 'is-current';
    eyebrow = 'In class now';
    const elapsed = now.getHours() * 60 + now.getMinutes() - minutesFromTime(current.start);
    const duration = Math.max(1, minutesFromTime(current.end) - minutesFromTime(current.start));
    const progress = Math.min(100, Math.max(0, Math.round((elapsed / duration) * 100)));
    primary = `<div class="today-primary"><span class="today-state-icon">${Icon('calendar')}</span><div><p class="today-code">${escapeHtml(current.code)}</p><h1 id="today-card-title">${escapeHtml(current.title)}</h1><p>${classMeta(current)}</p></div></div><div class="today-progress" aria-label="Class progress"><span style="width:${progress}%"></span></div>`;
    if (next) secondary = `<div class="today-next"><span>Up next</span><strong>${escapeHtml(next.code)} · ${escapeHtml(next.title)}</strong><small>${classMeta(next, !nextIsToday)}</small></div>`;
  } else if (nextIsToday) {
    stateClass = 'is-waiting';
    eyebrow = 'Up next';
    primary = `<div class="today-primary"><span class="today-state-icon">${Icon('calendar')}</span><div><p class="today-code">${escapeHtml(next.code)}</p><h1 id="today-card-title">${escapeHtml(next.title)}</h1><p>${classMeta(next)}</p></div></div><div class="today-countdown"><span>Starts in</span><strong data-countdown-start="${escapeHtml(next.start)}">${countdownTo(next, now)}</strong></div>`;
  } else if (!classes.length) {
    primary = `<div class="today-primary"><span class="today-state-icon">${Icon('import')}</span><div><h1 id="today-card-title">Build your first week.</h1><p>Import a schedule to let Atlas map the path ahead.</p></div></div>${Button({ label: 'Import schedule', variant: 'primary', icon: 'import', className: 'today-import-action', attributes: 'data-route="import"' })}`;
  }

  const content = `<div class="today-card-heading"><p class="eyebrow">${eyebrow}</p><span>${formatDate(now)}</span></div>${primary}${secondary}<div class="today-agenda-heading"><span>Today’s path</span><small>${today.length} ${today.length === 1 ? 'class' : 'classes'}</small></div>${todayTimeline(today, current, now)}`;
  return Card(content, { tag: 'section', className: `today-card ${stateClass}`, attributes: 'aria-labelledby="today-card-title"' });
}

function urgentTasks(tasks, classes, now) {
  const items = sortTasks(tasks).filter((task) => !task.completed && daysUntil(task.dueDate, now) <= 14).slice(0, 4);
  if (!items.length) return empty('Nothing is due soon. Add work from Week when you are ready.');
  return `<div class="home-task-list">${items.map((task) => {
    const subject = classes.find((item) => item.id === task.classId);
    const personalDay = task.classId.match(/^personal-day-([1-6])$/);
    const subjectLabel = subject?.code || (personalDay ? `Personal · ${DAY_NAMES[Number(personalDay[1])]}` : 'Class');
    const days = daysUntil(task.dueDate, now);
    const remaining = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`;
    const dueTime = task.dueTime ? new Date(`2000-01-01T${task.dueTime}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    return `<button class="home-task is-${urgencyFor(task, now)}" data-complete-home-task="${escapeHtml(task.id)}" type="button" aria-label="Mark ${escapeHtml(task.title)} complete"><span class="home-task-dot" aria-hidden="true">${Icon('check')}</span><span class="home-task-copy"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(subjectLabel)}${dueTime ? ` · due ${escapeHtml(dueTime)}` : ''}</span></span><span class="home-task-days">${remaining}</span></button>`;
  }).join('')}</div>`;
}

function upcomingExams(exams, classes, now) {
  const items = [...(exams || [])].filter((exam) => daysUntil(exam.date, now) >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  if (!items.length) return empty('No upcoming tests or exams.');
  return `<div class="home-exam-list">${items.map((exam) => {
    const subject = classes.find((item) => item.id === exam.classId);
    const days = daysUntil(exam.date, now);
    return `<article class="home-exam"><span class="home-exam-date"><strong>${exam.date.slice(8, 10)}</strong><small>${new Date(`${exam.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</small></span><span><strong>${escapeHtml(exam.title)}</strong><small>${escapeHtml(subject?.code || 'Class')} · ${days === 0 ? 'Today' : `${days}d away`}</small></span></article>`;
  }).join('')}</div>`;
}

function addExamForm(classes) {
  if (!classes.length) return '';
  return `<details class="exam-composer"><summary>${Icon('plus')}<span>Add an exam</span></summary><div class="exam-composer-body"><form class="add-exam-form home-exam-form" id="home-add-exam-form"><label class="task-form-field">Exam type<select name="examType" required>${EXAM_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}</select></label><label class="task-form-field">Subject<select name="classId" required>${classes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} · ${escapeHtml(item.title)}</option>`).join('')}</select></label><label class="task-form-field">Date<input name="date" type="date" min="${dateInputValue()}" value="${dateInputValue()}" required></label>${Button({ label: 'Save exam', variant: 'primary', icon: 'check', type: 'submit' })}${examMessage ? `<p class="note-message" role="status">${escapeHtml(examMessage)}</p>` : ''}</form></div></details>`;
}

function dismissFeedbackAfter(router, duration, clearUndo = false) {
  window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    if (clearUndo) pendingTaskUndo = null;
    feedback = null;
    router.render();
  }, duration);
}

function bindExamComposerAnimation() {
  const details = document.querySelector('.exam-composer');
  const summary = details?.querySelector(':scope > summary');
  const body = details?.querySelector(':scope > .exam-composer-body');
  if (!details || !summary || !body) return;

  summary.addEventListener('click', async (event) => {
    event.preventDefault();
    if (details.dataset.animating === 'true') return;

    const opening = !details.open;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || typeof body.animate !== 'function') {
      details.open = opening;
      return;
    }

    details.dataset.animating = 'true';
    if (opening) details.open = true;
    const height = body.scrollHeight;
    const frames = opening
      ? [{ height: '0px', opacity: 0, transform: 'translateY(-6px)' }, { height: `${height}px`, opacity: 1, transform: 'translateY(0)' }]
      : [{ height: `${height}px`, opacity: 1, transform: 'translateY(0)' }, { height: '0px', opacity: 0, transform: 'translateY(-6px)' }];
    const animation = body.animate(frames, {
      duration: opening ? 220 : 170,
      easing: opening ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'ease-in',
    });

    try {
      await animation.finished;
    } catch {
      // A superseding render can cancel the animation safely.
    }
    if (!opening) details.open = false;
    delete details.dataset.animating;
  });
}

function feedbackToast() {
  if (!feedback) return '';
  const action = feedback.action === 'undo-task' ? '<button type="button" data-undo-home-task>Undo</button>' : '<button type="button" data-route="schedule">Open Week</button>';
  return `<div class="home-toast" role="status" style="--toast-life:${feedback.duration || TASK_FEEDBACK_DURATION}ms"><span>${Icon('check')}${escapeHtml(feedback.message)}</span>${action}</div>`;
}

export default {
  render(state, now) {
    if (state.scheduleError) return PathSection('Schedule unavailable', `<div class="error-state"><p>${escapeHtml(state.scheduleError)}</p><p>Open Atlas through a local server, then reload.</p></div>`);
    const { classes } = state.schedule;
    const { today, current, next } = getClassState(classes, now);
    return `<header class="page-header home-header"><div><button class="brand" id="atlas-brand" type="button" aria-label="Atlas">Atlas</button><p class="course">${escapeHtml(state.schedule.course || 'Course not set')}</p><p class="semester">${escapeHtml(state.schedule.semester || 'Student planner')}</p></div><div class="clock-block" aria-live="off"><time id="live-clock"></time><span>${formatDate(now)}</span></div></header>${feedbackToast()}<div class="home-dashboard">${todayCard(classes, today, current, next, now)}<aside class="attention-rail" aria-label="Needs your attention"><section class="atlas-card attention-panel"><div class="attention-heading"><span>${Icon('check')}</span><div><p class="eyebrow">Needs attention</p><h2>Due soon</h2></div></div>${urgentTasks(state.tasks, classes, now)}</section><section class="atlas-card attention-panel"><div class="attention-heading"><span>${Icon('calendar')}</span><div><p class="eyebrow">On the horizon</p><h2>Tests & exams</h2></div></div>${upcomingExams(state.exams, classes, now)}${addExamForm(classes)}</section></aside></div>`;
  },

  bind(router, state) {
    bindExamComposerAnimation();
    document.querySelectorAll('[data-countdown-start]').forEach((element) => { element.textContent = countdownTo({ day: new Date().getDay(), start: element.dataset.countdownStart }, new Date()); });
    document.querySelectorAll('[data-complete-home-task]').forEach((taskButton) => taskButton.addEventListener('click', async () => {
      const task = Store.get().tasks.find((item) => item.id === taskButton.dataset.completeHomeTask);
      if (!task) return;
      await transitionTaskRow(taskButton, true);
      pendingTaskUndo = { ...task };
      feedback = { message: `“${task.title}” is complete.`, action: 'undo-task', duration: TASK_FEEDBACK_DURATION };
      dismissFeedbackAfter(router, TASK_FEEDBACK_DURATION, true);
      const latest = Store.get();
      const tasks = saveTasks(latest.tasks.map((item) => item.id === task.id ? { ...item, completed: true } : item));
      Store.set(withAutoSave(latest, { tasks }));
    }));
    document.querySelector('[data-undo-home-task]')?.addEventListener('click', () => {
      if (!pendingTaskUndo) return;
      window.clearTimeout(feedbackTimer);
      const task = pendingTaskUndo;
      pendingTaskUndo = null;
      feedback = { message: `“${task.title}” was restored.`, action: 'week', duration: UNDO_FEEDBACK_DURATION };
      dismissFeedbackAfter(router, UNDO_FEEDBACK_DURATION);
      const latest = Store.get();
      const tasks = saveTasks(latest.tasks.map((item) => item.id === task.id ? { ...item, completed: false } : item));
      Store.set(withAutoSave(latest, { tasks }));
    });
    document.querySelectorAll('[data-open-class]').forEach((button) => {
      button.addEventListener('click', () => router.go(`class/${encodeURIComponent(button.dataset.openClass)}`));
    });
    document.getElementById('home-add-exam-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const data = new FormData(event.currentTarget);
        const subject = Store.get().schedule.classes.find((item) => item.id === data.get('classId'));
        const exam = createExam({ classId: data.get('classId'), examType: data.get('examType'), subject, date: data.get('date') });
        examMessage = `${exam.title} was saved.`;
        feedback = { message: `${exam.title} was added to Tests & exams.`, action: 'week', duration: TASK_FEEDBACK_DURATION };
        dismissFeedbackAfter(router, TASK_FEEDBACK_DURATION);
        Store.set({ exams: saveExams([...(Store.get().exams || []), exam]) });
      } catch (error) {
        examMessage = error.message;
        router.render();
      }
    });
  },
};
