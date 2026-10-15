/**
 * Literals that mirror the CHECK constraints in
 * supabase/migrations/20260101000000_init.sql.
 *
 * If you change a list here, ship a migration that changes the matching
 * constraint in the same commit.
 */

// --- deliverables.status -----------------------------------------------------
export const DELIVERABLE_STATUSES = [
  "pending",
  "approved",
  "changes_requested",
] as const;

export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

// --- projects.status ---------------------------------------------------------
export const PROJECT_STATUSES = [
  "pending",
  "active",
  "in_review",
  "complete",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  pending: "Pending",
  active: "Active",
  in_review: "In review",
  complete: "Complete",
  archived: "Archived",
};

// --- agencies.plan -----------------------------------------------------------
// 'starter' and 'unlimited' are the Phase 4 paid tiers ($29/mo, $79/mo).
export const AGENCY_PLANS = ["free", "starter", "unlimited"] as const;

export type AgencyPlan = (typeof AGENCY_PLANS)[number];

export const AGENCY_PLAN_LABELS: Record<AgencyPlan, string> = {
  free: "Free",
  starter: "Starter",
  unlimited: "Unlimited",
};

// --- comments.author_role ----------------------------------------------------
export const COMMENT_AUTHOR_ROLES = ["agency", "client"] as const;

export type CommentAuthorRole = (typeof COMMENT_AUTHOR_ROLES)[number];

// --- staff roles -------------------------------------------------------------
// Clerk ships `org:admin` and `org:member`. `org:owner` only exists if it is
// added to the Clerk instance; it is accepted here so custom role sets work.
export const STAFF_ROLES = ["owner", "admin", "member"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const CLERK_ORG_ROLE_TO_STAFF_ROLE: Record<string, StaffRole> = {
  "org:owner": "owner",
  "org:admin": "admin",
  "org:member": "member",
};

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

// --- defaults ----------------------------------------------------------------
export const DEFAULT_BRAND_COLOR = "#4f46e5";

/** Private Supabase Storage bucket that holds all deliverable files. */
export const ASSETS_BUCKET = "assets";
