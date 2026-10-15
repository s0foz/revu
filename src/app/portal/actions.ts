"use server";

import { revalidatePath } from "next/cache";

import {
  recordActivity,
  requireClient,
  requireCommentWritable,
  requireDeliverableStatusWritable,
} from "@/lib/authz";
import { insertComment, loadCommentViews } from "@/lib/comments";
import { DELIVERABLE_STATUS_LABELS } from "@/lib/constants";
import { cleanMultiline, isDeliverableStatus } from "@/lib/form";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CommentView } from "@/lib/types";

/**
 * Everything a client is allowed to write, and nothing else:
 *
 *   - a deliverable's status (approve / request changes), and
 *   - comments on a deliverable they can read.
 *
 * Both guards are the shared assertions in src/lib/authz.ts, which is what
 * decides whether this client owns the project in the first place.
 */

export type PortalCommentFormState = {
  error?: string;
  success?: string;
};

function revalidatePortal(projectId: string): void {
  revalidatePath("/portal");
  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function setDeliverableStatusAction(
  formData: FormData,
): Promise<void> {
  const client = await requireClient();

  const deliverableId = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!deliverableId || !isDeliverableStatus(status)) return;

  const { deliverable, project } = await requireDeliverableStatusWritable(
    client,
    deliverableId,
  );

  const { error } = await supabaseAdmin()
    .from("deliverables")
    .update({ status })
    .eq("id", deliverable.id);

  if (error) {
    console.error("[portal] status update failed", error.message);
    return;
  }

  const who = client.client.contact_name || client.client.name;

  await recordActivity({
    actor: client,
    projectId: project.id,
    message: `${who} marked “${deliverable.title}” as ${DELIVERABLE_STATUS_LABELS[status]}`,
  });

  revalidatePortal(project.id);
}

export async function addCommentAction(
  _prev: PortalCommentFormState,
  formData: FormData,
): Promise<PortalCommentFormState> {
  const client = await requireClient();

  const deliverableId = String(formData.get("deliverable_id") ?? "");
  const body = cleanMultiline(formData.get("body"), 4000);

  if (!deliverableId) return { error: "Missing deliverable id." };
  if (!body) return { error: "Write something first." };

  const { deliverable, project } = await requireCommentWritable(
    client,
    deliverableId,
  );

  try {
    await insertComment({
      actor: client,
      deliverableId: deliverable.id,
      projectId: project.id,
      deliverableTitle: deliverable.title,
      body,
    });
  } catch (error) {
    console.error("[portal] comment failed", error);
    return { error: "Could not post the comment. Please try again." };
  }

  revalidatePortal(project.id);

  return { success: "Comment posted." };
}

/**
 * Re-reads a deliverable's thread. The portal's comment box polls this when
 * Supabase Realtime is unavailable for the session (see AGENTS.md).
 */
export async function refreshCommentsAction(
  deliverableId: string,
): Promise<CommentView[]> {
  const client = await requireClient();
  await requireCommentWritable(client, deliverableId);
  return loadCommentViews(deliverableId);
}
