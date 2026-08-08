const PDF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

export async function extractPdfPages(dataUrl) {
  const pdfjs = await import(PDF_MODULE_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({
      page: pageNumber,
      text: content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim(),
    });
  }

  return pages;
}
