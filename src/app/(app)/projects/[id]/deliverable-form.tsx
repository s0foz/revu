"use client";

import { useActionState } from "react";

import { Field, Input, Notice, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { Deliverable } from "@/lib/types";
import type { ProjectFormState } from "../actions";

export function DeliverableForm({
  action,
  projectId,
  deliverable,
  submitLabel,
  compact = false,
}: {
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  projectId: string;
  deliverable?: Deliverable;
  submitLabel: string;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="project_id" value={projectId} />
      {deliverable ? (
        <>
          <input type="hidden" name="id" value={deliverable.id} />
          <input type="hidden" name="sort_order" value={deliverable.sort_order} />
        </>
      ) : null}

      <Field label="Title" htmlFor={`deliverable-title-${deliverable?.id ?? "new"}`}>
        <Input
          id={`deliverable-title-${deliverable?.id ?? "new"}`}
          name="title"
          required
          maxLength={120}
          defaultValue={deliverable?.title ?? ""}
          placeholder="Homepage concept"
        />
      </Field>

      <Field
        label="Brief"
        htmlFor={`deliverable-brief-${deliverable?.id ?? "new"}`}
        hint="What is being handed over. Optional."
      >
        <Textarea
          id={`deliverable-brief-${deliverable?.id ?? "new"}`}
          name="brief"
          rows={compact ? 2 : 3}
          maxLength={2000}
          defaultValue={deliverable?.brief ?? ""}
          placeholder="Two directions for the hero, above-the-fold layout and primary CTAs."
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
