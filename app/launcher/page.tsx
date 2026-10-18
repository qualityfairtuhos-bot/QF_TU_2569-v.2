import Link from "next/link";

export default function LauncherPage() {
  const cid = "CONF-TUH-QF-2569";
  return (
    <div className="min-h-screen grid place-items-center bg-[#eef4f5] p-5 font-sans">
      <main className="w-full max-w-[680px] bg-white rounded-3xl p-7 shadow-2xl text-center">
        <div className="flex justify-center items-center gap-5 mb-4">
          <img src="/images/tuh-logo.png" alt="TUH" className="h-[75px] max-w-[180px] object-contain" />
          <img src="/images/hacc-logo.png" alt="HACC" className="h-[75px] max-w-[180px] object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-[#102a43] mb-2">TUH 19 &amp; HA-Regional 1</h1>
        <p className="text-sm text-gray-600 mb-6">เลือกหน้าที่ต้องการเปิด ระบบจะเปิด Web App โดยตรงและไม่ขึ้นกับบัญชี Google ที่กำลังใช้อยู่</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href={`/?conferenceId=${encodeURIComponent(cid)}`} className="block py-3 px-4 rounded-xl bg-[#006d70] text-white font-semibold hover:opacity-90 transition">
            หน้าผู้ลงทะเบียน
          </Link>
          <Link href={`/admin?conferenceId=${encodeURIComponent(cid)}`} className="block py-3 px-4 rounded-xl bg-[#0c385b] text-white font-semibold hover:opacity-90 transition">
            หน้าเจ้าหน้าที่
          </Link>
          <Link href={`/reviewer?conferenceId=${encodeURIComponent(cid)}`} className="block py-3 px-4 rounded-xl bg-[#c8b278] text-[#152c3a] font-semibold hover:opacity-90 transition">
            Reviewer Portal
          </Link>
          <Link href={`/scanner?conferenceId=${encodeURIComponent(cid)}`} className="block py-3 px-4 rounded-xl bg-[#0c385b] text-white font-semibold hover:opacity-90 transition">
            Check-in / Scanner
          </Link>
        </div>
        <div className="mt-5 p-3 rounded-xl bg-[#fff8dc] border border-[#e0c66b] text-xs text-[#8c6d1f] text-left">
          <b>สำหรับ Google Sites:</b> ให้นำ URL ของหน้านี้ไปทำเป็นปุ่มหรือ Embed by URL ห้ามใช้ลิงก์ Google Drive, Apps Script Editor หรือ URL ที่ลงท้าย /dev
        </div>
      </main>
    </div>
  );
}
