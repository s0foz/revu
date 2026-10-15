"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

const VARIANTS = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 disabled:opacity-60",
  danger: "bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-300",
} as const;

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  confirm,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof VARIANTS;
  className?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
