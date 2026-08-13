import PathSection from '../components/pathSection.js';
import Store from '../store.js';
import { escapeHtml } from '../utils/html.js';
import { DAY_NAMES } from '../utils/time.js';
import { scanScheduleImage } from '../services/ocr.js?v=41';
import { scanScheduleWithAi } from '../services/aiSchedule.js?v=4';
import { parseScheduleText } from '../services/scheduleParser.js?v=46';
import {
  loadSchedule,
  removeImportedSchedule,
  saveImportedSchedule,
} from '../services/schedule.js';
import {
  archiveNameFor,
  createArchive,
  readArchiveFile,
  saveArchives,
} from '../services/scheduleArchives.js';
import { saveTasks } from '../services/tasks.js';
import { saveNotes } from '../services/notes.js?v=37';
import { saveExams } from '../services/exams.js';
import { disableAutoSave, withAutoSave } from '../services/autosave.js';
import { closeOverlay } from '../utils/animations.js?v=3';

let selectedFile = null;
let previewUrl = '';
let draft = null;
let scanning = false;
let aiOffered = false;
let scanStatus = 'Preparing OCR...';
let message = '';
let reviewIndex = 0;
let archiveDirectoryOpen = false;
let archiveMessage = '';
let pendingScheduleReplacement = null;
let imageSourcePickerOpen = false;

function currentScheduleIsSaved(state) {
  const current = JSON.stringify(state.schedule);
  return !state.schedule.classes.length || (state.archives || []).some((entry) => JSON.stringify(entry.schedule) === current);
}

function requestScheduleReplacement(state, router, action) {
  if (currentScheduleIsSaved(state)) {
    action();
    return;
  }
  pendingScheduleReplacement = action;
  router.render();
}

function replacementWarning() {
  if (!pendingScheduleReplacement) return '';
  return `
    <div class="confirm-screen" role="dialog" aria-modal="true" aria-labelledby="replace-schedule-title">
      <div class="confirm-card">
        <p class="eyebrow">Unsaved schedule</p>
        <h2 id="replace-schedule-title">Replace the current schedule?</h2>
        <p>This schedule is not in your Saved Schedules directory yet. Loading another one may permanently remove it.</p>
        <div class="confirm-actions">
          <button class="secondary-action" id="cancel-schedule-replacement" type="button">Keep current</button>
          <button class="danger-action" id="confirm-schedule-replacement" type="button">Replace anyway</button>
        </div>
      </div>
    </div>`;
}

function filePicker() {
  return `
    ${selectedFile ? '' : `
      <button class="upload-zone" id="open-image-source-picker" type="button">
        <span class="upload-ring" aria-hidden="true"></span>
        <strong>Choose image source</strong>
        <span>PNG, JPG, or a photo from your camera</span>
      </button>`}
    <input class="visually-hidden" id="schedule-image-library" type="file" accept=".png,.jpg,.jpeg,.webp">
    <input class="visually-hidden" id="schedule-image-camera" type="file" accept="image/*" capture="environment">
    ${previewUrl ? `<img class="schedule-preview" src="${escapeHtml(previewUrl)}" alt="Selected class schedule">` : ''}
    ${selectedFile ? `
      <div class="image-actions">
      <button class="primary-action" id="scan-schedule" type="button" ${scanning ? 'disabled' : ''}>
        ${scanning ? 'Scanning…' : 'Scan this image'}
      </button>
      ${aiOffered ? '<button class="secondary-action" id="scan-schedule-ai" type="button">Improve with free AI</button>' : ''}
      <button class="secondary-action change-image-action" id="change-schedule-image" type="button">Change image</button>
      </div>` : ''}
    ${scanning ? `
      <div class="scan-progress" aria-live="polite">
        <div class="progress-track"><span id="progress-fill"></span></div>
        <p id="scan-status">${escapeHtml(scanStatus)}</p>
      </div>` : ''}
    ${message ? `<p class="import-message" role="status">${escapeHtml(message)}</p>` : ''}`;
}

