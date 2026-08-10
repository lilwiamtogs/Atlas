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

export async function scanScheduleWithAi(file) {
  const controller = new AbortController();
  // Workers AI can need more than 45 seconds for a large schedule image,
  // especially on a phone connection or when the model retries malformed JSON.
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(AI_SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: await fileToDataUrl(file) }),
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
    return {
      course: schedule.course || '',
      yearLevel: schedule.yearLevel || '',
      semester: schedule.semester || 'Imported schedule',
      classes,
      warnings: [],
      rawText: '',
      documentType: 'classes',
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The free AI scan took more than two minutes. Please try again on a stable connection.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
