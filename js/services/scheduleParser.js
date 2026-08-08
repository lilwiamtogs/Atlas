const TIME_PATTERN = /(?<!\d)(\d{1,2}[:.]\d{2}\s*(?:a\.?m\.?|p\.?m\.?|nn)?)(?!\d)/gi;
const DAY_WORDS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };

function to24Hour(value) {
  const compact = value.toLowerCase().replace(/[.\s]/g, '');
  const match = compact.match(/^(\d{1,2}):?(\d{2})(am|pm|nn)?$/);
  if (!match) return '';
  const minutes = match[2] || '00';
  if (!match[3]) {
    const hours = Number(match[1]);
    return hours <= 23 && Number(minutes) <= 59 ? `${String(hours).padStart(2, '0')}:${minutes}` : '';
  }
  if (match[3] === 'nn') return `12:${minutes}`;
  let hours = Number(match[1]) % 12;
  if (match[3] === 'pm') hours += 12;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function resolvedTimeRange(matches) {
  let start = to24Hour(matches[0][0]);
  const end = to24Hour(matches[1][0]);
  const startHasMeridiem = /(?:a\.?m\.?|p\.?m\.?|nn)/i.test(matches[0][0]);
  const endIsPm = /p\.?m\.?/i.test(matches[1][0]);
  if (!startHasMeridiem && endIsPm && start && end) {
    const startHour = Number(start.slice(0, 2));
    const endRawHour = Number(matches[1][0].match(/\d{1,2}/)?.[0] || 0);
    if (startHour > 0 && startHour <= endRawHour && startHour < 12) start = `${String(startHour + 12).padStart(2, '0')}:${start.slice(3)}`;
  }
  return { start, end };
}

function parseDays(value) {
  let token = value.toUpperCase().replace(/[^A-Z]/g, '');
  const named = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const days = [];
  const add = (day) => { if (!days.includes(day)) days.push(day); };

  while (token.length) {
    const pair = token.slice(0, 2);
    if (named[pair] !== undefined) {
      add(named[pair]);
      token = token.slice(2);
      continue;
    }
    const day = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 }[token[0]];
    if (day !== undefined) add(day);
    token = token.slice(1);
  }
  return days;
}

