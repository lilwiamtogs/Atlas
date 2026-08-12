import PathSection from '../components/pathSection.js';
import ClassItem from '../components/classItem.js?v=2';
import { escapeHtml } from '../utils/html.js';
import { daysUntil, sortTasks, urgencyFor } from '../services/tasks.js';
import { DAY_NAMES, formatDate, formatTime, getClassState } from '../utils/time.js';
import Store from '../store.js';
import { createExam, saveExams } from '../services/exams.js';
import { transitionClassDisclosure } from '../utils/animations.js';

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
      <article class="home-task is-${urgencyFor(task, now)}">
        <span class="home-task-dot" aria-hidden="true"></span>
        <span class="home-task-copy">
          <strong>${escapeHtml(task.title)}</strong>
          <span>${escapeHtml(subjectLabel)}${dueTime ? ` · due ${escapeHtml(dueTime)}` : ''}</span>
        </span>
        <span class="home-task-days">${remaining}</span>
      </article>`;
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
    const focus = current || next;
    const focusLabel = current ? 'Current class' : 'Next class';
    const todayList = today.length
      ? today.map((item) => ClassItem(item, { current: item.id === current?.id })).join('')
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
      ${PathSection(focusLabel, focusClass(focus, now, focusLabel), { active: Boolean(focus), className: 'hero-path-section' })}
      ${current && next ? PathSection('Next', focusClass(next, now, 'Next class')) : ''}
      ${hasUpcomingExams ? examsSection : ''}
      ${PathSection('Due / urgent', urgentTasks(state.tasks, classes, now), { className: 'tasks-preview' })}
      ${PathSection('Today', `<div class="agenda-list">${todayList}</div>`, { className: 'today-section' })}
      ${hasUpcomingExams ? '' : examsSection}
    `;
  },

  bind(router, state) {
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
