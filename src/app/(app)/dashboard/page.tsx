import Link from "next/link";

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  formatRelative,
} from "@/components/ui";
import { requireStaff } from "@/lib/authz";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Activity, Project } from "@/lib/types";

export const metadata = { title: "Overview" };

function fail(what: string, message: string): never {
  throw new Error(`Failed to load ${what}: ${message}`);
}

export default async function DashboardPage() {
  const staff = await requireStaff();
  const agencyId = staff.agency.id;
  const db = supabaseAdmin();

  const [
    clientsResult,
    projectsCountResult,
    deliverablesCountResult,
    pendingCountResult,
    activityResult,
    recentProjectsResult,
  ] = await Promise.all([
    db
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId),
    db
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId),
    db
      .from("deliverables")
      .select("id, projects!inner(agency_id)", { count: "exact", head: true })
      .eq("projects.agency_id", agencyId),
    db
      .from("deliverables")
      .select("id, projects!inner(agency_id)", { count: "exact", head: true })
      .eq("projects.agency_id", agencyId)
      .eq("status", "pending"),
    db
      .from("activity")
      .select("*")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("projects")
      .select("*, client:clients(id, name)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (clientsResult.error) fail("clients", clientsResult.error.message);
  if (projectsCountResult.error) fail("projects", projectsCountResult.error.message);
  if (deliverablesCountResult.error)
    fail("deliverables", deliverablesCountResult.error.message);
  if (pendingCountResult.error) fail("deliverables", pendingCountResult.error.message);
  if (activityResult.error) fail("activity", activityResult.error.message);
  if (recentProjectsResult.error)
    fail("projects", recentProjectsResult.error.message);

  const activity = (activityResult.data ?? []) as Activity[];
  const projects = (recentProjectsResult.data ?? []) as (Project & {
    client: { id: string; name: string } | null;
  })[];

  const stats = [
    { label: "Clients", value: clientsResult.count ?? 0, href: "/clients" },
    { label: "Projects", value: projectsCountResult.count ?? 0, href: "/projects" },
    {
      label: "Deliverables",
      value: deliverablesCountResult.count ?? 0,
      href: "/projects",
    },
    {
      label: "Awaiting review",
      value: pendingCountResult.count ?? 0,
      href: "/projects",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {staff.agency.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as {staff.clerkOrgRole || "member"} · {staff.agency.plan} plan
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="p-6 transition hover:border-slate-300">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {stat.label}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {stat.value}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent projects"
            action={
              <Link
                href="/projects"
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                View all
              </Link>
            }
          />
          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Add a client, then create their first project."
              action={
                <Link
                  href="/clients"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Go to clients
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{project.title}</p>
                    <p className="text-xs text-slate-500">
                      {project.client?.name ?? "—"}
                    </p>
                  </div>
                  <Badge>{PROJECT_STATUS_LABELS[project.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Activity" />
          {activity.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              description="Actions you take in Revu will show up here."
            />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {activity.map((entry) => (
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
      </div>
    </div>
  );
}
