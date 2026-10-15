import Link from "next/link";

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  formatDate,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireClientReadable, requireStaff } from "@/lib/authz";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Project } from "@/lib/types";
import { ClientForm } from "../client-form";
import {
  deleteClientAction,
  unlinkClientPortalAction,
  updateClientAction,
} from "../actions";

export const metadata = { title: "Client" };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const client = await requireClientReadable(staff, id);

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load projects for client ${client.id}: ${error.message}`);
  }

  const projects = (data ?? []) as Project[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/clients" className="text-xs text-slate-500 hover:underline">
          ← All clients
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
          {client.clerk_user_id ? (
            <Badge tone="success">Portal connected</Badge>
          ) : (
            <Badge tone="neutral">Awaiting sign-in</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Added {formatDate(client.created_at)} · {client.email}
        </p>
      </div>

      <Card>
        <CardHeader title="Client details" />
        <div className="p-6">
          <ClientForm
            action={updateClientAction}
            client={client}
            submitLabel="Save changes"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Portal access"
          description="Clients sign in with their email address. Revu connects them the first time they sign in."
        />
        <div className="flex flex-col gap-4 p-6">
          {client.clerk_user_id ? (
            <>
              <p className="text-sm text-slate-600">
                Linked Clerk user:{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  {client.clerk_user_id}
                </code>
              </p>
              <form action={unlinkClientPortalAction}>
                <input type="hidden" name="id" value={client.id} />
                <SubmitButton variant="secondary" pendingLabel="Revoking…">
                  Revoke portal access
                </SubmitButton>
              </form>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              Not connected yet. Tell {client.contact_name ?? client.name} to
              create an account at{" "}
              <span className="font-medium">{client.email}</span> — the portal
              opens automatically on their first sign-in.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Projects"
          description={
            projects.length === 0
              ? undefined
              : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`
          }
        />
        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create a project and its deliverables board from the projects page."
            action={
              <Link
                href="/projects"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Create a project
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between gap-4 px-6 py-3"
              >
                <Link
                  href={`/projects/${project.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {project.title}
                </Link>
                <span className="flex items-center gap-3 text-xs text-slate-500">
                  <Badge>{PROJECT_STATUS_LABELS[project.status]}</Badge>
                  {formatDate(project.due_date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-rose-200">
        <CardHeader
          title="Delete client"
          description="Deletes the client, their projects, deliverables and comments. This cannot be undone."
        />
        <div className="p-6">
          <form action={deleteClientAction}>
            <input type="hidden" name="id" value={client.id} />
            <SubmitButton
              variant="danger"
              pendingLabel="Deleting…"
              confirm={`Delete ${client.name} and all of their projects? This cannot be undone.`}
            >
              Delete client
            </SubmitButton>
          </form>
        </div>
      </Card>

      <p className="text-xs text-slate-400">
        Agency: {staff.agency.name}
      </p>
    </div>
  );
}
