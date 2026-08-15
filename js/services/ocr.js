const OCR_MODULE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';

function rotatedSize(width, height, rotation) {
  return Math.abs(rotation) % 180 === 90 ? { width: height, height: width } : { width, height };
}

function drawEditedImage(bitmap, edit = {}) {
  const crop = edit.crop || {};
  const left = Math.round(bitmap.width * Math.min(0.4, Math.max(0, Number(crop.left) || 0)));
  const right = Math.round(bitmap.width * Math.min(0.4, Math.max(0, Number(crop.right) || 0)));
  const top = Math.round(bitmap.height * Math.min(0.4, Math.max(0, Number(crop.top) || 0)));
  const bottom = Math.round(bitmap.height * Math.min(0.4, Math.max(0, Number(crop.bottom) || 0)));
  const sourceWidth = Math.max(1, bitmap.width - left - right);
  const sourceHeight = Math.max(1, bitmap.height - top - bottom);
  const rotation = ((Number(edit.rotation) || 0) % 360 + 360) % 360;
  const size = rotatedSize(sourceWidth, sourceHeight, rotation);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(bitmap, left, top, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  return canvas;
}

export async function prepareScheduleImageFile(file, edit = {}) {
  if ((!edit.rotation || Number(edit.rotation) % 360 === 0) && !Object.values(edit.crop || {}).some(Number)) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = drawEditedImage(bitmap, edit);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image editing failed.')), 'image/png'));
  return new File([blob], 'edited-schedule.png', { type: 'image/png', lastModified: Date.now() });
}

function contentBounds(image, width, height) {
  let left = width; let right = 0; let top = height; let bottom = 0; let found = false;
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 900));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;
      const grey = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
      if (grey > 238) continue;
      found = true;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (!found) return { left: 0, top: 0, width, height };
  const padX = Math.round(width * 0.018); const padY = Math.round(height * 0.018);
  return {
    left: Math.max(0, left - padX), top: Math.max(0, top - padY),
    width: Math.min(width, right + padX) - Math.max(0, left - padX),
    height: Math.min(height, bottom + padY) - Math.max(0, top - padY),
  };
}

function estimateSkew(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const stride = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 700));
  let bestAngle = 0; let bestScore = -Infinity;
  for (let angle = -4; angle <= 4; angle += 0.5) {
    const tangent = Math.tan(angle * Math.PI / 180);
    const rows = new Uint32Array(Math.ceil(canvas.height / stride) + Math.ceil(canvas.width * Math.abs(tangent) / stride) + 4);
    for (let y = 0; y < canvas.height; y += stride) for (let x = 0; x < canvas.width; x += stride) {
      const index = (y * canvas.width + x) * 4;
      const grey = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
      if (grey < 155) rows[Math.max(0, Math.round((y + x * tangent) / stride))] += 1;
    }
    const score = rows.reduce((sum, count) => sum + count * count, 0);
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  return Math.abs(bestAngle) >= 0.5 ? bestAngle : 0;
}

