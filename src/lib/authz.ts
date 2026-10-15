import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { CLERK_ORG_ROLE_TO_STAFF_ROLE, type StaffRole } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Agency, Asset, Client, Deliverable, Project } from "@/lib/types";

/**
 * ============================================================================
 * Revu authorization — the single place that decides who may do what.
 * ============================================================================
 *
 * Two kinds of people use Revu:
 *
 *  - STAFF  : a member of the agency's Clerk Organization. `agencies.clerk_org_id`
 *             equals the active `orgId` on their session.
 *  - CLIENT : a plain Clerk user who is NEVER in the organization. They are
 *             linked by a `clients` row whose `clerk_user_id` matches theirs.
 *
 * The rules this module implements:
 *
 *  - STAFF   : read and write everything inside their own agency.
 *  - CLIENT  : read the projects / deliverables / assets / comments of the
 *              agency they belong to; write only comments and deliverable status.
 *
 * Every server action and route handler must resolve an actor here and use the
 * assertions below before touching data. All database writes use the service
 * role key (src/lib/supabase/admin.ts), which bypasses RLS, so these checks are
 * the primary control. The RLS policies in the initial migration are
 * defence-in-depth for the anon key.
 *
 * Add helpers here rather than branching on Clerk state anywhere else.
 */

// --- errors ------------------------------------------------------------------

export class AuthzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthzError";
  }
}

/** The actor is known but is not allowed to touch this resource. */
export class ForbiddenError extends AuthzError {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The resource does not exist, or does not exist for this actor. */
export class NotFoundError extends AuthzError {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

// --- actor shapes ------------------------------------------------------------

export type StaffActor = {
  kind: "staff";
  userId: string;
  clerkOrgId: string;
  clerkOrgSlug: string | null;
  clerkOrgRole: string;
  staffRole: StaffRole;
  /** owner or admin — may manage agency settings and staff. */
  isAdmin: boolean;
  agency: Agency;
};

export type ClientActor = {
  kind: "client";
  userId: string;
  client: Client;
  agency: Agency;
};

export type Actor = StaffActor | ClientActor;

export type ActorResolution =
  | { status: "signed-out" }
  | { status: "no-actor"; userId: string }
  | { status: "actor"; actor: Actor };

// --- data access -------------------------------------------------------------

async function findAgencyByClerkOrgId(clerkOrgId: string): Promise<Agency | null> {
  const { data, error } = await supabaseAdmin()
    .from("agencies")
    .select("*")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load agency for Clerk org ${clerkOrgId}: ${error.message}`);
  }

  return (data as Agency | null) ?? null;
}

type ClientWithAgency = Client & { agency: Agency | null };

async function findClientByClerkUserId(clerkUserId: string): Promise<ClientWithAgency | null> {
  const { data, error } = await supabaseAdmin()
    .from("clients")
    .select("*, agency:agencies(*)")
    .eq("clerk_user_id", clerkUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load client for Clerk user ${clerkUserId}: ${error.message}`);
  }

  return (data as ClientWithAgency | null) ?? null;
}

// --- client claiming ---------------------------------------------------------

/**
 * Links a Clerk user to a `clients` row that an agency created for their email.
 *
 * Agency staff add a client by email before that person has an account, so the
 * row starts with `clerk_user_id = null`. The first time that person signs in,
 * we claim the row for them.
 *
 * This only runs when the user is not staff of any agency and has no linked
 * client row yet, and it requires a Clerk-verified primary email address. It
 * links at most one unlinked row; if two agencies have added the same address, a
 * second row is left untouched (see AGENTS.md).
 */
async function claimClientRowByVerifiedEmail(): Promise<ClientWithAgency | null> {
  const user = await currentUser();
  if (!user) return null;

  const primary = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );

  if (!primary || primary.verification?.status !== "verified") return null;

  const email = primary.emailAddress.trim().toLowerCase();
  if (!email) return null;

  const { data: candidates, error: lookupError } = await supabaseAdmin()
    .from("clients")
    .select("*, agency:agencies(*)")
    .eq("email", email)
    .is("clerk_user_id", null)
    .limit(2);

  if (lookupError) {
    throw new Error(`Failed to look up client for ${email}: ${lookupError.message}`);
  }

  const rows = (candidates ?? []) as ClientWithAgency[];
  if (rows.length !== 1) return null;

  const { data: claimed, error: claimError } = await supabaseAdmin()
    .from("clients")
    .update({ clerk_user_id: user.id })
    .eq("id", rows[0].id)
    .is("clerk_user_id", null)
    .select("*, agency:agencies(*)")
    .maybeSingle();

  if (claimError) {
    throw new Error(`Failed to claim client row ${rows[0].id}: ${claimError.message}`);
  }

  return (claimed as ClientWithAgency | null) ?? null;
}

// --- resolution --------------------------------------------------------------

