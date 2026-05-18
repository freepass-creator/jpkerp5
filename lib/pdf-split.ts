/**
 * 클라이언트 사이드 PDF 페이지 분할.
 * pdf-lib로 페이지마다 단일 페이지 PDF File을 생성한다.
 *
 * 다중 고지서 1개 PDF → N개 단일 페이지 PDF → 각각 OCR.
 */
import { PDFDocument } from 'pdf-lib';

export async function getPdfPageCount(file: File): Promise<number> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 1;
  const buf = await file.arrayBuffer();
  const src = await PDFDocument.load(buf);
  return src.getPageCount();
}

export async function splitPdfPages(file: File): Promise<File[]> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return [file];
  const buf = await file.arrayBuffer();
  const src = await PDFDocument.load(buf);
  const pageCount = src.getPageCount();
  if (pageCount <= 1) return [file];

  const baseName = file.name.replace(/\.pdf$/i, '');
  const out: File[] = [];
  for (let i = 0; i < pageCount; i++) {
    const dst = await PDFDocument.create();
    const [page] = await dst.copyPages(src, [i]);
    dst.addPage(page);
    const bytes = await dst.save();
    out.push(
      new File([new Uint8Array(bytes)], `${baseName}_p${i + 1}.pdf`, {
        type: 'application/pdf',
      }),
    );
  }
  return out;
}
