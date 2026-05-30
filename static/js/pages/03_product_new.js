import { requireAuth } from '../core/auth-guard.js';
import { bindFileDropzone, bindOverlayToggle, qs, registerPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { uploadProductImage } from '../firebase/firebase-storage.js';
import { deleteProduct, saveProduct, updateProduct, watchProducts } from '../firebase/firebase-db.js';

const menu = qs('#sidebar-menu');
const form = qs('#product-form');
const message = qs('#product-message');
const filterToggleButton = qs('#openProductFilterBtn');
const filterOverlay = qs('#productFilterOverlay');
const listBody = qs('#product-register-list');
const resetButton = qs('#product-form-reset');
const submitButton = qs('#product-submit-head');
const deleteButton = qs('#product-delete-head');
const editButton = qs('#product-edit-head');
const editingCodeInput = qs('#editing_product_code');
const existingImageInput = qs('#existing_image_url');
const imageInput = qs('#product_image');
const previewList = qs('#image-preview-list');
const uploadDropzone = qs('#upload-dropzone');
const sheetUrlInput = qs('#sheet_url');
const sheetApplyButton = qs('#sheet-apply-btn');
const titleNode = qs('#product-manage-title');

const FIELD_IDS = [
  'partner_code','policy_code','vehicle_status','product_type','car_number','maker','model_name','sub_model','trim_name',
  'fuel_type','mileage','year','engine_cc','ext_color','int_color','options','min_age',
  'vehicle_sub_status','accident_yn','maintenance_service','note','photo_link','credit_grade','review_status','partner_memo',
  'rent_1','deposit_1','fee_1','rent_12','deposit_12','fee_12','rent_24','deposit_24','fee_24',
  'rent_36','deposit_36','fee_36','rent_48','deposit_48','fee_48','rent_60','deposit_60','fee_60'
];

const FIELD_NUMBERS = new Set([
  'mileage','year','engine_cc','rent_1','deposit_1','fee_1','rent_12','deposit_12','fee_12','rent_24','deposit_24','fee_24',
  'rent_36','deposit_36','fee_36','rent_48','deposit_48','fee_48','rent_60','deposit_60','fee_60'
]);

let currentProfile = null;
let allProducts = [];

function syncHeadButtons(nextMode) {
  if (editButton) editButton.style.display = nextMode === 'view' ? '' : 'none';
  if (submitButton) submitButton.style.display = nextMode === 'view' ? 'none' : '';
}
let lastSelectedProductCode = '';
let mode = 'create';

function applyFormMode(nextMode) {
  mode = nextMode;
  form.classList.toggle('is-view', nextMode === 'view');
  form.classList.remove('is-view-mode', 'is-edit-mode');
  form.classList.add(nextMode === 'view' ? 'is-view-mode' : 'is-edit-mode');
  const isCreate = nextMode === 'create';
  const isView = nextMode === 'view';
  const editable = nextMode !== 'view';
  FIELD_IDS.forEach((id) => {
    const field = getField(id);
    if (!field) return;
    if (id === 'partner_code' && currentProfile?.role !== 'admin') return;
    field.readOnly = editable ? false : true;
    if (field.tagName === 'SELECT') field.disabled = !editable;
  });
  setReadOnlyByRole();
  deleteButton.disabled = isCreate;
  if (editButton) editButton.disabled = isCreate;
  syncHeadButtons(isCreate ? 'create' : nextMode);
}



function digitsOnly(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function formatCommaNumber(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
}

function bindMoneyInputs() {
  ['rent_1','deposit_1','fee_1','rent_12','deposit_12','fee_12','rent_24','deposit_24','fee_24','rent_36','deposit_36','fee_36','rent_48','deposit_48','fee_48','rent_60','deposit_60','fee_60']
    .map((id) => getField(id))
    .filter(Boolean)
    .forEach((input) => {
      input.style.textAlign = 'right';
      input.addEventListener('input', () => {
        input.value = formatCommaNumber(input.value);
      });
      input.addEventListener('blur', () => {
        input.value = formatCommaNumber(input.value);
      });
    });
}


function setTitle(text = '상품관리') {
  if (titleNode) titleNode.textContent = text;
}

function getField(id) {
  return qs(`#${id}`);
}

function setReadOnlyByRole() {
  const partnerField = getField('partner_code');
  if (!partnerField) return;
  if (currentProfile?.role === 'admin') {
    partnerField.readOnly = false;
  } else {
    partnerField.value = currentProfile?.company_code || '';
    partnerField.readOnly = true;
  }
}

function resetForm() {
  mode = 'create';
  editingCodeInput.value = '';
  existingImageInput.value = '';
  form.reset();
  previewList.innerHTML = '';
  setReadOnlyByRole();
  setTitle('상품관리');
  message.textContent = '';
  deleteButton.disabled = true;
  applyFormMode('create');
  renderList(allProducts);
}

function buildProductPayload() {
  const payload = {};
  FIELD_IDS.forEach((id) => {
    const field = getField(id);
    if (!field) return;
    const raw = field.value ?? '';
    payload[id] = FIELD_NUMBERS.has(id) ? Number(String(raw || '').replace(/[^\\d.-]/g, '') || 0) : String(raw || '').trim();
  });

  const partnerCode = payload.partner_code || currentProfile?.company_code || '';
  const imageUrl = existingImageInput.value || '';

  return {
    partner_code: partnerCode,
    provider_company_code: partnerCode,
    provider_uid: currentProfile?.role === 'provider' ? currentProfile.uid : '',
    provider_name: currentProfile?.company_name || '',
    created_by_uid: currentProfile?.uid || '',
    created_by_role: currentProfile?.role || '',
    policy_code: payload.policy_code,
    term_code: payload.policy_code,
    term_name: payload.policy_code,
    vehicle_status: payload.vehicle_status,
    product_type: payload.product_type,
    car_number: payload.car_number,
    maker: payload.maker,
    model_name: payload.model_name,
    sub_model: payload.sub_model,
    trim_name: payload.trim_name,
    fuel_type: payload.fuel_type,
    mileage: payload.mileage,
    year: payload.year,
    engine_cc: payload.engine_cc,
    ext_color: payload.ext_color,
    int_color: payload.int_color,
    options: payload.options,
    min_age: payload.min_age,
    vehicle_sub_status: payload.vehicle_sub_status,
    accident_yn: payload.accident_yn,
    maintenance_service: payload.maintenance_service,
    note: payload.note,
    photo_link: payload.photo_link,
    credit_grade: payload.credit_grade,
    review_status: payload.review_status,
    partner_memo: payload.partner_memo,
    rental_price_48: payload.rent_48,
    deposit_48: payload.deposit_48,
    rental_price_60: payload.rent_60,
    deposit_60: payload.deposit_60,
    rental_price: payload.rent_48,
    deposit: payload.deposit_48,
    image_url: imageUrl,
    price: {
      '1': { rent: payload.rent_1, deposit: payload.deposit_1, fee: payload.fee_1 },
      '12': { rent: payload.rent_12, deposit: payload.deposit_12, fee: payload.fee_12 },
      '24': { rent: payload.rent_24, deposit: payload.deposit_24, fee: payload.fee_24 },
      '36': { rent: payload.rent_36, deposit: payload.deposit_36, fee: payload.fee_36 },
      '48': { rent: payload.rent_48, deposit: payload.deposit_48, fee: payload.fee_48 },
      '60': { rent: payload.rent_60, deposit: payload.deposit_60, fee: payload.fee_60 }
    }
  };
}

function fillForm(product) {
  mode = 'edit';
  editingCodeInput.value = product.product_code || '';
  lastSelectedProductCode = product.product_code || '';
  existingImageInput.value = product.image_url || '';
  FIELD_IDS.forEach((id) => {
    const field = getField(id);
    if (!field) return;
    let value = '';
    if (id in product) value = product[id];
    if (!value && id === 'partner_code') value = product.partner_code || product.provider_company_code || '';
    if (!value && id === 'policy_code') value = product.policy_code || product.term_code || '';
    if (!value && id === 'rent_48') value = product.rent_48 ?? product.rental_price_48 ?? product.rental_price ?? '';
    if (!value && id === 'deposit_48') value = product.deposit_48 ?? product.deposit_48 ?? product.deposit ?? '';
    if (!value && id.startsWith('rent_')) value = product.price?.[id.split('_')[1]]?.rent ?? '';
    if (!value && id.startsWith('deposit_')) value = product.price?.[id.split('_')[1]]?.deposit ?? '';
    if (!value && id.startsWith('fee_')) value = product.price?.[id.split('_')[1]]?.fee ?? '';
    field.value = FIELD_NUMBERS.has(id) ? formatCommaNumber(value ?? '') : (value ?? '');
  });
  setReadOnlyByRole();
  renderPreviewFromExisting(product.image_url);
  setTitle(`${product.car_number || '-'} ${product.sub_model || ''} 상품관리`);
  renderList(allProducts);
  deleteButton.disabled = false;
}

function renderPreviewFromExisting(url) {
  previewList.innerHTML = '';
  if (!url) return;
  previewList.innerHTML = `<div class="image-preview-item"><img src="${url}" alt="상품이미지"></div>`;
}

function renderSelectedFiles() {
  previewList.innerHTML = '';
  const files = Array.from(imageInput.files || []);
  if (!files.length) {
    renderPreviewFromExisting(existingImageInput.value);
    return;
  }
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const item = document.createElement('div');
    item.className = 'image-preview-item';
    item.innerHTML = `<img src="${url}" alt="${file.name}">`;
    previewList.appendChild(item);
  });
}

