import { Badge, Card, CardHeader, formatDate } from "@/components/ui";
import { requireStaffAdmin } from "@/lib/authz";
import { AGENCY_PLAN_LABELS } from "@/lib/constants";
import { SettingsForm } from "./settings-form";
import { updateAgencyAction } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const staff = await requireStaffAdmin();
  const { agency } = staff;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Branding shown to your clients, and the identifiers behind your
          workspace.
        </p>
      </div>

      <Card>
        <CardHeader title="Agency" />
        <div className="p-6">
          <SettingsForm action={updateAgencyAction} agency={agency} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Workspace"
          description="Read-only identifiers. These change only through Clerk or a migration."
        />
        <dl className="divide-y divide-slate-100 text-sm">
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <dt className="text-slate-500">Plan</dt>
            <dd>
              <Badge tone={agency.plan === "free" ? "neutral" : "brand"}>
                {AGENCY_PLAN_LABELS[agency.plan]}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <dt className="text-slate-500">Agency id</dt>
            <dd className="font-mono text-xs text-slate-600">{agency.id}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <dt className="text-slate-500">Clerk organization</dt>
            <dd className="font-mono text-xs text-slate-600">
              {agency.clerk_org_id}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <dt className="text-slate-500">Your role</dt>
            <dd className="text-slate-600">
              {staff.clerkOrgRole || "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <dt className="text-slate-500">Created</dt>
            <dd className="text-slate-600">{formatDate(agency.created_at)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
