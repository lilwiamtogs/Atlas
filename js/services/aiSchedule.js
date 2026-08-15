const AI_SCAN_URL = 'https://atlas-vision-api.lilwiamtogs.workers.dev/scan';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('Atlas could not prepare this image.')));
    reader.readAsDataURL(file);
  });
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function mergeAiRepair(currentDraft, aiDraft) {
  if (!currentDraft?.classes?.length) return aiDraft;
  const repaired = currentDraft.classes.map((item) => {
    if (!item.uncertainFields?.length) return item;
    const match = aiDraft.classes.find((candidate) => candidate.day === item.day && (
      candidate.start === item.start
      || candidate.code.replace(/\W/g, '') === item.code.replace(/\W/g, '')
      || candidate.title.toLowerCase().includes(item.title.toLowerCase().split(/\s+/)[0] || ' ')
    ));
    if (!match) return item;
    const next = { ...item };
    item.uncertainFields.forEach((field) => { if (match[field] !== undefined && match[field] !== '') next[field] = match[field]; });
    return { ...next, uncertainFields: [], repairedByAi: true };
  });
  return {
    ...currentDraft,
    course: currentDraft.course || aiDraft.course,
    yearLevel: currentDraft.yearLevel || aiDraft.yearLevel,
    semester: currentDraft.semester === 'Imported schedule' ? aiDraft.semester : currentDraft.semester,
    classes: repaired,
    warnings: repaired.some((item) => item.uncertainFields?.length) ? currentDraft.warnings : [],
  };
}

export async function scanScheduleWithAi(file, ocrText = '', options = {}) {
  const controller = new AbortController();
  // Workers AI can need more than 45 seconds for a large schedule image,
  // especially on a phone connection or when the model retries malformed JSON.
  const timeout = window.setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(AI_SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: await fileToDataUrl(file),
        text: String(ocrText || '').slice(0, 100_000),
        knownRows: options.currentDraft?.classes || [],
        uncertainOnly: Boolean(options.uncertainOnly),
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The free AI scan could not finish.');
    const schedule = data.schedule;
    const classes = (schedule?.rows || []).flatMap((row, rowIndex) => row.days.map((day) => ({
      id: `ai-${slug(row.code)}-${day}-${rowIndex}`,
      code: row.code,
      title: row.title,
      day,
      start: row.start,
      end: row.end,
      room: row.room,
      instructor: '',
    })));
    if (!classes.length) throw new Error('The free AI could not find schedule rows.');
    const aiDraft = {
      course: schedule.course || '',
      yearLevel: schedule.yearLevel || '',
      semester: schedule.semester || 'Imported schedule',
      classes,
      warnings: [],
      rawText: '',
      documentType: 'classes',
    };
    return options.uncertainOnly ? mergeAiRepair(options.currentDraft, aiDraft) : aiDraft;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The free AI scan took more than three minutes. Please try again on a stable connection.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
