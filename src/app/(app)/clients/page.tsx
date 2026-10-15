import Link from "next/link";

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  formatDate,
} from "@/components/ui";
import { requireStaff } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Client } from "@/lib/types";
import { ClientForm } from "./client-form";
import { createClientAction } from "./actions";

export const metadata = { title: "Clients" };

type ClientWithCount = Client & { projects: { count: number }[] };

export default async function ClientsPage() {
  const staff = await requireStaff();

  const { data, error } = await supabaseAdmin()
    .from("clients")
    .select("*, projects(count)")
    .eq("agency_id", staff.agency.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load clients: ${error.message}`);
  }

  const clients = (data ?? []) as ClientWithCount[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="mt-1 text-sm text-slate-600">
          Each client gets their own portal login. Clients are never added to
          your Clerk organization.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Add a client"
          description="They will be able to sign in with this email to open their portal."
        />
        <div className="p-6">
          <ClientForm action={createClientAction} submitLabel="Add client" />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="All clients"
          description={`${clients.length} ${clients.length === 1 ? "client" : "clients"}`}
        />

        {clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            description="Add your first client above, then create projects and deliverables for them."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Contact</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Portal</th>
                  <th className="px-6 py-3 font-medium">Projects</th>
                  <th className="px-6 py-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {client.contact_name ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{client.email}</td>
                    <td className="px-6 py-3">
                      {client.clerk_user_id ? (
                        <Badge tone="success">Connected</Badge>
                      ) : (
                        <Badge tone="neutral">Awaiting sign-in</Badge>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {client.projects?.[0]?.count ?? 0}
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {formatDate(client.created_at)}
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
