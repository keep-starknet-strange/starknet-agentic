import crypto from "node:crypto";

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 \-:]/g, "")
    .trim();
}

export function canonicalEventKey(input: {
  title: string;
  endTimeMs?: number;
  outcomes: string[];
}): string {
  const payload = {
    title: normalizeTitle(input.title),
    endTimeMs: input.endTimeMs ?? null,
    outcomes: [...input.outcomes].map((o) => o.toLowerCase().trim()).sort(),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
