"use client";

import { useActionState } from "react";

import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { Agency } from "@/lib/types";
import type { SettingsFormState } from "./actions";

export function SettingsForm({
  action,
  agency,
}: {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  agency: Agency;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Agency name" htmlFor="agency-name">
          <Input
            id="agency-name"
            name="name"
            required
            minLength={2}
            maxLength={60}
            defaultValue={agency.name}
          />
        </Field>

        <Field
          label="Slug"
          htmlFor="agency-slug"
          hint="Lowercase letters, numbers and hyphens."
        >
          <Input
            id="agency-slug"
            name="slug"
            required
            defaultValue={agency.slug}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
          />
        </Field>
      </div>

      <Field
        label="Logo URL"
        htmlFor="agency-logo"
        hint="Shown in the header of your clients' portal. Leave empty for a monogram. Must be https."
      >
        <Input
          id="agency-logo"
          name="logo_url"
          type="url"
          maxLength={500}
          defaultValue={agency.logo_url ?? ""}
          placeholder="https://cdn.example.com/logo.png"
        />
      </Field>

      <Field
        label="Brand colour"
        htmlFor="agency-brand-color"
        hint="Used to theme your clients' portal."
      >
        <div className="flex items-center gap-3">
          <input
            id="agency-brand-color"
            name="brand_color"
            type="color"
            defaultValue={agency.brand_color}
            className="h-10 w-16 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
          />
          <span className="text-xs text-slate-500">{agency.brand_color}</span>
        </div>
      </Field>

      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}

      <div>
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  );
}
