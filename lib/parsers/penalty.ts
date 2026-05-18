/**
 * 과태료/통행료/범칙금 고지서 OCR 파서 — jpkerp penalty.js 이식.
 */

export interface PenaltyParsed {
  doc_type: string;
  notice_no: string;
  issuer: string;
  issue_date: string;
  payer_name: string;
  car_number: string;
  date: string;
  location: string;
  description: string;
  law_article: string;
  penalty_amount: number;
  fine_amount: number;
  demerit_points: number;
  toll_amount: number;
  surcharge_amount: number;
  amount: number;
  due_date: string;
  opinion_period: string;
  pay_account: string;
}

const KEYWORDS = ['과태료', '통행료', '납부고지', '위반사실', '범칙금', '고지서', '납부기한', '위반차량', '통행장소', '납부안내'];

export function detectPenalty(text: string): boolean {
  return KEYWORDS.filter((k) => text.includes(k)).length >= 2;
}

const pad = (n: number | string) => String(n).padStart(2, '0');
const toNum = (s: string) => Number(String(s).replace(/,/g, ''));

export function parsePenalty(text: string, lines: string[]): PenaltyParsed {
  const d: PenaltyParsed = {
    doc_type: '', notice_no: '', issuer: '', issue_date: '',
    payer_name: '', car_number: '', date: '', location: '',
    description: '', law_article: '',
    penalty_amount: 0, fine_amount: 0, demerit_points: 0,
    toll_amount: 0, surcharge_amount: 0, amount: 0,
    due_date: '', opinion_period: '', pay_account: '',
  };

  if (/통행료\s*납부고지/.test(text)) d.doc_type = '통행료';
  else if (/속도/.test(text) && /과태료/.test(text)) d.doc_type = '속도위반';
  else if (/주정차|주차위반/.test(text)) d.doc_type = '주정차위반';
  else if (/신호/.test(text) && /과태료/.test(text)) d.doc_type = '신호위반';
  else if (/과태료/.test(text)) d.doc_type = '과태료';
  else d.doc_type = '기타';

  const CAR = /(\d{2,3}\s?[가-힣]\s?\d{4})/;
  const carPatterns = [
    new RegExp('위반\\s*차량[\\s\\S]{0,30}?' + CAR.source),
    new RegExp('차량\\s*번호[\\s\\S]{0,30}?' + CAR.source),
  ];
  for (const p of carPatterns) {
    const m = text.match(p);
    if (m) { d.car_number = m[1].replace(/\s/g, ''); break; }
  }
  if (!d.car_number) {
    const cm = text.match(CAR);
    if (cm) d.car_number = cm[1].replace(/\s/g, '');
  }

  const payerPatterns = [
    /대\s*상\s*자\s*[:：]?\s*(주식회사\s*\S+)/,
    /성\s*명\s*(주식회사\s*\S+)/,
    /납\s*부\s*자\s*(주식회사\s*\S+)/,
    /대\s*상\s*자\s*[:：]?\s*(.+?)(?:\n|$)/m,
    /성\s*명\s*[:：]?\s*(.+?)(?:\n|$)/m,
  ];
  for (const p of payerPatterns) {
    const m = text.match(p);
    if (m) {
      let name = m[1].trim().replace(/\s*(위반|귀하|貴下|주\s*소).*$/, '').trim();
      if (name.length >= 3) { d.payer_name = name; break; }
    }
  }

  const dateP1 = text.match(/위반\s*일\s*시\s*[\s\S]{0,10}?(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(\d{1,2})\s*시\s*(\d{1,2})\s*분/);
  if (dateP1) d.date = `${dateP1[1]}-${pad(dateP1[2])}-${pad(dateP1[3])} ${pad(dateP1[4])}:${pad(dateP1[5])}`;
  if (!d.date) {
    const p2 = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (p2) d.date = `${p2[1]}-${p2[2]}-${p2[3]} ${p2[4]}:${p2[5]}`;
  }

  if (d.doc_type === '통행료') {
    const tollLoc = text.match(/통행장소[\s\S]{0,20}?(청라\S+|인천\S+|서울\S+|부산\S+|영동\S+|서해\S+|경부\S+|호남\S+|\S+대교|\S+터널|\S+IC|\S+고속)/);
    if (tollLoc) d.location = tollLoc[1];
    if (!d.location) {
      const office = text.match(/(\S+)\s*영업소/);
      if (office) d.location = office[1];
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      if (/위반\s*장\s*소/.test(lines[i])) {
        const val = lines[i].replace(/위반\s*장\s*소\s*/, '').trim();
        if (val.length > 3) {
          let loc = val;
          if (i + 1 < lines.length && !/위반\s*내용|적용|일련/.test(lines[i + 1])) loc += ' ' + lines[i + 1].trim();
          d.location = loc.trim();
        } else if (i + 1 < lines.length) {
          let loc = lines[i + 1].trim();
          if (i + 2 < lines.length && !/위반\s*내용|적용|일련/.test(lines[i + 2])) loc += ' ' + lines[i + 2].trim();
          d.location = loc;
        }
        break;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (/위반\s*내\s*용/.test(lines[i])) {
      const val = lines[i].replace(/위반\s*내\s*용\s*/, '').trim();
      if (val.length > 2 && !/부산|서울|인천|대구|광주|대전|울산|경기|강원/.test(val)) {
        d.description = val;
      } else {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          if (/속도|주정차|신호|중앙선|차선/.test(lines[j])) { d.description = lines[j].trim(); break; }
        }
      }
      break;
    }
  }
  if (!d.description) {
    const speed = text.match(/속도\s*\(\s*제한\s*[:：]?\s*\d+\s*[Kk]?[Mm]?\s*주행\s*[:：]?\s*\d+\s*[Kk]?[Mm]?\s*초과\s*[:：]?\s*\d+\s*[Kk]?[Mm]?\s*\)/);
    if (speed) d.description = speed[0];
  }

  const law = text.match(/적용\s*법\s*조\s*(도로교통법[^\n]{3,30})/);
  if (law) d.law_article = law[1].trim();

  const pen = text.match(/과태료\s*[:：]?\s*([\d,]+)\s*원/);
  if (pen) d.penalty_amount = toNum(pen[1]);

  const fine = text.match(/범칙금\s*[:：]?\s*([\d,]+)\s*원\s*\(\s*벌\s*점\s*[:：]?\s*(\d+)\s*점?\s*\)/);
  if (fine) {
    d.fine_amount = toNum(fine[1]);
    d.demerit_points = Number(fine[2]);
  } else {
    const fo = text.match(/범칙금\s*[:：]?\s*([\d,]+)\s*원/);
    if (fo) d.fine_amount = toNum(fo[1]);
    const pt = text.match(/벌\s*점\s*[:：]?\s*(\d+)\s*점/);
    if (pt) d.demerit_points = Number(pt[1]);
  }

  if (d.doc_type === '통행료') {
    const pay = text.match(/납부할\s*금\s*액[\s\S]{0,30}?([\d,]+)/);
    if (pay) d.toll_amount = toNum(pay[1]);
    if (!d.toll_amount) {
      const inline = text.match(/청라하늘대교\s*([\d,]+)/);
      if (inline) d.toll_amount = toNum(inline[1]);
    }
    const sur = text.match(/([\d,]+)\s*원?\s*\)?\s*이\s*부과/);
    if (sur) d.surcharge_amount = toNum(sur[1]);
  }

  const due = text.match(/(?:납부|사전)[\s\S]{0,10}?기\s*한[\s\S]{0,20}?(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (due) d.due_date = `${due[1]}-${pad(due[2])}-${pad(due[3])}`;

  const notice = text.match(/(\d{4}[-‐\s]*\d{4}[-‐\s]*\d[-‐\s]*\d{3}[-‐\s]*\d{5,6}[-‐\s]*\d)/);
  if (notice) d.notice_no = notice[1].replace(/\s/g, '');
  if (!d.notice_no) {
    const no = text.match(/NO\.\s*(\d+)/i);
    if (no) d.notice_no = no[1];
  }

  const issuer = text.match(/(\S+(?:경찰서|영업소|시청|구청|군청|대교|터널|고속도로))\s*(?:장|서장)?/);
  if (issuer) d.issuer = issuer[0].trim();

  const iss = text.match(/발\s*송\s*일\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (iss) d.issue_date = `${iss[1]}-${pad(iss[2])}-${pad(iss[3])}`;

  const acctPatterns = [
    /(농협|국민|신한|우리|하나|기업|우체국)\s*은?\s*행?\s*([\d\-]{10,})/,
    /고객\s*가상\s*계좌\s*(농협|국민|신한|우리|하나)\s*은?\s*행?\s*([\d\-]{10,})/,
  ];
  for (const p of acctPatterns) {
    const m = text.match(p);
    if (m) { d.pay_account = `${m[1]} ${m[2]}`; break; }
  }

  if (d.doc_type === '통행료' && !d.description) d.description = '통행료 미납';

  d.amount = d.penalty_amount || d.toll_amount || 0;
  return d;
}
