import {randomUUID} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {ALLOWED_ACTIONS,READ_ACTIONS,SESSION_ACTIONS} from "@/lib/actions";
import {clearSessionCookie,setSessionCookie} from "@/lib/auth";
import {GAS_TIMEOUT_MS,MAX_REQUEST_BYTES,SESSION_COOKIE} from "@/lib/config";
import type {ApiResponse,RpcRequest} from "@/lib/types";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const buckets=new Map<string,{count:number;reset:number}>();

// Fast in-memory cache for read-heavy responses
const memoryCache=new Map<string,{data:ApiResponse<unknown>;expiresAt:number}>();
const lastKnownGood=new Map<string,ApiResponse<unknown>>();
const CACHE_TTLS:Record<string,number>={
  getPublicBootstrap: 300_000,
  getPublicAnnouncement: 300_000,
  getPublicFinanceDocuments: 300_000,
  adminBootstrap: 180_000,
  adminDashboard: 120_000,
  getAdminSettings: 180_000,
  adminListRegistrations: 120_000,
  adminListPayments: 120_000,
  adminListWorks: 120_000,
  adminListReviewers: 180_000,
  adminListUsers: 180_000,
  adminListMealPasses: 120_000,
  adminListFinanceDocuments: 180_000,
  adminGetReviewConfig: 180_000,
  reviewerBootstrap: 120_000,
  getEventScannerBootstrap: 120_000,
  listImportBatches: 120_000
};

const DEFAULT_CONFERENCE_BOOT = {
  conference: {
    ConferenceID: "CONF-TUH-QF-2569",
    ConferenceNameTH: "งานมหกรรมคุณภาพโรงพยาบาล ครั้งที่ 19 และงาน HA-Regional Forum ครั้งที่ 1 ประจำปี 2569",
    ShortName: "มหกรรมคุณภาพ 2569",
    DescriptionTH: "ระบบลงทะเบียน ส่งผลงาน ประเมินผลงาน และบริหารจัดการงานประชุมวิชาการ",
    Venue: "อาคารเรียนและปฏิบัติการรวม มหาวิทยาลัยธรรมศาสตร์ ศูนย์รังสิต",
    StartDate: "2026-11-18",
    EndDate: "2026-11-20",
    RegistrationCloseAt: "2026-11-10T23:59:59",
    PaymentCloseAt: "2026-11-12T23:59:59",
    SubmissionCloseAt: "2026-10-15T23:59:59",
    ResultAnnouncementAt: "2026-11-01T23:59:59",
    LogoUrl: "/images/tuh-logo.png",
    PrimaryColor: "#0C385B",
    SecondaryColor: "#006D70"
  },
  registrationTypes: [
    { TypeCode: "INTERNAL", TypeNameTH: "บุคลากรโรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ", FeeAmount: 0 },
    { TypeCode: "EXTERNAL_EARLY", TypeNameTH: "บุคคลภายนอก (Early Bird)", FeeAmount: 1800 },
    { TypeCode: "EXTERNAL_REGULAR", TypeNameTH: "บุคคลภายนอก (ทั่วไป)", FeeAmount: 2200 }
  ],
  workCategories: [
    { CategoryID: "CAT-1", CategoryCode: "RESEARCH", CategoryNameTH: "ผลงานวิจัยด้านคุณภาพและความปลอดภัย" },
    { CategoryID: "CAT-2", CategoryCode: "INNOVATION", CategoryNameTH: "ผลงานนวัตกรรมด้านคุณภาพและความปลอดภัย" },
    { CategoryID: "CAT-3", CategoryCode: "SERVICE", CategoryNameTH: "Service Excellence" },
    { CategoryID: "CAT-4", CategoryCode: "CQI", CategoryNameTH: "CQI/ Best Practice" },
    { CategoryID: "CAT-5", CategoryCode: "PRIMARY_CARE", CategoryNameTH: "Primary Care & Community Network Development" }
  ],
  presentationTypes: [
    { PresentationTypeID: "PRES-ORAL", TypeCode: "ORAL", TypeNameTH: "แบบบรรยาย (Oral presentation)", PresentationMinutes: 10, QAMinutes: 2 },
    { PresentationTypeID: "PRES-POSTER", TypeCode: "POSTER", TypeNameTH: "แบบโปสเตอร์ (e-poster)", PresentationMinutes: 4, QAMinutes: 1 }
  ],
  eventDates: ["2026-11-18", "2026-11-19", "2026-11-20"],
  settings: {
    EVENT_DATES_JSON: '["2026-11-18","2026-11-19","2026-11-20"]',
    BANNER_SLIDES_JSON: '[{"title":"งานมหกรรมคุณภาพ ครั้งที่ 19","imageUrl":"/images/tuh-banner-main.jpg","link":"","active":true},{"title":"CQI & Best Practice","imageUrl":"/images/tuh-banner-cqi.jpg","link":"","active":true},{"title":"VAR for Sustainability Healthcare","imageUrl":"/images/tuh-banner-var.jpg","link":"","active":true}]'
  },
  organizationUnits: [
    { UnitLevel: "GROUP", UnitNameTH: "กลุ่มภารกิจด้านการพยาบาล" },
    { UnitLevel: "GROUP", UnitNameTH: "กลุ่มภารกิจด้านพัฒนาระบบบริการและสนับสนุนบริการสุขภาพ" },
    { UnitLevel: "GROUP", UnitNameTH: "กลุ่มภารกิจด้านบริการทางการแพทย์" },
    { UnitLevel: "GROUP", UnitNameTH: "กลุ่มภารกิจด้านอำนวยการ" },
    { UnitLevel: "GROUP", UnitNameTH: "ฝ่ายการพยาบาล" },
    { UnitLevel: "UNIT", UnitNameTH: "งานการพยาบาลผู้ป่วยนอก" },
    { UnitLevel: "UNIT", UnitNameTH: "งานการพยาบาลผู้ป่วยใน" },
    { UnitLevel: "UNIT", UnitNameTH: "งานการพยาบาลอุบัติเหตุและฉุกเฉิน" },
    { UnitLevel: "UNIT", UnitNameTH: "งานการพยาบาลผู้ป่วยหนัก" },
    { UnitLevel: "UNIT", UnitNameTH: "งานการพยาบาลห้องผ่าตัด" }
  ],
  dailyQuota: {
    internal: { max: 400, day1: 0, day2: 0, day3: 0 },
    external: { max: 200, day1: 0, day2: 0, day3: 0 }
  }
};

