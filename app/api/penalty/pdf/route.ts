/**
 * 과태료 변경부과 PDF 생성 API.
 *
 * 흐름:
 *   1) 클라이언트가 items + ctx + 항목별 noticeImageDataUrl 포함해서 POST
 *   2) 서버에서 Puppeteer로 공문(K장) + 확인서(N장)을 진짜 텍스트 PDF 로 렌더
 *   3) pdf-lib 으로 고지서 이미지 페이지를 케이스 사이에 끼움 ([공문 K] → [확인서 + 고지서] × N)
 *   4) 통합 PDF 바이너리 응답
 *
 * 텍스트 PDF (드래그·검색 가능) — html2canvas 이미지 박는 방식과 다름.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Browser } from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import { requireAuth } from '@/lib/api-auth';
import {
  renderOfficialPageHtml,
  renderConfirmationHtml,
  ROWS_PER_OFFICIAL_PAGE,
  type OfficialPageArgs,
  type ConfirmationArgs,
  type IssueContext,
} from '@/lib/penalty-templates';
import type { PenaltyWorkItem } from '@/lib/penalty-pdf';

export const runtime = 'nodejs'; // puppeteer 는 Node.js 런타임 필수
export const maxDuration = 120;  // 큰 묶음일 때 시간 여유

/* ────────────────── Browser pool — 누수 방지 ──────────────────
 *
 * 기존: 매 요청마다 puppeteer.launch() → Chrome 인스턴스 5+ 프로세스 생성.
 *       정상 종료(browser.close())해도 일부 자식 프로세스 leak 가능.
 *       반복되면 시스템 메모리 고갈 → dev 서버 다운.
 *
 * 개선: globalThis 에 1개 인스턴스 캐싱하고 재사용. 매 요청은 page 만 열고 닫음.
 *       Next.js dev 모드의 모듈 reload 살아남게 globalThis 에 저장.
 *       프로세스 종료 시 cleanup. */

declare global {
  // eslint-disable-next-line no-var
  var __puppeteer_browser: Browser | undefined;
  // eslint-disable-next-line no-var
  var __puppeteer_signals_registered: boolean | undefined;
}

async function getBrowser(): Promise<Browser> {
  const existing = globalThis.__puppeteer_browser;
  if (existing && existing.connected) return existing;

  // Vercel/Lambda는 @sparticuz/chromium, 로컬은 puppeteer 번들 Chrome 사용
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_VERSION;
  let browser: Browser;
  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteerCore = (await import('puppeteer-core')).default;
    browser = await puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    }) as unknown as Browser;
  } else {
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    }) as unknown as Browser;
  }
  globalThis.__puppeteer_browser = browser;

  // 한 번만 등록 — process 종료 시 cleanup
  if (!globalThis.__puppeteer_signals_registered) {
    globalThis.__puppeteer_signals_registered = true;
    const cleanup = async () => {
      try {
        await globalThis.__puppeteer_browser?.close();
      } catch { /* ignore */ }
      globalThis.__puppeteer_browser = undefined;
    };
    process.once('SIGINT', () => { void cleanup().then(() => process.exit(0)); });
    process.once('SIGTERM', () => { void cleanup().then(() => process.exit(0)); });
    process.once('beforeExit', () => { void cleanup(); });
  }

  // 브라우저가 죽으면 캐시 무효화 → 다음 요청 때 새로 띄움
  browser.on('disconnected', () => {
    if (globalThis.__puppeteer_browser === browser) {
      globalThis.__puppeteer_browser = undefined;
    }
  });

  return browser;
}

interface BuildRequest {
  items: PenaltyWorkItem[];
  ctx: IssueContext;
  /** 항목별 ConfirmationArgs (확인서 발급번호, 전자계약 정보 등) */
  confirmations: Array<Omit<ConfirmationArgs, 'ctx' | 'item'>>;
}

/* ────────────────── HTML → PDF (Puppeteer) ────────────────── */

/**
 * HTML 페이지들 → 텍스트 PDF.
 *
 * 핵심 — 샘플 HTML 미리보기와 폰트/크기/레이아웃 완전 동일하게 나와야 함:
 *   1) 샘플과 동일한 Pretendard CDN <link>
 *   2) viewport = .page 의 실제 width/height (794×1123)
 *   3) document.fonts.ready 로 Pretendard 로드 완료까지 대기
 *   4) @page A4 + preferCSSPageSize 로 정확히 1:1 매핑
 *   5) deviceScaleFactor=2 로 텍스트 선명도 확보 (텍스트 PDF니 사실 고화질 자체는 무관)
 */
