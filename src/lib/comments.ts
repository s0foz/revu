import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { COMMENT_AUTHOR_ROLES, type CommentAuthorRole } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordActivity, type Actor } from "@/lib/authz";
import type { Comment, CommentView } from "@/lib/types";

/**
 * Comments are stored with the author's Clerk user id and nothing else. Both the
 * agency board and the client portal render a thread, so the hydration lives
 * here: one query for the comments, one for the `clients` rows, one Clerk call
 * for everybody else.
 *
 * Callers must authorise the deliverable first (requireCommentWritable in
 * src/lib/authz.ts) — these helpers do no access control of their own.
 */

export function isCommentAuthorRole(value: string): value is CommentAuthorRole {
  return (COMMENT_AUTHOR_ROLES as readonly string[]).includes(value);
}

/** The role a comment is stamped with, derived from the actor — never a form field. */
export function authorRoleFor(actor: Actor): CommentAuthorRole {
  return actor.kind === "staff" ? "agency" : "client";
}

async function resolveAuthorNames(
  userIds: string[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return names;

  // A client's display name is already in our own table.
  const { data: clients, error } = await supabaseAdmin()
    .from("clients")
    .select("clerk_user_id, name, contact_name")
    .in("clerk_user_id", unique);

  if (error) {
    console.error("[comments] failed to resolve client names", error.message);
  }

  for (const client of clients ?? []) {
    if (!client.clerk_user_id) continue;
    names[client.clerk_user_id] = client.contact_name || client.name;
  }

  const remaining = unique.filter((id) => !names[id]);
  if (remaining.length === 0) return names;

  try {
    const clerk = await clerkClient();
    const { data: users } = await clerk.users.getUserList({
      userId: remaining,
      limit: 100,
    });

    for (const user of users) {
      const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
      names[user.id] = full || user.username || "Agency team";
    }
  } catch (error) {
    // Naming a commenter is cosmetic; never fail a page over it.
    console.error("[comments] failed to resolve Clerk user names", error);
  }

  for (const id of remaining) {
    if (!names[id]) names[id] = "Agency team";
  }

  return names;
}

/** Every comment on a deliverable, oldest first, with names resolved. */
export async function loadCommentViews(
  deliverableId: string,
): Promise<CommentView[]> {
  const { data, error } = await supabaseAdmin()
    .from("comments")
    .select("*")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to load comments for ${deliverableId}: ${error.message}`,
    );
  }

  const comments = (data ?? []) as Comment[];
  const names = await resolveAuthorNames(
    comments.map((comment) => comment.author_clerk_user_id),
  );

  return comments.map((comment) => ({
    ...comment,
    author_name: names[comment.author_clerk_user_id] ?? "Agency team",
  }));
}

/** Comment counts for a set of deliverables, keyed by deliverable id. */
export async function countCommentsByDeliverable(
  deliverableIds: string[],
): Promise<Record<string, number>> {
  if (deliverableIds.length === 0) return {};

  const { data, error } = await supabaseAdmin()
    .from("comments")
    .select("deliverable_id")
    .in("deliverable_id", deliverableIds);

  if (error) {
    throw new Error(`Failed to count comments: ${error.message}`);
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.deliverable_id] = (counts[row.deliverable_id] ?? 0) + 1;
  }

  return counts;
}

/**
 * Inserts a comment as the given actor and records it in the activity feed.
 * The caller has already passed requireCommentWritable().
 */
export async function insertComment(input: {
  actor: Actor;
  deliverableId: string;
  projectId: string;
  deliverableTitle: string;
  body: string;
}): Promise<Comment> {
  const { data, error } = await supabaseAdmin()
    .from("comments")
    .insert({
      deliverable_id: input.deliverableId,
      body: input.body,
      author_clerk_user_id: input.actor.userId,
      author_role: authorRoleFor(input.actor),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save comment: ${error.message}`);
  }

  await recordActivity({
    actor: input.actor,
    projectId: input.projectId,
    message: `${input.actor.kind === "staff" ? "Agency" : "Client"} commented on “${input.deliverableTitle}”`,
  });

  return data as Comment;
}
