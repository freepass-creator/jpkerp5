'use client';

/**
 * /asset/loan — 할부스케줄.
 * v4 stub 그대로 — 차량 자산별 할부/리스 스케줄 (별도 entity 필요, Phase 2).
 */

import { Bank } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';

export default function AssetLoanPage() {
  return (
    <MasterPageShell
      title="할부스케줄"
      icon={<Bank size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={ASSET_SUB}
      bottomBar={
        <BottomBar
          left={
            <>
              <span>전체 <strong>0</strong></span>
              <span>진행중 <strong>0</strong></span>
              <span>완료 <strong>0</strong></span>
            </>
          }
          right={
            <>
              <button className="btn" type="button">엑셀</button>
              <button className="btn btn-primary" type="button">+ 할부 등록</button>
            </>
          }
        />
      }
    >
      <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-weak)' }}>
        <Bank size={40} weight="duotone" style={{ display: 'block', margin: '0 auto 12px', color: 'var(--text-muted)' }} />
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>할부 스케줄 없음</div>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          ① 자산 등록 후 [할부 등록] 으로 할부/리스 스케줄 입력<br />
          ② 회차별 납입예정일·납입금액 자동 생성<br />
          ③ 미납 회차 자산별 누적 표시
        </div>
      </div>
    </MasterPageShell>
  );
}
