/**
 * PDF 1페이지짜리를 이미지(JPEG dataURL)로 렌더링.
 * pdfjs-dist는 ~1MB라 lazy import. worker는 CDN(unpkg)에서 로드해서 별도 설정 없이 사용.
 *
 * 과태료 변경부과 PDF에 고지서 원본을 박을 때, jsPDF.addImage는 PDF dataURL을 못 읽으므로
 * 업로드 시 PDF는 이 함수로 이미지화해서 저장한다.
 */

let workerSetupDone = false;

async function ensurePdfjs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist');
  if (!workerSetupDone) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    workerSetupDone = true;
  }
  return pdfjs;
}

export async function pdfFirstPageToImageDataUrl(file: File, scale = 2): Promise<string> {
  const pdfjs = await ensurePdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d context 획득 실패');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    pdf.destroy?.();
  }
}

/** 업로드된 파일을 이미지 dataURL로 — PDF면 렌더링, 이미지면 그대로 */
export async function fileToImageDataUrl(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return pdfFirstPageToImageDataUrl(file);
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}

/**
 * PDF 첫 페이지를 JPEG File 로 변환. OCR 보내기 전 전처리에 사용.
 * Gemini Vision 이 multi-page PDF 에서 page 1 을 안 보거나 페이지 간 혼선을 일으키는
 * non-deterministic 실패를 회피. PDF 면 무조건 변환 (1-page 도) — 신뢰성 우선.
 * 2.5x 스케일로 plate 가독성 확보. 변환 비용 ~1-2초.
 */
export async function pdfFirstPageToJpegFile(file: File, scale = 3): Promise<File> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return file;
  const dataUrl = await pdfFirstPageToImageDataUrl(file, scale);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const baseName = file.name.replace(/\.pdf$/i, '');
  return new File([blob], `${baseName}_p1.jpg`, { type: 'image/jpeg' });
}
