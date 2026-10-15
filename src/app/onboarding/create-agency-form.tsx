"use client";

import { useActionState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";

import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { AgencySetupState } from "./actions";

/**
 * Runs a create-agency server action and then activates the returned Clerk
 * organization. Clerk only exposes session activation to the client, so the
 * handshake is: server creates the org + row, client calls `setActive`, then
 * navigates into the dashboard.
 */
export function AgencySetupForm({
  action,
  submitLabel,
  defaultName = "",
  intro,
}: {
  action: (state: AgencySetupState, formData: FormData) => Promise<AgencySetupState>;
  submitLabel: string;
  defaultName?: string;
  intro: string;
}) {
  const { setActive } = useClerk();
  const router = useRouter();

  const run = useCallback(
    async (previous: AgencySetupState, formData: FormData): Promise<AgencySetupState> => {
      const result = await action(previous, formData);

      if (!result.organizationId) return result;

      try {
        await setActive({ organization: result.organizationId });
      } catch (error) {
        console.error("[onboarding] failed to activate organization", error);
        return {
          error:
            "Your agency was created but we could not switch to it. Reload the page and select it.",
        };
      }

      router.replace("/dashboard");
      router.refresh();
      return result;
    },
    [action, setActive, router],
  );

  const [state, formAction, pending] = useActionState(run, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">{intro}</p>

      <Field
        label="Agency name"
        htmlFor="name"
        hint="Shown to your clients. You can change it later in Settings."
      >
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={defaultName}
          placeholder="Northwind Studio"
          autoComplete="organization"
        />
      </Field>

      {state.error ? <Notice>{state.error}</Notice> : null}
      {pending ? (
        <Notice tone="info">Creating your workspace…</Notice>
      ) : null}

      <SubmitButton pendingLabel="Creating…">{submitLabel}</SubmitButton>
    </form>
  );
}
