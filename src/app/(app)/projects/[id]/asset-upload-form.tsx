"use client";

import { useActionState, useEffect, useRef } from "react";

import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { ProjectFormState } from "../actions";

/**
 * Uploads one file into the private `assets` bucket via a server action. The
 * action authorises the staff member, stores the object and records the row; the
 * file itself never becomes public — downloads go through a signed URL.
 */
export function AssetUploadForm({
  action,
  deliverableId,
}: {
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  deliverableId: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the picked file once the upload lands, so the same form can be reused.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="deliverable_id" value={deliverableId} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          required
          aria-label="Choose a file"
          className="min-w-0 flex-1 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:border-slate-400"
        />
        <SubmitButton variant="secondary" pendingLabel="Uploading…">
          Upload
        </SubmitButton>
      </div>

      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
    </form>
  );
}
