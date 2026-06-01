'use client';

/**
 * 손님 자가조회 — 진입 페이지.
 *
 * Firebase Anonymous Auth + Client SDK 방식:
 *   1. signInAnonymously → RTDB auth != null 통과
 *   2. /v5/contracts 를 vehiclePlate 인덱스 쿼리 → 입력한 차량번호 일치분만 fetch (전체 X)
 *   3. matchesIdent 클라이언트에서 확인 → 미일치면 즉시 폐기
 *   4. 일치한 1건만 PII 마스킹 후 sessionStorage 저장 → 상세 페이지로
 *
 * 보안 노트:
 *   - 차량번호를 알아야 쿼리 가능 (전체 contracts 스캔 차단)
 *   - 매칭된 1건의 원본도 즉시 마스킹 → sessionStorage에는 마스킹본만
 *   - URL에는 plate만 남고 ident는 흔적 없음
 *
 * 사전 설정 (Firebase Console):
 *   · Authentication → Sign-in method → Anonymous 활성화
 *   · RTDB Rules → contracts 노드에 ".indexOn": ["vehiclePlate"]
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ref, query, orderByChild, equalTo, get } from 'firebase/database';
import { signInAnonymously } from 'firebase/auth';
import { ShieldCheck, ArrowRight, CircleNotch, MagnifyingGlass } from '@phosphor-icons/react';
import { getRtdb, getFirebaseAuth, RTDB_ROOT } from '@/lib/firebase/client';
import { findCustomerContract, normalizePlate, maskIdent, maskLicense } from '@/lib/customer-match';
import type { Contract, Vehicle, Company } from '@/lib/types';

const SESSION_KEY = 'jpk-customer-lookup';

function asArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val.filter(Boolean) as T[];
  if (val && typeof val === 'object') return Object.values(val as Record<string, T>);
  return [];
}

/** 손님 노출용 — 민감 PII 마스킹 + 내부 필드 제거 */
function sanitizeContract(c: Contract) {
  return {
    contractNo: c.contractNo,
    company: c.company,
    customerName: c.customerName,
    customerPhone1: c.customerPhone1,
    customerPhone2: c.customerPhone2,
    customerRegion: c.customerRegion,
    customerDistrict: c.customerDistrict,
    customerIdentMasked: maskIdent(c.customerIdentNo),
    customerLicenseMasked: maskLicense(c.customerLicenseNo),
    customerLicenseType: c.customerLicenseType,
    customerLicenseStatus: c.customerLicenseStatus,
    vehiclePlate: c.vehiclePlate,
    vehicleModel: c.vehicleModel,
    vehicleStatus: c.vehicleStatus,
    contractDate: c.contractDate,
    returnScheduledDate: c.returnScheduledDate,
    returnedDate: c.returnedDate,
    termMonths: c.termMonths,
    monthlyRent: c.monthlyRent,
    deposit: c.deposit,
    paymentDay: c.paymentDay,
    paymentMethod: c.paymentMethod,
    status: c.status,
    currentSeq: c.currentSeq,
    totalSeq: c.totalSeq,
    lastPaidDate: c.lastPaidDate,
    lastPaidAmount: c.lastPaidAmount,
    unpaidAmount: c.unpaidAmount,
    unpaidSeqCount: c.unpaidSeqCount,
    schedules: (c.schedules ?? []).map((s) => ({
      seq: s.seq,
      dueDate: s.dueDate,
      amount: s.amount,
      status: s.status,
      paidAmount: s.paidAmount,
      paidAt: s.paidAt,
    })),
    // 계약서 다운로드 (Storage URL)
    contractDocUrl: c.contractDocUrl,
    contractDocFileName: c.contractDocFileName,
    contractDocUploadedAt: c.contractDocUploadedAt,
  };
}

