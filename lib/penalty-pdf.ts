/**
 * 과태료 변경부과 PDF 생성 (클라이언트 진입점).
 *
 * 실제 PDF 렌더는 서버(/api/penalty/pdf, Puppeteer) 에서 수행 — 진짜 텍스트 PDF.
 * 클라이언트는:
 *   1) (회사 × 발급기관) 단위로 그룹핑
 *   2) 그룹마다 API 호출 → PDF blob 받음
 *   3) zip 으로 묶어서 다운로드
 */
import type { PenaltyParsed } from './parsers/penalty';
import type { Company } from './sample-companies';
import type { IssueContext, ConfirmationArgs } from './penalty-templates';
import type { AuditFields } from './audit-fields';

export interface PenaltyWorkItem extends PenaltyParsed, AuditFields {
  id: string;
  fileName: string;
  fileDataUrl: string;
  fileSize?: number;
  pageNumber?: number;
  /** 소프트 삭제. 통지번호는 영구 보존 (재발급 금지). */
  deletedAt?: string;
  _company?: Company | null;
  _asset?: {
    manufacturer?: string;
    car_model?: string;
    detail_model?: string;
    partner_code?: string;
    /** 자동차등록증 추가 항목 — 확인서에 표기 */
    vin?: string;
    year?: string;
    color?: string;
    fuel?: string;
  } | null;
  _contract?: {
    contractor_name?: string;
    contractor_phone?: string;
    contractor_kind?: string;
    contractor_ident?: string;
    contractor_address?: string;
    start_date?: string;
    end_date?: string;
    product_type?: string;
    partner_code?: string;
    /** 전자계약 정보 — 확인서 evidence 박스에 표기 */
    electronic_contract_date?: string;
    electronic_contract_doc_no?: string;
    /** 임차인 전자서명 PNG URL (배경 투명) */
    contractor_signature_png?: string;
  } | null;
  _saving?: boolean;
  _ocrStatus?: 'pending' | 'done' | 'failed';
  _ocrError?: string;
  _phase?: 'in-progress' | 'completed';
  _processedAt?: string;
  /** 중복 검증 결과 — handleCreate 단계에서 dedupPenalties 가 채움.
   *  reason: UI 에 빨간 라벨로 표시. matchedExistingId: 어떤 기존 항목과 매칭됐는지. */
  _duplicate?: {
    reason: string;
    source: 'existing' | 'batch';
    matchedExistingId?: string;
  };
}

function dateOnly(s?: string): string {
  if (!s) return '';
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Windows/Linux/macOS 모두에서 안전한 폴더·파일명 */
function safeName(s: string | undefined, fallback = '미지정'): string {
  if (!s || !s.trim()) return fallback;
  return s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '').slice(0, 80);
}

/* ────────────────── 컨텍스트 빌더 ────────────────── */

function buildContext(items: PenaltyWorkItem[], staff: IssueContext['staff'], opts?: {
  recipient?: string;
  docNo?: string;
  sendDate?: string;
  sealPngUrl?: string;
  homepage?: string;
  hqAddress?: string;
}): IssueContext {
  const first = items[0];
  // 회사 매칭 안된 경우: "회사명없음" placeholder. 사용자가 나중에 매칭하고 다시 생성.
  const company = first._company ?? {
    code: 'NOCOMP', name: '회사명없음',
    ceo: '', bizNo: '', corpNo: '', hqAddress: '', bizType: '', bizCategory: '', phone: '',
  };
  const today = new Date().toISOString().slice(0, 10);
  const fallbackDocNo = `${company.code}-${today.slice(0, 4)}-${Date.now().toString().slice(-5)}`;

  return {
    company,
    hqAddress: opts?.hqAddress,
    homepage: opts?.homepage,
    sealPngUrl: opts?.sealPngUrl,
    staff,
    docNo: opts?.docNo ?? fallbackDocNo,
    sendDate: opts?.sendDate ?? today,
    recipient: opts?.recipient ?? first.issuer ?? '관할 경찰서장',
  };
}

function buildConfirmationPayload(item: PenaltyWorkItem, ctx: IssueContext, idx: number): Omit<ConfirmationArgs, 'ctx' | 'item'> {
  const seq = String(idx + 1).padStart(3, '0');
  const confirmationDocNo = `${ctx.company.code}-CONF-${ctx.sendDate.replace(/-/g, '')}-${seq}`;

  const elec = item._contract?.electronic_contract_date && item._contract?.electronic_contract_doc_no
    ? { date: item._contract.electronic_contract_date, docNo: item._contract.electronic_contract_doc_no }
    : undefined;

  return {
    confirmationDocNo,
    contractorSignaturePng: item._contract?.contractor_signature_png,
    electronicContract: elec,
    vehicleDetails: item._asset
      ? {
          manufacturer: item._asset.manufacturer,
          car_name: item._asset.detail_model ?? item._asset.car_model,
          vin: item._asset.vin,
          year: item._asset.year,
          color: item._asset.color,
          fuel: item._asset.fuel,
        }
      : undefined,
  };
}

/* ────────────────── 케이스 묶음 PDF — 서버 API 호출 ────────────────── */

