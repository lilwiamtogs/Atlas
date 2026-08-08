const OCR_MODULE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';

async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(1, 3000 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

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

  const histogram = new Array(256).fill(0);
  for (let index = 0; index < image.data.length; index += 4) histogram[image.data[index]] += 1;
  const total = canvas.width * canvas.height;
  let sum = 0;
  histogram.forEach((count, value) => { sum += value * count; });
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 170;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight || backgroundWeight === total) continue;
    backgroundSum += value * histogram[value];
    const foregroundWeight = total - backgroundWeight;
    const meanBackground = backgroundSum / backgroundWeight;
    const meanForeground = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }
  for (let index = 0; index < image.data.length; index += 4) {
    const value = image.data[index] <= threshold ? 0 : 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  const binaryBlob = await toBlob();
  return { blob, binaryBlob, width: canvas.width, height: canvas.height };
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

export async function scanScheduleImage(file, onProgress = () => {}) {
  const preparedImage = await prepareImage(file);
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
    const fallback = await worker.recognize(preparedImage.binaryBlob, {}, { blocks: true, text: true });
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
