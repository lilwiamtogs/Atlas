import PathSection from '../components/pathSection.js';
import Store from '../store.js';
import { createTask, daysUntil, saveTasks, sortTasks, urgencyFor } from '../services/tasks.js';
import { createNote, readNoteFile, saveNotes } from '../services/notes.js';
import { escapeHtml } from '../utils/html.js';
import { DAY_NAMES, formatTime } from '../utils/time.js';
import { closeOverlay, transitionAddConfirmation, transitionStrikeRemoval, transitionTaskRow } from '../utils/animations.js';
import { createExam, saveExams } from '../services/exams.js';
import { saveImportedSchedule } from '../services/schedule.js';
import { withAutoSave } from '../services/autosave.js';
import { extractPdfPages } from '../services/pdfText.js';

let noteMessage = '';
let pendingDeleteNoteId = '';
let editingTaskId = '';
let examMessage = '';
let editingClass = false;
let classMessage = '';
let actionMessage = '';

function dateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function assignmentRow(task, now) {
  if (task.id === editingTaskId) {
    return `
      <article class="detail-assignment is-editing">
        <form class="class-task-edit-form" data-class-task-edit-form="${escapeHtml(task.id)}">
          <label>Task
            <input name="title" value="${escapeHtml(task.title)}" required>
          </label>
          <label>Description
            <textarea name="description" maxlength="500" placeholder="What needs to be done?">${escapeHtml(task.description || '')}</textarea>
          </label>
          <label>Due date
            <input name="dueDate" type="date" value="${escapeHtml(task.dueDate)}" required>
          </label>
          <label>Due time
            <input name="dueTime" type="time" value="${escapeHtml(task.dueTime || '23:59')}" required>
          </label>
          <div class="class-task-edit-actions">
            <button type="submit">Save changes</button>
            <button type="button" id="cancel-class-task-edit">Cancel</button>
          </div>
        </form>
      </article>`;
  }

  const days = daysUntil(task.dueDate, now);
  const timingLabel = task.completed
    ? `Completed · due ${task.dueDate}`
    : days < 0
      ? `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`
      : days === 0
        ? 'Due today'
        : `${days} day${days === 1 ? '' : 's'} remaining`;
  const dueTime = task.dueTime
    ? new Date(`2000-01-01T${task.dueTime}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';
  const timing = `${timingLabel}${dueTime ? ` · ${dueTime}` : ''}`;

  return `
    <article class="detail-assignment is-${urgencyFor(task, now)}">
      <button class="task-check" type="button" data-class-toggle-task="${escapeHtml(task.id)}" aria-label="${task.completed ? 'Restore assignment' : 'Complete assignment'}" aria-pressed="${task.completed}">
        <span aria-hidden="true">${task.completed ? '✓' : ''}</span>
      </button>
      <span class="detail-assignment-copy">
        <strong>${escapeHtml(task.title)}</strong>
        ${task.description ? `<small class="task-description">${escapeHtml(task.description)}</small>` : ''}
        <span>${timing}</span>
      </span>
      <button class="detail-assignment-edit" type="button" data-edit-class-task="${escapeHtml(task.id)}">Edit</button>
    </article>`;
}

function assignmentSection(tasks, now, emptyMessage) {
  return tasks.length
    ? `<div class="detail-assignment-list">${tasks.map((task) => assignmentRow(task, now)).join('')}</div>`
    : `<p class="empty-state">${emptyMessage}</p>`;
}

function addTaskForm() {
  const today = dateInputValue();
  return `
    <form class="add-task-form class-add-task-form" id="class-add-task-form">
      <label class="task-form-field">Task
        <input name="title" placeholder="e.g. Read chapter 4" required>
      </label>
      <label class="task-form-field task-description-field">Short description
        <textarea name="description" maxlength="500" placeholder="What needs to be done?"></textarea>
      </label>
      <label class="task-form-field">Due date
        <input name="dueDate" type="date" min="${today}" value="${today}" required>
      </label>
      <label class="task-form-field">Due time
        <input name="dueTime" type="time" value="23:59" required>
      </label>
      <div class="class-add-task-actions"><button class="primary-action" type="submit">Save task</button></div>
    </form>`;
}

function noteSection(notes) {
  if (!notes.length) {
    return '<p class="empty-state">TXT and PDF notes attached to this class will appear here.</p>';
  }

  return `
    <div class="note-directory-heading">
      <span>${notes.length} file${notes.length === 1 ? '' : 's'}</span>
      <span>Newest first</span>
    </div>
    <div class="class-note-list">${notes.map((note) => `
      <article class="class-note-card" data-note-card="${escapeHtml(note.id)}">
        <button class="note-directory-link" type="button" data-open-note="${escapeHtml(note.id)}">
          <span class="note-file-icon" aria-hidden="true">${note.mimeType === 'application/pdf' ? 'PDF' : 'TXT'}</span>
          <span>
            <strong>${escapeHtml(note.name)}</strong>
            <small>${escapeHtml(note.fileName || 'Text note')}</small>
          </span>
          <span class="note-open-label" aria-hidden="true">→</span>
        </button>
        <button class="note-delete-quick" type="button" data-request-delete-note="${escapeHtml(note.id)}" aria-label="Delete ${escapeHtml(note.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>
        </button>
      </article>`).join('')}
    </div>`;
}

function masterDirectory(tasks, notes) {
  return `<section class="class-master-directory"><div><p class="eyebrow">Directory</p><h2>Find tasks & notes</h2><p>Search this class by task title, note name, filename, or text.</p></div><label class="master-search-control"><span aria-hidden="true">⌕</span><input id="class-master-search" type="search" placeholder="Type a keyword" autocomplete="off"></label><p class="master-search-status" id="class-master-status" aria-live="polite">${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${notes.length} note${notes.length === 1 ? '' : 's'}</p><div class="master-search-results" id="class-master-results"></div></section>`;
}

function noteReader(item, note) {
  if (!note) {
    return `
      <header class="class-detail-header">
        <button class="secondary-action" id="note-back" type="button">← Class notes</button>
        <p class="eyebrow">Note unavailable</p>
      </header>
      ${PathSection('File unavailable', '<p class="empty-state">This note may have been removed from this device.</p>')}`;
  }

  const isPdf = note.mimeType === 'application/pdf';
  return `
    <header class="class-detail-header">
      <button class="secondary-action" id="note-back" type="button">← Class notes</button>
      <p class="eyebrow">${escapeHtml(item.code)} · Note</p>
    </header>
    <article class="note-reader" data-note-reader="${escapeHtml(note.id)}">
      <p class="class-code">${isPdf ? 'PDF' : 'TXT'} note</p>
      <h1>${escapeHtml(note.name)}</h1>
      <p class="note-reader-file">${escapeHtml(note.fileName || 'Text note')}</p>
      <form class="note-search" id="note-search-form" role="search">
        <label for="note-search-input">Search this note</label>
        <span class="note-search-control">
          <input id="note-search-input" type="search" placeholder="Type a word or phrase" autocomplete="off">
          <button type="submit">Search</button>
        </span>
        <span class="note-search-status" id="note-search-status" aria-live="polite">${isPdf ? 'PDF text will be prepared for searching.' : 'Search every occurrence in this note.'}</span>
      </form>
      <div class="note-search-results" id="note-search-results"></div>
      ${isPdf
        ? `<iframe class="note-pdf-reader" src="${escapeHtml(note.content)}" title="${escapeHtml(note.name)}"></iframe>`
        : `<pre>${escapeHtml(note.content)}</pre>`}
      <div class="class-note-actions">
        <button type="button" data-download-note="${escapeHtml(note.id)}">Download ${isPdf ? 'PDF' : 'TXT'}</button>
        <button type="button" data-request-delete-note="${escapeHtml(note.id)}">Delete</button>
      </div>
    </article>`;
}

function highlightTextNote(note, query) {
  const reader = document.querySelector('.note-reader pre');
  if (!reader) return 0;
  reader.replaceChildren();
  if (!query) {
    reader.textContent = note.content;
    return 0;
  }

  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let cursor = 0;
  let matches = 0;
  for (const match of note.content.matchAll(expression)) {
    reader.append(document.createTextNode(note.content.slice(cursor, match.index)));
    const mark = document.createElement('mark');
    mark.textContent = match[0];
    reader.append(mark);
    cursor = match.index + match[0].length;
    matches += 1;
  }
  reader.append(document.createTextNode(note.content.slice(cursor)));
  reader.querySelector('mark')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return matches;
}

function pdfMatches(pages, query) {
  const needle = query.toLocaleLowerCase();
  return pages.flatMap(({ page, text }) => {
    const haystack = text.toLocaleLowerCase();
    const matches = [];
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      matches.push({ page, excerpt: text.slice(Math.max(0, index - 55), Math.min(text.length, index + query.length + 75)) });
      index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
    }
    return matches;
  });
}

function deleteNoteDialog(notes) {
  const note = notes.find((entry) => entry.id === pendingDeleteNoteId);
  if (!note) return '';

  return `
    <div class="confirm-screen" role="dialog" aria-modal="true" aria-labelledby="delete-note-title">
      <div class="confirm-card">
        <p class="eyebrow">Delete note</p>
        <h2 id="delete-note-title">Remove “${escapeHtml(note.name)}”?</h2>
        <p>This permanently removes the note from this device.</p>
        <div class="confirm-actions">
          <button class="secondary-action" id="cancel-note-delete" type="button">Keep note</button>
          <button class="danger-action" id="confirm-note-delete" type="button">Delete</button>
        </div>
      </div>
    </div>`;
}

function addNoteForm() {
  return `
    <form class="attach-note-form class-note-upload-form" id="class-note-upload-form">
      <label class="task-form-field">Note name
        <input name="name" placeholder="e.g. Midterm reviewer" required>
      </label>
      <label class="note-file-field" for="class-note-file">
        <span>TXT or PDF</span>
        <strong id="class-note-file-name">Choose a note file</strong>
      </label>
      <input class="visually-hidden" id="class-note-file" name="file" type="file" accept=".txt,.pdf,text/plain,application/pdf" required>
      <button class="primary-action" type="submit">Attach note</button>
      ${noteMessage ? `<p class="note-message" role="status">${escapeHtml(noteMessage)}</p>` : ''}
    </form>`;
}

function examSection(exams, now) {
  const list = exams.length
    ? `<div class="exam-list">${exams.map((exam) => {
        const days = daysUntil(exam.date, now);
        const timing = days < 0 ? `${Math.abs(days)} days ago` : days === 0 ? 'Today' : `In ${days} day${days === 1 ? '' : 's'}`;
        return `
          <article class="atlas-card exam-row">
            <span class="exam-date"><strong>${exam.date.slice(8, 10)}</strong><small>${new Date(`${exam.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</small></span>
            <span class="exam-copy"><strong>${escapeHtml(exam.title)}</strong><small>${timing}</small></span>
            <button type="button" data-delete-exam="${escapeHtml(exam.id)}">Delete</button>
          </article>`;
      }).join('')}</div>`
    : '<p class="empty-state">No tests or exams added for this class.</p>';

  return `
    ${list}
    <form class="add-exam-form" id="add-exam-form">
      <label class="task-form-field">Test / exam name
        <input name="title" placeholder="e.g. Midterm exam" required>
      </label>
      <label class="task-form-field">Date
        <input name="date" type="date" min="${dateInputValue()}" value="${dateInputValue()}" required>
      </label>
      <button class="primary-action" type="submit">Save test</button>
      ${examMessage ? `<p class="note-message" role="status">${escapeHtml(examMessage)}</p>` : ''}
    </form>`;
}

function classProfile(item, schedule) {
  if (editingClass) {
    return `
      <article class="class-profile-card class-profile-edit-card">
        <form class="class-profile-edit-form" id="class-profile-edit-form">
          <label class="task-form-field">Class code
            <input name="code" value="${escapeHtml(item.code)}" required>
          </label>
          <label class="task-form-field class-title-field">Subject name
            <input name="title" value="${escapeHtml(item.title)}" required>
          </label>
          <label class="task-form-field">Day
            <select name="day" required>${DAY_NAMES.map((day, index) => `<option value="${index}" ${item.day === index ? 'selected' : ''}>${day}</option>`).join('')}</select>
          </label>
          <label class="task-form-field">Starts
            <input name="start" type="time" value="${escapeHtml(item.start)}" required>
          </label>
          <label class="task-form-field">Ends
            <input name="end" type="time" value="${escapeHtml(item.end)}" required>
          </label>
          <label class="task-form-field">Room
            <input name="room" value="${escapeHtml(item.room)}" placeholder="Room not set">
          </label>
          <label class="task-form-field class-title-field">Instructor
            <input name="instructor" value="${escapeHtml(item.instructor)}" placeholder="Instructor not set">
          </label>
          <div class="class-profile-edit-actions">
            <button class="primary-action" type="submit">Save details</button>
            <button class="secondary-action" id="cancel-class-edit" type="button">Cancel</button>
          </div>
          ${classMessage ? `<p class="note-message class-title-field" role="status">${escapeHtml(classMessage)}</p>` : ''}
        </form>
      </article>`;
  }

  return `
    <article class="class-profile-card">
      <div class="class-profile-heading">
        <div>
          <p class="class-course">${escapeHtml(schedule.course || 'Course not set')}</p>
          <p class="class-code">${escapeHtml(item.code)}</p>
        </div>
        <button class="secondary-action class-edit-button" id="edit-class-details" type="button">Edit details</button>
      </div>
      <h1>${escapeHtml(item.title)}</h1>
      <div class="class-profile-grid">
        <div><span>Day</span><strong>${DAY_NAMES[item.day]}</strong></div>
        <div><span>Time</span><strong>${formatTime(item.start)} — ${formatTime(item.end)}</strong></div>
        <div><span>Room</span><strong>${escapeHtml(item.room) || 'Not set'}</strong></div>
        <div><span>Instructor</span><strong>${escapeHtml(item.instructor) || 'Not set'}</strong></div>
      </div>
    </article>`;
}

export default {
  render(state, now, context = {}) {
    let item = state.schedule.classes.find((entry) => entry.id === context.classId);
    const personalMatch = context.classId?.match(/^personal-day-([1-6])$/);
    if (!item && personalMatch && context.noteId) {
      item = { id: context.classId, code: 'Personal', title: `Plans for ${DAY_NAMES[Number(personalMatch[1])]}` };
    }
    if (!item) {
      return `
        <button class="secondary-action class-back" id="class-back" type="button">← Back to week</button>
        ${PathSection('Class unavailable', '<p class="empty-state">This class is not part of the active schedule.</p>')}`;
    }

    if (context.noteId) {
      const note = (state.notes || []).find((entry) => entry.id === context.noteId && entry.classId === item.id);
      return `${noteReader(item, note)}${deleteNoteDialog(state.notes || [])}`;
    }

    const tasks = sortTasks(state.tasks.filter((task) => task.classId === item.id));
    const notes = (state.notes || []).filter((note) => note.classId === item.id);
    const exams = (state.exams || []).filter((exam) => exam.classId === item.id);
    const overdue = tasks.filter((task) => !task.completed && daysUntil(task.dueDate, now) < 0);
    const upcoming = tasks.filter((task) => !task.completed && daysUntil(task.dueDate, now) >= 0);
    const past = tasks.filter((task) => task.completed);

    return `
      <header class="class-detail-header">
        <button class="secondary-action class-back" id="class-back" type="button">← Back to week</button>
        <p class="eyebrow">Class details</p>
      </header>
      ${classProfile(item, state.schedule)}
      ${actionMessage ? `<div class="product-feedback" role="status"><span>${escapeHtml(actionMessage)}</span><button type="button" id="class-feedback-dismiss">Dismiss</button></div>` : ''}
      ${masterDirectory(tasks, notes)}
      ${overdue.length ? PathSection('Needs attention', assignmentSection(overdue, now, ''), { active: true }) : ''}
      ${PathSection('Upcoming assignments', `${assignmentSection(upcoming, now, 'No upcoming assignments.')}${addTaskForm()}`)}
      ${PathSection('Class notes', `${noteSection(notes)}${addNoteForm()}`)}
      ${PathSection('Past assignments', assignmentSection(past, now, 'Completed assignments will appear here.'))}
      ${PathSection('Tests & exams', examSection(exams, now))}
      ${deleteNoteDialog(state.notes || [])}`;
  },

  bind(router, state, now, context = {}) {
    document.getElementById('class-feedback-dismiss')?.addEventListener('click', () => { actionMessage = ''; router.render(); });
    document.getElementById('class-back')?.addEventListener('click', () => router.go('schedule'));
    document.getElementById('note-back')?.addEventListener('click', () => router.go(context.classId?.startsWith('personal-day-') ? 'schedule' : `class/${encodeURIComponent(context.classId)}`));
    const openNote = context.noteId ? state.notes.find((note) => note.id === context.noteId) : null;
    const masterInput = document.getElementById('class-master-search');
    if (masterInput) {
      const classTasks = sortTasks(state.tasks.filter((task) => task.classId === context.classId));
      const classNotes = (state.notes || []).filter((note) => note.classId === context.classId);
      const results = document.getElementById('class-master-results');
      const status = document.getElementById('class-master-status');
      const renderMatches = () => {
        const query = masterInput.value.trim().toLocaleLowerCase();
        results.replaceChildren();
        if (!query) {
          status.textContent = `${classTasks.length} task${classTasks.length === 1 ? '' : 's'} · ${classNotes.length} note${classNotes.length === 1 ? '' : 's'}`;
          return;
        }
        const taskMatches = classTasks.filter((task) => `${task.title} ${task.description || ''}`.toLocaleLowerCase().includes(query));
        const noteMatches = classNotes.filter((note) => `${note.name} ${note.fileName || ''} ${note.mimeType === 'text/plain' ? note.content || '' : ''}`.toLocaleLowerCase().includes(query));
        status.textContent = `${taskMatches.length + noteMatches.length} result${taskMatches.length + noteMatches.length === 1 ? '' : 's'} found`;
        [...taskMatches.map((task) => ({ type: 'Task', title: task.title, meta: `${task.completed ? 'Completed' : 'Due'} · ${task.dueDate}`, id: task.id })), ...noteMatches.map((note) => ({ type: 'Note', title: note.name, meta: note.fileName || (note.mimeType === 'application/pdf' ? 'PDF note' : 'Text note'), id: note.id }))].forEach((match) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.masterType = match.type.toLowerCase();
          button.dataset.masterId = match.id;
          button.innerHTML = `<span>${escapeHtml(match.type)}</span><strong>${escapeHtml(match.title)}</strong><small>${escapeHtml(match.meta)}</small><i aria-hidden="true">→</i>`;
          results.append(button);
        });
        if (!results.children.length) results.innerHTML = '<p class="empty-state">No matching tasks or notes.</p>';
      };
      masterInput.addEventListener('input', renderMatches);
      results.addEventListener('click', (event) => {
        const button = event.target.closest('[data-master-type]');
        if (!button) return;
        if (button.dataset.masterType === 'note') router.go(`class/${encodeURIComponent(context.classId)}/note/${encodeURIComponent(button.dataset.masterId)}`);
        else {
          const row = [...document.querySelectorAll('[data-class-toggle-task]')].find((control) => control.dataset.classToggleTask === button.dataset.masterId)?.closest('.detail-assignment');
          row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row?.animate([{ backgroundColor: 'transparent' }, { backgroundColor: 'color-mix(in srgb, var(--primary-light) 18%, transparent)' }, { backgroundColor: 'transparent' }], { duration: 900 });
        }
      });
    }
    const noteSearchForm = document.getElementById('note-search-form');
    if (openNote && noteSearchForm) {
      const input = document.getElementById('note-search-input');
      const status = document.getElementById('note-search-status');
      const results = document.getElementById('note-search-results');
      const isPdf = openNote.mimeType === 'application/pdf';
      let pages = null;
      let pdfError = '';

      if (isPdf) {
        status.textContent = 'Preparing PDF text…';
        extractPdfPages(openNote.content).then((value) => {
          pages = value;
          status.textContent = `Ready to search ${pages.length} page${pages.length === 1 ? '' : 's'}.`;
        }).catch(() => {
          pdfError = 'PDF text could not be prepared. Check your connection, or use the PDF viewer search.';
          status.textContent = pdfError;
        });
      }

      noteSearchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = input.value.trim();
        results.replaceChildren();
        if (!query) {
          status.textContent = isPdf ? 'Enter a word or phrase to search this PDF.' : 'Enter a word or phrase to search this note.';
          if (!isPdf) highlightTextNote(openNote, '');
          return;
        }
        if (!isPdf) {
          const count = highlightTextNote(openNote, query);
          status.textContent = `${count} match${count === 1 ? '' : 'es'} found.`;
          return;
        }
        if (pdfError) {
          status.textContent = pdfError;
          return;
        }
        if (!pages) {
          status.textContent = 'PDF text is still being prepared. Try again in a moment.';
          return;
        }
        const matches = pdfMatches(pages, query);
        status.textContent = `${matches.length} match${matches.length === 1 ? '' : 'es'} found.`;
        matches.slice(0, 50).forEach((match) => {
          const button = document.createElement('button');
          button.type = 'button';
          const page = document.createElement('strong');
          page.textContent = `Page ${match.page}`;
          const excerpt = document.createElement('span');
          excerpt.textContent = match.excerpt;
          button.append(page, excerpt);
          button.addEventListener('click', () => {
            const frame = document.querySelector('.note-pdf-reader');
            if (frame) frame.src = `${openNote.content}#page=${match.page}`;
          });
          results.append(button);
        });
      });
    }
    document.getElementById('edit-class-details')?.addEventListener('click', () => {
      editingClass = true;
      classMessage = '';
      router.render();
    });
    document.getElementById('cancel-class-edit')?.addEventListener('click', () => {
      editingClass = false;
      classMessage = '';
      router.render();
    });
    document.getElementById('class-profile-edit-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const data = new FormData(event.currentTarget);
        const updated = {
          ...state.schedule,
          classes: state.schedule.classes.map((entry) => entry.id === context.classId ? {
            ...entry,
            code: data.get('code').trim(),
            title: data.get('title').trim(),
            day: Number(data.get('day')),
            start: data.get('start'),
            end: data.get('end'),
            room: data.get('room').trim(),
            instructor: data.get('instructor').trim(),
          } : entry),
        };
        editingClass = false;
        classMessage = '';
        Store.set({ schedule: saveImportedSchedule(updated), scheduleSource: 'Edited manually · saved on this device' });
      } catch (error) {
        classMessage = error.message;
        router.render();
      }
    });
    document.querySelectorAll('[data-open-note]').forEach((button) => {
      button.addEventListener('click', () => {
        router.go(`class/${encodeURIComponent(context.classId)}/note/${encodeURIComponent(button.dataset.openNote)}`);
      });
    });
    document.querySelectorAll('[data-class-toggle-task]').forEach((button) => {
      button.addEventListener('click', async () => {
        const task = state.tasks.find((entry) => entry.id === button.dataset.classToggleTask);
        await transitionTaskRow(button.closest('.detail-assignment'), !task?.completed);
        const tasks = state.tasks.map((task) => task.id === button.dataset.classToggleTask
          ? { ...task, completed: !task.completed }
          : task);
        const savedTasks = saveTasks(tasks);
        Store.set(withAutoSave(state, { tasks: savedTasks }));
      });
    });

    document.querySelectorAll('[data-edit-class-task]').forEach((button) => {
      button.addEventListener('click', () => {
        editingTaskId = button.dataset.editClassTask;
        router.render();
      });
    });

    document.getElementById('cancel-class-task-edit')?.addEventListener('click', () => {
      editingTaskId = '';
      router.render();
    });

    document.querySelector('[data-class-task-edit-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const id = event.currentTarget.dataset.classTaskEditForm;
      editingTaskId = '';
      Store.set({ tasks: saveTasks(state.tasks.map((task) => task.id === id ? {
        ...task,
        title: data.get('title'),
        description: data.get('description'),
        dueDate: data.get('dueDate'),
        dueTime: data.get('dueTime'),
      } : task)) });
    });

    document.getElementById('class-add-task-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const task = createTask({
        classId: context.classId,
        title: data.get('title'),
        description: data.get('description'),
        dueDate: data.get('dueDate'),
        dueTime: data.get('dueTime'),
      });
      const tasks = saveTasks([...state.tasks, task]);
      actionMessage = `“${task.title}” was added to this class.`;
      await transitionAddConfirmation(event.currentTarget);
      Store.set(withAutoSave(state, { tasks }));
    });

    document.getElementById('add-exam-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const data = new FormData(event.currentTarget);
        const exam = createExam({ classId: context.classId, title: data.get('title'), date: data.get('date') });
        examMessage = `${exam.title} was saved to this class.`;
        actionMessage = examMessage;
        Store.set({ exams: saveExams([...(state.exams || []), exam]) });
      } catch (error) {
        examMessage = error.message;
        router.render();
      }
    });

    document.querySelectorAll('[data-delete-exam]').forEach((button) => {
      button.addEventListener('click', async () => {
        await transitionStrikeRemoval(button.closest('.exam-row'));
        Store.set({ exams: saveExams((state.exams || []).filter((exam) => exam.id !== button.dataset.deleteExam)) });
      });
    });

    document.querySelectorAll('[data-request-delete-note]').forEach((button) => {
      button.addEventListener('click', () => {
        pendingDeleteNoteId = button.dataset.requestDeleteNote;
        router.render();
      });
    });

    document.getElementById('cancel-note-delete')?.addEventListener('click', async () => {
      await closeOverlay(document.querySelector('.confirm-screen'));
      pendingDeleteNoteId = '';
      router.render();
    });

    document.getElementById('confirm-note-delete')?.addEventListener('click', async () => {
      const noteId = pendingDeleteNoteId;
      await closeOverlay(document.querySelector('.confirm-screen'));
      document.querySelector('.confirm-screen')?.remove();
      const noteElement = document.querySelector(`[data-note-card="${CSS.escape(noteId)}"], [data-note-reader="${CSS.escape(noteId)}"]`);
      await transitionStrikeRemoval(noteElement);
      pendingDeleteNoteId = '';
      Store.set({ notes: saveNotes(state.notes.filter((note) => note.id !== noteId)) });
      if (context.noteId) router.go(context.classId?.startsWith('personal-day-') ? 'schedule' : `class/${encodeURIComponent(context.classId)}`);
    });

    document.querySelectorAll('[data-download-note]').forEach((button) => {
      button.addEventListener('click', () => {
        const note = state.notes.find((entry) => entry.id === button.dataset.downloadNote);
        if (!note) return;
        const isPdf = note.mimeType === 'application/pdf';
        const url = isPdf ? note.content : URL.createObjectURL(new Blob([note.content], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = note.fileName || `${note.name}.txt`;
        link.click();
        if (!isPdf) URL.revokeObjectURL(url);
      });
    });

    document.getElementById('class-note-file')?.addEventListener('change', (event) => {
      const fileName = document.getElementById('class-note-file-name');
      if (fileName) fileName.textContent = event.target.files[0]?.name || 'Choose a note file';
    });

    document.getElementById('class-note-upload-form')?.addEventListener('submit', async (event) => {
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
          classId: context.classId,
          name: data.get('name'),
          fileName: file.name,
          ...fileData,
        });
        noteMessage = `“${note.name}” is ready in Class notes.`;
        actionMessage = noteMessage;
        const notes = saveNotes([...state.notes, note]);
        await transitionAddConfirmation(event.currentTarget);
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
