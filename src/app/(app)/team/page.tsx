import { clerkClient } from "@clerk/nextjs/server";

import { Badge, Card, CardHeader, EmptyState, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireStaff } from "@/lib/authz";
import { CLERK_ORG_ROLE_TO_STAFF_ROLE, STAFF_ROLE_LABELS } from "@/lib/constants";
import { InviteForm } from "./invite-form";
import { inviteStaffAction, revokeInvitationAction } from "./actions";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const staff = await requireStaff();
  const client = await clerkClient();

  const [members, invitations] = await Promise.all([
    client.organizations.getOrganizationMembershipList({
      organizationId: staff.clerkOrgId,
      limit: 100,
    }),
    client.organizations.getOrganizationInvitationList({
      organizationId: staff.clerkOrgId,
      status: ["pending"],
      limit: 100,
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your team are members of the Clerk organization{" "}
          <span className="font-medium">{staff.agency.name}</span>. Clients are
          never added here.
        </p>
      </div>

      {staff.isAdmin ? (
        <Card>
          <CardHeader
            title="Invite a teammate"
            description="They join your organization with the role you choose."
          />
          <div className="p-6">
            <InviteForm action={inviteStaffAction} />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Members"
          description={`${members.totalCount} ${members.totalCount === 1 ? "person" : "people"}`}
        />
        <ul className="divide-y divide-slate-100 text-sm">
          {members.data.map((membership) => {
            const profile = membership.publicUserData;
            const name =
              [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
              profile?.identifier ||
              "Unknown";
            const role =
              CLERK_ORG_ROLE_TO_STAFF_ROLE[membership.role] ?? "member";

            return (
              <li
                key={membership.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
              >
                <div className="flex items-center gap-3">
                  {profile?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.imageUrl}
                      alt=""
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <p className="font-medium text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500">
                      {profile?.identifier ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={role === "member" ? "neutral" : "brand"}>
                    {STAFF_ROLE_LABELS[role]}
                  </Badge>
                  {profile?.userId === staff.userId ? (
                    <span className="text-xs text-slate-400">You</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Pending invitations"
          description="Invitations expire after 30 days."
        />
        {invitations.data.length === 0 ? (
          <EmptyState
            title="No pending invitations"
            description="Everyone you invited has already joined, or you have not invited anyone yet."
          />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {invitations.data.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {invitation.emailAddress}
                  </p>
                  <p className="text-xs text-slate-500">
                    Sent {formatDate(invitation.createdAt)} · expires{" "}
                    {formatDate(invitation.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="warning">
                    {CLERK_ORG_ROLE_TO_STAFF_ROLE[invitation.role] ?? invitation.role}
                  </Badge>
                  {staff.isAdmin ? (
                    <form action={revokeInvitationAction}>
                      <input
                        type="hidden"
                        name="invitation_id"
                        value={invitation.id}
                      />
                      <SubmitButton variant="secondary" pendingLabel="Revoking…">
                        Revoke
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
