"use client";

import { useSearchParams } from "next/navigation";

type PortalName = "index" | "admin" | "reviewer" | "scanner";

export function LegacyPortal({ portal }: { portal: PortalName }) {
  const query = useSearchParams().toString();
  const version = "20260828-email";
  const fullQuery = query ? `${query}&v=${version}` : `v=${version}`;
  const src = `/legacy/${portal}.html?${fullQuery}`;
  return <iframe src={src} title={`${portal} portal`} allow="camera" style={{width:"100%",height:"100dvh",border:0,display:"block"}} />;
}