function summarizeProduct(product) {
  const partner = product.partner_code || product.provider_company_code || '-';
  return `
    <button type="button" class="summary-row admin-summary-row management-summary-row ${editingCodeInput.value === product.product_code ? 'is-selected' : ''}" data-code="${product.product_code}">
      <span class="summary-inline">${partner}</span>
      <span class="summary-inline summary-inline-strong">${product.car_number || '-'}</span>
      <span class="summary-inline">${product.sub_model || '-'}</span>
      <span class="summary-inline">${product.trim_name || '-'}</span>
    </button>
  `;
}

function renderList(products) {
  if (!products.length) {
    listBody.innerHTML = '<div class="empty-block list-empty">등록된 상품이 없습니다.</div>';
    return;
  }
  listBody.innerHTML = products.map(summarizeProduct).join('');
  listBody.querySelectorAll('.summary-row').forEach((row) => {
    row.addEventListener('click', () => {
      const product = allProducts.find((item) => item.product_code === row.dataset.code);
      if (product) fillForm(product);
    });
  });
}

function parseHeaderKey(value) {
  const text = String(value || '').trim();
  const match = text.match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : text;
}

function parseCsv(text) {
  return Array.from((function* () {
    const rows = [];
    let cur = '';
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(cur);
        cur = '';
      } else if ((c === '\n' || c === '\r') && !inQuotes) {
        if (c === '\r' && next === '\n') i += 1;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      } else {
        cur += c;
      }
    }
    if (cur.length || row.length) {
      row.push(cur);
      rows.push(row);
    }
    yield* rows;
  })());
}