function sanitizeVehicle(v: Vehicle | undefined) {
  if (!v) return null;
  return {
    plate: v.plate,
    model: v.model,
    status: v.status,
    vehicleMaker: v.vehicleMaker,
    vehicleModelLine: v.vehicleModelLine,
    vehicleSubModel: v.vehicleSubModel,
    vehicleVariant: v.vehicleVariant,
    vehicleTrim: v.vehicleTrim,
    exteriorColor: v.exteriorColor,
    interiorColor: v.interiorColor,
    fuelType: v.fuelType,
    displacementCc: v.displacementCc,
    seatingCapacity: v.seatingCapacity,
    // 등록증·보험가입증명서 다운로드 (Storage URL)
    registrationCertUrl: v.registrationCertUrl,
    registrationCertFileName: v.registrationCertFileName,
    registrationCertUploadedAt: v.registrationCertUploadedAt,
    insuranceCertUrl: v.insuranceCertUrl,
    insuranceCertFileName: v.insuranceCertFileName,
    insuranceCertUploadedAt: v.insuranceCertUploadedAt,
  };
}

function sanitizeCompany(c: Company | undefined) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    ceo: c.ceo,
    address: c.address,
    mainPhone: c.mainPhone,
    customerServicePhone: c.customerServicePhone,
    accounts: (c.accounts ?? []).map((a) => ({
      bankName: a.bankName,
      accountNo: a.accountNo,
      holderName: a.accountHolder,
    })),
  };
}

