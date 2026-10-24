/** Normalises Indian mobile numbers to +91XXXXXXXXXX, or returns null if it isn't one. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** "+919876543210" → "+91 98765 43210" */
export const formatPhone = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 8)} ${p.slice(8)}`;

/** WhatsApp click-to-chat wants the number without "+". */
export const waNumber = (p: string) => p.replace(/^\+/, "");
