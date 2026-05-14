/** 과태료 / 통행료 / 범칙금 — 정부기관에서 발급한 위반 통지서 */

export type PenaltyDocType = '과태료' | '통행료' | '속도위반' | '주정차위반' | '신호위반' | '범칙금' | '기타';

export type PenaltyStatus =
  | '접수'           // OCR/등록 완료, 아직 미처리
  | '계약매칭'       // 차량번호로 계약 찾음, 임차인 식별됨
  | '임차인통보'     // 임차인에게 변경부과 확인서 발송
  | '납부완료'       // 임차인이 납부 완료
  | '회사납부'       // 회사가 대신 납부 (임차인 미상 등)
  | '이의신청';      // 이의 진행 중

export type Penalty = {
  id: string;
  // OCR 추출 정보
  docType: PenaltyDocType;
  noticeNo: string;             // 통지번호 (고유)
  issuer: string;               // 발급기관 (예: 서울지방경찰청)
  issueDate: string;            // 발급일 YYYY-MM-DD
  violationDate: string;        // 위반일자
  violationLocation?: string;   // 위반 장소
  description?: string;         // 위반 내용
  lawArticle?: string;          // 법조항
  payerName?: string;           // 명의자 (보통 회사)
  carNumber: string;            // 위반 차량번호
  // 금액
  amount: number;               // 총 부과액
  penaltyAmount?: number;       // 과태료
  fineAmount?: number;          // 범칙금
  surcharge?: number;           // 가산금
  tollAmount?: number;          // 통행료
  // 납부 정보
  dueDate?: string;
  payAccount?: string;
  // 처리 상태
  status: PenaltyStatus;
  matchedContractId?: string;   // 매칭된 계약 ID
  matchedDrivingFrom?: string;  // 위반일 당시 운행 시작일
  matchedDrivingTo?: string;
  noticedAt?: string;           // 임차인 통보 일시
  paidAt?: string;
  // 첨부
  fileName?: string;
  fileDataUrl?: string;         // 원본 PDF/이미지 (base64)
  // 감사
  createdAt: string;
  createdBy?: string;
  notes?: string;
};
