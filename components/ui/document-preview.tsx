'use client';

/**
 * A4 표준 문서 미리보기 — doc-templates 의 양식을 HTML 렌더링.
 *
 * 사용:
 *   <DocumentPreview body={renderedHtml} docNo="JPK-ERT-2606-001" />
 *
 * 인쇄: window.print() 호출 시 .doc-print-area 만 인쇄, 나머지 숨김.
 */

import type { CSSProperties } from 'react';

export const DOC_PRINT_CSS = `
@page { size: A4; margin: 0; }
@media print {
  body { background: #fff !important; }
  .doc-print-hide { display: none !important; }
  .doc-print-area {
    box-shadow: none !important;
    padding: 25mm 20mm !important;
    margin: 0 !important;
    min-height: auto !important;
  }
}
.doc-paper {
  width: 210mm;
  min-height: 297mm;
  background: #fff;
  padding: 25mm 22mm;
  font-size: 11pt;
  line-height: 1.7;
  color: #000;
  font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
  box-shadow: 0 2px 12px rgba(0,0,0,0.18);
}
.doc-paper .doc-title {
  text-align: center;
  font-size: 26pt;
  font-weight: 800;
  letter-spacing: 1.5em;
  text-indent: 1.5em;
  margin: 10mm 0 14mm;
}
.doc-paper .section-title {
  font-weight: 700;
  font-size: 12pt;
  margin: 12mm 0 4mm;
  padding-bottom: 2mm;
  border-bottom: 1.2pt solid #000;
}
.doc-paper table.info {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 4mm;
}
.doc-paper table.info th,
.doc-paper table.info td {
  border: 0.8pt solid #000;
  padding: 3mm 4mm;
  font-size: 11pt;
  text-align: left;
  vertical-align: middle;
}
.doc-paper table.info th {
  background: #f1f3f5;
  width: 25%;
  font-weight: 600;
}
.doc-paper .purpose-box {
  border: 0.8pt solid #000;
  padding: 5mm;
  min-height: 18mm;
  margin-bottom: 6mm;
  background: #fafbfc;
  white-space: pre-wrap;
}
.doc-paper .body-text {
  margin: 8mm 0 6mm;
  font-size: 12pt;
}
.doc-paper .doc-footer {
  margin-top: 18mm;
  text-align: center;
}
.doc-paper .issue-date {
  font-size: 13pt;
  font-weight: 600;
  margin-bottom: 12mm;
}
.doc-paper .company-line {
  font-size: 13pt;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.doc-paper .seal {
  display: inline-block;
  width: 18mm;
  height: 18mm;
  border: 1.4pt solid #c92a2a;
  color: #c92a2a;
  border-radius: 50%;
  text-align: center;
  line-height: 18mm;
  font-size: 14pt;
  font-weight: 700;
  margin-left: 4mm;
}
.doc-paper .doc-no {
  position: absolute;
  top: 12mm;
  right: 22mm;
  font-size: 10pt;
  color: #555;
  font-family: monospace;
}
.doc-paper section { position: relative; }
`;

export function DocumentPreview({
  body, docNo, style,
}: {
  /** renderBody(template, ctx) 결과 — 치환된 HTML */
  body: string;
  /** 문서번호 (우상단 표시) */
  docNo?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 16, ...style }} className="doc-print-area">
      <style dangerouslySetInnerHTML={{ __html: DOC_PRINT_CSS }} />
      <div className="doc-paper" style={{ position: 'relative' }}>
        {docNo && <div className="doc-no">{docNo}</div>}
        <div dangerouslySetInnerHTML={{ __html: body }} />
      </div>
    </div>
  );
}