function convertGoogleSheetUrlToCsv(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('구글시트 주소 형식이 올바르지 않습니다.');
  const spreadsheetId = match[1];
  const gidMatch = String(url).match(/[?&#]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

function normalizeImportedRow(rowObj) {
  const payload = {};
  Object.entries(rowObj).forEach(([key, value]) => {
    const clean = String(value || '').trim();
    payload[key] = FIELD_NUMBERS.has(key) ? Number(String(clean).replace(/[^\d.-]/g, '') || 0) : clean;
  });
  if (!payload.partner_code) payload.partner_code = currentProfile?.company_code || '';
  if (!payload.policy_code) payload.policy_code = '';
  return payload;
}

async function applyGoogleSheet() {
  const url = String(sheetUrlInput.value || '').trim();
  if (!url) throw new Error('구글시트 주소를 입력하세요.');
  const csvUrl = convertGoogleSheetUrlToCsv(url);
  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error('구글시트 데이터를 가져오지 못했습니다.');
  const text = await response.text();
  const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell || '').trim() !== ''));
  if (rows.length < 2) throw new Error('반영할 데이터가 없습니다.');

  const headers = rows[0].map(parseHeaderKey);
  const dataRows = rows.slice(1);

  let importedCount = 0;
  for (const row of dataRows) {
    const rowObj = {};
    headers.forEach((header, idx) => {
      rowObj[header] = row[idx] ?? '';
    });

    const payload = normalizeImportedRow(rowObj);
    if (!payload.car_number) continue;

    const savePayload = {
      ...buildProductPayload(),
      ...payload,
      partner_code: payload.partner_code || currentProfile?.company_code || '',
      provider_company_code: payload.partner_code || currentProfile?.company_code || '',
      policy_code: payload.policy_code || '',
      term_code: payload.policy_code || '',
      term_name: payload.policy_code || '',
      rental_price_48: payload.rent_48 || 0,
      deposit_48: payload.deposit_48 || 0,
      rental_price_60: payload.rent_60 || 0,
      deposit_60: payload.deposit_60 || 0,
      rental_price: payload.rent_48 || 0,
      deposit: payload.deposit_48 || 0,
      price: {
        '1': { rent: payload.rent_1 || 0, deposit: payload.deposit_1 || 0, fee: payload.fee_1 || 0 },
        '12': { rent: payload.rent_12 || 0, deposit: payload.deposit_12 || 0, fee: payload.fee_12 || 0 },
        '24': { rent: payload.rent_24 || 0, deposit: payload.deposit_24 || 0, fee: payload.fee_24 || 0 },
        '36': { rent: payload.rent_36 || 0, deposit: payload.deposit_36 || 0, fee: payload.fee_36 || 0 },
        '48': { rent: payload.rent_48 || 0, deposit: payload.deposit_48 || 0, fee: payload.fee_48 || 0 },
        '60': { rent: payload.rent_60 || 0, deposit: payload.deposit_60 || 0, fee: payload.fee_60 || 0 }
      }
    };

    try {
      await saveProduct(savePayload);
      importedCount += 1;
    } catch (error) {
      console.warn('행 반영 실패', payload.car_number, error);
    }
  }

  message.textContent = `구글시트 반영 완료: ${importedCount}건`;
}

