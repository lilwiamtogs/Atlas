import { escapeHtml } from '../utils/html.js';
import { daysUntil, urgencyFor } from '../services/tasks.js';

function formatDueTime(value) {
  if (!value) return '';
  return new Date(`2000-01-01T${value}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function remainingLabel(dueDate, now) {
  const days = daysUntil(dueDate, now);
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day remaining';
  return `${days} days remaining`;
}

function weekLabel(dueDate, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(`${dueDate}T00:00:00`);
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  const week = Math.floor((due - weekStart) / 604800000);
  if (week < 0) return 'Earlier plan';
  if (week === 0) return 'This week';
  if (week === 1) return 'Next week';
  return `In ${week} weeks`;
}

function editTask(task, showDueDate) {
  return `
    <form class="task-edit-form" data-task-edit-form="${escapeHtml(task.id)}">
      <label>Task
        <input name="title" value="${escapeHtml(task.title)}" required>
      </label>
      <label>Description
        <textarea name="description" maxlength="500" placeholder="What needs to be done?">${escapeHtml(task.description || '')}</textarea>
      </label>
      ${showDueDate ? `<label>Due date
        <input name="dueDate" type="date" value="${escapeHtml(task.dueDate)}" required>
      </label>` : ''}
      <label>Due time
        <input name="dueTime" type="time" value="${escapeHtml(task.dueTime || '23:59')}" required>
      </label>
      <div class="task-edit-actions">
        <button type="submit">Save</button>
        <button type="button" data-cancel-task>Edit later</button>
      </div>
    </form>`;
}

function taskRow(task, now, editingTaskId, showDueDate) {
  if (task.id === editingTaskId) return editTask(task, showDueDate);
  const urgency = urgencyFor(task, now);
  const timing = showDueDate
    ? `${remainingLabel(task.dueDate, now)} · ${escapeHtml(task.dueDate)}${task.dueTime ? ` · ${escapeHtml(formatDueTime(task.dueTime))}` : ''}`
    : `${weekLabel(task.dueDate, now)}${task.dueTime ? ` · ${escapeHtml(formatDueTime(task.dueTime))}` : ''}`;

  return `
    <article class="atlas-card task-row is-${urgency}">
      <button class="task-check" type="button" data-toggle-task="${escapeHtml(task.id)}" aria-label="${task.completed ? 'Mark incomplete' : 'Complete task'}" aria-pressed="${task.completed}">
        <span aria-hidden="true">${task.completed ? '✓' : ''}</span>
      </button>
      <div class="task-copy">
        <strong>${escapeHtml(task.title)}</strong>
        ${task.description ? `<small class="task-description">${escapeHtml(task.description)}</small>` : ''}
        <span>${timing}</span>
      </div>
      <div class="task-actions">
        <button type="button" data-edit-task="${escapeHtml(task.id)}">Edit</button>
        <button type="button" data-delete-task="${escapeHtml(task.id)}">Delete</button>
      </div>
    </article>`;
}

export default function TaskList(tasks, now, editingTaskId = '', { showDueDate = true } = {}) {
  return `
    <section class="class-tasks" aria-label="Tasks">
      <div class="class-tasks-heading">
        <span>Tasks</span>
        <span>${tasks.length}</span>
      </div>
      ${tasks.length
        ? `<div class="task-list">${tasks.map((task) => taskRow(task, now, editingTaskId, showDueDate)).join('')}</div>`
        : '<p class="no-class-tasks">No tasks for this class.</p>'}
    </section>`;
}
