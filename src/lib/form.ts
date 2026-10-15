import {
  DELIVERABLE_STATUSES,
  PROJECT_STATUSES,
  type DeliverableStatus,
  type ProjectStatus,
} from "@/lib/constants";

/**
 * Small form helpers shared by the server actions. Values coming out of a
 * `<form>` are always strings (or null), so these normalise them into what the
 * schema accepts — never trust the shape of a FormData entry.
 */

/** Trimmed single-line text, or null when empty. */
export function cleanText(raw: FormDataEntryValue | null, max = 200): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.slice(0, max);
}

/** Trimmed multi-line text (comment bodies, briefs), or null when empty. */
export function cleanMultiline(
  raw: FormDataEntryValue | null,
  max = 4000,
): string | null {
  const value = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!value) return null;
  return value.slice(0, max);
}

/**
 * A `YYYY-MM-DD` date input, validated as a real calendar date. An empty or
 * invalid entry becomes null, which is how "no due date" is stored.
 */
export function cleanDateValue(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;

  return value;
}

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function isDeliverableStatus(value: string): value is DeliverableStatus {
  return (DELIVERABLE_STATUSES as readonly string[]).includes(value);
}
