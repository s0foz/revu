"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildStoragePath,
  MAX_UPLOAD_BYTES,
  removeAssetObject,
  uploadAssetObject,
} from "@/lib/storage";
import {
  recordActivity,
  requireAssetWritableByStaff,
  requireClientReadable,
  requireDeliverableStatusWritable,
  requireDeliverableWritableByStaff,
  requireCommentWritable,
  requireProjectWritableByStaff,
  requireStaff,
} from "@/lib/authz";
import { insertComment, loadCommentViews } from "@/lib/comments";
import {
  cleanDateValue,
  cleanMultiline,
  cleanText,
  isDeliverableStatus,
  isProjectStatus,
} from "@/lib/form";
import { DELIVERABLE_STATUS_LABELS } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CommentView } from "@/lib/types";

export type ProjectFormState = {
  error?: string;
  success?: string;
};

export type CommentFormState = {
  error?: string;
  success?: string;
};

/** Everything a write to a project's board should refresh. */
function revalidateProject(projectId: string, clientId: string): void {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  revalidatePath(`/portal/projects/${projectId}`);
}

// --- projects ----------------------------------------------------------------

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const staff = await requireStaff();

  const clientId = String(formData.get("client_id") ?? "");
  const title = cleanText(formData.get("title"), 120);
  const status = String(formData.get("status") ?? "pending");
  const dueDate = cleanDateValue(formData.get("due_date"));
  const summary = cleanMultiline(formData.get("summary"), 400);

  if (!clientId) return { error: "Choose a client for this project." };
  if (!title) return { error: "Give the project a title." };
  if (!isProjectStatus(status)) return { error: "Choose a valid status." };

  // Throws NotFoundError when the client belongs to another agency.
  await requireClientReadable(staff, clientId);

  const { error } = await supabaseAdmin()
    .from("projects")
    .insert({
      agency_id: staff.agency.id,
      client_id: clientId,
      title,
      status,
      due_date: dueDate,
      summary,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[projects] insert failed", error.message);
    return { error: "Could not save the project. Please try again." };
  }

  await recordActivity({
    actor: staff,
    message: `Created project “${title}”`,
  });

  revalidatePath("/projects");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/dashboard");

  return { success: `“${title}” created.` };
}

export async function updateProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const staff = await requireStaff();

  const projectId = String(formData.get("id") ?? "");
  if (!projectId) return { error: "Missing project id." };

  const { project } = await requireProjectWritableByStaff(staff, projectId);

  const title = cleanText(formData.get("title"), 120);
  const status = String(formData.get("status") ?? "");
  const dueDate = cleanDateValue(formData.get("due_date"));
  const summary = cleanMultiline(formData.get("summary"), 400);

  if (!title) return { error: "Give the project a title." };
  if (!isProjectStatus(status)) return { error: "Choose a valid status." };

  const { error } = await supabaseAdmin()
    .from("projects")
    .update({ title, status, due_date: dueDate, summary })
    .eq("id", project.id)
    .eq("agency_id", staff.agency.id);

  if (error) {
    console.error("[projects] update failed", error.message);
    return { error: "Could not update the project. Please try again." };
  }

  if (project.status !== status) {
    await recordActivity({
      actor: staff,
      projectId: project.id,
      message: `Moved “${title}” to ${status}`,
    });
  } else {
    await recordActivity({
      actor: staff,
      projectId: project.id,
      message: `Updated project “${title}”`,
    });
  }

  revalidateProject(project.id, project.client_id);

  return { success: "Project saved." };
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();

  const projectId = String(formData.get("id") ?? "");
  if (!projectId) return;

  const { project } = await requireProjectWritableByStaff(staff, projectId);

  const { error } = await supabaseAdmin()
    .from("projects")
    .delete()
    .eq("id", project.id)
    .eq("agency_id", staff.agency.id);

  if (error) {
    console.error("[projects] delete failed", error.message);
    return;
  }

  await recordActivity({
    actor: staff,
    message: `Deleted project “${project.title}”`,
  });

  revalidatePath("/projects");
  revalidatePath(`/clients/${project.client_id}`);
  revalidatePath("/dashboard");
  redirect("/projects");
}

// --- deliverables ------------------------------------------------------------

async function nextSortOrder(projectId: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("deliverables")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[deliverables] sort order lookup failed", error.message);
    return 0;
  }

  return ((data?.sort_order as number | undefined) ?? -1) + 1;
}

export async function createDeliverableAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const staff = await requireStaff();

  const projectId = String(formData.get("project_id") ?? "");
  if (!projectId) return { error: "Missing project id." };

  const { project } = await requireProjectWritableByStaff(staff, projectId);

  const title = cleanText(formData.get("title"), 120);
  const brief = cleanMultiline(formData.get("brief"), 2000);

  if (!title) return { error: "Give the deliverable a title." };

  const { error } = await supabaseAdmin()
    .from("deliverables")
    .insert({
      project_id: project.id,
      title,
      brief,
      sort_order: await nextSortOrder(project.id),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[deliverables] insert failed", error.message);
    return { error: "Could not add the deliverable. Please try again." };
  }

  await recordActivity({
    actor: staff,
    projectId: project.id,
    message: `Added deliverable “${title}”`,
  });

  revalidateProject(project.id, project.client_id);

  return { success: `“${title}” added.` };
}

