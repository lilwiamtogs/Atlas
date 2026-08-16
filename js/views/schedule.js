import PathSection from '../components/pathSection.js';
import ClassItem from '../components/classItem.js';
import TaskList from '../components/taskList.js';
import Store from '../store.js';
import { createTask, daysUntil, saveTasks, sortTasks } from '../services/tasks.js';
import { createNote, readNoteFile, saveNotes } from '../services/notes.js';
import { escapeHtml } from '../utils/html.js';
import { DAY_NAMES, getClassState, minutesFromTime } from '../utils/time.js';
import { transitionAddConfirmation, transitionClassDisclosure, transitionStrikeRemoval, transitionTaskRow } from '../utils/animations.js';
import { withAutoSave } from '../services/autosave.js';

let noteMessage = '';
let weekMessage = '';
let editingTaskId = '';
const openClassIds = new Set();
let weekContentMode = sessionStorage.getItem('atlas.weekContentMode') === 'personal' ? 'personal' : 'classes';
let pendingNoteFile = null;
const FORM_DRAFT_KEY = 'atlas.weekFormDrafts';

function formDrafts() {
  try { return JSON.parse(sessionStorage.getItem(FORM_DRAFT_KEY) || '{}'); } catch { return {}; }
}

function restoreFormDraft(form) {
  const draft = formDrafts()[form.id];
  if (!draft) return;
  Object.entries(draft).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field && field.type !== 'file') {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  const type = draft.targetType || form.elements.targetType?.value;
  if (type && form.elements.targetType) {
    form.elements.targetType.value = type;
    form.querySelector('.target-type-switch').dataset.activeTarget = type;
    form.querySelectorAll('[data-target-type]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.targetType === type)));
    form.querySelector('[data-class-target]').hidden = type !== 'class';
    form.querySelector('[data-personal-target]').hidden = type !== 'personal';
    form.querySelectorAll('[data-due-date-field], [data-due-time-field]').forEach((field) => { field.hidden = type === 'personal'; });
  }
}

function saveFormDraft(form) {
  const drafts = formDrafts();
  drafts[form.id] = Object.fromEntries([...new FormData(form)].filter(([, value]) => typeof value === 'string'));
  sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(drafts));
}

