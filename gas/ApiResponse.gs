function apiJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiSuccess_(data,requestId) {
  return {success:true,data:data,message:'',requestId:requestId};
}

function apiFailure_(error,requestId) {
  const known = error && error.apiCode;
  const rawMsg = error && error.message ? error.message : String(error || 'เกิดข้อผิดพลาดในการประมวลผล');
  return {
    success:false,
    message: rawMsg,
    errorCode: known || 'INTERNAL_ERROR',
    requestId:requestId || ''
  };
}
