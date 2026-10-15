import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { CommentThread } from "@/components/comment-thread";
import { LiveStatusSync } from "@/components/live-status-sync";
import { ProjectStatusBadge, DeliverableStatusBadge } from "@/components/status-badge";
import {
  Card,
  CardHeader,
  EmptyState,
  Notice,
  formatDate,
  formatRelative,
} from "@/components/ui";
import {
  AuthzError,
  requireProjectReadable,
  requireStaff,
} from "@/lib/authz";
import { countCommentsByDeliverable, loadCommentViews } from "@/lib/comments";
import {
  DELIVERABLE_STATUSES,
  type DeliverableStatus,
} from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Asset, CommentView, Deliverable } from "@/lib/types";
import {
  addCommentAction,
  createDeliverableAction,
  deleteAssetAction,
  deleteDeliverableAction,
  deleteProjectAction,
  refreshCommentsAction,
  setDeliverableStatusAction,
  updateDeliverableAction,
  updateProjectAction,
  uploadAssetAction,
} from "../actions";
import { AssetUploadForm } from "./asset-upload-form";
import { DeliverableForm } from "./deliverable-form";
import { ProjectForm } from "../project-form";

export const metadata = { title: "Project" };

/** Column order on the board. */
const COLUMNS: { status: DeliverableStatus; hint: string }[] = [
  { status: "pending", hint: "Waiting on the client" },
  { status: "changes_requested", hint: "Needs another pass" },
  { status: "approved", hint: "Signed off" },
];

