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

async function cloudinary(op: "upload" | "destroy", params: Record<string, string>, file?: Blob) {
  if (!process.env.CLOUDINARY_URL) throw new AppError("photosOff");
  const u = new URL(process.env.CLOUDINARY_URL);
  const signed = { ...params, timestamp: Math.floor(Date.now() / 1000) };
  const fd = new FormData();
  for (const [k, v] of Object.entries(signed)) fd.set(k, String(v));
  fd.set("api_key", decodeURIComponent(u.username));
  fd.set("signature", cloudinarySignature(signed, decodeURIComponent(u.password)));
  if (file) fd.set("file", file);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${u.hostname}/image/${op}`, { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Cloudinary ${op} failed`, res.status, json);
    throw new AppError("photoFailed");
  }
  return json as { secure_url?: string };
}

const publicId = (name: string) => `vihan/${appMode()}/${name}`; // demo uploads never overwrite live ones

/** Uploads `file` as the photo, or deletes the photo when `file` is null. Returns the new URL or null. */
async function replace(name: string, file: FormDataEntryValue | null): Promise<string | null> {
  if (!file) {
    await cloudinary("destroy", { public_id: publicId(name), invalidate: "true" });
    return null;
  }
  // The browser shrinks photos to a ~1600px JPEG first; the cap is for anything that skipped that.
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || !file.size || file.size > MAX_PHOTO_BYTES)
    throw new AppError("photoInvalid");
  const r = await cloudinary("upload", { public_id: publicId(name), overwrite: "true" }, file);
  if (!r.secure_url) throw new AppError("photoFailed");
  return r.secure_url;
}

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