export async function updateDeliverableAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const staff = await requireStaff();

  const deliverableId = String(formData.get("id") ?? "");
  if (!deliverableId) return { error: "Missing deliverable id." };

  const { deliverable, project } = await requireDeliverableWritableByStaff(
    staff,
    deliverableId,
  );

  const title = cleanText(formData.get("title"), 120);
  const brief = cleanMultiline(formData.get("brief"), 2000);
  const sortOrderRaw = Number(formData.get("sort_order"));

  if (!title) return { error: "Give the deliverable a title." };

  const { error } = await supabaseAdmin()
    .from("deliverables")
    .update({
      title,
      brief,
      sort_order: Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0,
    })
    .eq("id", deliverable.id);

  if (error) {
    console.error("[deliverables] update failed", error.message);
    return { error: "Could not save the deliverable. Please try again." };
  }

  await recordActivity({
    actor: staff,
    projectId: project.id,
    message: `Edited deliverable “${title}”`,
  });

  revalidateProject(project.id, project.client_id);

  return { success: "Deliverable saved." };
}

/**
 * Approve / request changes. Both staff and clients may do this, so the guard is
 * requireDeliverableStatusWritable — the only thing either role may change about
 * a deliverable row.
 */
export async function setDeliverableStatusAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireStaff();

  const deliverableId = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!deliverableId || !isDeliverableStatus(status)) return;

  const { deliverable, project } = await requireDeliverableStatusWritable(
    staff,
    deliverableId,
  );

  const { error } = await supabaseAdmin()
    .from("deliverables")
    .update({ status })
    .eq("id", deliverable.id);

  if (error) {
    console.error("[deliverables] status update failed", error.message);
    return;
  }

  await recordActivity({
    actor: staff,
    projectId: project.id,
    message: `Marked “${deliverable.title}” as ${DELIVERABLE_STATUS_LABELS[status]}`,
  });

  revalidateProject(project.id, project.client_id);
}

export async function deleteDeliverableAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();

  const deliverableId = String(formData.get("id") ?? "");
  if (!deliverableId) return;

  const { deliverable, project } = await requireDeliverableWritableByStaff(
    staff,
    deliverableId,
  );

  const { error } = await supabaseAdmin()
    .from("deliverables")
    .delete()
    .eq("id", deliverable.id);

  if (error) {
    console.error("[deliverables] delete failed", error.message);
    return;
  }

  await recordActivity({
    actor: staff,
    projectId: project.id,
    message: `Deleted deliverable “${deliverable.title}”`,
  });

  revalidateProject(project.id, project.client_id);
}

// --- asset uploads -----------------------------------------------------------

function isUploadable(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value
  );
}

export async function uploadAssetAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const staff = await requireStaff();

  const deliverableId = String(formData.get("deliverable_id") ?? "");
  if (!deliverableId) return { error: "Missing deliverable id." };

  const { deliverable, project } = await requireDeliverableWritableByStaff(
    staff,
    deliverableId,
  );

  const file = formData.get("file");
  if (!isUploadable(file) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "That file is larger than 50 MB." };
  }

  const storagePath = buildStoragePath({
    agencyId: staff.agency.id,
    projectId: project.id,
    deliverableId: deliverable.id,
    fileName: file.name,
  });

  try {
    await uploadAssetObject(storagePath, file);
  } catch (error) {
    console.error("[assets] upload failed", error);
    return { error: "The upload failed. Please try again." };
  }

  const { error } = await supabaseAdmin().from("assets").insert({
    deliverable_id: deliverable.id,
    storage_path: storagePath,
    name: file.name.slice(0, 200),
    mime_type: file.type || null,
    size_bytes: file.size,
  });

  if (error) {
    console.error("[assets] insert failed", error.message);
    // The row is the source of truth, so don't leave the bytes behind.
    await removeAssetObject(storagePath);
    return { error: "Could not save the file. Please try again." };
  }

  await recordActivity({
    actor: staff,
    projectId: project.id,
    message: `Uploaded ${file.name} to “${deliverable.title}”`,
  });

  revalidateProject(project.id, project.client_id);

  return { success: `${file.name} uploaded.` };
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();

  const assetId = String(formData.get("id") ?? "");
  if (!assetId) return;

  const { asset, project } = await requireAssetWritableByStaff(staff, assetId);

  const { error } = await supabaseAdmin()
    .from("assets")
    .delete()
    .eq("id", asset.id);

  if (error) {
    console.error("[assets] delete failed", error.message);
    return;
  }

  await removeAssetObject(asset.storage_path);

  await recordActivity({
    actor: staff,
    projectId: project.id,
    message: `Removed file ${asset.name}`,
  });

  revalidateProject(project.id, project.client_id);
}

// --- comments ----------------------------------------------------------------

export async function addCommentAction(
  _prev: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const staff = await requireStaff();

  const deliverableId = String(formData.get("deliverable_id") ?? "");
  const body = cleanMultiline(formData.get("body"), 4000);

  if (!deliverableId) return { error: "Missing deliverable id." };
  if (!body) return { error: "Write something first." };

  const { deliverable, project } = await requireCommentWritable(
    staff,
    deliverableId,
  );

  try {
    await insertComment({
      actor: staff,
      deliverableId: deliverable.id,
      projectId: project.id,
      deliverableTitle: deliverable.title,
      body,
    });
  } catch (error) {
    console.error("[comments] insert failed", error);
    return { error: "Could not post the comment. Please try again." };
  }

  revalidateProject(project.id, project.client_id);

  return { success: "Comment posted." };
}

/**
 * Used by the comment thread to re-read a deliverable's comments. Realtime can
 * be unavailable for a client session (see AGENTS.md), in which case the thread
 * polls this instead.
 */
export async function refreshCommentsAction(
  deliverableId: string,
): Promise<CommentView[]> {
  const staff = await requireStaff();
  await requireCommentWritable(staff, deliverableId);
  return loadCommentViews(deliverableId);
}
