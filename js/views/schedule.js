import PathSection from '../components/pathSection.js';
import ClassItem from '../components/classItem.js';
import TaskList from '../components/taskList.js?v=2';
import Store from '../store.js';
import { createTask, saveTasks, sortTasks } from '../services/tasks.js';
import { createNote, readNoteFile, saveNotes } from '../services/notes.js?v=37';
import { escapeHtml } from '../utils/html.js';
import { DAY_NAMES, getClassState } from '../utils/time.js';
import { transitionTaskRow } from '../utils/animations.js';
import { withAutoSave } from '../services/autosave.js';

let noteMessage = '';
let editingTaskId = '';
const openClassIds = new Set();

function dateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function dateForWeekday(day, weekOffset, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const target = new Date(today);
  target.setDate(today.getDate() + mondayOffset + Number(weekOffset || 0) * 7 + Number(day) - 1);
  if (target < today) target.setDate(target.getDate() + 7);
  return dateInputValue(target);
}

function targetFields(classes, { includeWeek = false } = {}) {
  const hasClasses = classes.length > 0;
  const defaultType = hasClasses ? 'class' : 'personal';
  return `
    <input type="hidden" name="targetType" value="${defaultType}">
    <div class="target-type-switch" aria-label="Assign to">
      <button type="button" data-target-type="class" aria-pressed="${defaultType === 'class'}" ${hasClasses ? '' : 'disabled'}>Class</button>
      <button type="button" data-target-type="personal" aria-pressed="${defaultType === 'personal'}">Personal day</button>
    </div>
    <div class="target-field-stage">
      <div class="task-form-field" data-class-target ${defaultType === 'class' ? '' : 'hidden'}><span class="task-form-label">Class</span>
        <select name="classId" ${defaultType === 'class' ? 'required' : ''}>
          ${classes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} · ${escapeHtml(item.title)}</option>`).join('')}
        </select>
      </div>
      <div class="personal-task-target" data-personal-target ${defaultType === 'personal' ? '' : 'hidden'}>
        <label class="task-form-field">Day
          <select name="personalDay" ${defaultType === 'personal' ? 'required' : ''}>
            ${DAY_NAMES.slice(1, 7).map((day, index) => `<option value="${index + 1}">${day}</option>`).join('')}
          </select>
        </label>
        ${includeWeek ? `<label class="task-form-field">Week
          <select name="personalWeek" ${defaultType === 'personal' ? 'required' : ''}>
            <option value="0">This week</option>
            <option value="1">Next week</option>
            ${[2, 3, 4, 5, 6, 7, 8].map((week) => `<option value="${week}">In ${week} weeks</option>`).join('')}
          </select>
        </label>` : ''}
      </div>
    </div>`;
}

async function transitionTargetField(form, type) {
  const classField = form.querySelector('[data-class-target]');
  const personalField = form.querySelector('[data-personal-target]');
  const outgoing = type === 'class' ? personalField : classField;
  const incoming = type === 'class' ? classField : personalField;
  const stage = form.querySelector('.target-field-stage');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || typeof stage.animate !== 'function') {
    outgoing.hidden = true;
    incoming.hidden = false;
    return;
  }

  const startHeight = stage.getBoundingClientRect().height;
  incoming.hidden = false;
  const endHeight = incoming.getBoundingClientRect().height;
  incoming.style.position = 'absolute';
  incoming.style.inset = '0';
  incoming.style.opacity = '0';
  stage.style.height = `${startHeight}px`;
  stage.style.overflow = 'visible';

  const heightAnimation = stage.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
  );
  await Promise.all([
    heightAnimation.finished,
    outgoing.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-10px)' }], { duration: 150, easing: 'ease-in', fill: 'forwards' }).finished,
    incoming.animate([{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 230, delay: 70, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }).finished,
  ]);

  outgoing.hidden = true;
  outgoing.getAnimations().forEach((animation) => animation.cancel());
  incoming.getAnimations().forEach((animation) => animation.cancel());
  incoming.style.removeProperty('position');
  incoming.style.removeProperty('inset');
  incoming.style.removeProperty('opacity');
  stage.style.height = `${endHeight}px`;
  heightAnimation.cancel();
  stage.style.removeProperty('height');
  stage.style.removeProperty('overflow');
}

function selectedTarget(data) {
  return data.get('targetType') === 'personal' ? `personal-day-${data.get('personalDay')}` : data.get('classId');
}

function selectedTaskDate(data) {
  return data.get('targetType') === 'personal'
    ? dateForWeekday(data.get('personalDay'), data.get('personalWeek'))
    : data.get('dueDate');
}

function addTaskPanel(classes) {
  const today = dateInputValue();
  const personalOnly = classes.length === 0;

  return `
    <form class="add-task-form" id="add-task-form">
      <label class="task-form-field">Task
        <input name="title" placeholder="e.g. Read chapter 4" required>
      </label>
      ${targetFields(classes, { includeWeek: true })}
      <label class="task-form-field" data-due-date-field ${personalOnly ? 'hidden' : ''}>Due date
        <input name="dueDate" type="date" min="${today}" value="${today}" ${personalOnly ? '' : 'required'}>
      </label>
      <button class="primary-action add-task-button" type="submit">Add task</button>
    </form>`;
}

function addNotePanel(classes) {
  return `
    <form class="attach-note-form" id="attach-note-form">
      <label class="task-form-field">Note name
        <input name="name" placeholder="e.g. Midterm reviewer" required>
      </label>
      ${targetFields(classes)}
      <label class="note-file-field" for="note-file">
        <span>TXT or PDF</span>
        <strong id="note-file-name">Choose a note file</strong>
      </label>
      <input class="visually-hidden" id="note-file" name="file" type="file" accept=".txt,.pdf,text/plain,application/pdf" required>
      <button class="primary-action" type="submit">Add note</button>
      ${noteMessage ? `<p class="note-message" role="status">${escapeHtml(noteMessage)}</p>` : ''}
    </form>`;
}

function personalDayPlanner(day, tasks, notes, now) {
  const id = `personal-day-${day}`;
  const dayTasks = sortTasks(tasks.filter((task) => task.classId === id));
  const dayNotes = notes.filter((note) => note.classId === id);
  if (!dayTasks.length && !dayNotes.length) return '';
  const noteContent = dayNotes.length ? `
    <div class="personal-note-list">
      <div class="personal-plans-heading"><span>Notes</span><span>${dayNotes.length}</span></div>
      ${dayNotes.map((note) => `
        <details class="personal-note ${note.mimeType === 'application/pdf' ? 'is-pdf' : ''}">
          <summary>${escapeHtml(note.name)}</summary>
          ${note.mimeType === 'application/pdf'
            ? `<iframe src="${escapeHtml(note.content)}" title="${escapeHtml(note.name)}"></iframe>`
            : `<pre>${escapeHtml(note.content)}</pre>`}
        </details>`).join('')}
    </div>` : '';
  return `
    <article class="personal-planner-card">
      <div class="personal-planner-title">
        <div><p class="class-code">Personal</p><h3>Plans for ${DAY_NAMES[day]}</h3></div>
        <span>${dayTasks.length + dayNotes.length}</span>
      </div>
      ${TaskList(dayTasks, now, editingTaskId, { showDueDate: false })}
      ${noteContent}
    </article>`;
}

function bindCardAnimation(card, cards) {
  const summary = card.querySelector(':scope > summary');
  if (!summary) return;

  summary.addEventListener('click', (event) => {
    event.preventDefault();
    const opening = !card.open;

    if (opening) {
      cards.forEach((otherCard) => {
        if (otherCard === card || !otherCard.open) return;
        otherCard.open = false;
      });
    }
    card.open = opening;
  });
}

export default {
  render(state, now) {
    const { classes } = state.schedule;
    const { current } = getClassState(classes, now);
    const days = DAY_NAMES.map((name, day) => ({
      name,
      day,
      classes: classes.filter((item) => item.day === day),
    })).filter((entry) => entry.day >= 1 && entry.day <= 6);

    const content = days.map((entry) => PathSection(
          entry.day === now.getDay() ? `${entry.name} · Today` : entry.name,
          `<div class="weekly-card-grid">${entry.classes.map((item) => {
            const tasks = sortTasks(state.tasks.filter((task) => task.classId === item.id));
            const editingThisClass = tasks.some((task) => task.id === editingTaskId);
            return ClassItem(item, {
              current: item.id === current?.id,
              card: true,
              open: openClassIds.has(item.id) || editingThisClass,
              taskContent: TaskList(tasks, now, editingTaskId),
              fullPage: true,
            });
          }).join('')}${personalDayPlanner(entry.day, state.tasks, state.notes || [], now) || (entry.classes.length ? '' : '<p class="empty-day-state">No classes scheduled</p>')}</div>`,
          { active: entry.day === now.getDay(), className: `day-section ${entry.classes.length ? '' : 'is-empty'}` },
        )).join('');

    return `
      <header class="page-header compact-header">
        <div>
          <button class="brand" id="atlas-brand" type="button" aria-label="Atlas">Atlas</button>
          <p class="course">${escapeHtml(state.schedule.course || 'Course not set')}</p>
          <p class="semester">${escapeHtml(state.schedule.semester || 'Student planner')}</p>
        </div>
        <div class="view-title">
          <p class="eyebrow">Schedule</p>
          <h1>Your week</h1>
        </div>
      </header>
      <div class="week-list">${content}</div>
      <div class="week-tools-grid">
        ${PathSection('Add task', addTaskPanel(classes), { className: 'add-task-section' })}
        ${PathSection('Add note', addNotePanel(classes), { className: 'add-note-section' })}
      </div>
      <div class="schedule-print-action">
        <button class="secondary-action" id="print-schedule" type="button"><span>Print schedule</span><span aria-hidden="true">↗</span></button>
      </div>`;
  },

  bind(router, state) {
    document.querySelectorAll('.target-type-switch button').forEach((button) => {
      button.addEventListener('click', async () => {
        const form = button.closest('form');
        const type = button.dataset.targetType;
        if (form.elements.targetType.value === type || form.dataset.switching === 'true') return;
        form.dataset.switching = 'true';
        form.elements.targetType.value = type;
        form.querySelectorAll('.target-type-switch button').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
        const classField = form.querySelector('[data-class-target]');
        const personalField = form.querySelector('[data-personal-target]');
        classField.querySelector('select[name="classId"]').required = type === 'class';
        personalField.querySelectorAll('select').forEach((select) => { select.required = type === 'personal'; });
        form.querySelector('[data-due-date-field]')?.toggleAttribute('hidden', type === 'personal');
        const dueDate = form.elements.dueDate;
        if (dueDate) dueDate.required = type === 'class';
        await transitionTargetField(form, type);
        delete form.dataset.switching;
      });
    });
    document.getElementById('print-schedule')?.addEventListener('click', () => window.print());
    const classCards = [...document.querySelectorAll('.class-card[data-class-id]')];
    classCards.forEach((card) => {
      bindCardAnimation(card, classCards);
      card.addEventListener('toggle', () => {
        if (card.open) openClassIds.add(card.dataset.classId);
        else openClassIds.delete(card.dataset.classId);
      });
    });

    document.querySelectorAll('[data-open-class]').forEach((button) => {
      button.addEventListener('click', () => router.go(`class/${encodeURIComponent(button.dataset.openClass)}`));
    });

    document.getElementById('add-task-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const task = createTask({
        title: data.get('title'),
        classId: selectedTarget(data),
        dueDate: selectedTaskDate(data),
      });
      const tasks = saveTasks([...state.tasks, task]);
      Store.set(withAutoSave(state, { tasks }));
    });

    document.querySelectorAll('[data-toggle-task]').forEach((button) => {
      button.addEventListener('click', async () => {
        const task = state.tasks.find((entry) => entry.id === button.dataset.toggleTask);
        await transitionTaskRow(button.closest('.task-row'), !task?.completed);
        const tasks = saveTasks(state.tasks.map((task) => task.id === button.dataset.toggleTask
          ? { ...task, completed: !task.completed }
          : task));
        Store.set(withAutoSave(state, { tasks }));
      });
    });

    document.querySelectorAll('[data-delete-task]').forEach((button) => {
      button.addEventListener('click', () => {
        if (editingTaskId === button.dataset.deleteTask) editingTaskId = '';
        Store.set({ tasks: saveTasks(state.tasks.filter((task) => task.id !== button.dataset.deleteTask)) });
      });
    });

    document.querySelectorAll('[data-edit-task]').forEach((button) => {
      button.addEventListener('click', () => {
        editingTaskId = button.dataset.editTask;
        router.render();
      });
    });

    document.querySelector('[data-cancel-task]')?.addEventListener('click', () => {
      editingTaskId = '';
      router.render();
    });

    document.querySelector('[data-task-edit-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const id = event.currentTarget.dataset.taskEditForm;
      editingTaskId = '';
      Store.set({ tasks: saveTasks(state.tasks.map((task) => task.id === id ? {
        ...task,
        title: data.get('title'),
        dueDate: data.get('dueDate') || state.tasks.find((task) => task.id === id)?.dueDate,
      } : task)) });
    });

    document.getElementById('note-file')?.addEventListener('change', (event) => {
      const fileName = document.getElementById('note-file-name');
      if (fileName) fileName.textContent = event.target.files[0]?.name || 'Choose a note file';
    });

    document.getElementById('attach-note-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const file = data.get('file');

      if (!(file instanceof File)) {
        noteMessage = 'Choose a TXT or PDF file.';
        router.render();
        return;
      }

      try {
        const fileData = await readNoteFile(file);
        const note = createNote({
          classId: selectedTarget(data),
          name: data.get('name'),
          fileName: file.name,
          ...fileData,
        });
        noteMessage = 'Note attached. Open the class page to read it.';
        const notes = saveNotes([...state.notes, note]);
        Store.set(withAutoSave(state, { notes }));
      } catch (error) {
        noteMessage = error.name === 'QuotaExceededError'
          ? 'Device storage is full. Remove an older note and try again.'
          : error.message;
        router.render();
      }
    });
  },
};
