import fs from "node:fs/promises";
import path from "node:path";

const root=process.cwd();
const portals=["index","admin","reviewer","scanner"];
const defaultCid=process.env.NEXT_PUBLIC_DEFAULT_CONFERENCE_ID||"CONF-TUH-QF-2569";
const appName=process.env.NEXT_PUBLIC_APP_NAME||"TUH Quality Fair Conference Management";
const remoteTuhLogo="https://img2.pic.in.th/logo-020c27d3e8c360c016.png";
const remoteHaccLogo="https://img1.pic.in.th/images/logo-04.png";
const localTuhLogo="/images/tuh-logo.png";
const localHaccLogo="/images/hacc-logo.png";
const rpcCode=`window._rpcCache=window._rpcCache||new Map();window._rpcInFlight=window._rpcInFlight||new Map();async function rpc(n,...a){const isRead=/^(get|adminList|adminGet|reviewerGet|lookup|export|inspect|list|verifyWorkAccess)/i.test(n);const isWrite=n!=='verifyWorkAccess'&&/save|submit|update|verify|import|seed|init|add|revoke|delete|upload|replace|send|commit|toggle|reset|assign/i.test(n);if(isWrite&&window._rpcCache){window._rpcCache.clear()}const cacheKey=n+':'+JSON.stringify(a);if(isRead&&window._rpcCache&&window._rpcCache.has(cacheKey)){const item=window._rpcCache.get(cacheKey);if(item&&item.exp>Date.now())return item.data;window._rpcCache.delete(cacheKey)}if(window._rpcInFlight&&window._rpcInFlight.has(cacheKey)){return window._rpcInFlight.get(cacheKey)}const promise=(async()=>{const maxRetries=isRead?2:1;let lastErr=null;for(let attempt=0;attempt<maxRetries;attempt++){if(attempt>0)await new Promise(r=>setTimeout(r,300));try{const response=await fetch('/api/gas',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({action:n,args:a,requestId:crypto.randomUUID(),timestamp:Date.now()})});let result;try{const text=await response.text();result=JSON.parse(text)}catch(e){throw new Error('การตอบกลับจากระบบไม่ถูกต้อง')}if(!response.ok||!result.success){throw new Error(result.message||'เกิดข้อผิดพลาดในการเชื่อมต่อระบบ')}if(isRead&&window._rpcCache){const cTtl=/Bootstrap/i.test(n)?15000:45000;window._rpcCache.set(cacheKey,{data:result.data,exp:Date.now()+cTtl})}return result.data}catch(err){lastErr=err;const msg=String(err&&err.message||'');if(msg.includes('Session')||msg.includes('สิทธิ์')||msg.includes('ไม่อนุญาต')||msg.includes('401')||msg.includes('403')){break}if(attempt+1>=maxRetries)throw err}}throw lastErr||new Error('เกิดข้อผิดพลาดในการเชื่อมต่อระบบ')})();if(window._rpcInFlight){window._rpcInFlight.set(cacheKey,promise)}try{return await promise}finally{if(window._rpcInFlight){window._rpcInFlight.delete(cacheKey)}}}`;
const canonicalCode=`function canonicalRoute(page){const routes={public:'/',admin:'/admin',reviewer:'/reviewer',scanner:'/scanner',launcher:'/launcher'};const target=routes[page||'public']||'/';return target+'?conferenceId='+encodeURIComponent(CID)}`;

function replaceFunction(text,name,code){
  let start = text.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (start < 0) {
    start = text.indexOf(`function ${name}(`);
    if (start < 0) return text;
  }
  // If replacing rpc and window._rpcCache preceded it in text, strip the preceding declaration
  if (name === "rpc") {
    const cacheIdx = text.lastIndexOf("window._rpcCache=", start);
    if (cacheIdx >= 0 && start - cacheIdx < 160) {
      start = cacheIdx;
    }
  }
  const funcKeyword = text.indexOf("function", start);
  const openParen = text.indexOf("(", funcKeyword >= 0 ? funcKeyword : start);
  let depth=0,quote="",escaped=false,opened=false;
  for(let i=openParen;i<text.length;i+=1){
    const c=text[i];
    if(quote){
      if(escaped)escaped=false;
      else if(c==="\\")escaped=true;
      else if(c===quote)quote="";
      continue;
    }
    if(c==="'"||c==='"'||c==="`"){quote=c;continue}
    if(c==="{"){depth+=1;opened=true}
    else if(c==="}"){depth-=1;if(opened&&depth===0)return text.slice(0,start)+code+text.slice(i+1)}
  }
  throw new Error(`Unclosed function ${name}`);
}

