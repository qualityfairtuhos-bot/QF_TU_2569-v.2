const API_PERMISSION_MAP = Object.freeze({
  PUBLIC: Object.freeze([
    'getPublicBootstrap','submitRegistration','lookupRegistrationForEdit',
    'saveRegistrationEdit','uploadPaymentSlip','verifyWorkAccess','submitWork',
    'replaceWorkFile','emailMyMealPass','getMealPass','loginUser',
    'requestPasswordReset','registerNewUser','getPublicFinanceDocuments'
  ]),
  REVIEWER: Object.freeze(['reviewerBootstrap','reviewerGetAssignment','reviewerSaveReview']),
  SCANNER: Object.freeze([
    'getEventScannerBootstrap','inspectEventScanner','confirmEventScanner',
    'getEventScannerRecent'
  ])
});

const API_ADMIN_ROLES = Object.freeze([
  'SUPERADMIN','CONFERENCE_ADMIN','REGISTRATION_STAFF','FINANCE_STAFF',
  'ACADEMIC_STAFF','FOOD_STAFF','VIEWER'
]);

function apiValidateEnvelope_(body) {
  if (!body || typeof body !== 'object') throw apiError_('VALIDATION_ERROR','รูปแบบคำขอไม่ถูกต้อง');
  if (!/^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(String(body.action || ''))) {
    throw apiError_('VALIDATION_ERROR','ชื่อคำสั่งไม่ถูกต้อง');
  }
  if (!Array.isArray(body.args) || body.args.length > 20) {
    throw apiError_('VALIDATION_ERROR','พารามิเตอร์ไม่ถูกต้อง');
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(body.requestId || ''))) {
    throw apiError_('VALIDATION_ERROR','requestId ไม่ถูกต้อง');
  }
  const timestamp = Number(body.timestamp);
  if (isFinite(timestamp) && timestamp > 0 && Math.abs(Date.now() - timestamp) > 24 * 60 * 60 * 1000) {
    throw apiError_('STALE_REQUEST','คำขอหมดอายุ กรุณาลองใหม่อีกครั้ง');
  }
}

function apiValidateSecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty('TUH_API_SECRET');
  if (!expected) {
    return true;
  }
  if (!secret || !apiConstantTimeEqual_(String(expected), String(secret))) {
    throw apiError_('UNAUTHORIZED_PROXY','Secret key ไม่ตรงกัน กรุณาตรวจสอบ TUH_API_SECRET ใน Apps Script ให้ตรงกับ GAS_API_SECRET ใน Vercel');
  }
}

function apiConstantTimeEqual_(a,b) {
  const aa = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a);
  const bb = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  let diff = aa.length ^ bb.length;
  for (let i=0;i<Math.max(aa.length,bb.length);i++) diff |= (aa[i % aa.length] ^ bb[i % bb.length]);
  return diff === 0;
}

function apiAuthorize_(action,args) {
  if (API_PERMISSION_MAP.PUBLIC.indexOf(action) >= 0) return null;
  if (action === 'logoutUser') return requireSession_(args[0], null, null);
  if (API_PERMISSION_MAP.REVIEWER.indexOf(action) >= 0) return requireSession_(args[0], ['REVIEWER'], args[1]);
  if (API_PERMISSION_MAP.SCANNER.indexOf(action) >= 0) {
    return requireSession_(args[0], ['SUPERADMIN','CONFERENCE_ADMIN','REGISTRATION_STAFF','FOOD_STAFF'], args[1]);
  }
  if (action.indexOf('admin') === 0 || [
    'getAdminSettings','saveAdminSettings','uploadExcelForImport',
    'commitImportBatch','exportWorksToExcel','exportRegistrationsToExcel',
    'exportPaymentsToExcel','listImportBatches'
  ].indexOf(action) >= 0) return requireSession_(args[0], API_ADMIN_ROLES, args[1]);
  throw apiError_('FORBIDDEN','ไม่มีสิทธิ์ใช้คำสั่งนี้');
}

function apiError_(code,message) {
  const error = new Error(message);
  error.apiCode = code;
  return error;
}

function apiClaimRequest_(requestId) {
  if (!requestId) return '';
  const cache = CacheService.getScriptCache();
  const key = 'api_req_' + String(requestId).replace(/[^A-Za-z0-9_-]/g, '');
  const status = cache.get(key);
  if (status === 'PROCESSING') throw apiError_('DUPLICATE_REQUEST','คำขอนี้กำลังถูกประมวลผลอยู่ กรุณารอสักครู่');
  if (status === 'DONE') throw apiError_('DUPLICATE_REQUEST','คำขอนี้ถูกประมวลผลเสร็จสิ้นแล้ว');
  cache.put(key, 'PROCESSING', 180);
  return key;
}

function apiCompleteRequest_(key) {
  if (key) {
    try {
      CacheService.getScriptCache().put(key, 'DONE', 21600);
    } catch(e) {}
  }
}

function apiReleaseRequest_(key) {
  if (key) {
    try {
      CacheService.getScriptCache().remove(key);
    } catch(e) {}
  }
}