function clearFormDraft(id) {
  const drafts = formDrafts();
  delete drafts[id];
  sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(drafts));
}

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
    <div class="target-type-switch" data-active-target="${defaultType}" aria-label="Assign to">
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
  const dueField = form.querySelector('[data-due-date-field]');
  const dueTimeField = form.querySelector('[data-due-time-field]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const direction = type === 'personal' ? 1 : -1;

  if (reduceMotion || typeof stage.animate !== 'function') {
    outgoing.hidden = true;
    incoming.hidden = false;
    dueField?.toggleAttribute('hidden', type === 'personal');
    dueTimeField?.toggleAttribute('hidden', type === 'personal');
    return;
  }

  const startHeight = form.getBoundingClientRect().height;
  incoming.hidden = false;
  const auxiliaryFields = [dueField, dueTimeField].filter(Boolean);
  const auxiliaryWasHidden = auxiliaryFields.map((field) => field.hidden);
  if (dueField) dueField.hidden = type === 'personal';
  if (dueTimeField) dueTimeField.hidden = type === 'personal';
  outgoing.hidden = true;
  const endHeight = form.getBoundingClientRect().height;
  outgoing.hidden = false;
  auxiliaryFields.forEach((field, index) => { field.hidden = auxiliaryWasHidden[index]; });
  if (type === 'class') auxiliaryFields.forEach((field) => { field.hidden = false; });
  form.style.height = `${startHeight}px`;
  form.style.overflow = 'clip';
  const heightAnimation = form.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    { duration: 230, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
  );
  const enterAnimation = incoming.animate([
    { opacity: 0, transform: `translateX(${10 * direction}px)` },
    { opacity: 1, transform: 'translateX(0)' },
  ], { duration: 190, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
  const exitAnimation = outgoing.animate([
    { opacity: 1, transform: 'translateX(0)' },
    { opacity: 0, transform: `translateX(${-10 * direction}px)` },
  ], { duration: 140, easing: 'ease-out', fill: 'both' });
  const auxiliaryAnimations = auxiliaryFields.map((field) => field.animate(
    type === 'personal'
      ? [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-8px)' }]
      : [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 190, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
  ));
  await Promise.allSettled([heightAnimation.finished, enterAnimation.finished, exitAnimation.finished, ...auxiliaryAnimations.map((animation) => animation.finished)].filter(Boolean));
  outgoing.hidden = true;
  auxiliaryFields.forEach((field) => { field.hidden = type === 'personal'; });
  form.style.height = `${endHeight}px`;
  heightAnimation.cancel();
  enterAnimation.cancel();
  exitAnimation.cancel();
  auxiliaryAnimations.forEach((animation) => animation.cancel());
  form.getBoundingClientRect();
  form.style.removeProperty('height');
  form.style.removeProperty('overflow');
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
      <label class="task-form-field task-description-field">Short description
        <textarea name="description" maxlength="500" placeholder="What needs to be done?"></textarea>
      </label>
      ${targetFields(classes, { includeWeek: true })}
      <label class="task-form-field" data-due-date-field ${personalOnly ? 'hidden' : ''}>Due date
        <input name="dueDate" type="date" min="${today}" value="${today}" ${personalOnly ? '' : 'required'}>
      </label>
      <label class="task-form-field" data-due-time-field ${personalOnly ? 'hidden' : ''}>Due time
        <input name="dueTime" type="time" value="23:59" required>
      </label>
      <button class="primary-action add-task-button" type="submit">Save task</button>
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
      <button class="primary-action" type="submit">Attach note</button>
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
        <article class="personal-note-row">
          <button class="personal-note-open" data-open-personal-note="${escapeHtml(note.id)}" data-personal-day="${day}" type="button"><span>${note.mimeType === 'application/pdf' ? 'PDF' : 'TXT'}</span><strong>${escapeHtml(note.name)}</strong><i aria-hidden="true">→</i></button>
          <button class="personal-note-delete" data-delete-personal-note="${escapeHtml(note.id)}" type="button" aria-label="Remove ${escapeHtml(note.name)}">×</button>
        </article>`).join('')}
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
    if (opening) cards.forEach((otherCard) => {
      if (otherCard === card || !otherCard.open) return;
      transitionClassDisclosure(otherCard, false);
    });
    transitionClassDisclosure(card, opening);
  });
}

function mobileTaskPreview(tasks, now) {
  if (!tasks.length) return '';
  return `<div class="mobile-card-tasks"><span>Due soon</span>${tasks.slice(0, 3).map((task) => `<p><strong>${escapeHtml(task.title)}</strong><small>${daysUntil(task.dueDate, now) < 0 ? 'Overdue' : daysUntil(task.dueDate, now) === 0 ? 'Today' : `${daysUntil(task.dueDate, now)}d`}</small></p>`).join('')}${tasks.length > 3 ? `<small>+${tasks.length - 3} more</small>` : ''}</div>`;
}

export default {
  render(state, now) {
    const { classes } = state.schedule;
    const compactCards = window.matchMedia('(max-width: 619px), (pointer: coarse)').matches;
    const { current } = getClassState(classes, now);
    const days = DAY_NAMES.map((name, day) => ({
      name,
      day,
      classes: classes.filter((item) => item.day === day),
    })).filter((entry) => entry.day >= 1 && entry.day <= 6);

    const content = days.map((entry) => PathSection(
          entry.day === now.getDay() ? `${entry.name} · Today` : entry.name,
          `<div class="weekly-card-grid"><div class="week-class-group" ${weekContentMode === 'personal' ? 'hidden' : ''}>${entry.classes.map((item) => {
            const tasks = sortTasks(state.tasks.filter((task) => task.classId === item.id && !task.completed));
            const urgentTasks = tasks.filter((task) => daysUntil(task.dueDate, now) <= 14);
            const editingThisClass = tasks.some((task) => task.id === editingTaskId);
            return ClassItem(item, compactCards ? {
              current: item.id === current?.id,
              finished: entry.day === now.getDay() && minutesFromTime(item.end) <= now.getHours() * 60 + now.getMinutes(),
              navigate: true,
              taskContent: mobileTaskPreview(urgentTasks, now),
            } : {
              current: item.id === current?.id,
              finished: entry.day === now.getDay() && minutesFromTime(item.end) <= now.getHours() * 60 + now.getMinutes(),
              card: true,
              open: openClassIds.has(item.id) || editingThisClass,
              taskContent: TaskList(tasks, now, editingTaskId),
              fullPage: true,
            });
          }).join('')}${entry.classes.length ? '' : '<p class="empty-day-state">No classes scheduled</p>'}</div><div class="week-personal-group" ${weekContentMode === 'classes' ? 'hidden' : ''}>${personalDayPlanner(entry.day, state.tasks, state.notes || [], now) || '<p class="empty-day-state">No personal plans for this day.</p>'}</div></div>`,
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
      <div class="settings-pill week-content-switch" data-week-mode="${weekContentMode}" role="group" aria-label="Week content"><button class="${weekContentMode === 'classes' ? 'is-active' : ''}" data-week-content="classes" type="button">Classes</button><button class="${weekContentMode === 'personal' ? 'is-active' : ''}" data-week-content="personal" type="button">Personal</button></div>
      ${weekMessage ? `<div class="product-feedback" role="status"><span>${escapeHtml(weekMessage)}</span><button type="button" data-route="home">View Now</button></div>` : ''}
      <div class="week-list">${content}</div>
      <div class="week-tools-grid">
        ${PathSection('Plan a task', addTaskPanel(classes), { className: 'add-task-section' })}
        ${PathSection('Keep a note', addNotePanel(classes), { className: 'add-note-section' })}
      </div>
      <div class="schedule-print-action">
        <button class="secondary-action" id="print-schedule" type="button"><span>Print schedule</span><span aria-hidden="true">↗</span></button>
      </div>`;
  },

  bind(router, state) {
    ['add-task-form', 'attach-note-form'].forEach((id) => {
      const form = document.getElementById(id);
      if (!form) return;
      restoreFormDraft(form);
      form.addEventListener('input', () => saveFormDraft(form));
      form.addEventListener('change', () => saveFormDraft(form));
    });
    if (pendingNoteFile && typeof DataTransfer === 'function') {
      const input = document.getElementById('note-file');
      const transfer = new DataTransfer();
      transfer.items.add(pendingNoteFile);
      input.files = transfer.files;
      document.getElementById('note-file-name').textContent = pendingNoteFile.name;
    }
    document.querySelectorAll('[data-week-content]').forEach((button) => button.addEventListener('click', async () => {
      const nextMode = button.dataset.weekContent;
      if (nextMode === weekContentMode || document.querySelector('.week-content-switch')?.dataset.switching === 'true') return;
      const switcher = document.querySelector('.week-content-switch');
      const weekList = document.querySelector('.week-list');
      switcher.dataset.switching = 'true';
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduceMotion && typeof weekList.animate === 'function') {
        await weekList.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${nextMode === 'personal' ? '-10px' : '10px'})` }], { duration: 120, easing: 'ease-in', fill: 'both' }).finished.catch(() => {});
      }
      document.querySelectorAll('.week-class-group').forEach((group) => { group.hidden = nextMode !== 'classes'; });
      document.querySelectorAll('.week-personal-group').forEach((group) => { group.hidden = nextMode !== 'personal'; });
      weekContentMode = nextMode;
      sessionStorage.setItem('atlas.weekContentMode', weekContentMode);
      switcher.dataset.weekMode = nextMode;
      switcher.querySelectorAll('button').forEach((option) => option.classList.toggle('is-active', option === button));
      weekList.getAnimations().forEach((animation) => animation.cancel());
      if (!reduceMotion && typeof weekList.animate === 'function') {
        await weekList.animate([{ opacity: 0, transform: `translateX(${nextMode === 'personal' ? '10px' : '-10px'})` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 190, easing: 'cubic-bezier(.22,1,.36,1)' }).finished.catch(() => {});
      }
      delete switcher.dataset.switching;
    }));
    document.querySelectorAll('.target-type-switch button').forEach((button) => {
      button.addEventListener('click', async () => {
        const form = button.closest('form');
        const type = button.dataset.targetType;
        if (form.elements.targetType.value === type || form.dataset.switching === 'true') return;
        form.dataset.switching = 'true';
        form.elements.targetType.value = type;
        form.querySelector('.target-type-switch').dataset.activeTarget = type;
        form.querySelectorAll('.target-type-switch button').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
        const classField = form.querySelector('[data-class-target]');
        const personalField = form.querySelector('[data-personal-target]');
        classField.querySelector('select[name="classId"]').required = type === 'class';
        personalField.querySelectorAll('select').forEach((select) => { select.required = type === 'personal'; });
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

    document.getElementById('add-task-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const task = createTask({
        title: data.get('title'),
        description: data.get('description'),
        classId: selectedTarget(data),
        dueDate: selectedTaskDate(data),
        dueTime: data.get('dueTime'),
      });
      const tasks = saveTasks([...state.tasks, task]);
      const target = task.classId.startsWith('personal-day-')
        ? `your ${DAY_NAMES[Number(task.classId.split('-').at(-1))]} personal plan`
        : state.schedule.classes.find((item) => item.id === task.classId)?.code || 'your week';
      weekMessage = `“${task.title}” was added to ${target}.`;
      await transitionAddConfirmation(event.currentTarget);
      clearFormDraft('add-task-form');
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
      button.addEventListener('click', async () => {
        await transitionStrikeRemoval(button.closest('.task-row'));
        if (editingTaskId === button.dataset.deleteTask) editingTaskId = '';
        Store.set(withAutoSave(state, { tasks: saveTasks(state.tasks.filter((task) => task.id !== button.dataset.deleteTask)) }));
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
        description: data.get('description'),
        dueDate: data.get('dueDate') || state.tasks.find((task) => task.id === id)?.dueDate,
        dueTime: data.get('dueTime'),
      } : task)) });
    });

    document.getElementById('note-file')?.addEventListener('change', (event) => {
      pendingNoteFile = event.target.files[0] || null;
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
        const destination = note.classId.startsWith('personal-day-')
          ? `${DAY_NAMES[Number(note.classId.split('-').at(-1))]} personal plans`
          : state.schedule.classes.find((item) => item.id === note.classId)?.code || 'your week';
        noteMessage = `“${note.name}” is ready in ${destination}.`;
        weekMessage = noteMessage;
        const notes = saveNotes([...state.notes, note]);
        await transitionAddConfirmation(event.currentTarget);
        pendingNoteFile = null;
        clearFormDraft('attach-note-form');
        Store.set(withAutoSave(state, { notes }));
      } catch (error) {
        noteMessage = error.name === 'QuotaExceededError'
          ? 'Device storage is full. Remove an older note and try again.'
          : error.message;
        router.render();
      }
    });
    document.querySelectorAll('[data-open-personal-note]').forEach((button) => button.addEventListener('click', () => {
      router.go(`class/personal-day-${button.dataset.personalDay}/note/${encodeURIComponent(button.dataset.openPersonalNote)}`);
    }));
    document.querySelectorAll('[data-delete-personal-note]').forEach((button) => button.addEventListener('click', async () => {
      const row = button.closest('.personal-note-row');
      await transitionStrikeRemoval(row);
      Store.set(withAutoSave(state, { notes: saveNotes(state.notes.filter((note) => note.id !== button.dataset.deletePersonalNote)) }));
    }));
  },
};
