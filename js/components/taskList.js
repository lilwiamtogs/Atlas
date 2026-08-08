import { escapeHtml } from '../utils/html.js';
import { daysUntil, urgencyFor } from '../services/tasks.js';

function remainingLabel(dueDate, now) {
  const days = daysUntil(dueDate, now);
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day remaining';
  return `${days} days remaining`;
}

function editTask(task) {
  return `
    <form class="task-edit-form" data-task-edit-form="${escapeHtml(task.id)}">
      <label>Task
        <input name="title" value="${escapeHtml(task.title)}" required>
      </label>
      <label>Due date
        <input name="dueDate" type="date" value="${escapeHtml(task.dueDate)}" required>
      </label>
      <div class="task-edit-actions">
        <button type="submit">Save</button>
        <button type="button" data-cancel-task>Edit later</button>
      </div>
    </form>`;
}

function taskRow(task, now, editingTaskId) {
  if (task.id === editingTaskId) return editTask(task);
  const urgency = urgencyFor(task, now);

  return `
    <article class="task-row is-${urgency}">
      <button class="task-check" type="button" data-toggle-task="${escapeHtml(task.id)}" aria-label="${task.completed ? 'Mark incomplete' : 'Complete task'}" aria-pressed="${task.completed}">
        <span aria-hidden="true">${task.completed ? '✓' : ''}</span>
      </button>
      <div class="task-copy">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${remainingLabel(task.dueDate, now)} · ${escapeHtml(task.dueDate)}</span>
      </div>
      <div class="task-actions">
        <button type="button" data-edit-task="${escapeHtml(task.id)}">Edit</button>
        <button type="button" data-delete-task="${escapeHtml(task.id)}">Delete</button>
      </div>
    </article>`;
}

export default function TaskList(tasks, now, editingTaskId = '') {
  return `
    <section class="class-tasks" aria-label="Tasks">
      <div class="class-tasks-heading">
        <span>Tasks</span>
        <span>${tasks.length}</span>
      </div>
      ${tasks.length
        ? `<div class="task-list">${tasks.map((task) => taskRow(task, now, editingTaskId)).join('')}</div>`
        : '<p class="no-class-tasks">No tasks for this class.</p>'}
    </section>`;
}
