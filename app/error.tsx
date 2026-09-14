"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 600, margin: "40px auto", textAlign: "center" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#1e293b", marginBottom: 12 }}>
        เกิดข้อผิดพลาดในการโหลดระบบ
      </h2>
      <p style={{ color: "#64748b", fontSize: "0.95rem", marginBottom: 20 }}>
        {error?.message || "ไม่สามารถแสดงผลหน้านี้ได้ กรุณาลองใหม่อีกครั้ง"}
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: "10px 20px",
          borderRadius: 6,
          background: "#006D70",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        ลองใหม่อีกครั้ง
      </button>
    </div>
  );
}
