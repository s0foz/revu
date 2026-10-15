/**
 * Revu demo seed.
 *
 *   npm run seed
 *
 * Creates (idempotently) a demo agency, client, project and deliverables so you
 * have something to look at before building anything.
 *
 * Environment (read from .env.local via `node --env-file`):
 *   NEXT_PUBLIC_SUPABASE_URL      required
 *   SUPABASE_SERVICE_ROLE_KEY     required
 *   CLERK_SECRET_KEY              optional — lets the script create/invite the
 *                                 Clerk organization so you can actually sign in
 *   SEED_CLERK_ORG_ID             optional — reuse an existing Clerk org instead
 *   SEED_ADMIN_EMAIL              optional — invite this address as org:admin
 *   SEED_CLIENT_CLERK_USER_ID     optional — link the demo client to this Clerk
 *                                 user so you can sign in as the client
 *
 * Re-running resets the demo project's deliverables so the data is
 * deterministic. Nothing outside the demo agency is touched.
 */

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_BRAND_COLOR, DELIVERABLE_STATUSES } from "../src/lib/constants.ts";
import type { DeliverableStatus } from "../src/lib/constants.ts";

const AGENCY = {
  name: "Northwind Studio",
  slug: "northwind-studio",
};

const CLIENT = {
  name: "Acme Corporation",
  contactName: "Dana Whitfield",
  email: "dana@acme.example",
};

const PROJECT = {
  title: "Website redesign",
  status: "active" as const,
  summary:
    "Full rebuild of the marketing site — new information architecture, brand refresh and a self-serve pricing page.",
};

