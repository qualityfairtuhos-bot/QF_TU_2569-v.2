function parseEnvNumber(val: string | undefined, defaultVal: number): number {
  if (!val || typeof val !== "string" || val.trim() === "") return defaultVal;
  const num = Number(val);
  return isNaN(num) || num <= 0 ? defaultVal : num;
}

export const DEFAULT_CONFERENCE_ID = process.env.NEXT_PUBLIC_DEFAULT_CONFERENCE_ID ?? "CONF-TUH-QF-2569";
export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "tuh_session";
export const MAX_REQUEST_BYTES = parseEnvNumber(process.env.GAS_MAX_REQUEST_BYTES, 10_000_000);
export const GAS_TIMEOUT_MS = parseEnvNumber(process.env.GAS_REQUEST_TIMEOUT_MS, 180_000);
