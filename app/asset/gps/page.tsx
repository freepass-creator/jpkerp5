'use client';

/**
 * /asset/gps — GPS 관리.
 * v4 stub 그대로. GPS 관리는 별도 entity 필요 (Phase 2).
 */

import { MapPin } from '@phosphor-icons/react';
import { MasterPageShell } from '@/components/layout/master-page-shell';
import { ASSET_SUB } from '@/components/layout/sub-nav';
import { BottomBar } from '@/components/layout/bottom-bar';

export default function AssetGpsPage() {
  return (
    <MasterPageShell
      title="GPS관리"
      icon={<MapPin size={16} weight="fill" style={{ color: 'var(--brand)' }} />}
      subNav={ASSET_SUB}
      stats={<><span>전체<strong>0</strong></span><span>설치<strong>0</strong></span><span>미설치<strong>0</strong></span></>}
      bottomBar={
        <BottomBar
          left={<button className="btn btn-primary" type="button">+ GPS 등록</button>}
          right={<button className="btn" type="button">엑셀</button>}
        />
      }
    >
      <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-weak)' }}>
        <MapPin size={40} weight="duotone" style={{ display: 'block', margin: '0 auto 12px', color: 'var(--text-muted)' }} />
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>GPS 설치 차량 없음</div>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          ① [+ GPS 등록] 으로 단말기 시리얼·차량 매칭<br />
          ② 시동제어 활성 차량 자동 강조<br />
          ③ 실시간 위치 추적 (Phase 2)
        </div>
      </div>
    </MasterPageShell>
  );
}