const DELIVERABLES: { title: string; brief: string; status: DeliverableStatus }[] = [
  {
    title: "Homepage concept",
    brief:
      "Two directions for the hero, above-the-fold layout and primary calls to action.",
    status: "pending",
  },
  {
    title: "Brand style guide",
    brief: "Typography, colour and spacing tokens plus component usage notes.",
    status: "approved",
  },
  {
    title: "Contact page",
    brief: "Enquiry form, office map embed and support hours.",
    status: "changes_requested",
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n✗ Missing ${name}. Add it to .env.local first.\n`);
    process.exit(1);
  }
  return value;
}

function dueDateIn(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Resolves the Clerk organization id the demo agency should map to. */
async function resolveClerkOrgId(): Promise<string> {
  const provided = process.env.SEED_CLERK_ORG_ID?.trim();
  if (provided) {
    console.log(`• Using Clerk organization from SEED_CLERK_ORG_ID (${provided})`);
    return provided;
  }

  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error(
      [
        "",
        "✗ No Clerk organization to attach the demo agency to.",
        "",
        "  Either:",
        "    1. Run `npm run dev`, sign up and create your agency, then re-run the seed;",
        "    2. Set SEED_CLERK_ORG_ID to an existing organization id; or",
        "    3. Set CLERK_SECRET_KEY so this script can create the organization.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  let createClerkClient: typeof import("@clerk/backend").createClerkClient;
  try {
    ({ createClerkClient } = await import("@clerk/backend"));
  } catch {
    console.error(
      "✗ @clerk/backend is not installed. Run `npm install` and try again.",
    );
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey });
  const existing = await clerk.organizations.getOrganizationList({ limit: 100 });
  const match = existing.data.find(
    (organization) => organization.name === AGENCY.name,
  );

  if (match) {
    console.log(`• Reusing Clerk organization ${match.id}`);
    return match.id;
  }

  const created = await clerk.organizations.createOrganization({
    name: AGENCY.name,
    slug: AGENCY.slug,
  });
  console.log(`• Created Clerk organization ${created.id}`);

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim();
  if (adminEmail) {
    await clerk.organizations.createOrganizationInvitation({
      organizationId: created.id,
      emailAddress: adminEmail,
      role: "org:admin",
      expiresInDays: 30,
    });
    console.log(`• Invited ${adminEmail} as org:admin (accept it to sign in)`);
  } else {
    console.log(
      "• Set SEED_ADMIN_EMAIL to have the seed invite you as an organization admin",
    );
  }

  return created.id;
}

async function main() {
  const clerkOrgId = await resolveClerkOrgId();

  // --- agency ---------------------------------------------------------------
  const { data: existingAgency, error: agencyLookupError } = await db
    .from("agencies")
    .select("*")
    .eq("slug", AGENCY.slug)
    .maybeSingle();

  if (agencyLookupError) throw agencyLookupError;

  let agencyId: string;

  if (existingAgency) {
    const { error } = await db
      .from("agencies")
      .update({ clerk_org_id: clerkOrgId, name: AGENCY.name })
      .eq("id", existingAgency.id);
    if (error) throw error;
    agencyId = existingAgency.id;
    console.log(`• Updated agency ${AGENCY.slug}`);
  } else {
    const { data, error } = await db
      .from("agencies")
      .insert({
        clerk_org_id: clerkOrgId,
        name: AGENCY.name,
        slug: AGENCY.slug,
        brand_color: DEFAULT_BRAND_COLOR,
      })
      .select("id")
      .single();
    if (error) throw error;
    agencyId = data.id;
    console.log(`• Created agency ${AGENCY.slug}`);
  }

  // --- client ---------------------------------------------------------------
  const clientClerkUserId = process.env.SEED_CLIENT_CLERK_USER_ID?.trim() || null;

  const { data: existingClient, error: clientLookupError } = await db
    .from("clients")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("email", CLIENT.email)
    .maybeSingle();

  if (clientLookupError) throw clientLookupError;

  let clientId: string;

  if (existingClient) {
    const { error } = await db
      .from("clients")
      .update({
        name: CLIENT.name,
        contact_name: CLIENT.contactName,
        ...(clientClerkUserId ? { clerk_user_id: clientClerkUserId } : {}),
      })
      .eq("id", existingClient.id);
    if (error) throw error;
    clientId = existingClient.id;
    console.log(`• Updated client ${CLIENT.email}`);
  } else {
    const { data, error } = await db
      .from("clients")
      .insert({
        agency_id: agencyId,
        name: CLIENT.name,
        contact_name: CLIENT.contactName,
        email: CLIENT.email,
        clerk_user_id: clientClerkUserId,
      })
      .select("id")
      .single();
    if (error) throw error;
    clientId = data.id;
    console.log(`• Created client ${CLIENT.email}`);
  }

  // --- project --------------------------------------------------------------
  const { data: existingProject, error: projectLookupError } = await db
    .from("projects")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("client_id", clientId)
    .eq("title", PROJECT.title)
    .maybeSingle();

  if (projectLookupError) throw projectLookupError;

  const projectValues = {
    agency_id: agencyId,
    client_id: clientId,
    title: PROJECT.title,
    status: PROJECT.status,
    due_date: dueDateIn(21),
    summary: PROJECT.summary,
  };

  let projectId: string;

  if (existingProject) {
    const { error } = await db
      .from("projects")
      .update(projectValues)
      .eq("id", existingProject.id);
    if (error) throw error;
    projectId = existingProject.id;
    console.log(`• Updated project “${PROJECT.title}”`);
  } else {
    const { data, error } = await db
      .from("projects")
      .insert(projectValues)
      .select("id")
      .single();
    if (error) throw error;
    projectId = data.id;
    console.log(`• Created project “${PROJECT.title}”`);
  }

  // --- deliverables ---------------------------------------------------------
  const { error: clearError } = await db
    .from("deliverables")
    .delete()
    .eq("project_id", projectId);
  if (clearError) throw clearError;

  const { error: deliverableError } = await db.from("deliverables").insert(
    DELIVERABLES.map((deliverable, index) => ({
      project_id: projectId,
      title: deliverable.title,
      brief: deliverable.brief,
      status: deliverable.status,
      sort_order: index,
    })),
  );
  if (deliverableError) throw deliverableError;

  console.log(
    `• Reset ${DELIVERABLES.length} deliverables (statuses: ${DELIVERABLE_STATUSES.join(", ")})`,
  );

  console.log("\n✓ Seed complete.");
  console.log(`  Agency:  ${AGENCY.name} (${clerkOrgId})`);
  console.log(`  Client:  ${CLIENT.email}`);
  console.log(`  Project: ${PROJECT.title}`);
  if (!clientClerkUserId) {
    console.log(
      "\n  The demo client is unlinked. Any Clerk user who signs in with" +
        ` ${CLIENT.email} will claim it automatically.`,
    );
  }
}

main().catch((error) => {
  console.error("\n✗ Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
