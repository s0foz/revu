"use client";

import { useActionState } from "react";

import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { Client } from "@/lib/types";
import type { ClientFormState } from "./actions";

export function ClientForm({
  action,
  client,
  submitLabel,
  compact = false,
}: {
  action: (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  client?: Client;
  submitLabel: string;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {client ? <input type="hidden" name="id" value={client.id} /> : null}

      <div className={compact ? "flex flex-col gap-4" : "grid gap-4 sm:grid-cols-3"}>
        <Field label="Client / company" htmlFor="client-name">
          <Input
            id="client-name"
            name="name"
            required
            maxLength={120}
            defaultValue={client?.name ?? ""}
            placeholder="Acme Corporation"
          />
        </Field>

        <Field label="Main contact" htmlFor="client-contact" hint="Optional">
          <Input
            id="client-contact"
            name="contact_name"
            maxLength={120}
            defaultValue={client?.contact_name ?? ""}
            placeholder="Dana Whitfield"
          />
        </Field>

        <Field
          label="Email"
          htmlFor="client-email"
          hint="They sign in with this address."
        >
          <Input
            id="client-email"
            name="email"
            type="email"
            required
            maxLength={200}
            defaultValue={client?.email ?? ""}
            placeholder="dana@acme.com"
            autoComplete="off"
          />
        </Field>
      </div>

      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}

      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
