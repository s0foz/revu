import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { OrganizationList } from "@clerk/nextjs";

import { Card, CardHeader } from "@/components/ui";
import { getActorState } from "@/lib/authz";
import { AgencySetupForm } from "./create-agency-form";
import { createAgencyAction, finishAgencySetupAction } from "./actions";

export const metadata = { title: "Set up your agency" };

export default async function OnboardingPage() {
  const state = await getActorState();

  if (state.status === "signed-out") {
    redirect("/sign-in");
  }

  if (state.status === "actor") {
    redirect(state.actor.kind === "staff" ? "/dashboard" : "/portal");
  }

  const { userId, orgId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const client = await clerkClient();
  const { data: memberships } = await client.users.getOrganizationMembershipList({
    userId,
  });

  const activeMembership = memberships.find(
    (membership) => membership.organization.id === orgId,
  );

  // Already in an organization but its agency row is missing.
  if (orgId && activeMembership) {
    return (
      <main className="mx-auto w-full max-w-lg px-6 py-16">
        <Card>
          <CardHeader
            title="Finish setting up your agency"
            description={`Your organization “${activeMembership.organization.name}” is not connected to Revu yet.`}
          />
          <div className="p-6">
            <AgencySetupForm
              action={finishAgencySetupAction}
              submitLabel="Create agency"
              defaultName={activeMembership.organization.name}
              intro="Confirm the name your clients will see in their portal."
            />
          </div>
        </Card>
      </main>
    );
  }

  // Belongs to organizations but none is active — let them pick one.
  if (memberships.length > 0) {
    return (
      <main className="mx-auto w-full max-w-lg px-6 py-16">
        <Card>
          <CardHeader
            title="Choose your agency"
            description="You already belong to an organization. Select it to continue."
          />
          <div className="p-6">
            <OrganizationList
              hidePersonal
              afterSelectOrganizationUrl="/onboarding"
              afterCreateOrganizationUrl="/onboarding"
            />
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-16">
      <Card>
        <CardHeader
          title="Create your agency"
          description="This creates your workspace. You can invite your team and add clients next."
        />
        <div className="p-6">
          <AgencySetupForm
            action={createAgencyAction}
            submitLabel="Create agency"
            intro="One agency holds all of your clients, projects and deliverables."
          />
        </div>
      </Card>

      <p className="mt-6 text-center text-xs text-slate-500">
        Already have a client login?{" "}
        <Link href="/portal" className="underline">
          Go to your portal
        </Link>
      </p>
    </main>
  );
}