for(const portal of portals){
  let text=await fs.readFile(path.join(root,`${portal}.html.txt`),"utf8");
  const route=portal==="index"?"/":`/${portal}`;
  text=text
    .replaceAll("<?= appName ?>",appName)
    .replaceAll("<?= directUrl ?>",`${route}?conferenceId=${encodeURIComponent(defaultCid)}`)
    .replaceAll("<?= appUrl ?>","")
    .replaceAll("<?= conferenceId ?>",`'+(new URLSearchParams(location.search).get('conferenceId')||'${defaultCid}')+'`)
    .replaceAll(remoteTuhLogo,localTuhLogo)
    .replaceAll(remoteHaccLogo,localHaccLogo);
  text=replaceFunction(text,"rpc",rpcCode);
  text=replaceFunction(text,"canonicalRoute",canonicalCode);

  if(portal==="admin"){
    text=replaceFunction(text,"loadRememberedLogin",`function loadRememberedLogin(){try{const username=localStorage.getItem(ADMIN_CRED_KEY)||'';$('#loginUser').value=username;$('#rememberLogin').checked=!!username}catch(e){}}`);
    text=replaceFunction(text,"saveRememberedLogin",`function saveRememberedLogin(){if($('#rememberLogin').checked)localStorage.setItem(ADMIN_CRED_KEY,$('#loginUser').value.trim());else localStorage.removeItem(ADMIN_CRED_KEY)}`);
    text=replaceFunction(text,"currentAdminToken",`function currentAdminToken(){return '__COOKIE__'}`);
    text=replaceFunction(text,"storeAdminToken",`function storeAdminToken(){}`);
  }
  if(portal==="reviewer"){
    text=replaceFunction(text,"loadCreds",`function loadCreds(){try{const username=localStorage.getItem(CRED_KEY)||'';$('#loginUser').value=username;$('#rememberLogin').checked=!!username}catch(e){}}`);
    text=replaceFunction(text,"saveCreds",`function saveCreds(){if($('#rememberLogin').checked)localStorage.setItem(CRED_KEY,$('#loginUser').value.trim());else localStorage.removeItem(CRED_KEY)}`);
    text=replaceFunction(text,"storedToken",`function storedToken(){return '__COOKIE__'}`);
    text=replaceFunction(text,"storeToken",`function storeToken(){}`);
  }
  if(portal==="scanner"){
    text=replaceFunction(text,"loadRememberedLogin",`function loadRememberedLogin(){try{const username=localStorage.getItem(SCANNER_CRED_KEY)||'';$('#loginUser').value=username;$('#rememberLogin').checked=!!username}catch(e){}}`);
    text=replaceFunction(text,"saveRememberedLogin",`function saveRememberedLogin(){if($('#rememberLogin').checked)localStorage.setItem(SCANNER_CRED_KEY,$('#loginUser').value.trim());else localStorage.removeItem(SCANNER_CRED_KEY)}`);
    text=replaceFunction(text,"scannerStoredToken",`function scannerStoredToken(){return '__COOKIE__'}`);
    text=replaceFunction(text,"adminStoredToken",`function adminStoredToken(){return ''}`);
    text=replaceFunction(text,"storeScannerToken",`function storeScannerToken(){}`);
  }
  if(/google\.script\.run|<\?/.test(text))throw new Error(`GAS HTML binding remains in ${portal}`);
  await fs.writeFile(path.join(root,"public","legacy",`${portal}.html`),text,"utf8");
  console.log(`${portal}: ${Buffer.byteLength(text)} bytes`);
}
