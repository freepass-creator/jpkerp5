'use client';

/**
 * Drive 미러 백업 헬퍼 — 클라이언트에서 호출하는 wrapper.
 *
 *   await driveMirrorFromUrl({
 *     fileUrl: vehicle.registrationCertUrl,
 *     fileName: '등록증.pdf',
 *     path: `자산/${companyName}/${vehicle.plate}`,
 *     idToken,  // Firebase ID 토큰
 *   });
 *
 * Firebase Storage URL → Blob 다운로드 → /api/google/drive/upload 전송.
 *
 * 정책: 미러 백업이라 실패해도 ERP 흐름 멈추지 X (catch + toast warning).
 */

export type DriveMirrorInput = {
  fileUrl: string;
  fileName: string;
  path: string;       // 예: '계약/JPK본사/12가1234/CR-2026-001'
  idToken: string;
};

export type DriveMirrorResult = {
  ok: boolean;
  fileId?: string;
  webViewLink?: string;
  error?: string;
};

export async function driveMirrorFromUrl(input: DriveMirrorInput): Promise<DriveMirrorResult> {
  if (!input.fileUrl || !input.fileName || !input.path) {
    return { ok: false, error: 'fileUrl/fileName/path 필수' };
  }
  try {
    const blob = await (await fetch(input.fileUrl)).blob();
    const file = new File([blob], input.fileName, { type: blob.type || 'application/octet-stream' });

    const form = new FormData();
    form.append('file', file);
    form.append('path', input.path);
    form.append('fileName', input.fileName);

    const res = await fetch('/api/google/drive/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.idToken}` },
      body: form,
    });
    const json = await res.json();
    if (!json.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    return { ok: true, fileId: json.fileId, webViewLink: json.webViewLink };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? String(e) };
  }
}

/** Vehicle 의 모든 첨부 파일을 Drive 에 일괄 백업 — 자산 dialog 에서 "Drive 백업" 버튼 누를 때. */
export async function driveMirrorVehicleDocs(args: {
  vehicle: {
    plate?: string;
    company?: string;
    registrationCertUrl?: string;
    registrationCertFileName?: string;
    insuranceCertUrl?: string;
    insuranceCertFileName?: string;
    loanContractUrl?: string;
    loanContractFileName?: string;
    inspectionCertUrl?: string;
    inspectionCertFileName?: string;
    gpsInstallUrl?: string;
    gpsInstallFileName?: string;
    disposalCertUrl?: string;
    disposalCertFileName?: string;
    manufacturerQuoteUrl?: string;
    manufacturerQuoteFileName?: string;
    purchaseOrderUrl?: string;
    purchaseOrderFileName?: string;
  };
  companyName: string;
  idToken: string;
}): Promise<{ uploaded: number; failed: number; details: Array<{ label: string; result: DriveMirrorResult }> }> {
  const { vehicle, companyName, idToken } = args;
  const plate = vehicle.plate || '미정';
  const basePath = `자산/${companyName}/${plate}`;
  const candidates: Array<{ label: string; url?: string; name?: string; subDir?: string }> = [
    { label: '등록증',       url: vehicle.registrationCertUrl,  name: vehicle.registrationCertFileName  ?? '등록증.pdf',     subDir: '등록증' },
    { label: '보험증권',     url: vehicle.insuranceCertUrl,     name: vehicle.insuranceCertFileName     ?? '보험증권.pdf',   subDir: '보험' },
    { label: '할부계약서',   url: vehicle.loanContractUrl,      name: vehicle.loanContractFileName      ?? '할부계약서.pdf', subDir: '할부' },
    { label: '정기검사증',   url: vehicle.inspectionCertUrl,    name: vehicle.inspectionCertFileName    ?? '검사증.pdf',     subDir: '검사' },
    { label: 'GPS 설치증빙', url: vehicle.gpsInstallUrl,        name: vehicle.gpsInstallFileName        ?? 'GPS설치.pdf',    subDir: 'GPS' },
    { label: '매도증',       url: vehicle.disposalCertUrl,      name: vehicle.disposalCertFileName      ?? '매도증.pdf',     subDir: '매각' },
    { label: '제조사 견적',  url: vehicle.manufacturerQuoteUrl, name: vehicle.manufacturerQuoteFileName ?? '제조사견적.pdf', subDir: '매입' },
    { label: '발주서',       url: vehicle.purchaseOrderUrl,     name: vehicle.purchaseOrderFileName     ?? '발주서.pdf',     subDir: '매입' },
  ];

  const details: Array<{ label: string; result: DriveMirrorResult }> = [];
  let uploaded = 0;
  let failed = 0;
  for (const c of candidates) {
    if (!c.url || !c.name) continue;
    const res = await driveMirrorFromUrl({
      fileUrl: c.url,
      fileName: c.name,
      path: `${basePath}/${c.subDir ?? ''}`.replace(/\/+$/, ''),
      idToken,
    });
    details.push({ label: c.label, result: res });
    if (res.ok) uploaded += 1; else failed += 1;
  }
  return { uploaded, failed, details };
}

/** Contract 의 계약서 + 면허증 일괄 백업. */
export async function driveMirrorContractDocs(args: {
  contract: {
    contractNo?: string;
    company?: string;
    vehiclePlate?: string;
    customerLicenseCertUrl?: string;
    customerLicenseCertFileName?: string;
    contractDocUrl?: string;
    contractDocFileName?: string;
  };
  companyName: string;
  idToken: string;
}): Promise<{ uploaded: number; failed: number; details: Array<{ label: string; result: DriveMirrorResult }> }> {
  const { contract, companyName, idToken } = args;
  const contractNo = contract.contractNo || '미정';
  const plate = contract.vehiclePlate || '미정';
  const basePath = `계약/${companyName}/${plate}/${contractNo}`;
  const candidates: Array<{ label: string; url?: string; name?: string }> = [
    { label: '계약서',     url: contract.contractDocUrl,         name: contract.contractDocFileName         ?? '계약서.pdf' },
    { label: '면허증',     url: contract.customerLicenseCertUrl, name: contract.customerLicenseCertFileName ?? '면허증.jpg' },
  ];

  const details: Array<{ label: string; result: DriveMirrorResult }> = [];
  let uploaded = 0;
  let failed = 0;
  for (const c of candidates) {
    if (!c.url || !c.name) continue;
    const res = await driveMirrorFromUrl({
      fileUrl: c.url,
      fileName: c.name,
      path: basePath,
      idToken,
    });
    details.push({ label: c.label, result: res });
    if (res.ok) uploaded += 1; else failed += 1;
  }
  return { uploaded, failed, details };
}
