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

/** dataURL → File — Storage 업로드 직전, placeholder 단계에서 들고있던 dataURL을 다시 File로 복원 */
export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [meta, data] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
}
