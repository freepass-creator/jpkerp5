/**
 * 회사 표준 문서 발급 시스템 — 양식 등록·발급 로그·Drive 보관.
 *
 * 구조:
 *   1. DocTemplate — 양식 정의 (id, 분류, 필드, body HTML)
 *   2. registerTemplate() / getTemplate() — 양식 등록·조회
 *   3. renderBody() — 입력값 + 양식 → 최종 HTML
 *   4. issueDocument() — 발급 (문서번호 부여 + Drive 저장 + 로그)
 *
 * 양식 추가 = 이 파일에 DocTemplate 1개 push. 별도 페이지 작성 불필요.
 *
 * 렌터카 관련 (시설대여계약서, 차량인수증) 은 ERP 안에 이미 있으므로 여기 제외.
 * 일반관리 안에서 발급할 직원·거래처 대상 문서만 다룸.
 */

import type { Company } from './types';

export type DocTargetType = 'staff' | 'partner' | 'free';   // free = 자유 입력 (대상 미지정)
export type DocCategory = '인사' | '거래' | '대외' | '행정' | '법무';

/** 양식 필드 정의. type 에 따라 다이얼로그 input 렌더링이 결정됨. */
export type DocFieldDef = {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea' | 'select';
  required?: boolean;
  /** 기본값 — 사용자 입력 전 미리 채워둘 값 */
  default?: string;
  /** 자동 prefill 출처: 회사·직원·거래처. dialog 가 alSo 자동 채움 */
  prefillFrom?: 'company' | 'staff' | 'partner';
  /** prefill 출처에서 어떤 필드 가져올지 */
  prefillKey?: string;
  /** type='select' 일 때 옵션 */
  options?: string[];
  /** 1열 vs 2열 — 다이얼로그 그리드 폭 */
  colSpan?: 1 | 2;
  placeholder?: string;
};

export type DocTemplate = {
  /** 고유 ID (영문 kebab-case) */
  id: string;
  /** 한글 제목 — 다이얼로그·발급문서·드라이브 파일명에 사용 */
  title: string;
  category: DocCategory;
  /** 대상 — staff/partner/free */
  target: DocTargetType;
  /** 발급문서번호 prefix — JPK-{prefix}-{YYMM}-{seq} */
  prefix: string;
  /** Drive 보관 경로 (회사명 뒤에 붙음). 예: '인사/{직원명}' */
  drivePathPattern: string;
  /** UI 설명 */
  description?: string;
  /** 입력 필드들 */
  fields: DocFieldDef[];
  /**
   * 본문 HTML — {{key}} 형태 치환. 회사정보는 {{company.name}} 등 prefix.
   * 양식 디자인은 components/document-preview.tsx 가 공통 wrap.
   */
  body: string;
};

/* ────────────────── 양식 레지스트리 ────────────────── */

const REGISTRY = new Map<string, DocTemplate>();

export function registerTemplate(t: DocTemplate): void {
  if (REGISTRY.has(t.id)) {
    console.warn(`[doc-template] 중복 id 무시: ${t.id}`);
    return;
  }
  REGISTRY.set(t.id, t);
}

export function getTemplate(id: string): DocTemplate | undefined {
  return REGISTRY.get(id);
}

export function listTemplates(filter?: { category?: DocCategory; target?: DocTargetType }): DocTemplate[] {
  let arr = Array.from(REGISTRY.values());
  if (filter?.category) arr = arr.filter((t) => t.category === filter.category);
  if (filter?.target) arr = arr.filter((t) => t.target === filter.target);
  return arr;
}

/* ────────────────── 본문 치환 ────────────────── */

type RenderContext = {
  data: Record<string, string>;
  company?: Pick<Company, 'name' | 'bizRegNo' | 'corpRegNo' | 'ceo' | 'address' | 'mainPhone'>;
  /** target=staff 또는 partner 일 때 대상자 정보 */
  target?: Record<string, string>;
  docNo: string;
  issuedAt: string;
};

