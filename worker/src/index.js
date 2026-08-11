const MODEL = '@cf/google/gemma-4-26b-a4b-it';
const MAX_IMAGE_LENGTH = 10_000_000;
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
Use 24-hour HH:MM times. Keep every visible class. Put all meeting days for one identical class row in days.
Use empty strings for missing course, yearLevel, semester, or room. Never invent unreadable values.`;

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

function modelRequest(image, structured = true, attempt = 0) {
  const instructions = [
    'Read this class schedule screenshot and return the complete schedule JSON.',
    'Try again carefully. Return one valid JSON object only, with every readable recurring class row.',
    'Inspect the timetable row by row. Return the required JSON object even when some optional text is unreadable.',
  ];
  const request = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: instructions[attempt] || instructions[2] },
          { type: 'image_url', image_url: { url: image } },
        ],
      },
    ],
    temperature: 0,
    max_completion_tokens: 2400,
  };
  if (structured) request.response_format = { type: 'json_object' };
  return request;
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

      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const result = await env.AI.run(MODEL, modelRequest(image, attempt === 0, attempt));
          const schedule = normalizeSchedule(parseModelJson(responseValue(result)));
          return json({ schedule }, 200, corsOrigin);
        } catch (error) {
          lastError = error;
          const retryable = /empty answer|incomplete schedule data|could not find valid recurring class rows/i.test(error?.message || '');
          if (!retryable || attempt === 2) throw error;
        }
      }
      throw lastError;
    } catch (error) {
      console.error('Atlas vision scan failed.', error);
      return json({ error: error?.message || 'The AI scan could not finish.' }, 502, corsOrigin);
    }
  },
};
