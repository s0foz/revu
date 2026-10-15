import Link from "next/link";
import { redirect } from "next/navigation";

import { DeliverableStatusBadge, ProjectStatusBadge } from "@/components/status-badge";
import { Card, EmptyState, formatDate } from "@/components/ui";
import { getActorState, requireClient } from "@/lib/authz";
import type { DeliverableStatus } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Project } from "@/lib/types";
import { NotConnected } from "./not-connected";
import { PortalShell } from "./portal-shell";

export const metadata = { title: "Your portal" };

type ProjectWithDeliverables = Project & {
  deliverables: { id: string; status: DeliverableStatus; title: string }[];
};

export default async function PortalPage() {
  const state = await getActorState();

  if (state.status === "signed-out") {
    redirect("/sign-in");
  }

  // Signed in, but no agency has added them as a client.
  if (state.status === "no-actor") {
    return <NotConnected />;
  }

  // Staff belong in the agency app, not here.
  const actor = await requireClient();

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("*, deliverables(id, title, status)")
    .eq("client_id", actor.client.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load your projects: ${error.message}`);
  }

  const projects = (data ?? []) as ProjectWithDeliverables[];

  const awaiting = projects.reduce(
    (total, project) =>
      total +
      project.deliverables.filter((deliverable) => deliverable.status === "pending")
        .length,
    0,
  );

  return (
    <PortalShell agency={actor.agency} client={actor.client}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{actor.client.contact_name ? `, ${actor.client.contact_name}` : ""}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {projects.length === 0
              ? `${actor.agency.name} has not shared any work with you yet.`
              : awaiting > 0
                ? `${awaiting} deliverable${awaiting === 1 ? "" : "s"} waiting for your review.`
                : "Nothing is waiting on you right now."}
          </p>
        </div>

        {projects.length === 0 ? (
          <Card>
            <EmptyState
              title="No projects yet"
              description={`When ${actor.agency.name} starts a project for you, it will appear here.`}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {projects.map((project) => {
              const total = project.deliverables.length;
              const approved = project.deliverables.filter(
                (deliverable) => deliverable.status === "approved",
              ).length;
              const pending = project.deliverables.filter(
                (deliverable) => deliverable.status === "pending",
              ).length;
              const percent = total === 0 ? 0 : Math.round((approved / total) * 100);

              return (
                <Card key={project.id} className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/portal/projects/${project.id}`}
                        className="text-lg font-medium text-slate-900 hover:underline"
                      >
                        {project.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        Due {formatDate(project.due_date)}
                        {pending > 0 ? ` · ${pending} awaiting your review` : ""}
                      </p>
                    </div>
                    <ProjectStatusBadge status={project.status} />
                  </div>

                  {project.summary ? (
                    <p className="mt-3 text-sm text-slate-600">{project.summary}</p>
                  ) : null}

                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: "var(--brand)",
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">
                      {approved} of {total} approved
                    </span>
                  </div>

                  {total > 0 ? (
                    <ul className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
                      {project.deliverables.map((deliverable) => (
                        <li
                          key={deliverable.id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <Link
                            href={`/portal/projects/${project.id}#deliverable-${deliverable.id}`}
                            className="min-w-0 truncate text-slate-700 hover:underline"
                          >
                            {deliverable.title}
                          </Link>
                          <DeliverableStatusBadge status={deliverable.status} />
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-4">
                    <Link
                      href={`/portal/projects/${project.id}`}
                      className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white"
                      style={{ backgroundColor: "var(--brand)" }}
                    >
                      Review work
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