function deskewCanvas(source) {
  const angle = estimateSkew(source);
  if (!angle) return source;
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(-angle * Math.PI / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function normalizePerspective(source) {
  const context = source.getContext('2d', { willReadFrequently: true });
  const image = context.getImageData(0, 0, source.width, source.height);
  const slices = 12; const edges = [];
  for (let slice = 0; slice < slices; slice += 1) {
    const y0 = Math.floor(source.height * slice / slices); const y1 = Math.floor(source.height * (slice + 1) / slices);
    let left = source.width; let right = 0;
    for (let y = y0; y < y1; y += 3) for (let x = 0; x < source.width; x += 3) {
      const index = (y * source.width + x) * 4;
      if (image.data[index] + image.data[index + 1] + image.data[index + 2] < 630) { left = Math.min(left, x); right = Math.max(right, x); }
    }
    if (right > left) edges.push({ y0, y1, left, right });
  }
  if (edges.length < 6) return source;
  const leftRange = Math.max(...edges.map((edge) => edge.left)) - Math.min(...edges.map((edge) => edge.left));
  const rightRange = Math.max(...edges.map((edge) => edge.right)) - Math.min(...edges.map((edge) => edge.right));
  if (Math.max(leftRange, rightRange) < source.width * 0.025) return source;
  const lineResidual = (values) => {
    const count = values.length;
    const sumX = count * (count - 1) / 2;
    const sumY = values.reduce((sum, value) => sum + value, 0);
    const sumXX = values.reduce((sum, _, index) => sum + index * index, 0);
    const sumXY = values.reduce((sum, value, index) => sum + index * value, 0);
    const slope = (count * sumXY - sumX * sumY) / Math.max(1, count * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / count;
    return values.reduce((sum, value, index) => sum + Math.abs(value - (intercept + slope * index)), 0) / count;
  };
  const widths = edges.map((edge) => edge.right - edge.left);
  const averageWidth = widths.reduce((sum, width) => sum + width, 0) / widths.length;
  const widthDeviation = widths.reduce((sum, width) => sum + Math.abs(width - averageWidth), 0) / widths.length;
  if (lineResidual(edges.map((edge) => edge.left)) > source.width * 0.025
    || lineResidual(edges.map((edge) => edge.right)) > source.width * 0.025
    || widthDeviation > averageWidth * 0.14) return source;
  const targetLeft = edges.map((edge) => edge.left).sort((a, b) => a - b)[Math.floor(edges.length / 2)];
  const targetRight = edges.map((edge) => edge.right).sort((a, b) => a - b)[Math.floor(edges.length / 2)];
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const output = canvas.getContext('2d'); output.fillStyle = '#fff'; output.fillRect(0, 0, canvas.width, canvas.height);
  edges.forEach((edge) => output.drawImage(source, edge.left, edge.y0, edge.right - edge.left, edge.y1 - edge.y0, targetLeft, edge.y0, targetRight - targetLeft, edge.y1 - edge.y0));
  return canvas;
}

function adaptiveBinary(image, width, height) {
  const output = new ImageData(width, height);
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      const index = ((y - 1) * width + x - 1) * 4;
      row += image.data[index];
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + row;
    }
  }
  const radius = Math.max(10, Math.round(Math.min(width, height) / 70));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const x0 = Math.max(0, x - radius); const x1 = Math.min(width - 1, x + radius);
    const y0 = Math.max(0, y - radius); const y1 = Math.min(height - 1, y + radius);
    const area = (x1 - x0 + 1) * (y1 - y0 + 1);
    const mean = (integral[(y1 + 1) * (width + 1) + x1 + 1] - integral[y0 * (width + 1) + x1 + 1]
      - integral[(y1 + 1) * (width + 1) + x0] + integral[y0 * (width + 1) + x0]) / area;
    const source = (y * width + x) * 4;
    const value = image.data[source] < mean - 12 ? 0 : 255;
    output.data[source] = value; output.data[source + 1] = value; output.data[source + 2] = value; output.data[source + 3] = 255;
  }
  return output;
}

function removeTableLines(image, width, height) {
  const output = new ImageData(new Uint8ClampedArray(image.data), width, height);
  const horizontalRun = Math.round(width * 0.42);
  const verticalRun = Math.round(height * 0.32);
  for (let y = 0; y < height; y += 1) {
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const dark = x < width && image.data[(y * width + x) * 4] === 0;
      if (dark && start < 0) start = x;
      if ((!dark || x === width) && start >= 0) {
        if (x - start >= horizontalRun) for (let clearX = start; clearX < x; clearX += 1) output.data[(y * width + clearX) * 4] = output.data[(y * width + clearX) * 4 + 1] = output.data[(y * width + clearX) * 4 + 2] = 255;
        start = -1;
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    let start = -1;
    for (let y = 0; y <= height; y += 1) {
      const dark = y < height && image.data[(y * width + x) * 4] === 0;
      if (dark && start < 0) start = y;
      if ((!dark || y === height) && start >= 0) {
        if (y - start >= verticalRun) for (let clearY = start; clearY < y; clearY += 1) output.data[(clearY * width + x) * 4] = output.data[(clearY * width + x) * 4 + 1] = output.data[(clearY * width + x) * 4 + 2] = 255;
        start = -1;
      }
    }
  }
  return output;
}

async function prepareImage(file, edit = {}) {
  const bitmap = await createImageBitmap(file);
  const edited = deskewCanvas(normalizePerspective(drawEditedImage(bitmap, edit)));
  bitmap.close();
  const initialContext = edited.getContext('2d', { willReadFrequently: true });
  const bounds = contentBounds(initialContext.getImageData(0, 0, edited.width, edited.height), edited.width, edited.height);
  const scale = Math.min(
    Math.max(1, 3000 / bounds.width),
    4400 / bounds.height,
    Math.sqrt(8_000_000 / (bounds.width * bounds.height)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(edited, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const grey = image.data[index] * 0.299
      + image.data[index + 1] * 0.587
      + image.data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (grey - 128) * 1.45 + 128));
    image.data[index] = contrasted;
    image.data[index + 1] = contrasted;
    image.data[index + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);
  const toBlob = () => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image preparation failed.')), 'image/png');
  });
  const blob = await toBlob();

  const binaryImage = adaptiveBinary(image, canvas.width, canvas.height);
  context.putImageData(binaryImage, 0, 0);
  const binaryBlob = await toBlob();
  context.putImageData(removeTableLines(binaryImage, canvas.width, canvas.height), 0, 0);
  const lineRemovedBlob = await toBlob();
  return { blob, binaryBlob, lineRemovedBlob, width: canvas.width, height: canvas.height };
}

