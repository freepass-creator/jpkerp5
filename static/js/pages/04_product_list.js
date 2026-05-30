function moneyText(value){ const n = Number(value || 0); return n ? n.toLocaleString('ko-KR') : '-'; }
function safeText(value){ return String(value ?? '').trim() || '-'; }
import { requireAuth } from "../core/auth-guard.js";
import { qs, registerPageCleanup } from "../core/utils.js";
import { renderRoleMenu } from "../core/role-menu.js";
import { watchProducts } from "../firebase/firebase-db.js";

const DEFAULT_PERIODS = ["48"];
const RANGE_BUCKETS = {
  rent: [
    { value: "under100", label: "100만원 이하", match: v => v <= 1000000 },
    { value: "50", label: "50만원~", match: v => v >= 500000 && v < 600000 },
    { value: "60", label: "60만원~", match: v => v >= 600000 && v < 700000 },
    { value: "70", label: "70만원~", match: v => v >= 700000 && v < 800000 },
    { value: "80", label: "80만원~", match: v => v >= 800000 && v < 900000 },
    { value: "90", label: "90만원~", match: v => v >= 900000 && v < 1000000 },
    { value: "100", label: "100만원~", match: v => v >= 1000000 }
  ],
  deposit: [
    { value: "none", label: "무보증", match: v => v === 0 },
    { value: "under100", label: "100만원 이하", match: v => v > 0 && v <= 1000000 },
    { value: "100", label: "100만원~", match: v => v >= 1000000 && v < 2000000 },
    { value: "200", label: "200만원~", match: v => v >= 2000000 && v < 3000000 },
    { value: "300", label: "300만원~", match: v => v >= 3000000 && v < 4000000 },
    { value: "400", label: "400만원~", match: v => v >= 4000000 && v < 5000000 },
    { value: "500", label: "500만원~", match: v => v >= 5000000 }
  ],
  mileage: [
    { value: "0", label: "0km~", match: v => v >= 0 && v < 10000 },
    { value: "1", label: "1만~", match: v => v >= 10000 && v < 20000 },
    { value: "2", label: "2만~", match: v => v >= 20000 && v < 30000 },
    { value: "3", label: "3만~", match: v => v >= 30000 && v < 40000 },
    { value: "4", label: "4만~", match: v => v >= 40000 && v < 50000 },
    { value: "5", label: "5만~", match: v => v >= 50000 }
  ]
};
const sampleProducts = [];
const FILTER_SCHEMA = [
  { key:"periods", title:"기간", type:"periods", options:["36","48","60"], open:true },
  { key:"maker", title:"제조사", type:"select", optionsFromData:true, open:true },
  { key:"model", title:"모델", type:"select", optionsFromData:true, open:true },
  { key:"fuel", title:"연료", type:"select", optionsFromData:true, open:true },
  { key:"extColor", title:"외부색상", type:"select", optionsFromData:true, open:false },
  { key:"reviewStatus", title:"심사여부", type:"select", optionsFromData:true, open:false },
  { key:"creditGrade", title:"신용등급", type:"select", optionsFromData:true, open:false },
  { key:"ageLowering", title:"운전연령하향", type:"policySelect", field:"ageText", optionsFromData:true, open:false },
  { key:"rent", title:"대여료", type:"range", open:true },
  { key:"deposit", title:"보증금", type:"range", open:true },
  { key:"mileage", title:"주행거리", type:"range", open:false },
  { key:"year", title:"연식", type:"year", open:false }
];
const state = { allProducts: [], filteredProducts: [], selectedId: null, activePhotoIndex: 0, openGroups: {}, filters: {}, role: '', companyCode: '' };
FILTER_SCHEMA.forEach(g=>{state.filters[g.key]=g.key==="periods"?DEFAULT_PERIODS.slice():[]; state.openGroups[g.key]=!!g.open;});
const menu = qs('#sidebar-menu');
const $list = qs('#productList'); const $detail = qs('#productDetail'); const $title = qs('#detailPanelTitle'); const $overlay = qs('#filterOverlay'); const $accordion = qs('#filterAccordion'); const $periodHead = qs('#selectedPeriodsHead');
function moneyToNumber(v){return Number(String(v||'').replace(/[^\d]/g,''))||0;}
function moneyToDisplay(v){const n=moneyToNumber(v); return n?String(Math.round(n/1000)):'0';}
function safe(v){return v!==null&&v!==undefined&&String(v).trim()!==''?String(v):'-';}
function formatMileage(value){const n=Number(value||0); return n?`${n.toLocaleString('ko-KR')}km`:'-';}
function normalizePrice(raw){
  const price = raw.price || {};
  const pick = (month, key, fallback=0) => Number(price?.[month]?.[key] || raw[`${key}_${month}`] || fallback || 0);
  return {
    '1': { rent: pick('1','rent'), deposit: pick('1','deposit'), fee: pick('1','fee') },
    '6': { rent: pick('6','rent'), deposit: pick('6','deposit'), fee: pick('6','fee') },
    '12': { rent: pick('12','rent'), deposit: pick('12','deposit'), fee: pick('12','fee') },
    '24': { rent: pick('24','rent'), deposit: pick('24','deposit'), fee: pick('24','fee') },
    '36': { rent: pick('36','rent'), deposit: pick('36','deposit'), fee: pick('36','fee') },
    '48': { rent: pick('48','rent', raw.rental_price_48 || raw.rental_price || 0), deposit: pick('48','deposit', raw.deposit_48 || raw.deposit || 0), fee: pick('48','fee') },
    '60': { rent: pick('60','rent', raw.rental_price_60 || 0), deposit: pick('60','deposit', raw.deposit_60 || 0), fee: pick('60','fee') }
  };
}
function normalizeProduct(raw){
  const imageUrl = String(raw.image_url || '').trim();
  return {
    id: raw.product_code || raw.id || '',
    productCode: raw.product_code || raw.id || '',
    partnerCode: raw.partner_code || raw.provider_company_code || '',
    policyCode: raw.policy_code || raw.term_code || '',
    vehicleStatus: raw.vehicle_status || '-',
    productType: raw.product_type || '-',
    carNo: raw.car_number || '-',
    maker: raw.maker || '-',
    model: raw.model_name || '-',
    subModel: raw.sub_model || '-',
    trim: raw.trim_name || '-',
    fuel: raw.fuel_type || '-',
    mileageValue: Number(raw.mileage || 0),
    mileageDisplay: formatMileage(raw.mileage),
    year: raw.year || '-',
    engineCc: raw.engine_cc || '-',
    extColor: raw.ext_color || '-',
    intColor: raw.int_color || '-',
    optionSummary: raw.options || '-',
    ageText: raw.min_age || '-',
    reviewStatus: raw.review_status || '-',
    creditGrade: raw.credit_grade || '-',
    photos: imageUrl ? [imageUrl] : [],
    price: normalizePrice(raw),
    policy: {
      ageLoweringCost: raw.age_lowering_cost || '-',
      annualMileage: raw.annual_mileage || '-',
      bodily: raw.bodily_limit || '-',
      property: raw.property_limit || '-',
      ownDamage: raw.own_damage || '-',
      paymentMethod: raw.payment_method || '-'
    },
    condition: {
      detailStatus: raw.vehicle_sub_status || '-',
      accident: raw.accident_yn || '-',
      maintenance: raw.maintenance_service || '-',
      immediate: raw.ready_ship_yn || '-',
      delivery: raw.delivery_yn || '-',
      note: raw.note || raw.partner_memo || '-'
    }
  };
}
function applyRoleFilter(products){
  if (state.role === 'provider') return products.filter(item => String(item.partnerCode||'') === String(state.companyCode||''));
  return products;
}
function getSelectedPeriods(){const arr=state.filters.periods.slice().sort((a,b)=>Number(a)-Number(b)); return arr.length?arr:DEFAULT_PERIODS.slice();}
function getValueForRange(groupKey,item){const p=getSelectedPeriods()[0]||'48'; if(groupKey==='rent') return moneyToNumber(item.price[p]?.rent); if(groupKey==='deposit') return moneyToNumber(item.price[p]?.deposit); if(groupKey==='mileage') return item.mileageValue||0; return 0;}
function getGroupOptions(group,source){ if(group.type==='periods') return group.options.map(v=>({value:v,label:`${v}M`})); if(group.type==='range') return RANGE_BUCKETS[group.key].map(b=>({value:b.value,label:b.label})); if(group.type==='year'){const years=[...new Set(source.map(i=>i.year).filter(Boolean))].sort((a,b)=>b-a); return years.map(y=>({value:String(y),label:`${y}~`}));} const values=[...new Set(source.map(i=> group.type==='policySelect' ? i[group.field] : i[group.key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ko')); return values.map(v=>({value:String(v),label:String(v)})); }
function matchRange(groupKey,optionValue,item){const bucket=RANGE_BUCKETS[groupKey].find(x=>x.value===optionValue); return bucket?bucket.match(getValueForRange(groupKey,item)):false;}
function matchSingle(group,optionValue,item){ if(group.type==='periods') return true; if(group.type==='range') return matchRange(group.key, optionValue, item); if(group.type==='year') return String(item.year)===String(optionValue); if(group.type==='policySelect') return String(item[group.field]||'')===String(optionValue); return String(item[group.key]||'')===String(optionValue); }
function passesGroup(group,item,selected){ if(group.key==='periods') return true; if(!selected||!selected.length) return true; return selected.some(v=>matchSingle(group,v,item)); }
function passesAllFilters(item,skip){ return FILTER_SCHEMA.every(group=>{ if(group.key==='periods') return true; if(group.key===skip) return true; return passesGroup(group,item,state.filters[group.key]);}); }
function renderPeriodsHead(){ const periods=getSelectedPeriods(); $periodHead.innerHTML=periods.map(p=>`<div>${p}M</div>`).join(''); }
function summarizeOptionText(text){ const raw=safe(text); if(raw==='-') return raw; return raw.length>18 ? `${raw.slice(0,18)}...` : raw; }
function renderFilterAccordion(){ $accordion.innerHTML = FILTER_SCHEMA.map(group=>{ const options=getGroupOptions(group, state.allProducts); const body=options.map(option=>{ const count=group.key==='periods'?state.allProducts.length:state.allProducts.filter(item=>passesAllFilters(item, group.key)&&matchSingle(group, option.value, item)).length; const checked=state.filters[group.key].includes(option.value); return `<label class="filter-option"><span class="filter-check"><input type="checkbox" data-group="${group.key}" data-value="${option.value}" ${checked?'checked':''}><span>${option.label}</span></span><span class="filter-count">(${count})</span></label>`; }).join(''); return `<section class="filter-group ${state.openGroups[group.key]?'is-open':''}"><button type="button" class="filter-group-head" data-toggle-group="${group.key}"><span class="filter-group-title">${group.title}</span><span class="filter-group-caret">${state.openGroups[group.key]?'닫기':'열기'}</span></button><div class="filter-group-body">${body}</div></section>`; }).join(''); $accordion.querySelectorAll('[data-toggle-group]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.toggleGroup; state.openGroups[key]=!state.openGroups[key]; renderFilterAccordion();})); $accordion.querySelectorAll('input[type="checkbox"][data-group]').forEach(input=>input.addEventListener('change',()=>{ const key=input.dataset.group; const current=new Set(state.filters[key]); if(input.checked) current.add(input.dataset.value); else current.delete(input.dataset.value); if(key==='periods' && current.size===0) current.add(DEFAULT_PERIODS[0]); state.filters[key]=[...current]; applyFilters(); })); }
function renderList(){ if(!state.filteredProducts.length){ $list.innerHTML='<div class="list-empty">조건에 맞는 상품이 없습니다.</div>'; return; } const periods=getSelectedPeriods(); $list.innerHTML=state.filteredProducts.map(item=>{ const mainLeft=`${safe(item.vehicleStatus)} ${safe(item.productType)} ${safe(item.carNo)} ${safe(item.maker)} ${safe(item.model)} ${safe(item.subModel)} ${safe(item.trim)} ${safe(item.fuel)} ${safe(item.mileageDisplay)}`; const optionText = summarizeOptionText(item.optionSummary || '-'); const subLeft=`${safe(item.year)} | ${safe(item.engineCc)}cc | ${safe(optionText)} | ${safe(item.extColor)}/${safe(item.intColor)} | ${safe(item.ageText)}`; const mainRight=periods.map(p=>`<div class="product-main-price">${moneyToDisplay(item.price[p]?.rent)}</div>`).join(''); const subRight=periods.map(p=>`<div class="product-sub-price">${moneyToDisplay(item.price[p]?.deposit)}</div>`).join(''); return `<div class="product-row ${item.id===state.selectedId?'is-active':''}" data-id="${item.id}"><div class="product-row-line"><div class="product-main-left">${mainLeft}</div><div class="product-right-grid">${mainRight}</div></div><div class="product-row-line"><div class="product-sub-left">${subLeft}</div><div class="product-right-grid">${subRight}</div></div></div>`; }).join(''); $list.querySelectorAll('.product-row').forEach(row=>row.addEventListener('click',()=>{state.selectedId=row.dataset.id; state.activePhotoIndex=0; renderList(); renderDetail(); })); }
function detailItem(label,value){ return `<div class="detail-item"><span class="detail-label">${label}</span><span class="detail-value">${safe(value)}</span></div>`; }
function renderPhotoSection(product){ const photos=product.photos||[]; const active=photos[state.activePhotoIndex]||''; return `<div class="photo-main">${active?`<img src="${active}" alt="차량사진">`:''}</div><div class="photo-thumbs">${photos.map((src,idx)=>`<div class="photo-thumb ${idx===state.activePhotoIndex?'is-active':''}" data-photo-index="${idx}"><img src="${src}" alt="${idx+1}"></div>`).join('')}</div>`; }
function renderPriceTable(product){ const months=['1','6','12','24','36','48','60']; return `<table class="price-table"><thead><tr><th>기간</th><th>대여료</th><th>보증금</th><th>수수료</th></tr></thead><tbody>${months.map(m=>`<tr><td>${m}개월</td><td>${Number(product.price[m]?.rent||0).toLocaleString('ko-KR')}</td><td>${Number(product.price[m]?.deposit||0).toLocaleString('ko-KR')}</td><td>${Number(product.price[m]?.fee||0).toLocaleString('ko-KR')}</td></tr>`).join('')}</tbody></table>`; }
function renderDetail(){ const product=state.filteredProducts.find(i=>i.id===state.selectedId); if(!product){ $title.textContent='차량번호 세부모델 상세정보'; $detail.innerHTML='<div class="detail-empty">좌측 목록에서 차량을 선택하세요.</div>'; return; } $title.textContent=`${safe(product.carNo)} ${safe(product.subModel)} 상세정보`; $detail.innerHTML=`<div class="detail-wrap"><section class="detail-section"><div class="detail-section-head">차량정보</div><div class="detail-grid">${detailItem('차량상태',product.vehicleStatus)}${detailItem('상품구분',product.productType)}${detailItem('차량번호',product.carNo)}${detailItem('차량명',`${product.maker} ${product.model} ${product.subModel} ${product.trim}`)}${detailItem('연료',product.fuel)}${detailItem('주행거리',product.mileageDisplay)}${detailItem('연식',product.year)}${detailItem('배기량',`${product.engineCc}cc`)}${detailItem('색상',`${product.extColor} / ${product.intColor}`)}${detailItem('연령',product.ageText)}${detailItem('선택옵션',product.optionSummary)}</div>${renderPhotoSection(product)}</section><section class="detail-section"><div class="detail-section-head">대여조건</div>${renderPriceTable(product)}<div class="detail-grid">${detailItem('심사여부',product.reviewStatus)}${detailItem('신용등급',product.creditGrade)}</div></section><section class="detail-section"><div class="detail-section-head">정책 / 심사</div><div class="detail-grid">${detailItem('정책코드',product.policyCode)}${detailItem('운전연령',product.ageText)}${detailItem('연령하향비용',product.policy.ageLoweringCost)}${detailItem('연간약정주행거리',product.policy.annualMileage)}${detailItem('대인한도 및 면책금',product.policy.bodily)}${detailItem('대물한도 및 면책금',product.policy.property)}${detailItem('자기차량손해',product.policy.ownDamage)}${detailItem('결제방식',product.policy.paymentMethod)}</div></section><section class="detail-section"><div class="detail-section-head">컨디션 / 기타</div><div class="detail-grid">${detailItem('차량세부상태',product.condition.detailStatus)}${detailItem('사고여부',product.condition.accident)}${detailItem('정비서비스',product.condition.maintenance)}${detailItem('즉시출고여부',product.condition.immediate)}${detailItem('탁송가능여부',product.condition.delivery)}${detailItem('특이사항',product.condition.note)}</div></section></div>`; $detail.querySelectorAll('[data-photo-index]').forEach(node=>node.addEventListener('click',()=>{state.activePhotoIndex=Number(node.dataset.photoIndex)||0; renderDetail();})); }
function applyFilters(){ state.filteredProducts=state.allProducts.filter(item=>passesAllFilters(item)); if(!state.filteredProducts.find(item=>item.id===state.selectedId)){ state.selectedId=state.filteredProducts[0]?.id || null; state.activePhotoIndex=0; } renderPeriodsHead(); renderFilterAccordion(); renderList(); renderDetail(); }
qs('#openFilterBtn')?.addEventListener('click',()=>{ 
  const isOpen = $overlay.classList.contains('is-open');
  $overlay.classList.toggle('is-open', !isOpen); 
  $overlay.setAttribute('aria-hidden', String(isOpen));
});
qs('#resetFilterBtn')?.addEventListener('click',()=>{ FILTER_SCHEMA.forEach(g=>state.filters[g.key]=g.key==='periods'?DEFAULT_PERIODS.slice():[]); applyFilters(); });
qs('#shareProductBtn')?.addEventListener('click',()=>{ alert('공유 연결 예정'); });
qs('#inquiryProductBtn')?.addEventListener('click',()=>{ alert('문의 연결 예정'); });
qs('#contractProductBtn')?.addEventListener('click',()=>{ 
  const product=state.filteredProducts.find(i=>i.id===state.selectedId);
  if(!product) return;
  const seed = {
    seed_product_key: product.id,
    partner_code: product.partnerCode || 'RP003',
    policy_code: product.policyCode || '',
    car_number: product.carNo || '',
    vehicle_name: [product.maker, product.model, product.subModel, product.trim].filter(Boolean).join(' '),
    product_code: product.id,
    maker: product.maker || '',
    model_name: product.model || '',
    sub_model: product.subModel || '',
    trim_name: product.trim || '',
    rent_month: '48',
    rent_amount: Number(product.price?.['48']?.rent || 0),
    deposit_amount: Number(product.price?.['48']?.deposit || 0)
  };
  localStorage.setItem('freepass_pending_contract_seed', JSON.stringify(seed));
  window.location.href='/contract';
});

function applyRoleActions() {
  const inquiryBtn = qs('#inquiryProductBtn');
  const contractBtn = qs('#contractProductBtn');
  if (state.role === 'agent') {
    inquiryBtn?.classList.remove('detail-actions-hidden');
    contractBtn?.classList.remove('detail-actions-hidden');
  } else {
    inquiryBtn?.classList.add('detail-actions-hidden');
    contractBtn?.classList.add('detail-actions-hidden');
  }
}

async function init(){ 
  const { profile } = await requireAuth({ roles: ['provider','agent','admin'] }); 
  state.role = profile.role;
  state.companyCode = profile.company_code || '';
  renderRoleMenu(menu, profile.role); 
  applyRoleActions();

  const unsubscribe = watchProducts((products) => {
    state.allProducts = applyRoleFilter(products.map(normalizeProduct)).filter(item => item.id);
    applyFilters();
  });
  registerPageCleanup(unsubscribe);
}
init();