const preseededBoot: ApiResponse<unknown> = {
  success: true,
  data: DEFAULT_CONFERENCE_BOOT
};
lastKnownGood.set('getPublicBootstrap:["CONF-TUH-QF-2569"]', preseededBoot);
lastKnownGood.set('getPublicBootstrap:[]', preseededBoot);
lastKnownGood.set('getPublicBootstrap:[""]', preseededBoot);
memoryCache.set('getPublicBootstrap:["CONF-TUH-QF-2569"]', { data: preseededBoot, expiresAt: Date.now() + 300_000 });
memoryCache.set('getPublicBootstrap:[]', { data: preseededBoot, expiresAt: Date.now() + 300_000 });

function getCacheKey(action:string,args:unknown[]){
  if(SESSION_ACTIONS.has(action)&&args.length>0){
    const sessionlessArgs=["__SESSION__",...args.slice(1)];
    return `${action}:${JSON.stringify(sessionlessArgs)}`;
  }
  return `${action}:${JSON.stringify(args)}`;
}

function getCachedResponse(action:string,args:unknown[]){
  const ttl=CACHE_TTLS[action];
  if(!ttl)return null;
  const key=getCacheKey(action,args);
  const item=memoryCache.get(key);
  if(item&&item.expiresAt>Date.now()){
    return item.data;
  }
  if(item)memoryCache.delete(key);
  return null;
}

function setCachedResponse(action:string,args:unknown[],data:ApiResponse<unknown>){
  const ttl=CACHE_TTLS[action];
  if(!ttl||!data.success)return;
  const key=getCacheKey(action,args);
  memoryCache.set(key,{data,expiresAt:Date.now()+ttl});
  lastKnownGood.set(key,data);
}

function invalidateServerCache(action:string){
  // If a write occurs, clear memory cache
  if(/save|submit|update|verify|import|seed|init|add|revoke|delete|upload|replace|send|commit|toggle|reset|assign/i.test(action)){
    memoryCache.clear();
  }
}

