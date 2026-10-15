import Link from "next/link";

import {
  Card,
  CardHeader,
  EmptyState,
  Notice,
  formatDate,
} from "@/components/ui";
import { ProjectStatusBadge } from "@/components/status-badge";
import { requireStaff } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Client, Project } from "@/lib/types";
import { ProjectForm } from "./project-form";
import { createProjectAction } from "./actions";

export const metadata = { title: "Projects" };

type ProjectRow = Project & {
  client: { id: string; name: string } | null;
  deliverables: { count: number }[];
};

export default async function ProjectsPage() {
  const staff = await requireStaff();
  const db = supabaseAdmin();

  const [projectsResult, clientsResult] = await Promise.all([
    db
      .from("projects")
      .select("*, client:clients(id, name), deliverables(count)")
      .eq("agency_id", staff.agency.id)
      .order("created_at", { ascending: false }),
    db
      .from("clients")
      .select("id, name")
      .eq("agency_id", staff.agency.id)
      .order("name", { ascending: true }),
  ]);

  if (projectsResult.error) {
    throw new Error(`Failed to load projects: ${projectsResult.error.message}`);
  }
  if (clientsResult.error) {
    throw new Error(`Failed to load clients: ${clientsResult.error.message}`);
  }

  const projects = (projectsResult.data ?? []) as ProjectRow[];
  const clients = (clientsResult.data ?? []) as Pick<Client, "id" | "name">[];
  const awaitingReview = projects.filter(
    (project) => project.status === "in_review",
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every project has a deliverables board your client reviews in their own
          portal. {awaitingReview > 0 ? `${awaitingReview} awaiting sign-off.` : ""}
        </p>
      </div>

      <Card>
        <CardHeader
          title="New project"
          description="Pick a client, then add the deliverables they will review."
        />
        <div className="p-6">
          {clients.length === 0 ? (
            <Notice tone="info">
              Add a client first — a project always belongs to one.{" "}
              <Link href="/clients" className="font-medium underline">
                Go to clients
              </Link>
            </Notice>
          ) : (
            <ProjectForm
              action={createProjectAction}
              clients={clients}
              submitLabel="Create project"
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="All projects"
          description={`${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        />
        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create one above, then upload the work your client needs to review."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Project</th>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Deliverables</th>
                  <th className="px-6 py-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {project.title}
                      </Link>
                      {project.summary ? (
                        <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                          {project.summary}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {project.client?.name ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      <ProjectStatusBadge status={project.status} />
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {project.deliverables?.[0]?.count ?? 0}
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {formatDate(project.due_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
