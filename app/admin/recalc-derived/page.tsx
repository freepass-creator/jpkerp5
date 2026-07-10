'use client';

/**
 * /admin/recalc-derived — 파생값 재계산·확정 (R6, export/v6 이관 전).
 *
 * 미수·회차상태·paidAmount·dueDate 는 RTDB에 stale 캐시로 남을 수 있고(정본은 recalcContract 재계산),
 * 덤프를 그대로 v6로 옮기면 '예정인데 실제론 연체' 어긋남 발생. 이 도구는 data-context가 이미
 * 재계산한 신선값을 RTDB에 확정 저장(+_recalcAt 스탬프) → 덤프가 신선. export 직전 실행 권장.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useContracts } from '@/lib/firebase/contracts-store';
import { useRole } from '@/lib/use-role';
import { showConfirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { todayKr } from '@/lib/mock-data';

export default function RecalcDerivedPage() {
  const router = useRouter();
  const { isMaster, loading: roleLoading } = useRole();
  const { contracts, updateMany } = useContracts(); // 이미 recalcContract 통과된 신선값
  const [busy, setBusy] = useState(false);

  const today = todayKr();
  const stats = useMemo(() => {
    const withSchedules = contracts.filter((c) => (c.schedules?.length ?? 0) > 0);
    const confirmedToday = withSchedules.filter((c) => (c._recalcAt ?? '').slice(0, 10) === today).length;
    return {
      total: contracts.length,
      derived: withSchedules.length,
      confirmedToday,
      stale: withSchedules.length - confirmedToday,
      targets: withSchedules,
    };
  }, [contracts, today]);

  async function confirmRecalc() {
    if (stats.targets.length === 0) { toast.info('파생 대상(회차 있는 계약) 없음'); return; }
    if (!await showConfirm({
      title: `파생값을 재계산·확정할까요? (${stats.targets.length}건)`,
      description: '미수·회차상태·dueDate 의 현재 계산값을 RTDB에 확정 저장 + _recalcAt 스탬프. export/v6 이관 직전에 실행하세요. 재실행 가능.',
      confirmLabel: '재계산·확정',
    })) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await updateMany(stats.targets.map((c) => ({ ...c, _recalcAt: now })));
      toast.success(`${stats.targets.length}건 파생값 확정 (덤프 신선화)`);
    } catch (e) {
      toast.error(`실패: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!roleLoading && !isMaster) { router.replace('/'); return null; }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <header className="page-header" style={{ marginBottom: 16 }}>
          <h1 className="page-header-title"><ArrowsClockwise size={18} weight="duotone" /> 파생값 재계산·확정 (export 전)</h1>
          <div className="page-header-title-sub">
            미수·회차상태·dueDate 는 stale 캐시로 남을 수 있음. 앱이 이미 재계산한 신선값을 RTDB에 확정 저장 → 덤프/이관이 신선. v6 이관 직전 실행 권장.
          </div>
        </header>

        <div className="panel">
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Kpi label="전체 계약" value={stats.total} />
            <Kpi label="파생 대상(회차)" value={stats.derived} />
            <Kpi label="오늘 확정됨" value={stats.confirmedToday} tone="var(--green-text)" />
            <Kpi label="미확정/구값" value={stats.stale} tone={stats.stale > 0 ? 'var(--orange-text)' : undefined} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <button className="btn btn-primary" type="button" disabled={busy || stats.derived === 0} onClick={confirmRecalc}>
              {busy ? '확정 중…' : `파생값 재계산·확정 (${stats.derived}건)`}
            </button>
            <div className="dim" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
              ※ 파생값은 시점(오늘) 기준이라 시간이 지나면 다시 stale — export/이관 <strong>직전</strong>에 실행해야 의미가 있습니다.
              <br />※ 라이브 운영 화면은 항상 재계산되어 신선하므로 평소엔 불필요. 이건 <strong>덤프/이관용</strong>입니다.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ padding: '4px 8px' }}>
      <div className="dim" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: tone }}>{value}</div>
    </div>
  );
}
