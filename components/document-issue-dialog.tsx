'use client';

/**
 * 표준 문서 발급 다이얼로그 — 양식 선택 → 폼 입력 → 미리보기 → 인쇄·발급.
 *
 * 호출:
 *   <DocumentIssueDialog open={open} onOpenChange={setOpen} />
 *
 * 흐름:
 *   1) 좌측: 양식 선택 (카테고리 + 양식)
 *   2) 좌측: 대상 선택 (직원·거래처·자유)
 *   3) 좌측: 양식 fields 입력 (회사·대상자 자동 prefill)
 *   4) 우측: 실시간 A4 미리보기
 *   5) 하단: [인쇄] [발급] — 발급 시 RTDB 로그 + (선택) Drive 보관
 */

import { useEffect, useMemo, useState } from 'react';
import { Printer, CheckCircle, X, FileText, User, Buildings } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { DocumentPreview } from '@/components/ui/document-preview';
import {
  listTemplates, getTemplate, renderBody, buildDocNo, fmtKDate, fmtKMoney,
  type DocTemplate, type DocCategory, type DocTargetType,
} from '@/lib/doc-templates';
import {
  addIssuedDocument, useIssuedDocuments, computeNextSeq,
} from '@/lib/firebase/issued-docs-store';
import { useCompanies } from '@/lib/firebase/companies-store';
import { useAuth } from '@/lib/use-auth';
import { todayKr } from '@/lib/mock-data';
import { toast } from '@/lib/toast';

const CATEGORIES: DocCategory[] = ['인사', '거래', '대외', '행정', '법무'];

