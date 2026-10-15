/**
 * Slugs must satisfy the `agencies_slug_format` CHECK constraint:
 *   ^[a-z0-9]+(?:-[a-z0-9]+)*$
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "agency";
}

/** Appends -2, -3, ... until `isTaken` reports the slug is free. */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const slug = slugify(base);
  if (!(await isTaken(slug))) return slug;

  for (let suffix = 2; suffix < 200; suffix += 1) {
    const candidate = `${slug}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  return `${slug}-${Date.now()}`;
}
