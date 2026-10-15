"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { recordActivity, requireStaffAdmin } from "@/lib/authz";

export type TeamFormState = {
  error?: string;
  success?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Clerk ships `org:admin` and `org:member`. `org:owner` is only valid if it has
 * been added to the instance, so it is not offered here but IS understood when
 * reading roles back (see CLERK_ORG_ROLE_TO_STAFF_ROLE).
 */
const INVITABLE_ROLES = ["org:admin", "org:member"] as const;

export async function inviteStaffAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const staff = await requireStaffAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "org:member");

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  if (!INVITABLE_ROLES.includes(role as (typeof INVITABLE_ROLES)[number])) {
    return { error: "Choose a valid role." };
  }

  const client = await clerkClient();

  try {
    await client.organizations.createOrganizationInvitation({
      organizationId: staff.clerkOrgId,
      inviterUserId: staff.userId,
      emailAddress: email,
      role,
      // 30 days (Clerk's own default, made explicit).
      expiresInDays: 30,
    });
  } catch (error) {
    console.error("[team] invite failed", error);

    const message = error instanceof Error ? error.message : "";
    if (/already|exist/i.test(message)) {
      return { error: "That person is already a member or has a pending invitation." };
    }
    if (/limit|maximum/i.test(message)) {
      return { error: "Your Clerk organization has reached its member limit." };
    }
    return { error: "Clerk could not send the invitation. Please try again." };
  }

  await recordActivity({ actor: staff, message: `Invited ${email} to the team` });

  revalidatePath("/team");
  return { success: `Invitation sent to ${email}.` };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAdmin();

  const invitationId = String(formData.get("invitation_id") ?? "");
  if (!invitationId) return;

  const client = await clerkClient();

  try {
    await client.organizations.revokeOrganizationInvitation({
      organizationId: staff.clerkOrgId,
      invitationId,
      requestingUserId: staff.userId,
    });
  } catch (error) {
    console.error("[team] revoke failed", error);
    return;
  }

  await recordActivity({ actor: staff, message: "Revoked a team invitation" });
  revalidatePath("/team");
}
