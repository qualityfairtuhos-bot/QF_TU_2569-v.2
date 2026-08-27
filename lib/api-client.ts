import type {ApiResponse} from "./types";
export async function rpc<T>(action:string,args:unknown[]=[]):Promise<T>{
  const response=await fetch("/api/gas",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({action,args,requestId:crypto.randomUUID(),timestamp:Date.now()})});
  let result: ApiResponse<T>;
  try {
    const text = await response.text();
    result = JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new Error("การตอบกลับจากระบบไม่ถูกต้อง (Invalid JSON)");
  }
  if(!response.ok||!result.success)throw new Error(result.message||"เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
  return result.data as T;
}

