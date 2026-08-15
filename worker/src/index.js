const PARSER_MODELS = [
  { id: '@cf/meta/llama-3.1-8b-instruct-fast', structured: true },
  { id: '@cf/google/gemma-4-26b-a4b-it', structured: false },
];
const MAX_IMAGE_LENGTH = 10_000_000;
const MAX_TEXT_LENGTH = 100_000;
const ALLOWED_ORIGINS = new Set([
  'https://lilwiamtogs.github.io',
]);

function allowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return origin;
  if (origin === 'null') return 'null';
  return '';
}

const SYSTEM_PROMPT = `You extract recurring college class schedules from screenshots.
Return only JSON with this exact shape:
{
  "course": "string",
  "yearLevel": "string",
  "semester": "string",
  "rows": [
    {
      "code": "string",
      "title": "string",
      "days": [0],
      "start": "HH:MM",
      "end": "HH:MM",
      "room": "string"
    }
  ]
}
Day numbers are Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6.
Use 24-hour HH:MM times: 12 AM is 00:00, 12 PM is 12:00, and 1 PM through 11 PM must have 12 added (for example 1:00 PM is 13:00). Keep every visible class. Put all meeting days for one identical class row in days.
Use empty strings for missing course, yearLevel, semester, or room. Never invent unreadable values.
Every returned value must be supported by the transcription. If it has no clear recurring class rows, return an empty rows array.`;

const SCHEDULE_SCHEMA = {
  type: 'object',
  properties: {
    course: { type: 'string' },
    yearLevel: { type: 'string' },
    semester: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          title: { type: 'string' },
          days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
          start: { type: 'string' },
          end: { type: 'string' },
          room: { type: 'string' },
        },
        required: ['code', 'title', 'days', 'start', 'end', 'room'],
      },
    },
  },
  required: ['course', 'yearLevel', 'semester', 'rows'],
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(origin),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function responseValue(result) {
  const content = result?.choices?.[0]?.message?.content
    ?? result?.response
    ?? result?.result?.response
    ?? result?.result
    ?? result?.answer
    ?? result?.output_text
    ?? '';
  if (content && typeof content === 'object' && !Array.isArray(content)) return content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || part?.content || '').join('');
  return '';
}

function parseModelJson(value) {
  if (value && typeof value === 'object') return value;

  const cleaned = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!cleaned) throw new Error('Atlas AI returned an empty answer.');

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('Atlas AI returned incomplete schedule data.');
  }

  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch {
    throw new Error('Atlas AI returned incomplete schedule data.');
  }
}

function parserRequest(transcript, structured, repairContext = '') {
  const request = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Convert this timetable transcription into the required schedule JSON. Preserve every row.${repairContext}\n\n${transcript}` },
    ],
    temperature: 0,
    max_completion_tokens: 2400,
  };
  if (structured) {
    request.response_format = {
      type: 'json_schema',
      json_schema: SCHEDULE_SCHEMA,
    };
  }
  return request;
}

function imageFile(image) {
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/is);
  if (!match) throw new Error('Use a PNG, JPEG, or WebP image.');
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
  return { name: `schedule.${extension}`, blob: new Blob([bytes], { type: match[1] }) };
}

async function transcribeSchedule(env, image) {
  const result = await env.AI.toMarkdown(imageFile(image), {
    conversionOptions: { output: { format: 'text' } },
  });
  if (result?.format === 'error') throw new Error(result.error || 'Atlas AI could not read the image.');
  const transcript = String(result?.data || '').trim();
  if (!transcript) throw new Error('Atlas AI could not read any text from the image.');
  return transcript;
}

async function scheduleFromTranscript(env, transcript, repairContext = '') {
  let lastError;
  for (const model of PARSER_MODELS) {
    try {
      const result = await env.AI.run(model.id, parserRequest(transcript, model.structured, repairContext));
      return normalizeSchedule(parseModelJson(responseValue(result)));
    } catch (error) {
      lastError = error;
      console.warn(`Atlas schedule parser failed with ${model.id}.`, error?.message || error);
    }
  }
  throw lastError;
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeSchedule(value) {
  const rows = Array.isArray(value?.rows) ? value.rows : [];
  const normalizedRows = rows.map((row) => ({
    code: String(row?.code || '').trim().toUpperCase(),
    title: String(row?.title || '').trim(),
    days: [...new Set((Array.isArray(row?.days) ? row.days : [])
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))],
    start: String(row?.start || ''),
    end: String(row?.end || ''),
    room: String(row?.room || '').trim(),
  })).filter((row) => row.code && row.title && row.days.length
    && validTime(row.start) && validTime(row.end) && row.start < row.end);

  if (!normalizedRows.length) throw new Error('The AI could not find valid recurring class rows.');
  return {
    course: String(value?.course || '').trim(),
    yearLevel: String(value?.yearLevel || '').trim(),
    semester: String(value?.semester || '').trim() || 'Imported schedule',
    rows: normalizedRows,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigin(origin);
    if (origin && !corsOrigin) {
      return json({ error: 'This website is not allowed to use Atlas AI.' }, 403, 'null');
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'Atlas Vision API' }, 200, corsOrigin || '*');
    }
    if (request.method !== 'POST' || url.pathname !== '/scan') {
      return json({ error: 'Not found.' }, 404, corsOrigin);
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return json({ error: 'Send the schedule as JSON.' }, 415, corsOrigin);
    }

    try {
      const body = await request.json();
      const image = typeof body?.image === 'string' ? body.image : '';
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(image)) {
        return json({ error: 'Use a PNG, JPEG, or WebP image.' }, 400, corsOrigin);
      }
      if (image.length > MAX_IMAGE_LENGTH) {
        return json({ error: 'The image is too large. Choose an image under 7 MB.' }, 413, corsOrigin);
      }

      const suppliedText = typeof body?.text === 'string'
        ? body.text.slice(0, MAX_TEXT_LENGTH).trim()
        : '';
      const transcript = suppliedText.length >= 20
        ? suppliedText
        : await transcribeSchedule(env, image);
      const knownRows = Array.isArray(body?.knownRows) ? body.knownRows.slice(0, 100) : [];
      const repairContext = body?.uncertainOnly && knownRows.length
        ? ` Focus on correcting only fields marked uncertain in these locally detected rows; return matching corrected rows and do not invent replacements for confident fields:\n${JSON.stringify(knownRows).slice(0, 20_000)}`
        : '';
      const schedule = await scheduleFromTranscript(env, transcript, repairContext);
      return json({ schedule }, 200, corsOrigin);
    } catch (error) {
      console.error('Atlas vision scan failed.', error);
      return json({ error: error?.message || 'The AI scan could not finish.' }, 502, corsOrigin);
    }
  },
};
