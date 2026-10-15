"use client";

import { useActionState } from "react";

import { Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/constants";
import type { Client, Project } from "@/lib/types";
import type { ProjectFormState } from "./actions";

export function ProjectForm({
  action,
  clients,
  project,
  submitLabel,
  compact = false,
}: {
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  clients: Pick<Client, "id" | "name">[];
  project?: Project;
  submitLabel: string;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {project ? <input type="hidden" name="id" value={project.id} /> : null}

      <div className={compact ? "flex flex-col gap-4" : "grid gap-4 sm:grid-cols-3"}>
        <Field label="Project title" htmlFor="project-title">
          <Input
            id="project-title"
            name="title"
            required
            maxLength={120}
            defaultValue={project?.title ?? ""}
            placeholder="Website redesign"
          />
        </Field>

        {project ? (
          <Field label="Status" htmlFor="project-status">
            <Select
              id="project-status"
              name="status"
              defaultValue={project.status}
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field
            label="Client"
            htmlFor="project-client"
            hint="Only your own clients are listed."
          >
            <Select id="project-client" name="client_id" required defaultValue="">
              <option value="" disabled>
                Choose a client…
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Due date" htmlFor="project-due" hint="Optional">
          <Input
            id="project-due"
            name="due_date"
            type="date"
            defaultValue={project?.due_date ?? ""}
          />
        </Field>
      </div>

      <Field label="Summary" htmlFor="project-summary" hint="Optional, shown to the client.">
        <Textarea
          id="project-summary"
          name="summary"
          rows={2}
          maxLength={400}
          defaultValue={project?.summary ?? ""}
          placeholder="What are we delivering, and by when?"
        />
      </Field>

      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}

      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
