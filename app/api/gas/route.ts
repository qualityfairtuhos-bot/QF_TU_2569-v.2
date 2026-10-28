import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ALLOWED_ACTIONS, SESSION_ACTIONS, READ_ACTIONS } from "@/lib/actions";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { GAS_TIMEOUT_MS, MAX_REQUEST_BYTES, SESSION_COOKIE } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SETTINGS_FILE = path.join(process.cwd(), "persisted_settings.json");
const WORK_LOCKS_FILE = path.join(process.cwd(), "persisted_work_locks.json");

function getPersistedSettings(): Record<string, any> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Failed to read persisted_settings.json", err);
  }
  return {};
}

function getPersistedWorkLocks(): Record<string, { lockedRound1: boolean; timestamp: string }> {
  try {
    if (fs.existsSync(WORK_LOCKS_FILE)) {
      return JSON.parse(fs.readFileSync(WORK_LOCKS_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Failed to read persisted_work_locks.json", err);
  }
  return {};
}

function savePersistedWorkLock(workId: string, locked: boolean) {
  try {
    const current = getPersistedWorkLocks();
    current[workId] = { lockedRound1: locked, timestamp: new Date().toISOString() };
    fs.writeFileSync(WORK_LOCKS_FILE, JSON.stringify(current, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write persisted_work_locks.json", err);
  }
}

const rateLimits = new Map<string, { count: number; reset: number }>();
const memoryCache = new Map<string, { data: any; expiresAt: number }>();
const staleCache = new Map<string, any>();

const CACHE_TTLS: Record<string, number> = {
  getPublicBootstrap: 300_000,
  getPublicAnnouncement: 300_000,
  getPublicFinanceDocuments: 300_000,
  adminBootstrap: 300_000,
  adminDashboard: 180_000,
  getAdminSettings: 300_000,
  adminListRegistrations: 180_000,
  adminListPayments: 180_000,
  adminListWorks: 180_000,
  adminListReviewers: 300_000,
  adminGetReviewerEvaluationReport: 180_000,
  adminGetWorkScoreSummary: 180_000,
  adminListUsers: 300_000,
  adminListMealPasses: 180_000,
  adminListFinanceDocuments: 300_000,
  adminGetReviewConfig: 300_000,
  reviewerBootstrap: 180_000,
  reviewerGetAssignment: 180_000,
  verifyWorkAccess: 120_000,
  getEventScannerBootstrap: 180_000,
  listImportBatches: 300_000,
};

const inFlight = new Map<string, Promise<any>>();

const DEFAULT_BOOTSTRAP: any = {
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
    SecondaryColor: "#006D70",
  },
  registrationTypes: [
    { TypeCode: "EXT_PROV_CTR_GEN", TypeNameTH: "สาธารณสุขจังหวัด / โรงพยาบาลศูนย์ / โรงพยาบาลทั่วไป", FeeAmount: 2500 },
    { TypeCode: "EXT_COMMUNITY", TypeNameTH: "โรงพยาบาลชุมชน / สาธารณสุขอำเภอ / รพ.สต.", FeeAmount: 1500 },
    { TypeCode: "EXT_GENERAL_ACAD_PRIV", TypeNameTH: "บุคคลภายนอกทั่วไป / สถาบันการศึกษา / เอกชน", FeeAmount: 2500 },
    { TypeCode: "INTERNAL", TypeNameTH: "บุคลากรโรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ", FeeAmount: 0 },
  ],
  workCategories: [
    { CategoryID: "CAT-1", CategoryCode: "RESEARCH", CategoryNameTH: "ผลงานวิจัยด้านคุณภาพและความปลอดภัย" },
    { CategoryID: "CAT-2", CategoryCode: "INNOVATION", CategoryNameTH: "ผลงานนวัตกรรมด้านคุณภาพและความปลอดภัย" },
    { CategoryID: "CAT-3", CategoryCode: "SERVICE", CategoryNameTH: "Service Excellence" },
    { CategoryID: "CAT-4", CategoryCode: "CQI", CategoryNameTH: "CQI/ Best Practice" },
    { CategoryID: "CAT-5", CategoryCode: "PRIMARY_CARE", CategoryNameTH: "Primary Care & Community Network Development" },
  ],
  presentationTypes: [
    { PresentationTypeID: "PRES-ORAL", TypeCode: "ORAL", TypeNameTH: "แบบบรรยาย (Oral presentation)", PresentationMinutes: 10, QAMinutes: 2 },
    { PresentationTypeID: "PRES-POSTER", TypeCode: "POSTER", TypeNameTH: "แบบโปสเตอร์ (e-poster)", PresentationMinutes: 4, QAMinutes: 1 },
  ],
  eventDates: ["2026-11-18", "2026-11-19", "2026-11-20"],
  settings: {
    EVENT_DATES_JSON: '["2026-11-18","2026-11-19","2026-11-20"]',
    PRESENTATION_SUBMISSION_CLOSE_AT: "10/11/2569 23:59",
    BANNER_SLIDES_JSON: JSON.stringify([{
      id: "b_tuh_forum2569",
      title: "งานมหกรรมคุณภาพโรงพยาบาล ครั้งที่ 19 และงาน HA-Regional Forum ครั้งที่ 1 ประจำปี 2569",
      imageUrl: "https://lh3.googleusercontent.com/d/1K5ugV1wCA4NaKxB4SkQ5-viHTorL9aau",
      fallbackImageUrl: "/images/bannerweb_TUH19-1920x600.jpg",
      linkUrl: "",
      active: true,
    }]),
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
    { UnitLevel: "UNIT", UnitNameTH: "งานการพยาบาลห้องผ่าตัด" },
  ],
  dailyQuota: {
    internal: { max: 400, day1: 0, day2: 0, day3: 0 },
    external: { max: 200, day1: 0, day2: 0, day3: 0 },
  },
};

const initialPersisted = getPersistedSettings();
if (Object.keys(initialPersisted).length > 0) {
  DEFAULT_BOOTSTRAP.settings = { ...DEFAULT_BOOTSTRAP.settings, ...initialPersisted };
}

const DEFAULT_RESPONSE = { success: true, data: DEFAULT_BOOTSTRAP };

function buildCacheKey(action: string, args: any[]): string {
  if (action.startsWith("reviewer") && args.length > 0) {
    const masked = [typeof args[0] === "string" ? args[0].slice(0, 24) : "__REV__", ...args.slice(1)];
    return `${action}:${JSON.stringify(masked)}`;
  }
  if (SESSION_ACTIONS.has(action) && args.length > 0) {
    const masked = ["__SESSION__", ...args.slice(1)];
    return `${action}:${JSON.stringify(masked)}`;
  }
  return `${action}:${JSON.stringify(args)}`;
}

function setCache(action: string, args: any[], result: any) {
  const ttl = CACHE_TTLS[action];
  if (!ttl || !result.success) return;
  const key = buildCacheKey(action, args);
  memoryCache.set(key, { data: result, expiresAt: Date.now() + ttl });
  staleCache.set(key, result);
}

function getCached(action: string, args: any[]): any | null {
  if (!CACHE_TTLS[action]) return null;
  const key = buildCacheKey(action, args);
  const entry = memoryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  if (entry) memoryCache.delete(key);
  return null;
}

function invalidateCache(action: string) {
  if (READ_ACTIONS.has(action)) return;

  if (/reviewerSaveReview|reviewer/i.test(action)) {
    for (const key of Array.from(memoryCache.keys())) {
      if (
        key.startsWith("reviewer") ||
        key.startsWith("adminListWorks") ||
        key.startsWith("adminDashboard") ||
        key.startsWith("adminGetWorkScoreSummary") ||
        key.startsWith("adminGetReviewerEvaluationReport")
      ) {
        memoryCache.delete(key);
      }
    }
    return;
  }
  if (/Registration|Participant/i.test(action)) {
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith("adminListRegistrations") || key.startsWith("adminDashboard") || key.startsWith("adminListMealPasses") || key.startsWith("lookupRegistration")) {
        memoryCache.delete(key);
      }
    }
    return;
  }
  if (/Payment|Receipt|Invoice/i.test(action)) {
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith("adminListPayments") || key.startsWith("adminDashboard") || key.startsWith("adminListFinanceDocuments")) {
        memoryCache.delete(key);
      }
    }
    return;
  }
  if (/Work|File|Author|Criteria|Score/i.test(action)) {
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith("adminListWorks") || key.startsWith("adminDashboard") || key.startsWith("reviewer") || key.startsWith("verifyWorkAccess")) {
        memoryCache.delete(key);
      }
    }
    return;
  }
  if (/save|submit|update|verify|import|seed|init|add|revoke|delete|upload|replace|send|commit|toggle|reset|assign/i.test(action)) {
    memoryCache.clear();
  }
}