function imageSourcePicker() {
  if (!imageSourcePickerOpen) return '';
  return `
    <div class="image-source-screen" id="image-source-screen" role="dialog" aria-modal="true" aria-labelledby="image-source-title">
      <div class="image-source-card">
        <p class="eyebrow">Schedule image</p>
        <h2 id="image-source-title">Where is your image?</h2>
        <p>Choose an existing screenshot or take a new photo of your schedule.</p>
        <div class="image-source-actions">
          <label class="image-source-option" for="schedule-image-library">
            <span aria-hidden="true">▧</span>
            <strong>Photo library / Files</strong>
            <small>Choose an image already on this phone</small>
          </label>
          <label class="image-source-option" for="schedule-image-camera">
            <span aria-hidden="true">○</span>
            <strong>Take a photo</strong>
            <small>Open the camera</small>
          </label>
        </div>
        <button class="secondary-action" id="close-image-source-picker" type="button">Cancel</button>
      </div>
    </div>`;
}

function dayOptions(selected) {
  return DAY_NAMES.map((day, index) =>
    `<option value="${index}" ${index === selected ? 'selected' : ''}>${day}</option>`
  ).join('');
}

function reviewRow(item, index) {
  return `
    <article class="review-row review-card" data-review-row="${index}">
      <div class="review-row-heading">
        <span>Class ${index + 1}</span>
        ${draft.classes.length > 1 ? `<button class="remove-class" type="button" data-remove-class="${index}">Remove</button>` : ''}
      </div>
      <div class="review-grid">
        <label class="review-field code-field">Code
          <input data-field="code" data-index="${index}" value="${escapeHtml(item.code)}" required>
        </label>
        <label class="review-field day-field">Day
          <select data-field="day" data-index="${index}">${dayOptions(item.day)}</select>
        </label>
        <label class="review-field title-field">Subject
          <input data-field="title" data-index="${index}" value="${escapeHtml(item.title)}" required>
        </label>
        <label class="review-field">Starts
          <input type="time" data-field="start" data-index="${index}" value="${escapeHtml(item.start)}" required>
        </label>
        <label class="review-field">Ends
          <input type="time" data-field="end" data-index="${index}" value="${escapeHtml(item.end)}" required>
        </label>
        <label class="review-field">Room
          <input data-field="room" data-index="${index}" value="${escapeHtml(item.room)}">
        </label>
      </div>
    </article>`;
}

function reviewPanel() {
  if (!draft?.classes.length) return '';
  reviewIndex = Math.min(reviewIndex, draft.classes.length - 1);
  const item = draft.classes[reviewIndex];
  const progress = ((reviewIndex + 1) / draft.classes.length) * 100;
  const warnings = draft.warnings.length
    ? `<details class="ocr-warnings"><summary>${draft.warnings.length} line(s) need attention</summary><ul>${draft.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></details>`
    : '';

  return PathSection('Review before saving', `
    <form id="schedule-review-form">
      <div class="review-progress-heading">
        <p class="review-intro">Verify each class before using your schedule.</p>
        <span>${reviewIndex + 1} of ${draft.classes.length}</span>
      </div>
      <div class="review-progress-track" aria-hidden="true"><span style="width: ${progress}%"></span></div>
      ${warnings}
      <label class="review-field course-field">Course / program
        <input id="import-course" value="${escapeHtml(draft.course || '')}" placeholder="e.g. BS Computer Engineering" required>
      </label>
      <label class="review-field year-level-field">Year level
        <input id="import-year-level" value="${escapeHtml(draft.yearLevel || '')}" placeholder="e.g. Freshman Year" required>
      </label>
      <label class="review-field semester-field">Semester / term
        <input id="import-semester" value="${escapeHtml(draft.semester)}" placeholder="e.g. 1st Sem" required>
      </label>
      <div class="archive-name-preview"><span>Saved as</span><strong id="archive-name-preview">${escapeHtml(archiveNameFor(draft))}</strong></div>
      <div class="review-list">${reviewRow(item, reviewIndex)}</div>
      <div class="review-manual-actions">
        <button class="secondary-action" id="add-review-class" type="button">Add another class</button>
      </div>
      <div class="review-navigation">
        ${reviewIndex > 0 ? '<button class="secondary-action review-back" id="previous-class" type="button">Previous</button>' : '<span></span>'}
        ${reviewIndex < draft.classes.length - 1
          ? '<button class="primary-action review-next" id="verify-class" type="button">Verify & next</button>'
          : '<button class="primary-action save-schedule" type="submit">Use this schedule</button>'}
      </div>
    </form>`);
}