async function htmlPagesToPdf(htmlPages: string[]): Promise<Uint8Array> {
  const combinedHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link
    href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
    rel="stylesheet"
  />
  <style>
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0; padding: 0;
      font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
  </style>
</head>
<body>
  ${htmlPages.join('\n')}
</body>
</html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(60_000);
    // .page 의 실제 픽셀 크기 (A4 @ 96dpi = 794×1123) 와 동일하게 viewport 설정.
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.setContent(combinedHtml, { waitUntil: ['load', 'networkidle0'] as never, timeout: 60_000 });
    // Pretendard CDN 폰트 로드 완료까지 대기
    await page.evaluateHandle('document.fonts.ready');
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return pdfBytes;
  } finally {
    // page 만 닫고 browser 는 pool 에 유지 — 다음 요청 재사용
    await page.close().catch(() => {});
  }
}

/* ────────────────── 고지서 이미지를 PDF 페이지로 ────────────────── */

async function imageToPdfPage(pdfDoc: PDFDocument, dataUrl: string): Promise<void> {
  // dataUrl: "data:image/jpeg;base64,..." 또는 "data:image/png;..."
  const m = dataUrl.match(/^data:(image\/(jpeg|png));base64,(.+)$/);
  if (!m) {
    // 모르는 형식 — 빈 페이지 추가
    pdfDoc.addPage([595, 842]);
    return;
  }
  const mime = m[1];
  const b64 = m[3];
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));

  const img = mime === 'image/png'
    ? await pdfDoc.embedPng(bytes)
    : await pdfDoc.embedJpg(bytes);

  const page = pdfDoc.addPage([595, 842]); // A4 in PDF points (72dpi)
  const M = 56;
  const maxW = 595 - M * 2;
  const maxH = 842 - M * 2;
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  page.drawImage(img, {
    x: (595 - w) / 2,
    y: (842 - h) / 2,
    width: w,
    height: h,
  });
}

/* ────────────────── 메인 빌드 (공문 텍스트 PDF + 확인서/고지서 페어) ────────────────── */

async function buildBundlePdf(req: BuildRequest): Promise<Uint8Array> {
  const { items, ctx, confirmations } = req;
  if (items.length === 0) throw new Error('items is empty');

  // 1) 공문 K장 HTML 페이지들
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / ROWS_PER_OFFICIAL_PAGE));
  const officialHtmls: string[] = [];
  for (let p = 0; p < totalPages; p++) {
    const sliceStart = p * ROWS_PER_OFFICIAL_PAGE;
    const pageItems = items.slice(sliceStart, sliceStart + ROWS_PER_OFFICIAL_PAGE);
    const args: OfficialPageArgs = {
      ctx, pageItems, totalCount,
      pageNo: p + 1, totalPages,
      startNo: sliceStart + 1,
    };
    officialHtmls.push(renderOfficialPageHtml(args));
  }

  // 2) 공문 PDF 1개 (텍스트)
  const officialPdfBytes = await htmlPagesToPdf(officialHtmls);
  const officialPdf = await PDFDocument.load(officialPdfBytes);

  // 3) 케이스마다 [확인서 텍스트 PDF + 고지서 이미지 페이지] 페어
  //    효율을 위해 확인서 N장도 한꺼번에 브라우저에서 렌더 → 1개 PDF, 그 다음 페어 끼우기
  const confirmHtmls = items.map((item, i) => {
    const confArgs: ConfirmationArgs = { ctx, item, ...confirmations[i] };
    return renderConfirmationHtml(confArgs);
  });
  const confirmPdfBytes = await htmlPagesToPdf(confirmHtmls);
  const confirmPdf = await PDFDocument.load(confirmPdfBytes);

  // 4) 결합: 공문 K장 → (확인서ᵢ + 고지서ᵢ) × N
  const out = await PDFDocument.create();

  // 공문 페이지 복사
  const officialPages = await out.copyPages(officialPdf, officialPdf.getPageIndices());
  for (const p of officialPages) out.addPage(p);

  // 확인서 + 고지서 페어
  for (let i = 0; i < items.length; i++) {
    // 확인서 페이지 (i 번째)
    const [confPage] = await out.copyPages(confirmPdf, [i]);
    out.addPage(confPage);

    // 고지서 이미지 페이지
    if (items[i].fileDataUrl) {
      await imageToPdfPage(out, items[i].fileDataUrl);
    } else {
      out.addPage([595, 842]); // 빈 페이지
    }
  }

  return await out.save();
}

/* ────────────────── POST handler ────────────────── */

export async function POST(req: NextRequest) {
  // 인증 — Firebase ID token 검증 (직원만 호출 가능)
  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  try {
    const body = (await req.json()) as BuildRequest;
    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: 'items is required' }, { status: 400 });
    }
    if (!body.ctx) {
      return NextResponse.json({ error: 'ctx is required' }, { status: 400 });
    }
    if (!body.confirmations || body.confirmations.length !== body.items.length) {
      return NextResponse.json({ error: 'confirmations length must match items length' }, { status: 400 });
    }

    const pdfBytes = await buildBundlePdf(body);

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBytes.byteLength),
      },
    });
  } catch (err) {
    console.error('PDF generation failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 },
    );
  }
}