export default function CustomerLookupEntry() {
  const router = useRouter();
  const [plate, setPlate] = useState('');
  const [ident, setIdent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plate.trim() || !ident.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const db = getRtdb();
      const auth = getFirebaseAuth();
      if (!db || !auth) {
        setErr('서버 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.');
        return;
      }

      // 1) 익명 인증 — RTDB 'auth != null' 통과용
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          const code = (e as { code?: string }).code ?? '';
          if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
            setErr('서버 설정이 완료되지 않았습니다. (Anonymous Auth 미활성)');
          } else {
            setErr('인증 실패 — 잠시 후 다시 시도해주세요.');
          }
          return;
        }
      }

      const np = normalizePlate(plate);

      // 2) vehiclePlate 인덱스 쿼리 — 입력한 차량번호 일치 계약만 fetch
      //    (전체 contracts 노드 스캔 차단 — 인덱스 없으면 Firebase가 클라이언트 정렬해서 모두 내려옴 → rules에 ".indexOn" 필수)
      const contractsQ = query(
        ref(db, `${RTDB_ROOT}/contracts`),
        orderByChild('vehiclePlate'),
        equalTo(np),
      );
      const snap = await get(contractsQ);
      const contracts = asArray<Contract>(snap.val());

      // 3) ident 매칭 — 클라이언트에서 (마스킹 전 raw 사용)
      const matched = findCustomerContract(contracts, plate, ident);
      if (!matched) {
        setErr('일치하는 계약을 찾을 수 없습니다. 차량번호와 등록번호를 다시 확인해주세요.');
        return;
      }

      // 4) 차량 + 회사 fetch — 매칭된 1건의 plate/company로만 좁혀서
      const vehiclesQ = query(
        ref(db, `${RTDB_ROOT}/vehicles`),
        orderByChild('plate'),
        equalTo(matched.vehiclePlate),
      );
      const vSnap = await get(vehiclesQ);
      const vehicle = asArray<Vehicle>(vSnap.val())[0];

      let company: Company | undefined;
      if (matched.company) {
        const cSnap = await get(ref(db, `${RTDB_ROOT}/companies`));
        const companies = asArray<Company>(cSnap.val());
        company = companies.find((co) => co.name === matched.company || co.id === matched.company);
      }

      // 5) 즉시 마스킹 → sessionStorage에는 마스킹된 데이터만
      const safe = {
        contract: sanitizeContract(matched),
        vehicle: sanitizeVehicle(vehicle),
        company: sanitizeCompany(company),
      };

      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe));
      } catch { /* ignore */ }
      router.push(`/customer/${encodeURIComponent(plate.trim())}`);
    } catch (e) {
      console.error('[customer/lookup]', e);
      const code = (e as { code?: string }).code ?? '';
      if (code === 'PERMISSION_DENIED') {
        setErr('서버 설정이 완료되지 않았습니다. (RTDB 권한)');
      } else {
        setErr('네트워크 오류입니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lookup-shell">
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');
        body, html { margin: 0; padding: 0; background: linear-gradient(135deg, #1B2A4A 0%, #0b1220 100%); min-height: 100vh; font-family: 'Pretendard Variable', sans-serif; }
        .lookup-shell {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 40px 20px;
        }
        .lookup-card {
          width: 100%; max-width: 420px;
          background: #fff; border-radius: 12px;
          padding: 40px 32px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .lookup-card .icon-wrap {
          width: 40px; height: 40px; border-radius: 99px;
          background: rgba(27,42,74,0.08); color: #1B2A4A;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 14px;
        }
        .lookup-card h1 {
          font-size: 20px; font-weight: 800; text-align: center;
          margin: 0 0 8px; color: #0b1220; letter-spacing: -0.4px;
        }
        .lookup-card .sub {
          text-align: center; font-size: 13px; color: #64748b;
          margin: 0 0 28px; line-height: 1.6;
        }
        .lookup-card label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px; }
        .lookup-card .field { margin-bottom: 18px; }
        .lookup-card input {
          width: 100%; box-sizing: border-box;
          height: 44px; padding: 0 14px;
          font-size: 14px; font-family: inherit;
          border: 1px solid #d6dbe3; border-radius: 6px;
          color: #0b1220; background: #fff;
          transition: border-color 0.15s;
        }
        .lookup-card input:focus {
          outline: none; border-color: #1B2A4A;
          box-shadow: 0 0 0 3px rgba(27,42,74,0.08);
        }
        .lookup-card .hint {
          font-size: 11px; color: #94a3b8; margin-top: 4px;
        }
        .lookup-card button[type=submit] {
          width: 100%; height: 48px; margin-top: 8px;
          font-size: 14px; font-weight: 700;
          background: #1B2A4A; color: #fff;
          border: none; border-radius: 6px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          transition: opacity 0.15s;
        }
        .lookup-card button[type=submit]:disabled { opacity: 0.5; cursor: not-allowed; }
        .lookup-card button[type=submit]:not(:disabled):hover { background: #0b1220; }
        .lookup-card .err {
          padding: 10px 12px; margin-bottom: 14px;
          background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;
          border-radius: 6px; font-size: 12px;
        }
        .lookup-card .footnote {
          margin-top: 20px; padding-top: 16px;
          border-top: 1px solid #eef0f4;
          font-size: 11px; color: #94a3b8; line-height: 1.6;
          display: flex; align-items: flex-start; gap: 8px;
        }
        .lookup-card .footnote svg { flex-shrink: 0; margin-top: 2px; color: #64748b; }
        .lookup-card .footnote .txt { flex: 1; }
      `}</style>

      <form className="lookup-card" onSubmit={handleSubmit}>
        <div className="icon-wrap">
          <MagnifyingGlass size={18} weight="bold" />
        </div>
        <h1>차량 대여 계약 조회</h1>
        <p className="sub">차량번호와 등록번호로<br />본인의 계약 정보를 확인하실 수 있습니다.</p>

        {err && <div className="err">{err}</div>}

        <div className="field">
          <label htmlFor="plate">차량번호</label>
          <input
            id="plate"
            type="text"
            placeholder="예: 12가1234"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="ident">등록번호</label>
          <input
            id="ident"
            type="text"
            placeholder="생년월일 6자리 / 휴대폰 / 사업자번호 / 법인번호"
            value={ident}
            onChange={(e) => setIdent(e.target.value)}
            required
          />
          <div className="hint">개인 — 생년월일 6자리(예: 880101) 또는 휴대폰 / 사업자 — 사업자번호 / 법인 — 법인등록번호</div>
        </div>

        <button type="submit" disabled={submitting || !plate.trim() || !ident.trim()}>
          {submitting ? (
            <>
              <CircleNotch size={16} weight="bold" style={{ animation: 'spin 1s linear infinite' }} />
              조회 중…
            </>
          ) : (
            <>
              조회하기 <ArrowRight size={16} weight="bold" />
            </>
          )}
        </button>

        <div className="footnote">
          <ShieldCheck size={13} weight="fill" />
          <div className="txt">
            입력한 정보는 본인 확인 외 다른 용도로 사용되지 않습니다.
            <br />
            개인정보는 모두 마스킹되어 표시됩니다.
          </div>
        </div>
      </form>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