async function handleSubmit() {
  const file = imageInput.files?.[0];
  let imageUrl = existingImageInput.value || '';
  if (file) imageUrl = await uploadProductImage(file);
  const payload = buildProductPayload();
  payload.image_url = imageUrl;

  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    const productCode = await saveProduct(payload);
    lastSelectedProductCode = productCode;
    editingCodeInput.value = productCode;
    deleteButton.disabled = false;
    applyFormMode('view');
    message.textContent = `저장 완료: ${productCode}`;
    renderList(allProducts);
  } else {
    await updateProduct(editingCode, payload);
    lastSelectedProductCode = editingCode;
    deleteButton.disabled = false;
    applyFormMode('view');
    message.textContent = `수정 완료: ${editingCode}`;
    renderList(allProducts);
  }
}

async function handleDelete() {
  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    message.textContent = '삭제할 상품을 먼저 선택하세요.';
    return;
  }
  if (!window.confirm(`선택한 상품 ${editingCode} 를 삭제할까요?`)) return;
  await deleteProduct(editingCode);
  message.textContent = `삭제 완료: ${editingCode}`;
  lastSelectedProductCode = '';
  resetForm();
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    resetButton?.addEventListener('click', resetForm);
    bindOverlayToggle(filterToggleButton, filterOverlay);
    editButton?.addEventListener('click', () => { if (editingCodeInput.value.trim()) applyFormMode('edit'); });
    submitButton?.addEventListener('click', () => form.requestSubmit());
    deleteButton?.addEventListener('click', async () => {
      try {
        await handleDelete();
      } catch (error) {
        message.textContent = `삭제 실패: ${error.message}`;
      }
    });
    imageInput?.addEventListener('change', renderSelectedFiles);
    bindFileDropzone({ dropzone: uploadDropzone, input: imageInput, onFilesApplied: renderSelectedFiles });
    sheetApplyButton?.addEventListener('click', async () => {
      try {
        await applyGoogleSheet();
      } catch (error) {
        message.textContent = `반영 실패: ${error.message}`;
      }
    });

    registerPageCleanup(watchProducts((products) => {
      allProducts = profile.role === 'admin'
        ? [...products]
        : products.filter((item) => (item.partner_code || item.provider_company_code) === profile.company_code);
      renderList(allProducts);
      const selectedCode = editingCodeInput.value || lastSelectedProductCode || '';
      if (selectedCode) {
        const selected = allProducts.find((item) => item.product_code === selectedCode);
        if (selected) fillForm(selected);
      }
    }));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await handleSubmit();
      } catch (error) {
        message.textContent = `저장 실패: ${error.message}`;
      }
    });

    bindMoneyInputs();
    resetForm();
  } catch (error) {
    console.error(error);
  }
}

bootstrap();