function wordsFromBlocks(blocks = []) {
  return blocks.flatMap((block) => block.paragraphs || [])
    .flatMap((paragraph) => paragraph.lines || [])
    .flatMap((line) => line.words || [])
    .filter((word) => word.text?.trim() && word.bbox)
    .map((word) => ({ text: word.text.trim(), bbox: word.bbox, confidence: word.confidence }));
}

function readingScore(data) {
  const words = wordsFromBlocks(data.blocks);
  const confidence = words.length ? words.reduce((sum, word) => sum + (word.confidence || 0), 0) / words.length : 0;
  const timeTokens = data.text.match(/\b\d{1,2}[:.]\d{2}\s*(?:AM|PM)?\b/gi) || [];
  const registrarHeaders = ['SUBJECT', 'TITLE', 'SCHEDULE', 'SECTION', 'ROOM']
    .filter((header) => new RegExp(`\\b${header}\\b`, 'i').test(data.text)).length;
  return timeTokens.length * 12 + registrarHeaders * 30 + words.length * 0.25 + confidence;
}

function compositeLayout(readings, width, height) {
  const combined = readings.flatMap((reading) => wordsFromBlocks(reading.blocks))
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const xTolerance = Math.max(10, width * 0.008);
  const yTolerance = Math.max(6, height * 0.01);
  const words = [];
  combined.forEach((word) => {
    const x = (word.bbox.x0 + word.bbox.x1) / 2;
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    const duplicate = words.some((existing) => {
      const existingX = (existing.bbox.x0 + existing.bbox.x1) / 2;
      const existingY = (existing.bbox.y0 + existing.bbox.y1) / 2;
      return Math.abs(existingX - x) <= xTolerance && Math.abs(existingY - y) <= yTolerance;
    });
    if (!duplicate) words.push(word);
  });
  return { width, height, words };
}

export async function scanScheduleImage(file, onProgress = () => {}, edit = {}) {
  const preparedImage = await prepareImage(file, edit);
  const tesseractModule = await import(OCR_MODULE_URL);
  const { createWorker } = tesseractModule.default;
  const worker = await createWorker('eng', 1, {
    logger(message) {
      onProgress(message);
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    const result = await worker.recognize(preparedImage.blob, {}, { blocks: true, text: true });
    onProgress({ status: 'Reading schedule columns', progress: 0.76 });
    await worker.setParameters({ tessedit_pageseg_mode: '4' });
    const fallback = await worker.recognize(preparedImage.lineRemovedBlob, {}, { blocks: true, text: true });
    const readings = [result.data, fallback.data];
    onProgress({ status: 'Checking table structure', progress: 0.84 });
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
    const automatic = await worker.recognize(preparedImage.blob, {}, { blocks: true, text: true });
    readings.push(automatic.data);
    onProgress({ status: 'Checking sparse text', progress: 0.92 });
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    const sparse = await worker.recognize(preparedImage.binaryBlob, {}, { blocks: true, text: true });
    readings.push(sparse.data);
    onProgress({ status: 'Recovering faint rows', progress: 0.96 });
    await worker.setParameters({ tessedit_pageseg_mode: '12' });
    const sparseAutomatic = await worker.recognize(preparedImage.blob, {}, { blocks: true, text: true });
    readings.push(sparseAutomatic.data);

    onProgress({ status: 'Checking times and schedule codes', progress: 0.98 });
    await worker.setParameters({
      tessedit_pageseg_mode: '11',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-/ ',
    });
    const scheduleTokens = await worker.recognize(preparedImage.lineRemovedBlob, {}, { blocks: true, text: true });
    readings.push(scheduleTokens.data);

    const bestLayout = [...readings].sort((a, b) => readingScore(b) - readingScore(a))[0];
    return {
      text: bestLayout.text,
      layout: {
        width: preparedImage.width,
        height: preparedImage.height,
        words: wordsFromBlocks(bestLayout.blocks),
      },
      layouts: [...readings.map((reading) => ({
        width: preparedImage.width,
        height: preparedImage.height,
        words: wordsFromBlocks(reading.blocks),
        isComposite: false,
      })), { ...compositeLayout(readings, preparedImage.width, preparedImage.height), isComposite: true }],
    };
  } finally {
    await worker.terminate();
  }
}