function savedSchedulesPanel(state) {
  const archives = state.archives || [];
  const directory = archives.length
    ? `<div class="schedule-archive-list">${archives.map((entry) => `
        <article class="schedule-archive-card">
          <div>
            <strong>${escapeHtml(entry.name)}</strong>
            <span>${escapeHtml(entry.schedule.course || 'Course not set')} · ${escapeHtml(entry.schedule.yearLevel || 'Year not set')} · ${escapeHtml(entry.schedule.semester || 'Semester not set')}</span>
          </div>
          <div class="schedule-archive-actions">
            <button type="button" data-load-archive="${escapeHtml(entry.id)}">Load</button>
            <button type="button" data-download-archive="${escapeHtml(entry.id)}">JSON</button>
            <button type="button" data-delete-archive="${escapeHtml(entry.id)}">Delete</button>
          </div>
        </article>`).join('')}</div>`
    : '<p class="empty-state">Saved semesters will appear here after you confirm a schedule.</p>';

  return PathSection('Saved schedules', `
    <div class="archive-control-grid ${state.autoSaveSettings?.enabled ? 'is-single' : ''}">
      ${state.autoSaveSettings?.enabled ? '' : `
        <button class="archive-control" id="save-current-schedule" type="button" ${state.schedule.classes.length ? '' : 'disabled'}>
          <span>Save</span><strong>Current schedule</strong>
        </button>`}
      <button class="archive-control" id="toggle-archive-directory" type="button" aria-expanded="${archiveDirectoryOpen}">
        <span>${archives.length} saved</span><strong>Schedule directory</strong>
      </button>
    </div>
    ${state.autoSaveSettings?.enabled ? '<p class="archive-message autosave-active-message">Autosave is keeping the current saved semester updated.</p>' : ''}
    ${archiveMessage ? `<p class="archive-message" role="status">${escapeHtml(archiveMessage)}</p>` : ''}
    ${archiveDirectoryOpen ? `
      <div class="archive-directory-panel">
        ${directory}
        <label class="secondary-action import-json-action" for="schedule-json">Import saved JSON</label>
        <input class="visually-hidden" id="schedule-json" type="file" accept="application/json,.json">
      </div>` : ''}
  `);
}

