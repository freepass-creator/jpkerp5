/**
 * 도장(인영) PNG 흰 배경 누끼 처리.
 *
 *   const file = e.target.files[0];
 *   const { blob, dataUrl, bounds } = await removeWhiteBackground(file);
 *   // blob → Firebase Storage 업로드
 *   // dataUrl → 즉시 미리보기
 *
 * 알고리즘:
 *   1) 이미지를 캔버스에 그림
 *   2) 픽셀별로 RGB 평균이 threshold(기본 235) 이상이면 alpha=0
 *   3) 도장 영역의 bounding box 계산 → 가장자리 trim (여백 8px 유지)
 *   4) 트림된 영역을 새 캔버스에 그려 PNG blob 생성
 *
 * A4 스캔본 (보통 흰 배경 + 인주 빨강/검정) 에 최적화.
 */

export type SealResult = {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  bounds: { x: number; y: number; w: number; h: number; original: { w: number; h: number } };
};

/**
 * 흰 배경 제거 + 도장 영역 trim.
 * threshold: RGB 평균이 이 값 이상이면 투명 처리 (200~250 사이 권장).
 * margin: trim 후 여백 (픽셀)
 */
export async function removeWhiteBackground(file: File, opts: { threshold?: number; margin?: number } = {}): Promise<SealResult> {
  const threshold = opts.threshold ?? 235;
  const margin = opts.margin ?? 8;

  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;

  // bounding box 추적
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  let opaqueCount = 0;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const avg = (r + g + b) / 3;
      if (avg >= threshold) {
        d[i + 3] = 0; // 투명
      } else {
        // soft alpha — 인주 진하기 보존: 어두울수록 더 진하게 (255), 밝을수록 흐리게
        // 250-threshold 사이 grayscale 범위를 0-255 알파로 매핑
        const range = threshold;
        const darkness = Math.max(0, range - avg);
        const alpha = Math.min(255, Math.round((darkness / range) * 320)); // 1.25 boost
        d[i + 3] = alpha;
        if (alpha > 16) {
          opaqueCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  if (opaqueCount === 0) {
    throw new Error('도장이 인식되지 않았습니다 — 더 진하게 스캔하거나 threshold 를 낮춰주세요.');
  }

  ctx.putImageData(imgData, 0, 0);

  // trim with margin
  const cropX = Math.max(0, minX - margin);
  const cropY = Math.max(0, minY - margin);
  const cropW = Math.min(canvas.width - cropX, maxX - minX + 1 + margin * 2);
  const cropH = Math.min(canvas.height - cropY, maxY - minY + 1 + margin * 2);

  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('Canvas 2D context unavailable (out)');
  outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const blob: Blob = await new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  const dataUrl = out.toDataURL('image/png');

  return {
    blob,
    dataUrl,
    width: cropW,
    height: cropH,
    bounds: {
      x: cropX, y: cropY, w: cropW, h: cropH,
      original: { w: canvas.width, h: canvas.height },
    },
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
