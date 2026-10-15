/**
 * Row types for the schema in supabase/migrations/20260101000000_init.sql.
 *
 * These are hand-written for Phase 1 so the app typechecks before a Supabase
 * project exists. Once the project is linked they can be regenerated with:
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 */

import type {
  AgencyPlan,
  CommentAuthorRole,
  DeliverableStatus,
  ProjectStatus,
} from "@/lib/constants";

export type Agency = {
  id: string;
  clerk_org_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  plan: AgencyPlan;
  created_at: string;
};

export type Client = {
  id: string;
  agency_id: string;
  clerk_user_id: string | null;
  name: string;
  contact_name: string | null;
  email: string;
  created_at: string;
};

export type Project = {
  id: string;
  agency_id: string;
  client_id: string;
  title: string;
  status: ProjectStatus;
  due_date: string | null;
  summary: string | null;
  created_at: string;
};

export type Deliverable = {
  id: string;
  project_id: string;
  title: string;
  brief: string | null;
  status: DeliverableStatus;
  sort_order: number;
  created_at: string;
};

export type Asset = {
  id: string;
  deliverable_id: string;
  storage_path: string;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type Comment = {
  id: string;
  deliverable_id: string;
  body: string;
  author_clerk_user_id: string;
  author_role: CommentAuthorRole;
  created_at: string;
};

/**
 * A comment with a display name resolved for it. The database only stores the
 * Clerk user id, so anything that renders a thread carries this shape instead.
 */
export type CommentView = Comment & { author_name: string };

export type Activity = {
  id: string;
  agency_id: string;
  project_id: string | null;
  actor_clerk_user_id: string | null;
  message: string;
  created_at: string;
};
