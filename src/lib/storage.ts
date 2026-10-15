import "server-only";

import { ASSETS_BUCKET } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Object storage for deliverable files.
 *
 * The `assets` bucket is PRIVATE (see
 * supabase/migrations/20260201000000_phase2_assets.sql). Nothing in it is
 * publicly readable: a caller is authorised by src/lib/authz.ts first, and only
 * then does the app ask for a short-lived signed URL.
 *
 * Object keys follow one fixed layout, because the storage RLS policies parse
 * them to work out which agency and deliverable an object belongs to:
 *
 *   <agency_id>/<project_id>/<deliverable_id>/<random>-<filename>
 *
 * Every write here uses the service role, which bypasses RLS.
 */

/** Matches the bucket's file_size_limit in the migration. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** How long a signed download link stays valid. */
export const SIGNED_URL_TTL_SECONDS = 300;

export type StoragePathParts = {
  agencyId: string;
  projectId: string;
  deliverableId: string;
  fileName: string;
};

/** Strips directories and anything awkward from an uploaded file name. */
export function sanitizeFileName(rawName: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 120);

  return cleaned || "file";
}

/** Builds the canonical object key for a new upload. */
export function buildStoragePath({
  agencyId,
  projectId,
  deliverableId,
  fileName,
}: StoragePathParts): string {
  return [
    agencyId,
    projectId,
    deliverableId,
    `${crypto.randomUUID()}-${sanitizeFileName(fileName)}`,
  ].join("/");
}

/** Uploads bytes to the private bucket. Throws with a readable message. */
export async function uploadAssetObject(
  path: string,
  file: File,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .storage.from(ASSETS_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload ${path}: ${error.message}`);
  }
}

/**
 * A short-lived signed URL. `download` sets Content-Disposition: attachment so
 * the browser saves the file under its original name instead of rendering it.
 */
export async function createAssetSignedUrl(
  path: string,
  options: { download?: string; expiresIn?: number } = {},
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(ASSETS_BUCKET)
    .createSignedUrl(
      path,
      options.expiresIn ?? SIGNED_URL_TTL_SECONDS,
      options.download ? { download: options.download } : undefined,
    );

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to sign ${path}: ${error?.message ?? "no signed URL returned"}`,
    );
  }

  return data.signedUrl;
}

/**
 * Removes an object. Deliberately non-throwing: the database row is the source
 * of truth, so a failed cleanup must not roll back the user's delete.
 */
export async function removeAssetObject(path: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .storage.from(ASSETS_BUCKET)
    .remove([path]);

  if (error) {
    console.error("[storage] failed to remove object", path, error.message);
  }
}