/** "{{key}}" 또는 "{{company.name}}" 같은 placeholder 치환. 못 찾으면 빈 문자열. */
export function renderBody(template: DocTemplate, ctx: RenderContext): string {
  return template.body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const parts = path.split('.');
    let scope: Record<string, unknown> = { ...ctx.data, docNo: ctx.docNo, issuedAt: ctx.issuedAt };
    if (ctx.company) (scope as Record<string, unknown>).company = ctx.company as unknown as Record<string, unknown>;
    if (ctx.target) (scope as Record<string, unknown>).target = ctx.target;
    let cur: unknown = scope;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return '';
      }
    }
    return cur == null ? '' : String(cur);
  });
}

/** 발급문서번호 생성 — JPK-{prefix}-{YYMM}-{seq}. seq 는 호출자가 일련번호 누적 관리. */
export function buildDocNo(prefix: string, seq: number, when: Date = new Date()): string {
  const yy = String(when.getFullYear()).slice(-2);
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  return `JPK-${prefix}-${yy}${mm}-${String(seq).padStart(3, '0')}`;
}

/* ────────────────── 한국식 헬퍼 ────────────────── */

export function fmtKDate(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function fmtKMoney(n: number | string): string {
  const num = typeof n === 'number' ? n : Number(String(n).replace(/[,\s]/g, ''));
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString('ko-KR');
}

/* ════════════════════════════════════════════════════════════════════
 *  1차 — 4종 초기 양식 등록
 * ════════════════════════════════════════════════════════════════════ */

// ─── 1. 재직증명서 (인사 / 직원) ───
registerTemplate({
  id: 'employment-certificate',
  title: '재직증명서',
  category: '인사',
  target: 'staff',
  prefix: 'ERT',
  drivePathPattern: '인사/{{target.name}}',
  description: '직원의 재직 사실 증명. 금융·관공서·이주 등 제출용.',
  fields: [
    { key: 'purpose', label: '발급 용도', type: 'text', required: true, default: '금융기관 제출용', colSpan: 2 },
    { key: 'department', label: '부서', type: 'text', prefillFrom: 'staff', prefillKey: 'department' },
    { key: 'position', label: '직급', type: 'text', prefillFrom: 'staff', prefillKey: 'position' },
    { key: 'hiredDate', label: '입사일', type: 'date', prefillFrom: 'staff', prefillKey: 'hiredDate', required: true },
    { key: 'status', label: '재직상태', type: 'select', options: ['재직중', '휴직중'], default: '재직중' },
  ],
  body: `
<div class="doc-title">재 직 증 명 서</div>

<section>
  <div class="section-title">■ 인적사항</div>
  <table class="info">
    <tr>
      <th>성 명</th><td>{{target.name}}</td>
      <th>생년월일</th><td>{{target.birth}}</td>
    </tr>
    <tr>
      <th>주 소</th><td colspan="3">{{target.address}}</td>
    </tr>
  </table>
</section>

<section>
  <div class="section-title">■ 재직사항</div>
  <table class="info">
    <tr>
      <th>회 사 명</th><td>{{company.name}}</td>
      <th>사업자등록번호</th><td>{{company.bizRegNo}}</td>
    </tr>
    <tr>
      <th>회사주소</th><td colspan="3">{{company.address}}</td>
    </tr>
    <tr>
      <th>부 서</th><td>{{department}}</td>
      <th>직 급</th><td>{{position}}</td>
    </tr>
    <tr>
      <th>입사일자</th><td>{{hiredDate}}</td>
      <th>재직상태</th><td>{{status}}</td>
    </tr>
  </table>
</section>

<section>
  <div class="section-title">■ 용 도</div>
  <div class="purpose-box">{{purpose}}</div>
  <div class="body-text">위와 같이 본 회사에 재직하고 있음을 증명합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line">
    <strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span>
  </div>
</footer>
`,
});

// ─── 2. 거래사실확인서 (거래 / 거래처) ───
registerTemplate({
  id: 'transaction-confirmation',
  title: '거래사실확인서',
  category: '거래',
  target: 'partner',
  prefix: 'TXC',
  drivePathPattern: '거래/{{target.name}}',
  description: '특정 거래처와의 거래 사실을 증명. 입찰·금융·세무 제출용.',
  fields: [
    { key: 'purpose', label: '발급 용도', type: 'text', required: true, default: '거래은행 제출용', colSpan: 2 },
    { key: 'periodFrom', label: '거래기간 시작', type: 'date', required: true },
    { key: 'periodTo', label: '거래기간 종료', type: 'date', required: true },
    { key: 'tradeItem', label: '거래품목', type: 'text', default: '차량 임대 서비스', colSpan: 2 },
    { key: 'amount', label: '거래금액 (원)', type: 'number', placeholder: '20000000' },
    { key: 'note', label: '비고', type: 'textarea', colSpan: 2 },
  ],
  body: `
<div class="doc-title">거 래 사 실 확 인 서</div>

<section>
  <div class="section-title">■ 거래상대방</div>
  <table class="info">
    <tr>
      <th>상호 (법인명)</th><td>{{target.name}}</td>
      <th>사업자등록번호</th><td>{{target.bizRegNo}}</td>
    </tr>
    <tr>
      <th>대표자</th><td>{{target.ceo}}</td>
      <th>연락처</th><td>{{target.mainPhone}}</td>
    </tr>
    <tr>
      <th>주 소</th><td colspan="3">{{target.address}}</td>
    </tr>
  </table>
</section>

<section>
  <div class="section-title">■ 거래내용</div>
  <table class="info">
    <tr><th>거래기간</th><td colspan="3">{{periodFrom}} ~ {{periodTo}}</td></tr>
    <tr><th>거래품목</th><td colspan="3">{{tradeItem}}</td></tr>
    <tr><th>거래금액</th><td colspan="3"><strong>{{amount}}</strong> 원</td></tr>
    <tr><th>비고</th><td colspan="3">{{note}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 용 도</div>
  <div class="purpose-box">{{purpose}}</div>
  <div class="body-text">위와 같이 본 회사와 거래사실이 있음을 확인합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line">
    <strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span>
  </div>
</footer>
`,
});

// ─── 3. 입금확인서 (거래 / 거래처) ───
registerTemplate({
  id: 'payment-confirmation',
  title: '입금확인서',
  category: '거래',
  target: 'partner',
  prefix: 'PYC',
  drivePathPattern: '거래/{{target.name}}',
  description: '특정 금액의 입금 확인. 손님·거래처 요청 발급.',
  fields: [
    { key: 'amount', label: '입금금액 (원)', type: 'number', required: true, colSpan: 2, placeholder: '1000000' },
    { key: 'amountKr', label: '금액 (한글)', type: 'text', placeholder: '일백만원', colSpan: 2 },
    { key: 'depositDate', label: '입금일자', type: 'date', required: true },
    { key: 'depositMethod', label: '입금방법', type: 'select', options: ['계좌이체', '현금', '카드', 'CMS 자동이체', '기타'], default: '계좌이체' },
    { key: 'depositBank', label: '입금계좌 (수령)', type: 'text', placeholder: '신한은행 140-013-750928' },
    { key: 'purpose', label: '입금 사유', type: 'textarea', default: '차량 임대료', colSpan: 2 },
  ],
  body: `
<div class="doc-title">입 금 확 인 서</div>

<section>
  <div class="section-title">■ 수령자</div>
  <table class="info">
    <tr>
      <th>상 호</th><td>{{company.name}}</td>
      <th>사업자등록번호</th><td>{{company.bizRegNo}}</td>
    </tr>
    <tr><th>주 소</th><td colspan="3">{{company.address}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 입금자</div>
  <table class="info">
    <tr>
      <th>상호 (성명)</th><td>{{target.name}}</td>
      <th>연락처</th><td>{{target.mainPhone}}</td>
    </tr>
  </table>
</section>

<section>
  <div class="section-title">■ 입금사항</div>
  <table class="info">
    <tr><th>입금금액</th><td colspan="3"><strong>{{amount}}</strong> 원 ({{amountKr}})</td></tr>
    <tr><th>입금일자</th><td>{{depositDate}}</td><th>입금방법</th><td>{{depositMethod}}</td></tr>
    <tr><th>입금계좌</th><td colspan="3">{{depositBank}}</td></tr>
    <tr><th>입금사유</th><td colspan="3">{{purpose}}</td></tr>
  </table>
  <div class="body-text">위와 같이 입금받았음을 확인합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line">
    <strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span>
  </div>
</footer>
`,
});

// ─── 4. 위임장 (법인 명의) (대외 / 자유) ───
registerTemplate({
  id: 'letter-of-attorney',
  title: '위임장',
  category: '대외',
  target: 'free',
  prefix: 'POA',
  drivePathPattern: '위임장',
  description: '법인 명의로 제3자에게 권한 위임. 등기·차량·세무 등.',
  fields: [
    { key: 'agentName', label: '수임인 성명', type: 'text', required: true },
    { key: 'agentIdent', label: '수임인 주민번호', type: 'text', placeholder: '900101-1******' },
    { key: 'agentAddress', label: '수임인 주소', type: 'text', colSpan: 2 },
    { key: 'agentRelation', label: '관계', type: 'text', default: '본사 직원', placeholder: '본사 직원, 대리인 등' },
    { key: 'matter', label: '위임사항', type: 'textarea', required: true, colSpan: 2, placeholder: '예) 차량 12가1234 의 명의이전 등기 일체' },
    { key: 'validUntil', label: '위임유효기간', type: 'date' },
  ],
  body: `
<div class="doc-title">위 임 장</div>

<section>
  <div class="section-title">■ 위임인</div>
  <table class="info">
    <tr>
      <th>상 호</th><td>{{company.name}}</td>
      <th>사업자등록번호</th><td>{{company.bizRegNo}}</td>
    </tr>
    <tr>
      <th>대표자</th><td>{{company.ceo}}</td>
      <th>연락처</th><td>{{company.mainPhone}}</td>
    </tr>
    <tr><th>주 소</th><td colspan="3">{{company.address}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 수임인</div>
  <table class="info">
    <tr>
      <th>성 명</th><td>{{agentName}}</td>
      <th>주민등록번호</th><td>{{agentIdent}}</td>
    </tr>
    <tr><th>주 소</th><td colspan="3">{{agentAddress}}</td></tr>
    <tr><th>관 계</th><td colspan="3">{{agentRelation}}</td></tr>
  </table>
</section>

<section>
  <div class="section-title">■ 위임사항</div>
  <div class="purpose-box">{{matter}}</div>
  <table class="info" style="margin-top: 6mm;">
    <tr><th>유효기간</th><td>{{validUntil}}</td></tr>
  </table>
  <div class="body-text">위 사람을 본 회사의 대리인으로 정하고 위 사항에 대한 일체의 권한을 위임합니다.</div>
</section>

<footer class="doc-footer">
  <div class="issue-date">{{issuedAt}}</div>
  <div class="company-line">
    위임인  <strong>{{company.name}}</strong>  대표이사  <strong>{{company.ceo}}</strong> <span class="seal">印</span>
  </div>
</footer>
`,
});

/* ────────────────── exports ────────────────── */

/** 모든 양식 id 목록 (다이얼로그·테스트용) */
export function listTemplateIds(): string[] {
  return Array.from(REGISTRY.keys());
}