function rateLimited(request:NextRequest){
  const key=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown",now=Date.now(),bucket=buckets.get(key);
  if(!bucket||bucket.reset<now){buckets.set(key,{count:1,reset:now+60_000});return false}
  bucket.count+=1;return bucket.count>180;
}
function failure(message:string,errorCode:string,status:number,requestId:string){
  return NextResponse.json<ApiResponse<never>>({success:false,message,errorCode,requestId},{status});
}
function getGasExecUrls(): string[] {
  const custom = process.env.GAS_WEB_APP_URL || process.env.GAS_EXEC_URL;
  if (custom && custom.trim().startsWith("http")) {
    const trimmed = custom.trim();
    if (trimmed.includes("DEPLOYMENT_ID") || trimmed.includes("YOUR_") || trimmed.includes("REPLACE_ME")) {
      throw new Error("ยังไม่ได้ตั้งค่า GAS_WEB_APP_URL (พบค่าเริ่มต้น placeholder DEPLOYMENT_ID) กรุณาระบุ Web App URL ของ Google Apps Script ในการตั้งค่า (Settings > Environment Variables)");
    }
    return [trimmed];
  }
  throw new Error("ยังไม่ได้กำหนดค่า GAS_WEB_APP_URL กรุณาระบุ Web App URL ของ Google Apps Script ที่ Deploy แล้ว (ลงท้ายด้วย /exec) ในเมนู Settings");
}

function getGasSecret(): string {
  return process.env.GAS_API_SECRET || process.env.GAS_WEBHOOK_TOKEN || process.env.BYPASS_SHARED_SECRET || "";
}

async function callGas(payload:RpcRequest&{secret:string},attempts:number){
  let urls: string[];
  try {
    urls = getGasExecUrls();
  } catch (err) {
    throw err;
  }
  let lastError: unknown = null;

  for (const url of urls) {
    for(let attempt=0;attempt<attempts;attempt+=1){
      if(attempt>0){
        await new Promise((r)=>setTimeout(r,attempt*600));
      }
      const isAuthOrBoot = /login|Bootstrap|Dashboard|getPublic|verify/i.test(payload.action);
      const timeoutMs = isAuthOrBoot ? 35_000 : Math.min(GAS_TIMEOUT_MS, 50_000);
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const currentPayload = attempt > 0 ? { ...payload, requestId: `${payload.requestId || randomUUID()}_r${attempt}` } : payload;
        const response=await fetch(url,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(currentPayload),
          redirect:"follow",
          cache:"no-store",
          keepalive:true,
          signal:controller.signal
        });
        if(response.status === 404){
          throw new Error("ไม่พบ Google Apps Script Web App (HTTP 404) กรุณาตรวจสอบว่า URL ลงท้ายด้วย /exec และ Deploy แบบ Web App ถูกต้อง");
        }
        if(!response.ok){
          throw new Error(`การเชื่อมต่อไปยัง Google Apps Script ขัดข้อง (HTTP ${response.status})`);
        }
        const rawText=await response.text();
        let result:ApiResponse<unknown>;
        try{
          result=JSON.parse(rawText) as ApiResponse<unknown>;
        }catch{
          if(rawText.includes("accounts.google.com")||rawText.includes("Authorization required")||rawText.includes("google.com/auth")){
            throw new Error("สิทธิ์การเข้าถึง Google Apps Script ไม่ถูกต้อง: กรุณา Deploy Web App โดยตั้ง 'Who has access' เป็น 'Anyone' และกดอนุมัติสิทธิ์ (Authorize)");
          }
          if(rawText.includes("<!DOCTYPE")||rawText.includes("<html")){
            throw new Error("Google Apps Script ส่งกลับเป็นหน้าเว็บ HTML (อาจเกิดจากสิทธิ์การใช้งานของ Script หรือ Web App URL ไม่ถูกต้อง)");
          }
          throw new Error(`คำตอบจากส่วนกลางไม่ถูกต้อง (${rawText.slice(0, 80)})`);
        }
        if(typeof result.success!=="boolean")throw new Error("GAS_INVALID_RESPONSE");
        return result;
      }catch(error){
        lastError = error;
        if(attempt+1>=attempts && urls.indexOf(url) === urls.length - 1) throw error;
      }finally{
        clearTimeout(timeout);
      }
    }
  }
  throw lastError || new Error("ไม่สามารถเชื่อมต่อ Google Apps Script ได้ในขณะนี้");
}