function cleanRoom(value) {
  return value.trim().replace(/^[\$§](?=\d)/, 'S').replace(/\s+/g, ' ');
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseSemester(text) {
  const match = text.match(/\bSY\s+([^\n]+?(?:semester|trimester))/i);
  return match ? match[0].replace(/\s+/g, ' ').trim() : 'Imported schedule';
}

function parseCourse(text) {
  const section = text.match(/\bcourse\s*\/\s*year\s*(?:&|and)\s*section\s*:\s*([^\n]+)/i);
  if (section) return section[1].replace(/\s+/g, ' ').trim();
  const labeled = text.match(/\b(?:course|program|degree)\s*[:\-]\s*([^\n]+)/i);
  if (labeled) return labeled[1].replace(/\s+/g, ' ').trim();
  const scheduleFor = text.match(/class\s+schedule\s+for\s*:\s*([^\n]+)/i);
  const candidate = scheduleFor?.[1]?.replace(/\s+/g, ' ').trim() || '';
  return /^SY\b/i.test(candidate) ? '' : candidate;
}

function dayWord(line) {
  const match = line.match(/\b(sunday|sun|monday|mon|tuesday|tues?|wednesday|wed|thursday|thurs?|friday|fri|saturday|sat)\b/i);
  return match ? DAY_WORDS[match[1].toLowerCase()] : null;
}

function findDayToken(value) {
  const matches = [...value.matchAll(/\b((?:(?:Su|Mo|Tu|We|Th|Fr|Sa)){1,5}|MWF|TTH|MW|MF|WF|TR|M|T|W|R|F|S)\b/gi)];
  const match = matches.at(-1);
  return match ? { text: match[0], index: match.index, days: parseDays(match[0]) } : null;
}

function extractRoom(value) {
  const cleaned = value.replace(/\b(?:JUL|AUG|SEP|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAY|JUN)\b.*$/i, '').trim();
  const match = cleaned.match(/((?:Q|S|P|R)-?\d{3,4}|(?:AVR\s+BLDG|PE\s+CENTER|GYM|LAB)[A-Z0-9 .-]*)\s*$/i);
  if (!match) return { room: '', remainder: cleaned };
  return { room: cleanRoom(match[1]), remainder: cleaned.slice(0, match.index).trim() };
}

function generatedCode(title) {
  const words = title.match(/[A-Za-z0-9]+/g) || ['CLASS'];
  const number = words.find((word) => /^\d+$/.test(word)) || '';
  return `${words.filter((word) => !/^\d+$/.test(word)).slice(0, 4).map((word) => word[0]).join('').toUpperCase()}${number}` || 'CLASS';
}

function cleanTableTitle(value) {
  return value
    .replace(/\s+[A-Z]{3,}\d+[A-Z0-9-]*\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOriginalFormat(line, lineIndex, matches) {
  const [startMatch, endMatch] = matches;
  const before = line.slice(0, startMatch.index).trim();
  const after = line.slice(endMatch.index + endMatch[0].length).trim();
  const rowMatch = before.match(/^(\d{3,})\s+([A-Z]{2,}\s*\d+\s*-\s*\d+)\s+(.+)$/i);
  if (!rowMatch) return null;
  const [, classNumber, , subjectCell] = rowMatch;
  const subjectParts = subjectCell.split(/\s+[-–—]\s+/, 2);
  const rawCode = subjectParts[0] || '';
  const code = rawCode.replace(/[^a-z0-9-]/gi, '');
  const title = subjectParts[1]?.trim() || rawCode.trim();
  const suffixParts = after.split(/\s+/);
  const days = parseDays(suffixParts.shift() || '');
  const room = cleanRoom(suffixParts.join(' '));
  if (!code || !title || !days.length) return { warning: `Line ${lineIndex + 1}: some schedule fields could not be understood.` };
  return { code, title, days, room, classKey: classNumber };
}

function parseFlexibleFormat(line, currentDay, matches) {
  const [startMatch, endMatch] = matches;
  const beforeTime = line.slice(0, startMatch.index).trim().replace(/^[-:]+|[-:]+$/g, '').trim();
  const afterTime = line.slice(endMatch.index + endMatch[0].length).replace(/^\s*[-–—]\s*/, '').trim();
  const explicitDay = findDayToken(beforeTime);
  const days = explicitDay?.days?.length ? explicitDay.days : currentDay === null ? [] : [currentDay];
  if (!days.length) return null;

  const courseMatch = beforeTime.match(/^([A-Z]{2,4}\s*\d{2,3})\b/i);
  if (courseMatch) {
    const withoutCode = beforeTime.slice(courseMatch[0].length).trim();
    const day = findDayToken(withoutCode);
    const metadataFree = day ? withoutCode.slice(0, day.index).trim() : withoutCode;
    const title = cleanTableTitle(metadataFree);
    const { room } = extractRoom(afterTime);
    return title ? { code: courseMatch[1].replace(/\s+/g, ' ').toUpperCase(), title, days, room, classKey: courseMatch[1] } : null;
  }

  const { room, remainder } = extractRoom(afterTime);
  const title = remainder.replace(/^[-–—\s]+/, '').trim();
  if (!title || /^(time|subject|room)$/i.test(title)) return null;
  return { code: generatedCode(title), title, days, room, classKey: title };
}

function parseRegistrarTableRow(line, matches) {
  const [startMatch, endMatch] = matches;
  if (line.slice(0, startMatch.index).trim()) return null;
  const afterTime = line.slice(endMatch.index + endMatch[0].length)
    .replace(/^\s*[-â€“â€”|:]\s*/, '')
    .trim();
  const dayMatch = afterTime.match(/^(MWF|TTH|MW|MF|WF|TR|TH|M|T|W|R|F|S)\b/i);
  if (!dayMatch) return null;
  const days = parseDays(dayMatch[1]);
  const row = afterTime.slice(dayMatch[0].length).trim();
  const units = row.match(/\s+\d+\s*\/\s*\d+\s+/);
  if (!units || !days.length) return null;

  const subject = row.slice(0, units.index).trim();
  const subjectMatch = subject.match(/^([A-Z]{2,10}(?:\s+(?:\d{1,3}[A-Z]?|[A-Z]{1,3}))?)\s+(.+)$/i);
  if (!subjectMatch) return null;
  const code = subjectMatch[1].replace(/\s+/g, ' ').toUpperCase();
  const title = subjectMatch[2].replace(/\s+/g, ' ').trim();
  const metadata = row.slice(units.index + units[0].length).trim();
  const room = cleanRoom(metadata.match(/^\S+/)?.[0] || '');
  if (!title) return null;
  return { code, title, days, room, classKey: code };
}

function parseCourseListRow(line, matches) {
  const [startMatch] = matches;
  const beforeTime = line.slice(0, startMatch.index).trim();
  if (!beforeTime) return null;
  const dayMatch = beforeTime.match(/(MWF|TTH|MW|MF|WF|TR|TH|(?:[MTWRFS](?:\s*[\/,&]\s*[MTWRFS])+)|M|T|W|R|F|S)\s*$/i);
  if (!dayMatch) return null;
  const days = parseDays(dayMatch[1]);
  const subject = beforeTime.slice(0, dayMatch.index).replace(/^\d+\s+/, '').trim();
  const codeMatch = subject.match(/^([A-Z]{2,12}\d*[A-Z0-9-]*)\b\s*(.*)$/i);
  if (!codeMatch || !days.length) return null;
  const code = codeMatch[1].toUpperCase();
  let title = codeMatch[2].trim();
  if (/^(?:[A-Z]{2,}\d+\s+)?\d+(?:\.\d+)?$/i.test(title)) title = '';
  title = title.replace(/^\d+(?:\.\d+)?\s+/, '').trim() || code;
  const afterTime = line.slice(matches[1].index + matches[1][0].length).replace(/^\s*[-â€“â€”|:]\s*/, '').trim();
  const room = cleanRoom(afterTime.match(/^[A-Z0-9-]+/i)?.[0] || '');
  return { code, title, days, room, classKey: code };
}

function parseLine(line, lineIndex, currentDay) {
  const matches = [...line.matchAll(TIME_PATTERN)];
  if (matches.length < 2) return null;
  const parsed = parseRegistrarTableRow(line, matches)
    || parseCourseListRow(line, matches)
    || parseOriginalFormat(line, lineIndex, matches)
    || parseFlexibleFormat(line, currentDay, matches);
  if (!parsed) return { warning: `Line ${lineIndex + 1}: schedule columns were not recognized.` };
  const { start, end } = resolvedTimeRange(matches);
  if (!start || !end || start >= end) return { warning: `Line ${lineIndex + 1}: time range was not understood.` };
  return {
    classes: parsed.days.map((day) => ({
      id: `${slug(parsed.classKey)}-${day}-${slug(start)}`,
      code: parsed.code,
      title: parsed.title,
      day,
      start,
      end,
      room: parsed.room,
      instructor: '',
    })),
  };
}

function groupWordsIntoLines(words, tolerance) {
  const lines = [];
  [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0).forEach((word) => {
    const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
    let line = lines.find((candidate) => Math.abs(candidate.centerY - centerY) <= tolerance);
    if (!line) {
      line = { centerY, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.centerY = line.words.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / line.words.length;
  });
  return lines.map((line) => ({
    ...line,
    words: line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0),
    text: line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((word) => word.text).join(' '),
    centerX: line.words.reduce((sum, word) => sum + (word.bbox.x0 + word.bbox.x1) / 2, 0) / line.words.length,
  }));
}

function minutesToTime(minutes) {
  const normalized = Math.max(0, Math.min(1439, minutes));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function parseGridLayout(layout) {
  if (!layout?.words?.length || !layout.width || !layout.height) return [];
  const headerDays = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, THUR: 4, FRI: 5, SAT: 6 };
  const headers = layout.words
    .map((word) => ({ ...word, token: word.text.toUpperCase().replace(/[^A-Z]/g, '') }))
    .filter((word) => headerDays[word.token] !== undefined)
    .map((word) => ({ day: headerDays[word.token], x: (word.bbox.x0 + word.bbox.x1) / 2, y: (word.bbox.y0 + word.bbox.y1) / 2 }))
    .sort((a, b) => a.x - b.x);
  if (headers.length < 4) return [];

  const uniqueHeaders = [...new Map(headers.map((header) => [header.day, header])).values()].sort((a, b) => a.x - b.x);
  const firstColumnX = uniqueHeaders[0].x;
  const headerY = uniqueHeaders.reduce((sum, header) => sum + header.y, 0) / uniqueHeaders.length;
  const hourWords = layout.words
    .filter((word) => {
      const x = (word.bbox.x0 + word.bbox.x1) / 2;
      const number = Number(word.text.replace(/[^0-9]/g, ''));
      return x < firstColumnX && number >= 1 && number <= 12 && (word.bbox.y0 + word.bbox.y1) / 2 > headerY;
    })
    .map((word) => ({ hour: Number(word.text.replace(/[^0-9]/g, '')), y: (word.bbox.y0 + word.bbox.y1) / 2 }))
    .sort((a, b) => a.y - b.y);
  if (hourWords.length < 2) return [];

  const anchors = [];
  hourWords.forEach((entry) => {
    if (!anchors.some((anchor) => Math.abs(anchor.y - entry.y) < layout.height * 0.012)) anchors.push(entry);
  });
  if (anchors.length < 2) return [];
  const steps = anchors.slice(1).map((anchor, index) => anchor.y - anchors[index].y).filter((step) => step > 0);
  const pixelsPerHour = steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)];
  if (!pixelsPerHour) return [];
  const firstAnchorMinutes = (anchors[0].hour % 12) * 60;
  const tolerance = Math.max(5, layout.height * 0.006);
  const lines = groupWordsIntoLines(layout.words.filter((word) => (word.bbox.y0 + word.bbox.y1) / 2 > headerY + tolerance), tolerance);
  const eventsByDay = new Map();

  uniqueHeaders.forEach((header, index) => {
    const left = index ? (uniqueHeaders[index - 1].x + header.x) / 2 : header.x - (uniqueHeaders[index + 1].x - header.x) / 2;
    const right = index < uniqueHeaders.length - 1 ? (header.x + uniqueHeaders[index + 1].x) / 2 : header.x + (header.x - uniqueHeaders[index - 1].x) / 2;
    const dayLines = lines.map((line) => {
      const words = line.words.filter((word) => {
        const x = (word.bbox.x0 + word.bbox.x1) / 2;
        return x >= left && x < right;
      });
      return words.length ? {
        text: words.map((word) => word.text).join(' ').replace(/^[▶►>]+\s*/, '').trim(),
        y: words.reduce((sum, word) => sum + (word.bbox.y0 + word.bbox.y1) / 2, 0) / words.length,
      } : null;
    }).filter((line) => line?.text && !/^(am|pm|nn)$/i.test(line.text));

    const events = [];
    dayLines.forEach((line) => {
      if (/^(?:rm|room)\b/i.test(line.text) || /^(?:Q|S|P|R)-?\d{3,4}\b/i.test(line.text)) {
        const previous = events.at(-1);
        if (previous && line.y - previous.y < pixelsPerHour * 0.55) previous.room = cleanRoom(line.text.replace(/^(?:rm|room)\s*/i, ''));
        return;
      }
      if (/^\d{1,2}(?::\d{2})?$/.test(line.text)) return;
      const rawMinutes = firstAnchorMinutes + ((line.y - anchors[0].y) / pixelsPerHour) * 60 - 15;
      const startMinutes = Math.round(rawMinutes / 15) * 15;
      events.push({ title: line.text, y: line.y, startMinutes, room: '' });
    });
    eventsByDay.set(header.day, events);
  });

  const classes = [];
  eventsByDay.forEach((events, day) => {
    events.sort((a, b) => a.startMinutes - b.startMinutes).forEach((event, index) => {
      const nextStart = events[index + 1]?.startMinutes;
      const endMinutes = nextStart && nextStart > event.startMinutes && nextStart <= event.startMinutes + 60 ? nextStart : event.startMinutes + 60;
      const title = event.title.replace(/\s+/g, ' ').trim();
      if (!title || /^(sun|mon|tue|wed|thu|fri|sat)$/i.test(title)) return;
      classes.push({
        id: `grid-${day}-${event.startMinutes}-${slug(title)}`,
        code: generatedCode(title),
        title,
        day,
        start: minutesToTime(event.startMinutes),
        end: minutesToTime(endMinutes),
        room: event.room,
        instructor: '',
      });
    });
  });
  return classes;
}

function parseRegistrarLayout(layout) {
  if (!layout?.words?.length || !layout.width || !layout.height) return [];
  const words = layout.words.map((word) => ({
    ...word,
    x: (word.bbox.x0 + word.bbox.x1) / 2,
    y: (word.bbox.y0 + word.bbox.y1) / 2,
    token: word.text.toUpperCase().replace(/[^A-Z/]/g, ''),
  }));
  const headerWords = words.filter((word) => /^(TIME|DAY|ROOM|FACULTY|UNIT\/HRS)$/.test(word.token));
  if (!headerWords.some((word) => word.token === 'TIME') || !headerWords.some((word) => word.token === 'DAY') || !headerWords.some((word) => word.token === 'ROOM')) return [];
  const headerY = headerWords.reduce((sum, word) => sum + word.y, 0) / headerWords.length;
  const dayRows = words
    .filter((word) => word.y > headerY && word.x >= layout.width * 0.13 && word.x <= layout.width * 0.25)
    .map((word) => ({ ...word, days: findDayToken(word.text)?.days || [] }))
    .filter((word) => word.days.length)
    .sort((a, b) => a.y - b.y);
  if (dayRows.length < 2) return [];

  return dayRows.flatMap((dayRow, index) => {
    const top = index ? (dayRows[index - 1].y + dayRow.y) / 2 : headerY;
    const bottom = index < dayRows.length - 1 ? (dayRow.y + dayRows[index + 1].y) / 2 : Math.min(layout.height, dayRow.y + (dayRow.y - top));
    const rowWords = words.filter((word) => word.y > top && word.y < bottom);
    const cellText = (left, right) => rowWords
      .filter((word) => word.x >= layout.width * left && word.x < layout.width * right)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((word) => word.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const times = [...cellText(0, 0.17).matchAll(TIME_PATTERN)];
    const code = cellText(0.20, 0.36).replace(/[^A-Z0-9 -]/gi, '').trim().toUpperCase();
    const title = cellText(0.36, 0.66);
    const room = cleanRoom(cellText(0.76, 0.85).split(/\s+/)[0] || '');
    if (times.length < 2 || !code || !title) return [];
    const { start, end } = resolvedTimeRange(times);
    if (!start || !end || start >= end) return [];
    return dayRow.days.map((day) => ({
      id: `registrar-${slug(code)}-${day}-${slug(start)}`,
      code,
      title,
      day,
      start,
      end,
      room,
      instructor: '',
    }));
  });
}

export function parseScheduleText(input) {
  const text = typeof input === 'string' ? input : input?.text || '';
  const normalized = text.replace(/[|]/g, ' ').replace(/[‐‑‒–—]/g, '-').replace(/\r/g, '');
  const classes = [];
  const warnings = [];
  let currentDay = null;

  normalized.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line, index) => {
    const wordDay = dayWord(line);
    if (wordDay !== null) currentDay = wordDay;
    const result = parseLine(line, index, currentDay);
    if (!result) return;
    if (result.warning) warnings.push(result.warning);
    if (result.classes) classes.push(...result.classes);
  });

  classes.push(...parseGridLayout(typeof input === 'object' ? input.layout : null));
  classes.push(...parseRegistrarLayout(typeof input === 'object' ? input.layout : null));
  const unique = [...new Map(classes.map((item) => [`${item.day}-${item.start}-${item.title.toLowerCase()}`, item])).values()];
  const documentType = /(?:schedule\s+of\s+.*examinations|\bexam\b.*\bdate\b|\blong exam\b)/i.test(normalized) ? 'exam' : 'classes';
  return { course: parseCourse(normalized), yearLevel: '', semester: parseSemester(normalized), classes: unique, warnings, rawText: text, documentType };
}
