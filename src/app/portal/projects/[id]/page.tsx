import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CommentThread } from "@/components/comment-thread";
import { LiveStatusSync } from "@/components/live-status-sync";
import { DeliverableStatusBadge, ProjectStatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, formatDate } from "@/components/ui";
import {
  AuthzError,
  getActorState,
  requireClient,
  requireProjectReadable,
} from "@/lib/authz";
import { loadCommentViews } from "@/lib/comments";
import { DELIVERABLE_STATUSES } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Asset, CommentView, Deliverable } from "@/lib/types";
import { PortalShell } from "../../portal-shell";
import { addCommentAction, refreshCommentsAction, setDeliverableStatusAction } from "../../actions";

export const metadata = { title: "Review" };

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const state = await getActorState();

  if (state.status === "signed-out") {
    redirect("/sign-in");
  }

  // A client without a row has no projects to open.
  if (state.status === "no-actor") {
    redirect("/portal");
  }

  const actor = await requireClient();
  const { id } = await params;

  // Someone else's project is indistinguishable from a missing one.
  const project = await requireProjectReadable(actor, id).catch((error: unknown) => {
    if (error instanceof AuthzError) notFound();
    throw error;
  });

  const { data, error } = await supabaseAdmin()
    .from("deliverables")
    .select("*, assets(*)")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load the deliverables: ${error.message}`);
  }

  const deliverables = (data ?? []) as (Deliverable & { assets: Asset[] })[];

  const commentEntries = await Promise.all(
    deliverables.map(
      async (deliverable) =>
        [deliverable.id, await loadCommentViews(deliverable.id)] as const,
    ),
  );
  const comments = new Map<string, CommentView[]>(commentEntries);

  const approved = deliverables.filter(
    (deliverable) => deliverable.status === "approved",
  ).length;
  const outstanding = deliverables.filter(
    (deliverable) => deliverable.status !== "approved",
  ).length;

  return (
    <PortalShell agency={actor.agency} client={actor.client}>
      <div className="flex flex-col gap-8">
        <div>
          <Link href="/portal" className="text-xs text-slate-500 hover:underline">
            ← All projects
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
            <ProjectStatusBadge status={project.status} />
            <LiveStatusSync projectId={project.id} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Due {formatDate(project.due_date)} · {approved} of {deliverables.length}{" "}
            approved
            {outstanding > 0
              ? ` · ${outstanding} still to review`
              : deliverables.length > 0
                ? " · all caught up"
                : ""}
          </p>
          {project.summary ? (
            <p className="mt-2 max-w-2xl text-sm text-slate-600">{project.summary}</p>
          ) : null}
        </div>

        {deliverables.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing to review yet"
              description={`${actor.agency.name} will add deliverables to this project as they are ready.`}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {deliverables.map((deliverable) => (
              <div key={deliverable.id} id={`deliverable-${deliverable.id}`}>
                <Card className="flex flex-col gap-5 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-medium text-slate-900">
                        {deliverable.title}
                      </h2>
                      {deliverable.brief ? (
                        <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">
                          {deliverable.brief}
                        </p>
                      ) : null}
                    </div>
                    <DeliverableStatusBadge status={deliverable.status} />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Files
                    </h3>
                    {deliverable.assets.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        No files attached yet.
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-2">
                        {deliverable.assets.map((asset) => (
                          <li
                            key={asset.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <a
                              href={`/api/assets/${asset.id}/download`}
                              className="min-w-0 truncate font-medium text-slate-900 underline decoration-slate-300 hover:decoration-slate-500"
                            >
                              {asset.name}
                            </a>
                            <span className="shrink-0 text-xs text-slate-400">
                              {formatBytes(asset.size_bytes)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                    <span className="text-sm text-slate-600">
                      {deliverable.status === "approved"
                        ? "You approved this."
                        : deliverable.status === "changes_requested"
                          ? "You asked for changes."
                          : "Your call:"}
                    </span>
                    {DELIVERABLE_STATUSES.filter(
                      (status) => status !== deliverable.status,
                    ).map((status) => (
                      <form key={status} action={setDeliverableStatusAction}>
                        <input type="hidden" name="id" value={deliverable.id} />
                        <input type="hidden" name="status" value={status} />
                        <SubmitButton
                          variant={status === "approved" ? "primary" : "secondary"}
                          pendingLabel="Saving…"
                        >
                          {status === "approved"
                            ? "Approve"
                            : status === "changes_requested"
                              ? "Request changes"
                              : "Reset to “pending review”"}
                        </SubmitButton>
                      </form>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <CommentThread
                      deliverableId={deliverable.id}
                      initialComments={comments.get(deliverable.id) ?? []}
                      currentUserId={actor.userId}
                      addAction={addCommentAction}
                      refreshAction={refreshCommentsAction}
                    />
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400">
          Statuses and comments update here while the page is open. Downloads use
          private links that expire after five minutes.
        </p>
      </div>
    </PortalShell>
  );
}