async function resolveActorState(): Promise<ActorResolution> {
  const { isAuthenticated, userId, orgId, orgRole, orgSlug } = await auth();

  if (!isAuthenticated || !userId) {
    return { status: "signed-out" };
  }

  // Staff first: an active organization wins over any client row.
  if (orgId) {
    const agency = await findAgencyByClerkOrgId(orgId);
    if (agency) {
      const staffRole: StaffRole =
        CLERK_ORG_ROLE_TO_STAFF_ROLE[orgRole ?? ""] ?? "member";

      return {
        status: "actor",
        actor: {
          kind: "staff",
          userId,
          clerkOrgId: orgId,
          clerkOrgSlug: orgSlug ?? null,
          clerkOrgRole: orgRole ?? "",
          staffRole,
          isAdmin: staffRole === "owner" || staffRole === "admin",
          agency,
        },
      };
    }
  }

  // Otherwise they may be a client of some agency, either already linked or
  // waiting to be claimed by this email address.
  const client =
    (await findClientByClerkUserId(userId)) ?? (await claimClientRowByVerifiedEmail());

  if (client?.agency) {
    return {
      status: "actor",
      actor: {
        kind: "client",
        userId,
        client: {
          id: client.id,
          agency_id: client.agency_id,
          clerk_user_id: client.clerk_user_id,
          name: client.name,
          contact_name: client.contact_name,
          email: client.email,
          created_at: client.created_at,
        },
        agency: client.agency,
      },
    };
  }

  return { status: "no-actor", userId };
}

/**
 * Memoized for the current request. Returns the resolution tri-state so callers
 * can distinguish "signed out" from "signed in but not set up yet".
 */
export const getActorState = cache(resolveActorState);

/** The actor for this request, or null when signed out / not provisioned. */
export async function getActor(): Promise<Actor | null> {
  const state = await getActorState();
  return state.status === "actor" ? state.actor : null;
}

// --- guards ------------------------------------------------------------------

/** Signed in and provisioned. Sends you to sign-in or onboarding otherwise. */
export async function requireActor(): Promise<Actor> {
  const state = await getActorState();

  if (state.status === "signed-out") {
    redirect("/sign-in");
  }
  if (state.status === "no-actor") {
    redirect("/onboarding");
  }

  return state.actor;
}

/** Agency staff only. Clients are sent to their portal. */
export async function requireStaff(): Promise<StaffActor> {
  const actor = await requireActor();

  if (actor.kind !== "staff") {
    redirect("/portal");
  }

  return actor;
}

/** Staff with owner or admin role. */
export async function requireStaffAdmin(): Promise<StaffActor> {
  const staff = await requireStaff();

  if (!staff.isAdmin) {
    throw new ForbiddenError("Only agency owners and admins can do that.");
  }

  return staff;
}

/** Client users only. Staff are sent to the agency dashboard. */
export async function requireClient(): Promise<ClientActor> {
  const actor = await requireActor();

  if (actor.kind !== "client") {
    redirect("/dashboard");
  }

  return actor;
}

// --- scoping -----------------------------------------------------------------

/** The one agency any query for this actor must be scoped to. */
export function agencyIdOf(actor: Actor): string {
  return actor.agency.id;
}

/** A client actor's own `clients.id`, or null for staff. */
export function clientIdOf(actor: Actor): string | null {
  return actor.kind === "client" ? actor.client.id : null;
}

// --- resource assertions -----------------------------------------------------
//
// These are the only sanctioned way to reach a project / deliverable / client
// row from a server action. They return the row on success and throw
// NotFoundError or ForbiddenError otherwise.

/** Staff of the owning agency, or the client the project belongs to. */
export async function requireProjectReadable(
  actor: Actor,
  projectId: string,
): Promise<Project> {
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load project ${projectId}: ${error.message}`);
  }

  const project = data as Project | null;
  if (!project) throw new NotFoundError("Project not found.");

  if (actor.kind === "staff") {
    if (project.agency_id !== actor.agency.id) {
      throw new NotFoundError("Project not found.");
    }
  } else if (project.client_id !== actor.client.id) {
    throw new NotFoundError("Project not found.");
  }

  return project;
}

/** Staff-only: mutate anything about a project, its deliverables and assets. */
export async function requireProjectWritableByStaff(
  actor: Actor,
  projectId: string,
): Promise<{ actor: StaffActor; project: Project }> {
  if (actor.kind !== "staff") {
    throw new ForbiddenError("Only agency staff can change projects.");
  }

  const project = await requireProjectReadable(actor, projectId);
  return { actor, project };
}

async function loadDeliverableFor(actor: Actor, deliverableId: string) {
  const { data, error } = await supabaseAdmin()
    .from("deliverables")
    .select("*, project:projects(*)")
    .eq("id", deliverableId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load deliverable ${deliverableId}: ${error.message}`);
  }

  const row = data as (Deliverable & { project: Project | null }) | null;
  if (!row?.project) throw new NotFoundError("Deliverable not found.");

  if (actor.kind === "staff") {
    if (row.project.agency_id !== actor.agency.id) {
      throw new NotFoundError("Deliverable not found.");
    }
  } else if (row.project.client_id !== actor.client.id) {
    throw new NotFoundError("Deliverable not found.");
  }

  const { project, ...deliverable } = row;
  return { deliverable: deliverable as Deliverable, project };
}

