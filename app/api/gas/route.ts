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
  adminDashboard: 45_000,
  getAdminSettings: 120_000,
  adminListRegistrations: 45_000,
  adminListPayments: 45_000,
  adminListWorks: 45_000,
  adminListReviewers: 60_000,
  adminListUsers: 60_000,
  adminListMealPasses: 45_000,
  adminListFinanceDocuments: 120_000,
  adminGetReviewConfig: 120_000,
  reviewerBootstrap: 60_000,
  getEventScannerBootstrap: 60_000,
  listImportBatches: 60_000
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

function getCachedResponse(action:string,args:unknown[]){
  const ttl=CACHE_TTLS[action];
  if(!ttl)return null;
  const key=`${action}:${JSON.stringify(args)}`;
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
  const key=`${action}:${JSON.stringify(args)}`;
  memoryCache.set(key,{data,expiresAt:Date.now()+ttl});
  lastKnownGood.set(key,data);
}

function invalidateServerCache(action:string){
  // If a write occurs, clear memory cache
  if(/save|submit|update|import|seed|init|add|revoke|delete|upload|replace|send/i.test(action)){
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
  const urls: string[] = [];
  if (custom && custom.trim().startsWith("http")) urls.push(custom.trim());
  const fallback1 = "https://script.google.com/macros/s/AKfycbwOqV8w3QZ2V-68pPq2Q7i1F55eXzW5Jp7n_bYxG9L0kM2r1Tu/exec";
  const fallback2 = "https://script.google.com/macros/s/AKfycbybV1rB7q_rV4X5XF_56T6L7n_bYxG9L0kM2r1Tu/exec";
  if (!urls.includes(fallback1)) urls.push(fallback1);
  if (!urls.includes(fallback2)) urls.push(fallback2);
  return urls;
}

function getGasSecret(): string {
  return process.env.GAS_API_SECRET || process.env.GAS_WEBHOOK_TOKEN || process.env.BYPASS_SHARED_SECRET || "";
}

async function callGas(payload:RpcRequest&{secret:string},attempts:number){
  const urls = getGasExecUrls();
  let lastError: unknown = null;

  for (const url of urls) {
    for(let attempt=0;attempt<attempts;attempt+=1){
      if(attempt>0){
        await new Promise((r)=>setTimeout(r,attempt*700+Math.floor(Math.random()*200)));
      }
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),GAS_TIMEOUT_MS);
      try{
        const response=await fetch(url,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(payload),
          redirect:"follow",
          cache:"no-store",
          keepalive:true,
          signal:controller.signal
        });
        if(!response.ok)throw new Error(`GAS_HTTP_${response.status}`);
        const rawText=await response.text();
        let result:ApiResponse<unknown>;
        try{
          result=JSON.parse(rawText) as ApiResponse<unknown>;
        }catch{
          if(rawText.includes("accounts.google.com")||rawText.includes("Authorization required")||rawText.includes("google.com/auth")){
            throw new Error("กรุณากดจัดทำเวอร์ชันใหม่ (New Version Deployment) และยินยอมสิทธิ์ใน Google Apps Script");
          }
          if(rawText.includes("<!DOCTYPE")||rawText.includes("<html")){
            throw new Error("Google Apps Script คืนค่าเป็นหน้า HTML (อาจเกิดจากสิทธิ์การใช้งาน หรือ Script Error)");
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
  throw lastError || new Error("GAS_UNAVAILABLE");
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

  const cacheKey=`${action}:${JSON.stringify(args)}`;

  // Check in-memory cache for fast read actions
  const cached=getCachedResponse(action,args);
  if(cached){
    return NextResponse.json(cached,{status:200,headers:{"X-Cache":"HIT"}});
  }

  if(SESSION_ACTIONS.has(action)){
    const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
    const directToken = (typeof args[0] === "string" && args[0].trim() && args[0] !== "__COOKIE__") ? args[0].trim() : "";
    const token = directToken || cookieToken;
    if(!token) return failure("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่","UNAUTHENTICATED",401,requestId);
    if(args.length===0) args.push(token); else args[0]=token;
  }
  const secret=getGasSecret();
  const outbound={action,args,requestId:typeof input.requestId==="string"?input.requestId:requestId,timestamp:Date.now(),secret};
  try{
    const result=await callGas(outbound,READ_ACTIONS.has(action)?3:1);
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
      errorMsg="การเชื่อมต่อระบบส่วนกลางใช้เวลานานเกินกำหนด กรุณาตรวจสอบสถานะการลงทะเบียนในเมนู 'ตรวจสอบสถานะ' หรือลองใหม่อีกครั้ง";
    }
    // If upstream call fails, check if we have a last known good cached response for read actions
    if(lastKnownGood.has(cacheKey)){
      const fallback=lastKnownGood.get(cacheKey)!;
      return NextResponse.json(fallback,{status:200,headers:{"X-Fallback":"true"}});
    }
    return failure(`ไม่สามารถเชื่อมต่อระบบส่วนกลางได้ (${errorMsg})`,"UPSTREAM_ERROR",502,requestId);
  }
}