export function DocumentIssueDialog({
  open, onOpenChange,
  defaultTemplateId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTemplateId?: string;
}) {
  const { user } = useAuth();
  const { companies } = useCompanies();
  const { items: issuedDocs } = useIssuedDocuments({ limit: 200 });

  const [templateId, setTemplateId] = useState<string>(defaultTemplateId ?? '');
  const [category, setCategory] = useState<DocCategory>('인사');
  // 회사 (발급자) — 보통 메인 법인 (대표회사)
  const [issuerId, setIssuerId] = useState<string>('');
  // 대상 ID (staff uid or partner company id)
  const [targetId, setTargetId] = useState<string>('');
  // 폼 입력값
  const [fieldData, setFieldData] = useState<Record<string, string>>({});

  const template = useMemo(() => templateId ? getTemplate(templateId) : undefined, [templateId]);

  // 카테고리 변경 시 첫 양식 선택
  useEffect(() => {
    if (templateId && template?.category === category) return;
    const first = listTemplates({ category })[0];
    if (first) setTemplateId(first.id);
  }, [category, template?.category, templateId]);

  // 양식 변경 시 폼 초기화 + 기본값 채움
  useEffect(() => {
    if (!template) return;
    const initial: Record<string, string> = {};
    for (const f of template.fields) {
      if (f.default) initial[f.key] = f.default;
    }
    setFieldData(initial);
    setTargetId('');
  }, [template?.id]);

  // 발급자 회사 — 직영 우선, 없으면 첫 회사
  useEffect(() => {
    if (issuerId) return;
    const own = companies.find((c) => c.partnerKind === '직영') ?? companies[0];
    if (own) setIssuerId(own.id);
  }, [companies, issuerId]);

  // 대상 선택 (직원·거래처) — 직영이 아닌 모든 회사 = 거래처
  const partnersList = useMemo(
    () => companies.filter((c) => c.partnerKind && c.partnerKind !== '직영'),
    [companies],
  );
  const issuerCompany = companies.find((c) => c.id === issuerId);
  const targetCompany = partnersList.find((c) => c.id === targetId);

  // 대상 변경 시 prefill
  useEffect(() => {
    if (!template) return;
    const next: Record<string, string> = { ...fieldData };
    for (const f of template.fields) {
      if (!f.prefillFrom || !f.prefillKey) continue;
      if (next[f.key]) continue; // 이미 입력된 건 보존
      if (f.prefillFrom === 'company' && issuerCompany) {
        const v = (issuerCompany as unknown as Record<string, unknown>)[f.prefillKey];
        if (v) next[f.key] = String(v);
      }
      if (f.prefillFrom === 'partner' && targetCompany) {
        const v = (targetCompany as unknown as Record<string, unknown>)[f.prefillKey];
        if (v) next[f.key] = String(v);
      }
      // staff prefill 은 RTDB staff 마스터 필요 — 추후 (지금은 사용자 직접 입력)
    }
    setFieldData(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCompany?.id, issuerCompany?.id, template?.id]);

  // 미리보기용 docNo + ctx
  const nextSeq = template ? computeNextSeq(issuedDocs, template.prefix) : 1;
  const previewDocNo = template ? buildDocNo(template.prefix, nextSeq) : '';
  const today = todayKr();

  const previewBody = useMemo(() => {
    if (!template) return '';
    // 자동 변환: 날짜 한글, 금액 콤마
    const transformed: Record<string, string> = { ...fieldData };
    for (const f of template.fields) {
      const v = fieldData[f.key];
      if (!v) continue;
      if (f.type === 'date') transformed[f.key] = fmtKDate(v);
      if (f.type === 'number') transformed[f.key] = fmtKMoney(v);
    }
    return renderBody(template, {
      data: transformed,
      company: issuerCompany ? {
        name: issuerCompany.name,
        bizRegNo: issuerCompany.bizRegNo,
        corpRegNo: issuerCompany.corpRegNo,
        ceo: issuerCompany.ceo,
        address: issuerCompany.address,
        mainPhone: issuerCompany.mainPhone,
      } : undefined,
      target: targetCompany ? {
        name: targetCompany.name,
        bizRegNo: targetCompany.bizRegNo ?? '',
        ceo: targetCompany.ceo ?? '',
        mainPhone: targetCompany.mainPhone ?? '',
        address: targetCompany.address ?? '',
      } : (template.target === 'staff' ? { name: fieldData['_targetName'] ?? '', birth: fieldData['_targetBirth'] ?? '', address: fieldData['_targetAddress'] ?? '' } : undefined),
      docNo: previewDocNo,
      issuedAt: fmtKDate(today),
    });
  }, [template, fieldData, issuerCompany, targetCompany, previewDocNo, today]);

  function setField(k: string, v: string) {
    setFieldData((prev) => ({ ...prev, [k]: v }));
  }

  function handlePrint() {
    window.print();
  }

  async function handleIssue() {
    if (!template || !issuerCompany) {
      toast.warning('양식·발급자 선택 필요');
      return;
    }
    // required 필드 검증
    const missing = template.fields.filter((f) => f.required && !fieldData[f.key]?.trim());
    if (missing.length > 0) {
      toast.warning(`필수값 누락: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    try {
      await addIssuedDocument({
        templateId: template.id,
        templateTitle: template.title,
        category: template.category,
        docNo: previewDocNo,
        targetType: template.target,
        targetId: targetId || undefined,
        targetName: targetCompany?.name ?? fieldData['_targetName'] ?? undefined,
        data: fieldData,
        issuerCompanyId: issuerCompany.id,
        issuerCompanyName: issuerCompany.name,
        issuedAt: new Date().toISOString(),
        issuedBy: user?.email ?? 'unknown',
      });
      toast.success(`${template.title} 발급 — ${previewDocNo}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`발급 실패: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`표준 문서 발급 ${template ? `— ${template.title}` : ''}`} size="xl">
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, minHeight: 600 }}>

          {/* 좌측 — 입력 */}
          <div style={{
            background: 'var(--bg-sunken)', padding: 14, borderRadius: 'var(--radius)',
            display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto',
            maxHeight: 'calc(100vh - 200px)',
          }} className="doc-print-hide">

            {/* 카테고리 chip */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4 }}>분류</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {CATEGORIES.map((c) => {
                  const has = listTemplates({ category: c }).length > 0;
                  if (!has) return null;
                  return (
                    <button
                      key={c} type="button"
                      className={`chip ${category === c ? 'active' : ''}`}
                      onClick={() => setCategory(c)}
                    >{c}</button>
                  );
                })}
              </div>
            </div>

            {/* 양식 드롭다운 */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4 }}>양식</div>
              <select
                className="input"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                style={{ width: '100%' }}
              >
                {listTemplates({ category }).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              {template?.description && (
                <div style={{ fontSize: 10, color: 'var(--text-weak)', marginTop: 4 }}>{template.description}</div>
              )}
            </div>

            {/* 발급자 (회사) */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4 }}>발급자 (회사)</div>
              <select
                className="input"
                value={issuerId}
                onChange={(e) => setIssuerId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">— 선택 —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* 대상 (target 따라 다름) */}
            {template?.target === 'staff' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <User size={11} weight="duotone" /> 대상 직원
                </div>
                <input
                  className="input"
                  placeholder="직원 성명 (수기 입력 — 직원 마스터 추후)"
                  value={fieldData['_targetName'] ?? ''}
                  onChange={(e) => setField('_targetName', e.target.value)}
                  style={{ width: '100%', marginBottom: 4 }}
                />
                <input
                  className="input"
                  placeholder="생년월일 (예: 1990-01-01)"
                  value={fieldData['_targetBirth'] ?? ''}
                  onChange={(e) => setField('_targetBirth', e.target.value)}
                  style={{ width: '100%', marginBottom: 4 }}
                />
                <input
                  className="input"
                  placeholder="주소"
                  value={fieldData['_targetAddress'] ?? ''}
                  onChange={(e) => setField('_targetAddress', e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            {template?.target === 'partner' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Buildings size={11} weight="duotone" /> 대상 거래처
                </div>
                <select
                  className="input"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">— 선택 (자동 채움) —</option>
                  {partnersList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 양식 fields */}
            {template?.fields.map((f) => (
              <div key={f.key} style={f.colSpan === 2 ? { gridColumn: 'span 2' } : undefined}>
                <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4 }}>
                  {f.label}{f.required && <span style={{ color: 'var(--red-text)', marginLeft: 2 }}>*</span>}
                </div>
                {f.type === 'textarea' ? (
                  <textarea
                    className="input"
                    rows={3}
                    value={fieldData[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                ) : f.type === 'select' ? (
                  <select
                    className="input"
                    value={fieldData[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    className="input"
                    value={fieldData[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    style={{ width: '100%' }}
                  />
                )}
              </div>
            ))}

            <div style={{ fontSize: 10, color: 'var(--text-weak)', padding: 8, background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
              문서번호: <strong className="mono">{previewDocNo}</strong>
              <br />
              발급일: {fmtKDate(today)}
            </div>
          </div>

          {/* 우측 — 미리보기 */}
          <div style={{ background: 'var(--bg-page)', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
            {template ? (
              <DocumentPreview body={previewBody} docNo={previewDocNo} />
            ) : (
              <div className="muted center" style={{ padding: 40, fontSize: 13 }}>
                양식을 선택하세요
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose>
            <button type="button" className="btn">
              <X size={12} weight="bold" /> 닫기
            </button>
          </DialogClose>
          <button type="button" className="btn" onClick={handlePrint} disabled={!template}>
            <Printer size={12} weight="bold" /> 인쇄 / PDF
          </button>
          <button type="button" className="btn btn-primary" onClick={handleIssue} disabled={!template}>
            <CheckCircle size={12} weight="bold" /> 발급 (로그 저장)
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentIssueButton({
  defaultTemplateId,
  label = '문서 발급',
}: { defaultTemplateId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <FileText size={14} weight="bold" /> {label}
      </button>
      <DocumentIssueDialog open={open} onOpenChange={setOpen} defaultTemplateId={defaultTemplateId} />
    </>
  );
}
