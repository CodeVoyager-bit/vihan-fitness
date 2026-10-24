import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { setting } from "./db";

/** Public origin for links printed on posters. APP_URL wins; otherwise the request's own host. */
export async function origin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

export async function checkinUrl() {
  return `${await origin()}/checkin?k=${encodeURIComponent((await setting("checkin_key")) ?? "")}`;
}

export const registerUrl = async () => `${await origin()}/register`;

export const qrSvg = (text: string) => QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#121210", light: "#ffffff" } });
