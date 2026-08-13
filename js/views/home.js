import PathSection from '../components/pathSection.js';
import ClassItem from '../components/classItem.js?v=3';
import { escapeHtml } from '../utils/html.js';
import { daysUntil, saveTasks, sortTasks, urgencyFor } from '../services/tasks.js';
import { DAY_NAMES, formatDate, formatTime, getClassState, minutesFromTime } from '../utils/time.js';
import Store from '../store.js';
import { createExam, saveExams } from '../services/exams.js';
import { closeOverlay, openOverlay, transitionClassDisclosure, transitionTaskRow } from '../utils/animations.js?v=9';
import { withAutoSave } from '../services/autosave.js';
import enhanceDatePickers from '../components/datePicker.js?v=3';
import enhanceTimePickers from '../components/timePicker.js?v=2';

let examMessage = '';

function dateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function empty(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function focusClass(item, now, label) {
  if (!item) return empty(label === 'Current class' ? 'No class right now.' : 'Nothing else scheduled.');
  const dayPrefix = item.day === now.getDay() ? '' : `${DAY_NAMES[item.day]} · `;
  return `
    <article class="focus-class">
      <p class="focus-code">${escapeHtml(item.code)}</p>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${dayPrefix}${formatTime(item.start)} — ${formatTime(item.end)}</p>
      <p>${escapeHtml(item.room)}</p>
    </article>`;
}

function countdownTo(item, now) {
  if (!item || item.day !== now.getDay()) return '';
  const seconds = Math.max(0, minutesFromTime(item.start) * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours ? `${hours}h ` : ''}${String(minutes).padStart(hours ? 2 : 1, '0')}m ${String(remainder).padStart(2, '0')}s`;
}

function waitingClass(item, now) {
  return `<article class="focus-class is-waiting"><p class="focus-code">Starts in</p><strong class="class-countdown" data-countdown-start="${escapeHtml(item.start)}">${countdownTo(item, now)}</strong><h2>${escapeHtml(item.title)}</h2><p>${formatTime(item.start)} — ${formatTime(item.end)} · ${escapeHtml(item.room)}</p></article>`;
}

function dayComplete(next) {
  if (!next) return `<article class="day-complete"><p class="focus-code">Day complete</p><h2>You're done for today.</h2><p>Want to get ahead on an assignment?</p></article>`;
  return `<article class="day-complete"><p class="focus-code">Day complete</p><h2>You're done for today.</h2><p>Want to get ahead on an assignment?</p><small>Next up · ${escapeHtml(DAY_NAMES[next.day])}, ${formatTime(next.start)} · ${escapeHtml(next.code)}</small></article>`;
}

function urgentTasks(tasks, classes, now) {
  const items = sortTasks(tasks)
    .filter((task) => !task.completed && daysUntil(task.dueDate, now) <= 14)
    .slice(0, 4);

  if (!items.length) return empty('No urgent tasks. Your path is clear.');

  return `<div class="home-task-list">${items.map((task) => {
    const subject = classes.find((item) => item.id === task.classId);
    const personalDay = task.classId.match(/^personal-day-([1-6])$/);
    const subjectLabel = subject?.code || (personalDay ? `Personal · ${DAY_NAMES[Number(personalDay[1])]}` : 'Class');
    const days = daysUntil(task.dueDate, now);
    const remaining = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`;
    const dueTime = task.dueTime
      ? new Date(`2000-01-01T${task.dueTime}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : '';
    return `
      <button class="home-task is-${urgencyFor(task, now)}" data-complete-home-task="${escapeHtml(task.id)}" type="button" aria-label="Mark ${escapeHtml(task.title)} complete">
        <span class="home-task-dot" aria-hidden="true"></span>
        <span class="home-task-copy">
          <strong>${escapeHtml(task.title)}</strong>
          <span>${escapeHtml(subjectLabel)}${dueTime ? ` · due ${escapeHtml(dueTime)}` : ''}</span>
        </span>
        <span class="home-task-days">${remaining}</span>
      </button>`;
  }).join('')}</div>`;
}

function upcomingExams(exams, classes, now) {
  const items = [...(exams || [])]
    .filter((exam) => daysUntil(exam.date, now) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  if (!items.length) return empty('No upcoming tests or exams.');

  return `<div class="home-exam-list">${items.map((exam) => {
    const subject = classes.find((item) => item.id === exam.classId);
    const days = daysUntil(exam.date, now);
    return `
      <article class="home-exam">
        <span class="home-exam-date"><strong>${exam.date.slice(8, 10)}</strong><small>${new Date(`${exam.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</small></span>
        <span><strong>${escapeHtml(exam.title)}</strong><small>${escapeHtml(subject?.code || 'Class')} · ${days === 0 ? 'Today' : `${days}d away`}</small></span>
      </article>`;
  }).join('')}</div>`;
}

function addExamForm(classes) {
  if (!classes.length) return '';
  return `
    <form class="add-exam-form home-exam-form" id="home-add-exam-form">
      <label class="task-form-field">Test / exam name
        <input name="title" placeholder="e.g. Midterm exam" required>
      </label>
      <label class="task-form-field">Class
        <select name="classId" required>
          ${classes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} · ${escapeHtml(item.title)}</option>`).join('')}
        </select>
      </label>
      <label class="task-form-field">Date
        <input name="date" type="date" min="${dateInputValue()}" value="${dateInputValue()}" required>
      </label>
      <button class="primary-action" type="submit">Add test</button>
      ${examMessage ? `<p class="note-message" role="status">${escapeHtml(examMessage)}</p>` : ''}
    </form>`;
}

export default {
  render(state, now) {
    if (state.scheduleError) {
      return PathSection('Schedule unavailable', `
        <div class="error-state">
          <p>${escapeHtml(state.scheduleError)}</p>
          <p>Open Atlas through a local server, then reload.</p>
        </div>`);
    }

    const { classes } = state.schedule;
    const { today, current, next } = getClassState(classes, now);
    const nextIsToday = next?.day === now.getDay();
    const focus = current || (nextIsToday ? next : null);
    const focusLabel = current ? 'Current class' : nextIsToday ? 'Next class' : 'Today';
    const focusContent = current ? focusClass(current, now, focusLabel) : nextIsToday ? waitingClass(next, now) : dayComplete(next);
    const todayList = today.length
      ? today.map((item) => ClassItem(item, { current: item.id === current?.id, finished: minutesFromTime(item.end) <= now.getHours() * 60 + now.getMinutes() })).join('')
      : empty(classes.length ? 'No classes scheduled today.' : 'Your schedule is empty. Add classes to data/defaultSchedule.json.');
    const hasUpcomingExams = (state.exams || []).some((exam) => daysUntil(exam.date, now) >= 0);
    const examsSection = PathSection('Tests & exams', `
      ${upcomingExams(state.exams, classes, now)}
      ${addExamForm(classes)}`, { className: hasUpcomingExams ? 'has-exams' : 'no-exams' });

    return `
      <header class="page-header">
        <div>
          <button class="brand" id="atlas-brand" type="button" aria-label="Atlas">Atlas</button>
          <p class="course">${escapeHtml(state.schedule.course || 'Course not set')}</p>
          <p class="semester">${escapeHtml(state.schedule.semester || 'Student planner')}</p>
        </div>
        <div class="clock-block" aria-live="off">
          <time id="live-clock"></time>
          <span>${formatDate(now)}</span>
        </div>
      </header>
      ${PathSection(focusLabel, focusContent, { active: Boolean(current), className: `hero-path-section ${nextIsToday && !current ? 'is-waiting' : ''}` })}
      ${current && next ? PathSection('Next', focusClass(next, now, 'Next class')) : ''}
      ${hasUpcomingExams ? examsSection : ''}
      ${PathSection('Due / urgent', urgentTasks(state.tasks, classes, now), { className: 'tasks-preview' })}
      ${PathSection('Today', `<div class="agenda-list">${todayList}</div>`, { className: 'today-section' })}
      ${hasUpcomingExams ? '' : examsSection}
    `;
  },

  bind(router, state) {
    const updateCountdown = () => document.querySelectorAll('[data-countdown-start]').forEach((element) => {
      element.textContent = countdownTo({ day: new Date().getDay(), start: element.dataset.countdownStart }, new Date());
    });
    updateCountdown();
    document.querySelectorAll('[data-complete-home-task]').forEach((taskButton) => taskButton.addEventListener('click', () => {
      const task = state.tasks.find((item) => item.id === taskButton.dataset.completeHomeTask);
      if (!task || document.getElementById('home-task-confirm')) return;
      const screen = document.createElement('div');
      screen.className = 'confirm-screen';
      screen.id = 'home-task-confirm';
      screen.innerHTML = `<section class="confirm-card home-task-dialog" role="dialog" aria-modal="true" aria-labelledby="home-task-confirm-title"><div data-home-task-actions><p class="eyebrow">Task</p><h2 id="home-task-confirm-title">Done with this?</h2><p>${escapeHtml(task.title)}</p>${task.description ? `<small class="task-dialog-description">${escapeHtml(task.description)}</small>` : ''}<div class="confirm-actions home-task-actions"><button class="secondary-action" data-home-task-no type="button">Not yet</button><button class="secondary-action" data-home-task-edit type="button">Edit task</button><button class="primary-action" data-home-task-yes type="button">Mark done</button></div></div><form class="home-task-edit-form" data-home-task-edit-form hidden><p class="eyebrow">Edit task</p><h2>Update details</h2><label class="task-form-field">Task<input name="title" value="${escapeHtml(task.title)}" required></label><label class="task-form-field">Short description<textarea name="description" maxlength="500" placeholder="What needs to be done?">${escapeHtml(task.description || '')}</textarea></label><label class="task-form-field">Due date<input name="dueDate" type="date" value="${escapeHtml(task.dueDate)}" required></label><label class="task-form-field">Due time<input name="dueTime" type="time" value="${escapeHtml(task.dueTime || '23:59')}" required></label><div class="confirm-actions"><button class="secondary-action" data-home-task-edit-cancel type="button">Cancel</button><button class="primary-action" type="submit">Save changes</button></div></form></section>`;
      document.getElementById('app').append(screen);
      openOverlay(screen);
      const dismiss = async () => { await closeOverlay(screen); screen.remove(); };
      let dialogViewTransitioning = false;
      const transitionDialogView = async (outgoing, incoming, direction) => {
        if (dialogViewTransitioning || outgoing.hidden || !incoming.hidden) return;
        dialogViewTransitioning = true;
        const card = screen.querySelector('.home-task-dialog');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const startHeight = card.getBoundingClientRect().height;
        try {
          card.style.height = `${startHeight}px`;
          card.style.overflow = 'clip';
          outgoing.hidden = true;
          incoming.hidden = false;
          card.style.removeProperty('height');
          const endHeight = card.getBoundingClientRect().height;
          card.style.height = `${startHeight}px`;
          outgoing.hidden = false;
          if (!reduceMotion && typeof card.animate === 'function') {
            const options = { duration: 230, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' };
            const height = card.animate([{ height: `${startHeight}px` }, { height: `${endHeight}px` }], options);
            const out = outgoing.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-10 * direction}px)` }], { duration: 120, easing: 'ease-out', fill: 'both' });
            const enter = incoming.animate([{ opacity: 0, transform: `translateX(${10 * direction}px)` }, { opacity: 1, transform: 'translateX(0)' }], options);
            await Promise.allSettled([height.finished, out.finished, enter.finished]);
          }
          outgoing.hidden = true;
          card.style.height = `${endHeight}px`;
        } finally {
          outgoing.getAnimations().forEach((animation) => animation.cancel());
          incoming.getAnimations().forEach((animation) => animation.cancel());
          card.getAnimations().forEach((animation) => animation.cancel());
          card.getBoundingClientRect();
          card.style.removeProperty('height');
          card.style.removeProperty('overflow');
          dialogViewTransitioning = false;
        }
      };
      screen.addEventListener('click', (event) => { if (event.target === screen || event.target.closest('[data-home-task-no]')) dismiss(); });
      screen.querySelector('[data-home-task-edit]')?.addEventListener('click', () => {
        const actions = screen.querySelector('[data-home-task-actions]');
        const form = screen.querySelector('[data-home-task-edit-form]');
        enhanceDatePickers(screen);
        enhanceTimePickers(screen);
        transitionDialogView(actions, form, 1).then(() => form.elements.title.focus());
      });
      screen.querySelector('[data-home-task-edit-cancel]')?.addEventListener('click', async () => {
        const form = screen.querySelector('[data-home-task-edit-form]');
        const actions = screen.querySelector('[data-home-task-actions]');
        await transitionDialogView(form, actions, -1);
      });
      screen.querySelector('[data-home-task-edit-form]')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        await closeOverlay(screen, 180);
        screen.remove();
        const tasks = saveTasks(state.tasks.map((item) => item.id === task.id ? { ...item, title: data.get('title'), description: data.get('description'), dueDate: data.get('dueDate'), dueTime: data.get('dueTime') } : item));
        Store.set(withAutoSave(state, { tasks }));
      });
      screen.querySelector('[data-home-task-yes]')?.addEventListener('click', async () => {
        await closeOverlay(screen, 180);
        screen.remove();
        await transitionTaskRow(taskButton, true);
        const tasks = saveTasks(state.tasks.map((item) => item.id === task.id ? { ...item, completed: true } : item));
        Store.set(withAutoSave(state, { tasks }));
      });
    }));
    document.querySelectorAll('.today-section details.class-item').forEach((card) => {
      card.querySelector(':scope > summary')?.addEventListener('click', (event) => {
        event.preventDefault();
        transitionClassDisclosure(card, !card.open);
      });
    });
    document.getElementById('home-add-exam-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const data = new FormData(event.currentTarget);
        const exam = createExam({ classId: data.get('classId'), title: data.get('title'), date: data.get('date') });
        examMessage = 'Test added.';
        Store.set({ exams: saveExams([...(state.exams || []), exam]) });
      } catch (error) {
        examMessage = error.message;
        router.render();
      }
    });
  },
};
