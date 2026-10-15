import {
  AuthzError,
  getActorState,
  requireAssetReadable,
} from "@/lib/authz";
import { createAssetSignedUrl, SIGNED_URL_TTL_SECONDS } from "@/lib/storage";

/**
 * GET /api/assets/:id/download
 *
 * The `assets` bucket is private, so there is no public URL to link to. This is
 * the only way a file leaves Revu:
 *
 *   1. resolve the actor (staff of the agency, or the client that owns the
 *      project the file hangs off) — requireAssetReadable throws otherwise;
 *   2. sign a five-minute URL and redirect to it, as an attachment.
 *
 * Signed URLs are per-request and never cached, which is why this is a route
 * handler rather than a link rendered into a page that may be prerendered.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const state = await getActorState();

  // A signed-out visitor learns nothing: not found, same as a bad id.
  if (state.status !== "actor") {
    return notFound();
  }

  const { id } = await params;

  try {
    const { asset } = await requireAssetReadable(state.actor, id);
    const signedUrl = await createAssetSignedUrl(asset.storage_path, {
      download: asset.name,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: signedUrl,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      return notFound();
    }

    console.error("[assets] download failed", error);
    return new Response("Could not prepare that download.", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

function notFound(): Response {
  return new Response("Not found.", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
