const OCR_MODULE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';

async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(1, 2200 / bitmap.width);
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

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error('Image preparation failed.')), 'image/png');
  });
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
  return timeTokens.length * 12 + words.length * 0.25 + confidence;
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
    const fallback = await worker.recognize(preparedImage.blob, {}, { blocks: true, text: true });
    const readings = [result.data, fallback.data];
    const recognizedTimes = readings.flatMap((reading) => reading.text.match(/\b\d{1,2}[:.]\d{2}\s*(?:AM|PM)?\b/gi) || []);

    if (recognizedTimes.length < 4) {
      onProgress({ status: 'Checking sparse text', progress: 0.9 });
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      const sparse = await worker.recognize(preparedImage.blob, {}, { blocks: true, text: true });
      readings.push(sparse.data);
    }

    const bestLayout = [...readings].sort((a, b) => readingScore(b) - readingScore(a))[0];
    return {
      text: readings.map((reading) => reading.text).join('\n'),
      layout: {
        width: preparedImage.width,
        height: preparedImage.height,
        words: wordsFromBlocks(bestLayout.blocks),
      },
    };
  } finally {
    await worker.terminate();
  }
}
