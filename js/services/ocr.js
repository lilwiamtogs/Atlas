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
    const layout = {
      width: preparedImage.width,
      height: preparedImage.height,
      words: wordsFromBlocks(result.data.blocks),
    };
    const timeTokens = result.data.text.match(/\b(?:AM|PM|NN)\b/gi) || [];
    if (timeTokens.length >= 4 || layout.words.length >= 15) return { text: result.data.text, layout };

    onProgress({ status: 'Trying a second reading', progress: 0.82 });
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    const fallback = await worker.recognize(file);
    return { text: `${result.data.text}\n${fallback.data.text}`, layout };
  } finally {
    await worker.terminate();
  }
}