export async function POST(request:NextRequest){
  const requestId=randomUUID();
  if(rateLimited(request))return failure("ส่งคำขอบ่อยเกินไป กรุณารอสักครู่","RATE_LIMITED",429,requestId);
  const length=Number(request.headers.get("content-length")??"0");
  if(length>MAX_REQUEST_BYTES)return failure("ข้อมูลหรือไฟล์มีขนาดใหญ่เกินกำหนด","PAYLOAD_TOO_LARGE",413,requestId);
  let input:RpcRequest;
  try{input=await request.json() as RpcRequest}catch{return failure("รูปแบบคำขอไม่ถูกต้อง","INVALID_JSON",400,requestId)}
  const action=typeof input.action==="string"?input.action:"";
  if(!ALLOWED_ACTIONS.has(action))return failure("ไม่อนุญาตให้เรียกคำสั่งนี้","ACTION_NOT_ALLOWED",403,requestId);
  const args=Array.isArray(input.args)?[...input.args]:[];
  if(args.length>20)return failure("จำนวนพารามิเตอร์ไม่ถูกต้อง","VALIDATION_ERROR",400,requestId);

  if(SESSION_ACTIONS.has(action)){
    const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
    const directToken = (typeof args[0] === "string" && args[0].trim() && args[0] !== "__COOKIE__") ? args[0].trim() : "";
    const token = directToken || cookieToken;
    if(!token) return failure("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่","UNAUTHENTICATED",401,requestId);
    if(args.length===0) args.push(token); else args[0]=token;
  }

  const bypassCache = Boolean((input as {bypassCache?: boolean}).bypassCache) || request.headers.get("x-bypass-cache") === "1";
  const cacheKey=getCacheKey(action,args);

  // Check in-memory cache for fast read actions unless explicitly bypassed
  if(!bypassCache){
    const cached=getCachedResponse(action,args);
    if(cached){
      return NextResponse.json(cached,{status:200,headers:{"X-Cache":"HIT"}});
    }
  } else {
    memoryCache.delete(cacheKey);
  }

  const secret=getGasSecret();
  const outbound={action,args,requestId:typeof input.requestId==="string"?input.requestId:requestId,timestamp:Date.now(),secret};
  const isRetryableAction = READ_ACTIONS.has(action) || action === "loginUser" || action === "requestPasswordReset" || action === "verifyWorkAccess" || action === "lookupRegistrationForEdit";
  try{
    const result=await callGas(outbound,isRetryableAction?2:1);
    if(result.success){
      setCachedResponse(action,args,result);
      invalidateServerCache(action);
    }
    if(action==="loginUser"&&result.success&&result.data&&typeof result.data==="object"){
      const data={...(result.data as Record<string,unknown>)};
      const token=typeof data.token==="string"?data.token:"";
      if(!token)return failure("Backend ไม่ได้คืน Session ที่ถูกต้อง","INVALID_SESSION",502,requestId);
      const response=NextResponse.json({...result,data});
      setSessionCookie(response,token);
      return response;
    }
    const response=NextResponse.json(result,{status:result.success?200:400});
    if(action==="logoutUser")clearSessionCookie(response);
    return response;
  }catch(err:unknown){
    let errorMsg=err instanceof Error?err.message:String(err);
    if(/aborted|AbortError|timeout|ECONNRESET/i.test(errorMsg)){
      errorMsg="การเชื่อมต่อระบบส่วนกลางใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง";
    }
    // If upstream call fails, check if we have a last known good cached response for read actions
    if(lastKnownGood.has(cacheKey)){
      const fallback=lastKnownGood.get(cacheKey)!;
      return NextResponse.json(fallback,{status:200,headers:{"X-Fallback":"true"}});
    }
    return failure(`ไม่สามารถเชื่อมต่อระบบส่วนกลางได้ (${errorMsg})`,"UPSTREAM_ERROR",502,requestId);
  }
}
