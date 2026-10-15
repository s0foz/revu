"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Notice, Textarea, formatRelative } from "@/components/ui";
import { liveStatusLabel, useLiveChanges } from "@/components/use-live-changes";
import type { CommentView } from "@/lib/types";

export type CommentFormState = {
  error?: string;
  success?: string;
};

/**
 * The comment thread for one deliverable, shared by the agency board and the
 * client portal.
 *
 * New comments arrive without a page refresh: the thread subscribes to
 * `postgres_changes` on `comments` (filtered to this deliverable) and re-reads
 * the thread through a server action, so author names are resolved server-side.
 * If Realtime is unavailable the hook polls instead — see
 * src/components/use-live-changes.ts.
 *
 * The server action is passed in as a prop so staff and client each use their own
 * guard (requireStaff / requireClient) from src/lib/authz.ts.
 */
export function CommentThread({
  deliverableId,
  initialComments,
  currentUserId,
  addAction,
  refreshAction,
}: {
  deliverableId: string;
  initialComments: CommentView[];
  currentUserId: string;
  addAction: (state: CommentFormState, formData: FormData) => Promise<CommentFormState>;
  refreshAction: (deliverableId: string) => Promise<CommentView[]>;
}) {
  const [extra, setExtra] = useState<CommentView[]>([]);
  const [body, setBody] = useState("");
  const [state, formAction] = useActionState(addAction, {});

  // Everything the server handed us at render time, deduped below. `extra` is
  // simply the latest full list from the server, so a comment that later shows
  // up in `initialComments` is not rendered twice.
  const sync = useCallback(async () => {
    try {
      setExtra(await refreshAction(deliverableId));
    } catch (error) {
      console.warn("[comments] could not refresh the thread", error);
    }
  }, [deliverableId, refreshAction]);

  const live = useLiveChanges({
    channelName: `comments-${deliverableId}`,
    table: "comments",
    event: "INSERT",
    filter: `deliverable_id=eq.${deliverableId}`,
    onEvent: () => {
      void sync();
    },
    pollIntervalMs: 6000,
  });

  const comments = useMemo(() => {
    const merged = [...initialComments];
    const known = new Set(initialComments.map((comment) => comment.id));

    for (const comment of extra) {
      if (!known.has(comment.id)) merged.push(comment);
    }

    return merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [initialComments, extra]);

  // The action revalidates the page, which re-renders this component with fresh
  // server data. Also clear the box and pull anything the action's own write
  // didn't already include.
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!state.success || state.success === handled.current) return;
    handled.current = state.success;
    setBody("");
    void sync();
  }, [state.success, sync]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Comments {comments.length > 0 ? `(${comments.length})` : ""}
        </h3>
        <span
          className="flex items-center gap-1.5 text-xs text-slate-400"
          title="New comments appear here without a refresh."
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              live === "realtime"
                ? "bg-emerald-500"
                : live === "polling"
                  ? "bg-amber-400"
                  : "bg-slate-300"
            }`}
          />
          {liveStatusLabel(live)}
        </span>
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-slate-500">
          No comments yet. Leave the first note for whoever picks this up next.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => {
            const mine = comment.author_clerk_user_id === currentUserId;

            return (
              <li key={comment.id} className="flex gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    comment.author_role === "agency"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {comment.author_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {comment.author_name}
                      {mine ? " (you)" : ""}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      {comment.author_role === "agency" ? "Agency" : "Client"}
                    </span>
                    <span>{formatRelative(comment.created_at)}</span>
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">
                    {comment.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="deliverable_id" value={deliverableId} />
        <Textarea
          name="body"
          rows={2}
          maxLength={4000}
          required
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a comment…"
          aria-label="Comment"
        />
        {state.error ? <Notice>{state.error}</Notice> : null}
        <div className="flex justify-end">
          <SubmitButton variant="secondary" pendingLabel="Posting…">
            Comment
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
