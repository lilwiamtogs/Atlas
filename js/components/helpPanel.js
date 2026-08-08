const helpTopics = [
  { title: 'Import a schedule', body: 'Open Import, choose a clear screenshot, then review each detected class before saving.', route: 'import', target: '#open-image-source-picker, #scan-schedule, .route-import .path-section:first-of-type', action: 'Take me there' },
  { title: 'Fix a class Atlas read incorrectly', body: 'On Import, edit the detected code, title, days, time, and room before accepting the class.', route: 'import', target: '.review-card, #open-image-source-picker, .route-import .path-section:first-of-type', action: 'Take me there' },
  { title: 'Add a task', body: 'Open Week and use Add Task. Choose a class or Personal Day, set the due date, then save it.', route: 'schedule', target: '#add-task-form', action: 'Take me there' },
  { title: 'Add or read notes', body: 'Open Week and use Add Note, or open a class card to revisit notes already attached to it.', route: 'schedule', target: '#attach-note-form', action: 'Take me there' },
  { title: 'Add a test or exam', body: 'On Now, enter its name, class, and date under Tests & Exams, then choose Add Test.', route: 'home', target: '#home-add-exam-form', action: 'Take me there' },
  { title: 'Edit a class', body: 'Open Week, expand a class card, then open its full class page to update the class details.', route: 'schedule', target: '.class-card[data-class-id]', action: 'Take me there' },
  { title: 'Reminders and autosave', body: 'Open Settings to enable reminders or keep a completed semester archive updated automatically.', settings: true, target: '.settings-notifications', action: 'Take me there' },
];

export default function HelpPanel() {
  return `
    <div class="help-screen" id="help-screen">
      <section class="help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header class="settings-header">
          <div><p class="eyebrow">Atlas guide</p><h2 id="help-title">How do I…?</h2></div>
          <button class="settings-close" id="close-help" type="button" aria-label="Close help">×</button>
        </header>
        <p class="help-intro">Choose what you want to do. Atlas will explain it and take you to the right place.</p>
        <div class="help-topic-list">
          ${helpTopics.map((topic, index) => `
            <article class="help-topic">
              <button class="help-topic-summary" type="button" aria-expanded="false">
                <span>${topic.title}</span><i aria-hidden="true">+</i>
              </button>
              <div class="help-topic-content"><div><p>${topic.body}</p><button class="secondary-action" type="button" data-help-action="${index}">${topic.action} →</button></div></div>
            </article>`).join('')}
        </div>
        <button class="help-replay" id="replay-tutorial" type="button">Replay the introduction</button>
      </section>
    </div>`;
}

export { helpTopics };
