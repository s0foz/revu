"use client";

import { useRouter } from "next/navigation";

import { liveStatusLabel, useLiveChanges } from "@/components/use-live-changes";

/**
 * Keeps a project view current while it sits open.
 *
 * When a client approves a deliverable (or staff change one), every other open
 * view of that project re-renders itself through `router.refresh()` — no manual
 * reload. If Realtime is unavailable this degrades to a 15-second poll, which is
 * the documented fallback in AGENTS.md.
 */
export function LiveStatusSync({ projectId }: { projectId: string }) {
  const router = useRouter();

  const live = useLiveChanges({
    channelName: `deliverables-${projectId}`,
    table: "deliverables",
    event: "*",
    filter: `project_id=eq.${projectId}`,
    onEvent: () => {
      router.refresh();
    },
    pollIntervalMs: 15000,
  });

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-slate-400"
      title="Statuses update here without a refresh."
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          live === "realtime"
            ? "bg-emerald-500"
            : live === "polling"
              ? "bg-amber-400"
              : "bg-slate-300"
        }`}
      />
      {liveStatusLabel(live)}
    </span>
  );
}