export default {
  render(state) {
    const imported = !['Not loaded', 'data/defaultSchedule.json'].includes(state.scheduleSource);
    return `
      <header class="page-header compact-header">
        <div>
          <button class="brand" id="atlas-brand" type="button" aria-label="Atlas">Atlas</button>
          <p class="course">${escapeHtml(state.schedule.course || 'Course not set')}</p>
          <p class="semester">Schedule tools</p>
        </div>
        <div class="view-title">
          <p class="eyebrow">Import</p>
          <h1>Scan your schedule</h1>
        </div>
      </header>
      ${PathSection('Image to schedule', `
        <p class="import-intro">Upload a clear screenshot or photo. Atlas reads it on this device, then lets you correct the result before anything is saved.</p>
        ${filePicker()}
        ${draft?.classes?.length ? '' : '<button class="secondary-action manual-class-start" id="add-class-manually" type="button">Add class manually</button>'}`)}
      ${reviewPanel()}
      ${savedSchedulesPanel(state)}
      ${imported ? PathSection('Current data', `
        <p class="import-intro">Update the details Atlas uses to name saved semester files.</p>
        <form class="saved-course-form" id="saved-course-form">
          <label class="review-field course-field">Course / program
            <input id="saved-course" value="${escapeHtml(state.schedule.course || '')}" placeholder="e.g. BS Computer Engineering" required>
          </label>
          <label class="review-field year-level-field">Year level
            <input id="saved-year-level" value="${escapeHtml(state.schedule.yearLevel || '')}" placeholder="e.g. Freshman Year" required>
          </label>
          <label class="review-field semester-field">Semester / term
            <input id="saved-semester" value="${escapeHtml(state.schedule.semester || '')}" placeholder="e.g. 1st Sem" required>
          </label>
          <button class="primary-action" type="submit">Save details</button>
        </form>
        <button class="secondary-action" id="restore-default-schedule" type="button">Restore default JSON schedule</button>`): ''}
      ${replacementWarning()}
      ${imageSourcePicker()}`;
  },

  bind(router, state) {
    const rememberReviewDetails = () => {
      if (!draft) return;
      draft.course = document.getElementById('import-course')?.value.trim() || draft.course || '';
      draft.yearLevel = document.getElementById('import-year-level')?.value.trim() || draft.yearLevel || '';
      draft.semester = document.getElementById('import-semester')?.value.trim() || draft.semester || 'Imported schedule';
    };
    const addManualClass = () => {
      rememberReviewDetails();
      if (!draft) {
        draft = {
          course: state.schedule.course || '',
          yearLevel: state.schedule.yearLevel || '',
          semester: state.schedule.semester || 'Imported schedule',
          classes: [],
          warnings: [],
          documentType: 'classes',
        };
      }
      draft.classes.push({ code: '', title: '', day: 1, start: '08:00', end: '09:00', room: '', instructor: '' });
      reviewIndex = draft.classes.length - 1;
      message = '';
      router.render();
    };
    document.getElementById('add-class-manually')?.addEventListener('click', addManualClass);
    document.getElementById('add-review-class')?.addEventListener('click', addManualClass);
    const openImageSourcePicker = () => {
      imageSourcePickerOpen = true;
      router.render();
    };
    document.getElementById('open-image-source-picker')?.addEventListener('click', openImageSourcePicker);
    document.getElementById('change-schedule-image')?.addEventListener('click', openImageSourcePicker);
    const closeImageSourcePicker = async () => {
      await closeOverlay(document.getElementById('image-source-screen'));
      imageSourcePickerOpen = false;
      router.render();
    };
    document.getElementById('close-image-source-picker')?.addEventListener('click', closeImageSourcePicker);
    document.getElementById('image-source-screen')?.addEventListener('click', async (event) => {
      if (event.target.id !== 'image-source-screen') return;
      await closeImageSourcePicker();
    });
    document.getElementById('cancel-schedule-replacement')?.addEventListener('click', async () => {
      await closeOverlay(document.querySelector('.confirm-screen'));
      pendingScheduleReplacement = null;
      router.render();
    });
    document.getElementById('confirm-schedule-replacement')?.addEventListener('click', async () => {
      const action = pendingScheduleReplacement;
      await closeOverlay(document.querySelector('.confirm-screen'));
      pendingScheduleReplacement = null;
      action?.();
    });
    const useScheduleImage = (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        message = 'Drop a PNG, JPG, or other image file.';
        router.render();
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      selectedFile = file;
      previewUrl = URL.createObjectURL(file);
      draft = null;
      aiOffered = false;
      message = '';
      imageSourcePickerOpen = false;
      router.render();
    };
    const handleScheduleImage = (event) => useScheduleImage(event.target.files?.[0]);
    document.getElementById('schedule-image-library')?.addEventListener('change', handleScheduleImage);
    document.getElementById('schedule-image-camera')?.addEventListener('change', handleScheduleImage);
    const uploadZone = document.getElementById('open-image-source-picker');
    uploadZone?.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      uploadZone.classList.add('is-dragging');
    });
    uploadZone?.addEventListener('dragleave', (event) => {
      if (event.relatedTarget && uploadZone.contains(event.relatedTarget)) return;
      uploadZone.classList.remove('is-dragging');
    });
    uploadZone?.addEventListener('drop', (event) => {
      event.preventDefault();
      uploadZone.classList.remove('is-dragging');
      useScheduleImage(event.dataTransfer.files?.[0]);
    });

    document.getElementById('scan-schedule')?.addEventListener('click', async () => {
      if (!selectedFile || scanning) return;
      scanning = true;
      scanStatus = 'Preparing private on-device scan...';
      message = '';
      router.render();

      try {
        const text = await scanScheduleImage(selectedFile, ({ status, progress = 0 }) => {
          const statusNode = document.getElementById('scan-status');
          const fill = document.getElementById('progress-fill');
          if (statusNode) statusNode.textContent = `${status || 'Scanning'}${progress ? ` · ${Math.round(progress * 100)}%` : ''}`;
          if (fill) fill.style.width = `${Math.max(4, progress * 100)}%`;
        });
        draft = parseScheduleText(text);
        reviewIndex = 0;
        aiOffered = draft.classes.length < 2 && draft.documentType !== 'exam';
        message = draft.classes.length >= 2
          ? ''
          : draft.classes.length === 1
            ? 'Atlas found only one class. You can review it or improve the scan with free AI.'
          : draft.documentType === 'exam'
            ? 'Atlas recognized an examination schedule, not a recurring class schedule. Exam-image importing is not supported yet.'
            : 'Atlas could not find schedule rows. Try the free AI scan or choose a clearer image.';
      } catch (error) {
        console.error('Schedule scan failed.', error);
        aiOffered = true;
        message = 'The private scan could not finish. You can try the free AI scan.';
      } finally {
        scanning = false;
        router.render();
      }
    });

    document.getElementById('scan-schedule-ai')?.addEventListener('click', async () => {
      if (!selectedFile || scanning) return;
      scanning = true;
      aiOffered = false;
      scanStatus = 'Sending this image to Atlas AI...';
      message = 'The free AI scan sends this schedule image to Cloudflare for processing.';
      router.render();
      try {
        draft = await scanScheduleWithAi(selectedFile, draft?.rawText || '');
        reviewIndex = 0;
        message = '';
      } catch (error) {
        console.error('Atlas AI scan failed.', error);
        aiOffered = true;
        message = error.message;
      } finally {
        scanning = false;
        router.render();
      }
    });

    document.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const item = draft.classes[Number(input.dataset.index)];
        item[input.dataset.field] = input.dataset.field === 'day' ? Number(input.value) : input.value;
      });
    });

    const updateArchivePreview = () => {
      const preview = document.getElementById('archive-name-preview');
      if (!preview) return;
      preview.textContent = archiveNameFor({
        course: document.getElementById('import-course').value,
        yearLevel: document.getElementById('import-year-level').value,
        semester: document.getElementById('import-semester').value,
      });
    };
    ['import-course', 'import-year-level', 'import-semester'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', updateArchivePreview);
    });

    document.querySelectorAll('[data-remove-class]').forEach((button) => {
      button.addEventListener('click', () => {
        draft.classes.splice(Number(button.dataset.removeClass), 1);
        reviewIndex = Math.min(reviewIndex, Math.max(0, draft.classes.length - 1));
        router.render();
      });
    });

    document.getElementById('previous-class')?.addEventListener('click', () => {
      rememberReviewDetails();
      reviewIndex = Math.max(0, reviewIndex - 1);
      router.render();
    });

    document.getElementById('verify-class')?.addEventListener('click', () => {
      const form = document.getElementById('schedule-review-form');
      if (!form.reportValidity()) return;
      rememberReviewDetails();
      reviewIndex = Math.min(draft.classes.length - 1, reviewIndex + 1);
      router.render();
    });

    document.getElementById('schedule-review-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      rememberReviewDetails();
      requestScheduleReplacement(state, router, () => { try {
        const classes = draft.classes.map((item, index) => ({
          ...item,
          id: `${item.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${item.day}-${index}`,
        }));
        const schedule = saveImportedSchedule({
          course: draft.course,
          yearLevel: draft.yearLevel,
          semester: draft.semester,
          classes,
        });
        const archive = createArchive(archiveNameFor(schedule), schedule);
        const archives = saveArchives([archive, ...(state.archives || [])]);
        draft = null;
        selectedFile = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        Store.set({
          schedule,
          archives,
          autoSaveSettings: disableAutoSave(state),
          scheduleSource: 'Imported image · saved on this device',
          scheduleError: '',
        });
        router.go('home');
      } catch (error) {
        message = error.message;
        router.render();
      } });
    });

    document.getElementById('restore-default-schedule')?.addEventListener('click', async () => {
      requestScheduleReplacement(state, router, async () => {
        removeImportedSchedule();
        const result = await loadSchedule();
        Store.set({ schedule: result.schedule, autoSaveSettings: disableAutoSave(state), scheduleSource: result.source, scheduleError: '' });
      });
    });

    document.getElementById('saved-course-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const schedule = saveImportedSchedule({
          ...state.schedule,
          course: document.getElementById('saved-course').value.trim(),
          yearLevel: document.getElementById('saved-year-level').value.trim(),
          semester: document.getElementById('saved-semester').value.trim(),
        });
        Store.set(withAutoSave(state, { schedule, scheduleSource: 'Imported image · saved on this device', scheduleError: '' }));
      } catch (error) {
        message = error.message;
        router.render();
      }
    });

    document.getElementById('save-current-schedule')?.addEventListener('click', () => {
      const { course, yearLevel, semester } = state.schedule;
      if (!course || !yearLevel || !semester) {
        archiveMessage = 'Complete Course, Year level, and Semester / term in Current data first.';
        router.render();
        return;
      }
      try {
        const archive = {
          ...createArchive(archiveNameFor(state.schedule), state.schedule),
          plannerData: { tasks: state.tasks, notes: state.notes, exams: state.exams || [] },
        };
        archiveDirectoryOpen = true;
        archiveMessage = `${archive.name} saved.`;
        Store.set({ archives: saveArchives([archive, ...(state.archives || [])]) });
      } catch (error) {
        archiveMessage = error.message;
        router.render();
      }
    });

    document.getElementById('toggle-archive-directory')?.addEventListener('click', async (event) => {
      if (!archiveDirectoryOpen) {
        archiveDirectoryOpen = true;
        router.render();
        return;
      }
      const panel = document.querySelector('.archive-directory-panel');
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      event.currentTarget.setAttribute('aria-expanded', 'false');
      if (panel && !reduceMotion && typeof panel.animate === 'function') {
        const height = panel.getBoundingClientRect().height;
        panel.style.overflow = 'hidden';
        try {
          await panel.animate([
            { height: `${height}px`, opacity: 1, transform: 'translateY(0)' },
            { height: '0px', opacity: 0, transform: 'translateY(-8px)' },
          ], { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)' }).finished;
        } catch {
          // A rerender can safely cancel this visual transition.
        }
      }
      archiveDirectoryOpen = false;
      router.render();
    });

    document.querySelectorAll('[data-load-archive]').forEach((button) => {
      button.addEventListener('click', () => {
        const archive = state.archives.find((entry) => entry.id === button.dataset.loadArchive);
        if (!archive) return;
        requestScheduleReplacement(state, router, () => {
          const schedule = saveImportedSchedule(archive.schedule);
          const plannerData = archive.plannerData || {};
          Store.set({
            schedule,
            autoSaveSettings: disableAutoSave(state),
            ...(archive.plannerData ? {
              tasks: saveTasks(plannerData.tasks || []),
              notes: saveNotes(plannerData.notes || []),
              exams: saveExams(plannerData.exams || []),
            } : {}),
            scheduleSource: `Saved schedule · ${archive.name}`,
            scheduleError: '',
          });
          router.go('home');
        });
      });
    });

    document.querySelectorAll('[data-delete-archive]').forEach((button) => {
      button.addEventListener('click', () => {
        Store.set({ archives: saveArchives(state.archives.filter((entry) => entry.id !== button.dataset.deleteArchive)) });
      });
    });

    document.querySelectorAll('[data-download-archive]').forEach((button) => {
      button.addEventListener('click', () => {
        const archive = state.archives.find((entry) => entry.id === button.dataset.downloadArchive);
        if (!archive) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${archive.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'atlas-schedule'}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
    });

    document.getElementById('schedule-json')?.addEventListener('change', async (event) => {
      const [file] = event.target.files;
      if (!file) return;
      try {
        const archive = readArchiveFile(JSON.parse(await file.text()), file.name);
        requestScheduleReplacement(state, router, () => {
          const archives = saveArchives([archive, ...(state.archives || [])]);
          const schedule = saveImportedSchedule(archive.schedule);
          const plannerData = archive.plannerData || {};
          message = '';
          Store.set({
            archives,
            schedule,
            autoSaveSettings: disableAutoSave(state),
            ...(archive.plannerData ? {
              tasks: saveTasks(plannerData.tasks || []),
              notes: saveNotes(plannerData.notes || []),
              exams: saveExams(plannerData.exams || []),
            } : {}),
            scheduleSource: `Imported JSON · ${archive.name}`,
            scheduleError: '',
          });
        });
      } catch (error) {
        message = `Could not import that JSON: ${error.message}`;
        router.render();
      }
    });
  },
};