async function buildCasePdf(
  items: PenaltyWorkItem[],
  staff: IssueContext['staff'],
  opts?: Parameters<typeof buildContext>[2],
): Promise<Blob> {
  const ctx = buildContext(items, staff, opts);
  const confirmations = items.map((item, i) => buildConfirmationPayload(item, ctx, i));

  // Firebase ID token 첨부 (서버 requireAuth 통과)
  const { getFirebaseAuth } = await import('@/lib/firebase/client');
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  const idToken = user ? await user.getIdToken() : '';

  const res = await fetch('/api/penalty/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ items, ctx, confirmations }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PDF 생성 실패 (${res.status}): ${errText}`);
  }
  return await res.blob();
}

/* ────────────────── 단일 항목 미리보기 ────────────────── */

export async function previewPenaltyItem(
  item: PenaltyWorkItem,
  staff: IssueContext['staff'],
  opts?: Parameters<typeof buildContext>[2],
): Promise<void> {
  // 팝업 블로커 회피 — 사용자 클릭 직후 즉시 빈 창 열고, async PDF 생성 후 URL 채움
  const win = window.open('about:blank', '_blank');
  if (!win) {
    alert('PDF 미리보기를 위해 팝업을 허용해주세요.');
    return;
  }
  // 로딩 안내
  win.document.write(`
    <html><head><title>PDF 생성 중...</title></head>
    <body style="font-family: 'Pretendard', sans-serif; padding: 40px; color: #333; text-align: center;">
      <h2 style="color: #1B2A4A;">PDF 생성 중...</h2>
      <p style="color: #666;">서버에서 변경부과 PDF 를 생성하고 있습니다. 잠시만 기다려주세요.</p>
    </body></html>
  `);

  try {
    const blob = await buildCasePdf([item], staff, opts);
    const url = URL.createObjectURL(blob);
    win.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error('PDF 미리보기 실패', err);
    win.document.body.innerHTML = `
      <div style="font-family: sans-serif; padding: 40px; color: #c20a0a;">
        <h2>PDF 생성 실패</h2>
        <pre>${(err as Error)?.message ?? String(err)}</pre>
      </div>
    `;
  }
}

/* ────────────────── 폴더/파일명 ────────────────── */

function folderNameForCompany(item: PenaltyWorkItem): string {
  // 미매칭은 별도 폴더로 분리 — 사용자가 일목요연하게 "이거 매칭 필요" 파악
  if (!item._company) return '00_회사명없음';
  return `${item._company.code}_${safeName(item._company.name, '회사명없음')}`;
}

/** 한 건 PDF 파일명: 차량번호_임차인_부과기관_위반일자.pdf */
function fileNameForItem(item: PenaltyWorkItem): string {
  const car = safeName(item.car_number, '차량미정');
  const tenant = safeName(item._contract?.contractor_name, '임차인미매칭');
  const issuer = safeName(item.issuer, '발급기관미정');
  const violDate = dateOnly(item.date) || '날짜미정';
  return `${car}_${tenant}_${issuer}_${violDate}.pdf`;
}

/** 묶음 파일명 — 1건이면 단일 파일명, N>1 이면 첫 차량 + 외 N-1건 */
function bundleFileName(items: PenaltyWorkItem[]): string {
  if (items.length === 1) return fileNameForItem(items[0]);

  const firstCar = safeName(items[0].car_number, '차량미정');
  const issuer = safeName(items[0].issuer, '발급기관미정');
  const today = new Date().toISOString().slice(0, 10);
  return `${issuer}_${firstCar}외${items.length - 1}건_${today}.pdf`;
}

/* ────────────────── zip 다운로드 ────────────────── */

/**
 * 그룹 키 — 같은 (회사 × 발급기관) 단위로 묶음 PDF 1개씩.
 * 회사 매칭 안된 케이스는 "NOCOMP" 키 → "00_회사명없음" 폴더로 분류.
 */
function groupKey(item: PenaltyWorkItem): string {
  const company = item._company?.code ?? 'NOCOMP';
  const issuer = item.issuer ?? 'unknown';
  return `${company}__${issuer}`;
}

export async function downloadPenaltyZip(
  items: PenaltyWorkItem[],
  staff: IssueContext['staff'],
  opts?: Parameters<typeof buildContext>[2] & {
    onProgress?: (done: number, total: number) => void;
  },
): Promise<void> {
  if (items.length === 0) return;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const todayStr = new Date().toISOString().slice(0, 10);
  const rootFolder = zip.folder(todayStr);
  if (!rootFolder) return;

  // 모든 항목 → (회사 × 발급기관) 단위 그룹핑.
  // 미매칭 (회사 없음) 도 PDF 생성. "회사명없음" placeholder 로 표기되고
  // "00_회사명없음" 폴더로 분류 → 사용자가 나중에 매칭 후 재생성.
  const groups = new Map<string, PenaltyWorkItem[]>();
  for (const item of items) {
    const key = groupKey(item);
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }

  let done = 0;
  const total = groups.size;

  for (const [, groupItems] of groups) {
    const compFolder = rootFolder.folder(folderNameForCompany(groupItems[0]));
    if (!compFolder) continue;

    const merged = await buildCasePdf(groupItems, staff, opts);
    compFolder.file(bundleFileName(groupItems), merged);

    done++;
    opts?.onProgress?.(done, total);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `과태료_변경부과_${todayStr}_${items.length}건.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/* ────────────────── 하위 호환 ────────────────── */

/** @deprecated downloadPenaltyZip 사용 */
export async function downloadPenaltyMergedPdf(
  items: PenaltyWorkItem[],
  staff?: IssueContext['staff'],
): Promise<void> {
  if (!staff) {
    throw new Error('downloadPenaltyMergedPdf: staff 인자 필요');
  }
  return downloadPenaltyZip(items, staff);
}