/** Staff of the agency, or the client that owns the project. */
export async function requireDeliverableReadable(
  actor: Actor,
  deliverableId: string,
): Promise<{ deliverable: Deliverable; project: Project }> {
  return loadDeliverableFor(actor, deliverableId);
}

/** Staff-only structural change to a deliverable (title, brief, ordering). */
export async function requireDeliverableWritableByStaff(
  actor: Actor,
  deliverableId: string,
): Promise<{ actor: StaffActor; deliverable: Deliverable; project: Project }> {
  if (actor.kind !== "staff") {
    throw new ForbiddenError("Only agency staff can edit deliverables.");
  }

  const { deliverable, project } = await loadDeliverableFor(actor, deliverableId);
  return { actor, deliverable, project };
}

/**
 * Both staff and clients may move a deliverable between
 * pending / approved / changes_requested. Nothing else about the row changes.
 */
export async function requireDeliverableStatusWritable(
  actor: Actor,
  deliverableId: string,
): Promise<{ deliverable: Deliverable; project: Project }> {
  return loadDeliverableFor(actor, deliverableId);
}

/** Both staff and clients may comment on anything they can read. */
export async function requireCommentWritable(
  actor: Actor,
  deliverableId: string,
): Promise<{ deliverable: Deliverable; project: Project }> {
  return loadDeliverableFor(actor, deliverableId);
}

/** Staff of the owning agency, or the client themself. */
export async function requireClientReadable(
  actor: Actor,
  clientId: string,
): Promise<Client> {
  const { data, error } = await supabaseAdmin()
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load client ${clientId}: ${error.message}`);
  }

  const client = data as Client | null;
  if (!client) throw new NotFoundError("Client not found.");

  const allowed =
    actor.kind === "staff"
      ? client.agency_id === actor.agency.id
      : client.id === actor.client.id;

  if (!allowed) throw new NotFoundError("Client not found.");

  return client;
}

/** Staff-only: create, edit or delete a client record. */
export async function requireClientWritable(
  actor: Actor,
  clientId: string,
): Promise<{ actor: StaffActor; client: Client }> {
  if (actor.kind !== "staff") {
    throw new ForbiddenError("Only agency staff can manage clients.");
  }

  const { data, error } = await supabaseAdmin()
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("agency_id", actor.agency.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load client ${clientId}: ${error.message}`);
  }

  const client = data as Client | null;
  if (!client) throw new NotFoundError("Client not found.");

  return { actor, client };
}

async function loadAssetFor(actor: Actor, assetId: string) {
  const { data, error } = await supabaseAdmin()
    .from("assets")
    .select("*, deliverable:deliverables(*, project:projects(*))")
    .eq("id", assetId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load asset ${assetId}: ${error.message}`);
  }

  const row = data as
    | (Asset & {
        deliverable: (Deliverable & { project: Project | null }) | null;
      })
    | null;

  const project = row?.deliverable?.project;
  if (!row?.deliverable || !project) throw new NotFoundError("File not found.");

  if (actor.kind === "staff") {
    if (project.agency_id !== actor.agency.id) {
      throw new NotFoundError("File not found.");
    }
  } else if (project.client_id !== actor.client.id) {
    throw new NotFoundError("File not found.");
  }

  // Rebuild both rows explicitly so the joined shape never leaks outwards.
  const asset: Asset = {
    id: row.id,
    deliverable_id: row.deliverable_id,
    storage_path: row.storage_path,
    name: row.name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
  };

  const deliverable: Deliverable = {
    id: row.deliverable.id,
    project_id: row.deliverable.project_id,
    title: row.deliverable.title,
    brief: row.deliverable.brief,
    status: row.deliverable.status,
    sort_order: row.deliverable.sort_order,
    created_at: row.deliverable.created_at,
  };

  return { asset, deliverable, project };
}

/** Staff of the agency, or the client that owns the project holding the file. */
export async function requireAssetReadable(
  actor: Actor,
  assetId: string,
): Promise<{ asset: Asset; deliverable: Deliverable; project: Project }> {
  return loadAssetFor(actor, assetId);
}

/** Staff-only: upload, rename or delete a deliverable file. */
export async function requireAssetWritableByStaff(
  actor: Actor,
  assetId: string,
): Promise<{
  actor: StaffActor;
  asset: Asset;
  deliverable: Deliverable;
  project: Project;
}> {
  if (actor.kind !== "staff") {
    throw new ForbiddenError("Only agency staff can change files.");
  }

  const loaded = await loadAssetFor(actor, assetId);
  return { actor, ...loaded };
}

// --- activity log ------------------------------------------------------------

/**
 * Records an entry in the activity feed. Never throws: a failed audit write
 * must not roll back the user's actual change.
 */
export async function recordActivity(input: {
  actor: Actor;
  message: string;
  projectId?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("activity").insert({
    agency_id: input.actor.agency.id,
    project_id: input.projectId ?? null,
    actor_clerk_user_id: input.actor.userId,
    message: input.message,
  });

  if (error) {
    console.error("[authz] failed to record activity", error.message);
  }
}
