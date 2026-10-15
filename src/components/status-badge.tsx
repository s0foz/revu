import { Badge } from "@/components/ui";
import {
  DELIVERABLE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type DeliverableStatus,
  type ProjectStatus,
} from "@/lib/constants";

/**
 * One place that decides how a status looks, so the agency board and the client
 * portal can't drift apart. Clients only ever see deliverables, staff see both.
 */

const PROJECT_TONES: Record<ProjectStatus, "neutral" | "brand" | "warning" | "success"> = {
  pending: "neutral",
  active: "brand",
  in_review: "warning",
  complete: "success",
  archived: "neutral",
};

const DELIVERABLE_TONES: Record<
  DeliverableStatus,
  "neutral" | "brand" | "warning" | "success" | "danger"
> = {
  pending: "warning",
  approved: "success",
  changes_requested: "danger",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={PROJECT_TONES[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>;
}

export function DeliverableStatusBadge({ status }: { status: DeliverableStatus }) {
  return (
    <Badge tone={DELIVERABLE_TONES[status]}>
      {DELIVERABLE_STATUS_LABELS[status]}
    </Badge>
  );
}
