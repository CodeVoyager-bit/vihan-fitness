import crypto from "node:crypto";
import { AppError, appMode, audit, db, setSetting } from "./db";
import { MAX_PHOTO_BYTES } from "./format";

// Photos live on Cloudinary; the database keeps only their URLs. Each photo has a fixed public id,
// so replacing one overwrites the old file instead of piling up copies.
// CLOUDINARY_URL is on the Cloudinary dashboard: cloudinary://<api_key>:<api_secret>@<cloud_name>

export const photosEnabled = () => !!process.env.CLOUDINARY_URL;

export const PHOTO_SLOTS = ["logo", "trainer", "g1", "g2", "g3", "g4"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

// Read them with getSite(lang).photos (src/lib/site.ts).

/** Cloudinary's request signature: params sorted and joined as k=v&k=v, then the API secret, SHA-1. */
export function cloudinarySignature(params: Record<string, string | number>, secret: string) {
  const s = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHash("sha1").update(s + secret).digest("hex");
}

/** Key, secret and cloud name from CLOUDINARY_URL, exactly as typed (a URL parser would lowercase the cloud name). */
function credentials() {
  const m = process.env.CLOUDINARY_URL?.trim().match(/^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([\w-]+)\/?$/);
  return m ? { key: decodeURIComponent(m[1]), secret: decodeURIComponent(m[2]), cloud: m[3] } : null;
}

async function cloudinary(op: "upload" | "destroy", params: Record<string, string>, file?: Blob) {
  if (!process.env.CLOUDINARY_URL) throw new AppError("photosOff");
  const c = credentials();
  if (!c) {
    console.error("CLOUDINARY_URL is not in the form cloudinary://<api_key>:<api_secret>@<cloud_name>");
    throw new AppError("photoFailed");
  }
  const signed = { ...params, timestamp: Math.floor(Date.now() / 1000) };
  const fd = new FormData();
  for (const [k, v] of Object.entries(signed)) fd.set(k, String(v));
  fd.set("api_key", c.key);
  fd.set("signature", cloudinarySignature(signed, c.secret));
  if (file) fd.set("file", file);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/image/${op}`, { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Cloudinary ${op} failed`, res.status, json);
    throw new AppError("photoFailed");
  }
  return json as { secure_url?: string };
}

export type CloudinaryStatus = "ok" | "format" | "placeholder" | "credentials" | "unreachable" | "other";

/**
 * Whether uploads can work, in words the admin can act on: asks Cloudinary to accept the credentials
 * (its ping needs them). Cloudinary answers "api_secret mismatch" for a wrong key, secret or cloud name alike.
 */
export async function cloudinaryStatus(): Promise<CloudinaryStatus> {
  const c = credentials();
  if (!c) return "format";
  if (/[<>*]|api_secret|api_key|cloud_name/i.test(`${c.key} ${c.secret} ${c.cloud}`)) return "placeholder"; // copied before revealing the secret
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/ping`, {
      headers: { Authorization: `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString("base64")}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (res.ok) return "ok";
    if (res.status === 401) return "credentials";
    console.error("Cloudinary ping failed", res.status, await res.text().catch(() => ""));
    return "other";
  } catch {
    return "unreachable";
  }
}

const publicId = (name: string) => `vihan/${appMode()}/${name}`; // demo uploads never overwrite live ones

// The browser shrinks photos to a ~1600px JPEG first; the cap is for anything that skipped that.
function checkImage(file: FormDataEntryValue | null): asserts file is File {
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || !file.size || file.size > MAX_PHOTO_BYTES)
    throw new AppError("photoInvalid");
}

/** Uploads `file` as the photo, or deletes the photo when `file` is null. Returns the new URL or null. */
async function replace(name: string, file: FormDataEntryValue | null): Promise<string | null> {
  if (!file) {
    await cloudinary("destroy", { public_id: publicId(name), invalidate: "true" });
    return null;
  }
  checkImage(file);
  const r = await cloudinary("upload", { public_id: publicId(name), overwrite: "true" }, file);
  if (!r.secure_url) throw new AppError("photoFailed");
  return r.secure_url;
}

/**
 * A UPI payment screenshot for a claim. The name is random, so the link can't be guessed from a
 * member or claim number; only the admin's claim screens show it.
 */
export async function uploadClaimProof(memberId: number, file: FormDataEntryValue | null): Promise<{ url: string; name: string }> {
  checkImage(file);
  const name = `claims/m${memberId}-${crypto.randomBytes(12).toString("hex")}`;
  const r = await cloudinary("upload", { public_id: publicId(name) }, file);
  if (!r.secure_url) throw new AppError("photoFailed");
  return { url: r.secure_url, name };
}

/** Best-effort removal of an upload whose claim never got saved. */
export const removeClaimProof = (name: string) => cloudinary("destroy", { public_id: publicId(name), invalidate: "true" }).catch(() => {});

export async function setMemberPhoto(memberId: number, file: FormDataEntryValue | null, actorId: number) {
  const d = await db();
  if (!(await d.users.findOne({ uid: memberId, role: "member" }, { projection: { _id: 1 } }))) throw new AppError("memberNotFound");
  const url = await replace(`member-${memberId}`, file);
  await d.users.updateOne({ uid: memberId }, { $set: { photo: url } });
  await audit(actorId, "member.photo", { memberId });
}

export async function setSitePhoto(slot: string, file: FormDataEntryValue | null, actorId: number) {
  if (!PHOTO_SLOTS.includes(slot as PhotoSlot)) throw new AppError("invalidInput");
  await setSetting(`photo_${slot}`, (await replace(`site-${slot}`, file)) ?? "");
  await audit(actorId, "settings.updated", { detail: `public photo ${slot}` });
}
