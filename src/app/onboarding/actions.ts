"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { DEFAULT_BRAND_COLOR } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uniqueSlug } from "@/lib/slug";

export type AgencySetupState = {
  error?: string;
  /** Set on success. The client activates it then navigates to /dashboard. */
  organizationId?: string;
};

const MAX_NAME_LENGTH = 60;

function validateName(raw: FormDataEntryValue | null): string | null {
  const name = String(raw ?? "").trim();
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

async function isSlugTaken(slug: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("agencies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check slug availability: ${error.message}`);
  }

  return Boolean(data);
}

/**
 * Creates the Clerk Organization for a brand new agency and the matching
 * `agencies` row. `createdBy` makes the caller an `org:admin`.
 *
 * The active organization is set on the client afterwards (Clerk only exposes
 * session activation on the client) — see create-agency-form.tsx.
 */
export async function createAgencyAction(
  _prev: AgencySetupState,
  formData: FormData,
): Promise<AgencySetupState> {
  const { userId } = await auth();
  if (!userId) return { error: "You need to be signed in to create an agency." };

  const name = validateName(formData.get("name"));
  if (!name) {
    return { error: `Enter an agency name between 2 and ${MAX_NAME_LENGTH} characters.` };
  }

  const client = await clerkClient();

  // Someone who already belongs to an organization should activate it instead
  // of accidentally creating a second one.
  const { data: memberships } = await client.users.getOrganizationMembershipList({
    userId,
  });

  if (memberships.length > 0) {
    return {
      error:
        "Your account already belongs to an organization. Use the list above to select it.",
    };
  }

  let organization;
  try {
    organization = await client.organizations.createOrganization({
      name,
      createdBy: userId,
    });
  } catch (error) {
    console.error("[onboarding] createOrganization failed", error);
    return { error: "Clerk could not create the organization. Please try again." };
  }

  const slug = await uniqueSlug(name, isSlugTaken);

  const { error: insertError } = await supabaseAdmin().from("agencies").insert({
    clerk_org_id: organization.id,
    name,
    slug,
    brand_color: DEFAULT_BRAND_COLOR,
  });

  if (insertError) {
    console.error("[onboarding] agencies insert failed", insertError.message);
    // Do not leave a Clerk organization with no matching agency row.
    try {
      await client.organizations.deleteOrganization(organization.id);
    } catch (cleanupError) {
      console.error("[onboarding] failed to roll back organization", cleanupError);
    }
    return {
      error:
        insertError.code === "23505"
          ? "That agency name is already taken. Try another one."
          : "We could not save your agency. Please try again.",
    };
  }

  revalidatePath("/", "layout");

  return { organizationId: organization.id };
}

/**
 * Recovery path: the signed-in user has an active Clerk Organization that has
 * no `agencies` row yet (for example the organization was created outside
 * Revu). Creates just the row.
 */
export async function finishAgencySetupAction(
  _prev: AgencySetupState,
  formData: FormData,
): Promise<AgencySetupState> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return { error: "No active organization. Select or create one first." };
  }

  if (orgRole !== "org:admin" && orgRole !== "org:owner") {
    return { error: "Only organization admins can finish setting up the agency." };
  }

  const { data: existing } = await supabaseAdmin()
    .from("agencies")
    .select("id")
    .eq("clerk_org_id", orgId)
    .maybeSingle();

  if (existing) {
    return { organizationId: orgId };
  }

  const name = validateName(formData.get("name"));
  if (!name) {
    return { error: `Enter an agency name between 2 and ${MAX_NAME_LENGTH} characters.` };
  }

  const slug = await uniqueSlug(name, isSlugTaken);

  const { error } = await supabaseAdmin().from("agencies").insert({
    clerk_org_id: orgId,
    name,
    slug,
    brand_color: DEFAULT_BRAND_COLOR,
  });

  if (error) {
    console.error("[onboarding] finish setup insert failed", error.message);
    return { error: "We could not save your agency. Please try again." };
  }

  revalidatePath("/", "layout");
  return { organizationId: orgId };
}
