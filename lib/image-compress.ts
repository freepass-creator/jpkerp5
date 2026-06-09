/**
 * 파일 → dataURL — multi-file OCR placeholder 표시용.
 * v4 패턴 포팅. 본격 압축은 필요할 때 추가.
 */

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}