function fail(what: string, message: string): never {
  throw new Error(`Failed to load ${what}: ${message}`);
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return ` · ${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;

  // A project from another agency is indistinguishable from one that does not
  // exist: both render the 404 page.
  const project = await requireProjectReadable(staff, id).catch((error: unknown) => {
    if (error instanceof AuthzError) notFound();
    throw error;
  });

  const db = supabaseAdmin();

  const [deliverablesResult, clientResult, activityResult] = await Promise.all([
    db
      .from("deliverables")
      .select("*, assets(*)")
      .eq("project_id", project.id)
      .order("sort_order", { ascending: true }),
    db
      .from("clients")
      .select("id, name, email")
      .eq("id", project.client_id)
      .maybeSingle(),
    db
      .from("activity")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (deliverablesResult.error) fail("deliverables", deliverablesResult.error.message);
  if (clientResult.error) fail("client", clientResult.error.message);
  if (activityResult.error) fail("activity", activityResult.error.message);

  const deliverables = (deliverablesResult.data ?? []) as (Deliverable & {
    assets: Asset[];
  })[];

  // Hydrated comment threads (with author names) for every card on the board.
  const commentEntries = await Promise.all(
    deliverables.map(
      async (deliverable) =>
        [deliverable.id, await loadCommentViews(deliverable.id)] as const,
    ),
  );
  const commentsByDeliverable = new Map<string, CommentView[]>(commentEntries);
  const commentCounts = await countCommentsByDeliverable(
    deliverables.map((deliverable) => deliverable.id),
  );

  const narrative = (activityResult.data ?? []) as {
    id: string;
    message: string;
    created_at: string;
  }[];

  const counts: Record<DeliverableStatus, number> = {
    pending: 0,
    approved: 0,
    changes_requested: 0,
  };
  for (const deliverable of deliverables) counts[deliverable.status] += 1;

  const approvedShare =
    deliverables.length === 0
      ? 0
      : Math.round((counts.approved / deliverables.length) * 100);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/projects" className="text-xs text-slate-500 hover:underline">
          ← All projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <ProjectStatusBadge status={project.status} />
          <LiveStatusSync projectId={project.id} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {clientResult.data?.name ?? "Client"} · due {formatDate(project.due_date)} ·{" "}
          {deliverables.length} deliverable{deliverables.length === 1 ? "" : "s"} ·{" "}
          {approvedShare}% approved
        </p>
        {project.summary ? (
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{project.summary}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {DELIVERABLE_STATUSES.map((status) => (
          <span
            key={status}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
          >
            {counts[status]} of {deliverables.length} {status.replace("_", " ")}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnDeliverables = deliverables.filter(
            (deliverable) => deliverable.status === column.status,
          );

          return (
            <section key={column.status} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-900">
                  {column.status === "pending"
                    ? "Pending review"
                    : column.status === "approved"
                      ? "Approved"
                      : "Changes requested"}
                </h2>
                <span className="text-xs text-slate-400">
                  {columnDeliverables.length}
                </span>
              </div>
              <p className="text-xs text-slate-400">{column.hint}</p>

              {columnDeliverables.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                  Nothing here
                </div>
              ) : (
                columnDeliverables.map((deliverable) => (
                  <article key={deliverable.id}>
                    <Card className="flex flex-col gap-4 p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-medium text-slate-900">
                            {deliverable.title}
                          </h3>
                          <DeliverableStatusBadge status={deliverable.status} />
                        </div>
                        {deliverable.brief ? (
                          <p className="text-sm whitespace-pre-wrap text-slate-600">
                            {deliverable.brief}
                          </p>
                        ) : null}
                        <p className="text-xs text-slate-400">
                          {commentCounts[deliverable.id] ?? 0} comment
                          {(commentCounts[deliverable.id] ?? 0) === 1 ? "" : "s"} · added{" "}
                          {formatRelative(deliverable.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                        <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Files
                        </h4>
                        {deliverable.assets.length === 0 ? (
                          <p className="text-xs text-slate-400">No files yet.</p>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {deliverable.assets.map((asset) => (
                              <li
                                key={asset.id}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <a
                                  href={`/api/assets/${asset.id}/download`}
                                  className="min-w-0 truncate font-medium text-indigo-600 hover:underline"
                                  title="Downloads via a signed link"
                                >
                                  {asset.name}
                                </a>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="text-xs text-slate-400">
                                    {formatBytes(asset.size_bytes)}
                                  </span>
                                  <form action={deleteAssetAction}>
                                    <input type="hidden" name="id" value={asset.id} />
                                    <button
                                      type="submit"
                                      className="text-xs text-slate-400 hover:text-rose-600"
                                      aria-label={`Delete ${asset.name}`}
                                    >
                                      Remove
                                    </button>
                                  </form>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <AssetUploadForm
                          action={uploadAssetAction}
                          deliverableId={deliverable.id}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                        {DELIVERABLE_STATUSES.filter(
                          (status) => status !== deliverable.status,
                        ).map((status) => (
                          <form key={status} action={setDeliverableStatusAction}>
                            <input type="hidden" name="id" value={deliverable.id} />
                            <input type="hidden" name="status" value={status} />
                            <SubmitButton variant="secondary" pendingLabel="Saving…">
                              Mark{" "}
                              {status === "approved"
                                ? "approved"
                                : status === "changes_requested"
                                  ? "changes requested"
                                  : "pending"}
                            </SubmitButton>
                          </form>
                        ))}
                      </div>

                      <details className="border-t border-slate-100 pt-3">
                        <summary className="cursor-pointer text-xs font-medium text-slate-500">
                          Edit deliverable
                        </summary>
                        <div className="pt-3">
                          <DeliverableForm
                            action={updateDeliverableAction}
                            projectId={project.id}
                            deliverable={deliverable}
                            submitLabel="Save deliverable"
                            compact
                          />
                          <form action={deleteDeliverableAction} className="mt-3">
                            <input type="hidden" name="id" value={deliverable.id} />
                            <SubmitButton
                              variant="danger"
                              pendingLabel="Deleting…"
                              confirm={`Delete “${deliverable.title}” and its files and comments?`}
                            >
                              Delete deliverable
                            </SubmitButton>
                          </form>
                        </div>
                      </details>

                      <div className="border-t border-slate-100 pt-3">
                        <CommentThread
                          deliverableId={deliverable.id}
                          initialComments={commentsByDeliverable.get(deliverable.id) ?? []}
                          currentUserId={staff.userId}
                          addAction={addCommentAction}
                          refreshAction={refreshCommentsAction}
                        />
                      </div>
                    </Card>
                  </article>
                ))
              )}
            </section>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="Add a deliverable"
          description="Each deliverable gets its own files, comments and approval state."
        />
        <div className="p-6">
          {deliverables.length === 0 ? (
            <Notice tone="info">
              This board is empty. Add the first deliverable below — the client sees
              it the moment it exists.
            </Notice>
          ) : null}
          <div className={deliverables.length === 0 ? "mt-4" : ""}>
            <DeliverableForm
              action={createDeliverableAction}
              projectId={project.id}
              submitLabel="Add deliverable"
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Project details" />
        <div className="p-6">
          <ProjectForm
            action={updateProjectAction}
            clients={clientResult.data ? [clientResult.data] : []}
            project={project}
            submitLabel="Save project"
            compact
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Activity" description="Newest first" />
        {narrative.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="Uploads, status changes and comments on this project show up here."
          />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {narrative.map((entry) => (
              <li key={entry.id} className="px-6 py-3">
                <p className="text-slate-900">{entry.message}</p>
                <p className="text-xs text-slate-500">
                  {formatRelative(entry.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-rose-200">
        <CardHeader
          title="Delete project"
          description="Removes the board, its deliverables, files and comments. This cannot be undone."
        />
        <div className="p-6">
          <form action={deleteProjectAction}>
            <input type="hidden" name="id" value={project.id} />
            <SubmitButton
              variant="danger"
              pendingLabel="Deleting…"
              confirm={`Delete “${project.title}” and everything in it?`}
            >
              Delete project
            </SubmitButton>
          </form>
        </div>
      </Card>

      <p className="text-xs text-slate-400">
        Agency: {staff.agency.name} · downloads are signed links that expire after
        five minutes.
      </p>
    </div>
  );
}