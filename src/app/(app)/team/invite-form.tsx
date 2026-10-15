"use client";

import { useActionState } from "react";

import { Field, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { TeamFormState } from "./actions";

export function InviteForm({
  action,
}: {
  action: (state: TeamFormState, formData: FormData) => Promise<TeamFormState>;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field
          label="Email address"
          htmlFor="invite-email"
          hint="They must accept the invitation before they can sign in."
        >
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="teammate@youragency.com"
            autoComplete="off"
          />
        </Field>

        <Field label="Role" htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="org:member">
            <option value="org:member">Member</option>
            <option value="org:admin">Admin</option>
          </Select>
        </Field>
      </div>

      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}

      <div>
        <SubmitButton pendingLabel="Sending…">Send invitation</SubmitButton>
      </div>
    </form>
  );
}