function errorResponse(message: string, code: string, status = 400, reqId?: string) {
  return NextResponse.json(
    { success: false, message, errorCode: code, requestId: reqId },
    { status }
  );
}

function getGasUrls(): string[] {
  const url = process.env.GAS_WEB_APP_URL || process.env.GAS_EXEC_URL;
  if (url && url.trim().startsWith("http")) {
    const trimmed = url.trim();
    if (trimmed.includes("DEPLOYMENT_ID") || trimmed.includes("YOUR_") || trimmed.includes("REPLACE_ME")) {
      throw new Error("ยังไม่ได้ตั้งค่า GAS_WEB_APP_URL (พบค่าเริ่มต้น placeholder DEPLOYMENT_ID) กรุณาระบุ Web App URL ของ Google Apps Script ในการตั้งค่า (Settings > Environment Variables)");
    }
    return [trimmed];
  }
  throw new Error("ยังไม่ได้กำหนดค่า GAS_WEB_APP_URL กรุณาระบุ Web App URL ของ Google Apps Script ที่ Deploy แล้ว (ลงท้ายด้วย /exec) ในเมนู Settings");
}

async function fetchGasWithRetry(payload: any, maxRetries: number) {
  let urls: string[];
  try {
    urls = getGasUrls();
  } catch (err) {
    throw err;
  }

  let lastError: any = null;
  for (const url of urls) {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      }
      const timeoutMs = Math.max(GAS_TIMEOUT_MS, 90_000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const bodyPayload = attempt > 0 ? { ...payload, requestId: `${payload.requestId || crypto.randomUUID()}_r${attempt}` } : payload;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
          redirect: "follow",
          cache: "no-store",
          keepalive: true,
          signal: controller.signal,
        });

        if (res.status === 404) {
          throw new Error("ไม่พบ Google Apps Script Web App (HTTP 404) กรุณาตรวจสอบว่า URL ลงท้ายด้วย /exec และ Deploy แบบ Web App ถูกต้อง");
        }
        if (!res.ok) {
          throw new Error(`การเชื่อมต่อไปยัง Google Apps Script ขัดข้อง (HTTP ${res.status})`);
        }

        const rawText = await res.text();
        let parsed: any;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          if (rawText.includes("accounts.google.com") || rawText.includes("Authorization required") || rawText.includes("google.com/auth")) {
            throw new Error("สิทธิ์การเข้าถึง Google Apps Script ไม่ถูกต้อง: กรุณา Deploy Web App โดยตั้ง 'Who has access' เป็น 'Anyone' และกดอนุมัติสิทธิ์ (Authorize)");
          }
          if (rawText.includes("<!DOCTYPE") || rawText.includes("<html")) {
            throw new Error("Google Apps Script ส่งกลับเป็นหน้าเว็บ HTML (อาจเกิดจากสิทธิ์การใช้งานของ Script หรือ Web App URL ไม่ถูกต้อง)");
          }
          throw new Error(`คำตอบจากส่วนกลางไม่ถูกต้อง (${rawText.slice(0, 80)})`);
        }

        if (typeof parsed.success !== "boolean") {
          throw new Error("GAS_INVALID_RESPONSE");
        }
        return parsed;
      } catch (err: any) {
        lastError = err;
        if (attempt + 1 >= maxRetries && urls.indexOf(url) === urls.length - 1) {
          throw err;
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastError || new Error("ไม่สามารถเชื่อมต่อ Google Apps Script ได้ในขณะนี้");
}

export async function POST(req: NextRequest) {
  const reqId = crypto.randomUUID();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const rl = rateLimits.get(ip);
  if (rl && rl.reset >= now) {
    rl.count += 1;
    if (rl.count > 180) {
      return errorResponse("ส่งคำขอบ่อยเกินไป กรุณารอสักครู่", "RATE_LIMITED", 429, reqId);
    }
  } else {
    rateLimits.set(ip, { count: 1, reset: now + 60_000 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return errorResponse("ข้อมูลหรือไฟล์มีขนาดใหญ่เกินกำหนด", "PAYLOAD_TOO_LARGE", 413, reqId);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("รูปแบบคำขอไม่ถูกต้อง", "INVALID_JSON", 400, reqId);
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (!ALLOWED_ACTIONS.has(action)) {
    return errorResponse("ไม่อนุญาตให้เรียกคำสั่งนี้", "ACTION_NOT_ALLOWED", 403, reqId);
  }

  const args: any[] = Array.isArray(body.args) ? [...body.args] : [];
  if (args.length > 20) {
    return errorResponse("จำนวนพารามิเตอร์ไม่ถูกต้อง", "VALIDATION_ERROR", 400, reqId);
  }

  if (SESSION_ACTIONS.has(action)) {
    const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
    const clientToken = (typeof args[0] === "string" && args[0].trim() && args[0] !== "__COOKIE__") ? args[0].trim() : "";
    const sessionToken = clientToken || cookieToken;
    if (!sessionToken) {
      return errorResponse("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่", "UNAUTHENTICATED", 401, reqId);
    }
    if (args.length === 0) {
      args.push(sessionToken);
    } else {
      args[0] = sessionToken;
    }
  }

  const bypassCache = !!body.bypassCache || req.headers.get("x-bypass-cache") === "1";
  const cacheKey = buildCacheKey(action, args);

  if (bypassCache) {
    memoryCache.delete(cacheKey);
  } else {
    const cached = getCached(action, args);
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: { "X-Cache": "HIT" },
      });
    }
  }

  const secret = process.env.GAS_API_SECRET || process.env.GAS_WEBHOOK_TOKEN || process.env.BYPASS_SHARED_SECRET || "";
  const payload = {
    action,
    args,
    requestId: typeof body.requestId === "string" ? body.requestId : reqId,
    timestamp: Date.now(),
    secret,
  };

  const isRead = READ_ACTIONS.has(action) || action === "loginUser" || action === "requestPasswordReset" || action === "verifyWorkAccess" || action === "lookupRegistrationForEdit";

  try {
    let result: any;

    if (READ_ACTIONS.has(action)) {
      if (inFlight.has(cacheKey)) {
        result = await inFlight.get(cacheKey)!;
      } else {
        const promise = fetchGasWithRetry(payload, 2);
        inFlight.set(cacheKey, promise);
        try {
          result = await promise;
        } finally {
          inFlight.delete(cacheKey);
        }
      }
    } else {
      if (action === "adminUploadBanner") {
        const fileObj = args[2];
        if (!fileObj || !fileObj.base64) {
          return errorResponse("ไม่พบข้อมูลไฟล์ภาพ", "INVALID_FILE", 400, reqId);
        }
        const extMatch = (fileObj.name || fileObj.fileName || "").split(".").pop()?.toLowerCase();
        const mime = fileObj.type || fileObj.mimeType || "";
        const ext = extMatch && /^(jpg|jpeg|png|webp|gif)$/.test(extMatch) ? extMatch : (mime.includes("png") ? "png" : "jpg");
        const fileName = `banner_${Date.now()}.${ext}`;
        const uploadsDir = path.join(process.cwd(), "public", "uploads");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const filePath = path.join(uploadsDir, fileName);
        const buf = Buffer.from(fileObj.base64, "base64");
        fs.writeFileSync(filePath, buf);
        let fileUrl = `/uploads/${fileName}`;
        try {
          if (getGasUrls().length > 0) {
            const upstream = await fetchGasWithRetry(payload, 1);
            if (upstream.success && upstream.data?.fileUrl) {
              fileUrl = upstream.data.fileUrl;
            }
          }
        } catch {}
        return NextResponse.json({
          success: true,
          data: {
            fileId: `banner_${Date.now()}`,
            fileUrl,
            fileName: fileObj.name || fileObj.fileName || fileName,
          },
        });
      }

      if (action === "saveAdminSettings") {
        if (args.length >= 3 && args[2] && typeof args[2] === "object") {
          const payloadSettings = args[2];
          if (payloadSettings.settings && typeof payloadSettings.settings === "object") {
            const newSettings = payloadSettings.settings;
            try {
              const current = { ...getPersistedSettings(), ...newSettings };
              fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf-8");
              const standaloneDir = path.join(process.cwd(), ".next", "standalone");
              if (fs.existsSync(standaloneDir)) {
                try {
                  fs.writeFileSync(path.join(standaloneDir, "persisted_settings.json"), JSON.stringify(current, null, 2), "utf-8");
                } catch {}
              }
            } catch (err) {
              console.error("Failed to write persisted_settings.json", err);
            }
            if (DEFAULT_BOOTSTRAP.settings) {
              DEFAULT_BOOTSTRAP.settings = { ...DEFAULT_BOOTSTRAP.settings, ...payloadSettings.settings };
            }
          }
        }
        invalidateCache("saveAdminSettings");
        memoryCache.clear();
        staleCache.clear();
        try {
          if (getGasUrls().length > 0) {
            const gasRes = await fetchGasWithRetry(payload, 1);
            if (gasRes.success) return NextResponse.json(gasRes);
          }
        } catch (e) {
          console.log("Upstream saveAdminSettings skipped or failed, saved locally:", e);
        }
        return NextResponse.json({
          success: true,
          data: { savedLocally: true, message: "บันทึกการตั้งค่าเรียบร้อยแล้ว" },
        });
      }

      if (action === "adminAcceptWorkScores") {
        const workId = String(args[2] || "").trim();
        savePersistedWorkLock(workId, true);
        invalidateCache("adminGetWorkScoreSummary");
        invalidateCache("adminListWorks");
        memoryCache.clear();
        staleCache.clear();
        try {
          if (getGasUrls().length > 0) {
            const gasRes = await fetchGasWithRetry(payload, 1);
            if (gasRes.success) return NextResponse.json(gasRes);
          }
        } catch (e) {
          console.log("Upstream adminAcceptWorkScores error, using local fallback:", e);
        }
        return NextResponse.json({
          success: true,
          data: {
            workId,
            locked: true,
            round: 1,
            count: 3,
            savedLocally: true,
            message: "รับคะแนนและล็อกแบบประเมินรอบที่ 1 เรียบร้อยแล้ว",
          },
        });
      }

      if (action === "adminUnlockWorkScores") {
        const workId = String(args[2] || "").trim();
        savePersistedWorkLock(workId, false);
        invalidateCache("adminGetWorkScoreSummary");
        invalidateCache("adminListWorks");
        memoryCache.clear();
        staleCache.clear();
        try {
          if (getGasUrls().length > 0) {
            const gasRes = await fetchGasWithRetry(payload, 1);
            if (gasRes.success) return NextResponse.json(gasRes);
          }
        } catch (e) {
          console.log("Upstream adminUnlockWorkScores error, using local fallback:", e);
        }
        return NextResponse.json({
          success: true,
          data: {
            workId,
            locked: false,
            round: 1,
            count: 3,
            savedLocally: true,
            message: "ปลดล็อกแบบประเมินรอบที่ 1 เรียบร้อยแล้ว",
          },
        });
      }

      result = await fetchGasWithRetry(payload, isRead ? 2 : 1);
    }

    if (result.success) {
      if (action === "getPublicBootstrap" && result.data && typeof result.data === "object") {
        const persisted = getPersistedSettings();
        if (result.data.settings && typeof result.data.settings === "object") {
          result.data.settings = { ...result.data.settings, ...persisted };
        }
      }

      if (action === "getAdminSettings" && result.data && Array.isArray(result.data.settings)) {
        const persisted = getPersistedSettings();
        Object.keys(persisted).forEach((k) => {
          const item = result.data.settings.find((s: any) => s.SettingKey === k);
          if (item) item.SettingValue = persisted[k];
          else result.data.settings.push({ SettingKey: k, SettingValue: persisted[k] });
        });
      }

      if (action === "verifyWorkAccess" && result.data && typeof result.data === "object") {
        const persisted = getPersistedSettings();
        if (persisted.PRESENTATION_SUBMISSION_CLOSE_AT) {
          result.data.presentationDeadline = persisted.PRESENTATION_SUBMISSION_CLOSE_AT;
        } else if (!result.data.presentationDeadline) {
          result.data.presentationDeadline = "10/11/2569 23:59";
        }
      }

      if (action === "adminGetWorkScoreSummary" && result.data && typeof result.data === "object") {
        const locks = getPersistedWorkLocks();
        const workId = String(args[2] || "").trim();
        const lockInfo = locks[workId];
        if (lockInfo !== undefined) {
          const isLocked = lockInfo.lockedRound1;
          result.data.isRound1Locked = isLocked;
          if (Array.isArray(result.data.assignments)) {
            result.data.assignments.forEach((a: any) => {
              const isRound1 = (a.ReviewRoundID === 'RR-2026-000001') || (Number(a.RoundNo) === 1) || (!a.ReviewRoundID && !a.RoundNo) || !String(a.ReviewRoundID || '').includes('000002');
              if (isRound1) {
                a.Locked = isLocked;
                a.ScoreAcceptedByAdmin = isLocked;
                a.AdminLocked = isLocked;
                if (isLocked) a.AllowEditAfterSubmit = false;
              }
            });
          }
        }
      }
      setCache(action, args, result);
      invalidateCache(action);
    }

    if (action === "loginUser" && result.success && result.data && typeof result.data === "object") {
      const data = { ...result.data };
      const token = typeof data.token === "string" ? data.token : "";
      if (!token) {
        return errorResponse("Backend ไม่ได้คืน Session ที่ถูกต้อง", "INVALID_SESSION", 502, reqId);
      }
      if (data.reviewerBoot && typeof data.reviewerBoot === "object") {
        const confId = typeof data.conferenceId === "string" ? data.conferenceId : "CONF-TUH-QF-2569";
        const bootPayload = { success: true, data: data.reviewerBoot };
        setCache("reviewerBootstrap", [token, confId], bootPayload);
        setCache("reviewerBootstrap", ["__COOKIE__", confId], bootPayload);
        setCache("reviewerBootstrap", [token], bootPayload);
        setCache("reviewerBootstrap", ["__COOKIE__"], bootPayload);
      }
      if (data.user && data.conference && data.settings) {
        const confId = typeof data.conferenceId === "string" ? data.conferenceId : "CONF-TUH-QF-2569";
        const adminBootData = {
          user: data.user,
          role: data.role,
          conference: data.conference,
          settings: data.settings,
          workCategories: DEFAULT_BOOTSTRAP.workCategories,
          presentationTypes: DEFAULT_BOOTSTRAP.presentationTypes,
          optionConfig: data.optionConfig,
        };
        const bootPayload = { success: true, data: adminBootData };
        setCache("adminBootstrap", [token, confId], bootPayload);
        setCache("adminBootstrap", ["__COOKIE__", confId], bootPayload);
        setCache("adminBootstrap", [token], bootPayload);
        setCache("adminBootstrap", ["__COOKIE__"], bootPayload);
      }
      const response = NextResponse.json({ ...result, data });
      setSessionCookie(response, token);
      return response;
    }

    const headers: Record<string, string> = {};
    if (result.success && READ_ACTIONS.has(action)) {
      headers["Cache-Control"] = "private, max-age=15, stale-while-revalidate=60";
    }

    const response = NextResponse.json(result, {
      status: result.success ? 200 : 400,
      headers,
    });

    if (action === "logoutUser") {
      clearSessionCookie(response);
    }

    return response;
  } catch (err: any) {
    let msg = err instanceof Error ? err.message : String(err);
    if (/aborted|AbortError|timeout|ECONNRESET/i.test(msg)) {
      msg = "การเชื่อมต่อระบบส่วนกลางใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง";
    }

    if (staleCache.has(cacheKey)) {
      const fallback = staleCache.get(cacheKey);
      if (fallback.data && typeof fallback.data === "object") {
        const persisted = getPersistedSettings();
        if (fallback.data.settings && typeof fallback.data.settings === "object") {
          fallback.data.settings = { ...fallback.data.settings, ...persisted };
        }
      }
      return NextResponse.json(fallback, {
        status: 200,
        headers: { "X-Fallback": "true" },
      });
    }

    if (action === "getPublicBootstrap") {
      const persisted = getPersistedSettings();
      const fallback = JSON.parse(JSON.stringify(DEFAULT_BOOTSTRAP));
      if (persisted && Object.keys(persisted).length > 0) {
        fallback.settings = { ...(fallback.settings || {}), ...persisted };
      }
      return NextResponse.json(
        { success: true, data: fallback },
        { status: 200, headers: { "X-Fallback": "true" } }
      );
    }

    if (action === "getAdminSettings") {
      const persisted = getPersistedSettings();
      const settingsMap = { ...(DEFAULT_BOOTSTRAP.settings || {}), ...persisted };
      const settingsList = Object.entries(settingsMap).map(([k, v]) => ({
        SettingKey: k,
        SettingValue: v,
      }));
      return NextResponse.json(
        {
          success: true,
          data: {
            conference: DEFAULT_BOOTSTRAP.conference,
            settings: settingsList,
            settingsMap,
            optionConfig: {
              prefixes: ["นาย", "นาง", "นางสาว", "นพ.", "พญ.", "ทพ.", "ทพญ.", "ภก.", "ภญ."],
              positions: [],
              professions: ["แพทย์", "ทันตแพทย์", "เภสัชกร", "พยาบาล", "นักวิชาการ"],
              organizationGroups: [],
              organizations: [],
              foodTypes: ["ปกติ", "อิสลาม", "มังสวิรัติ", "แพ้อาหาร"],
            },
          },
        },
        { status: 200, headers: { "X-Fallback": "true" } }
      );
    }

    return errorResponse(
      `ไม่สามารถเชื่อมต่อระบบส่วนกลางได้ (${msg})`,
      "UPSTREAM_ERROR",
      502,
      reqId
    );
  }
}

staleCache.set('getPublicBootstrap:["CONF-TUH-QF-2569"]', DEFAULT_RESPONSE);
staleCache.set("getPublicBootstrap:[]", DEFAULT_RESPONSE);
staleCache.set('getPublicBootstrap:[""]', DEFAULT_RESPONSE);
memoryCache.set('getPublicBootstrap:["CONF-TUH-QF-2569"]', { data: DEFAULT_RESPONSE, expiresAt: Date.now() + 300_000 });
memoryCache.set("getPublicBootstrap:[]", { data: DEFAULT_RESPONSE, expiresAt: Date.now() + 300_000 });
