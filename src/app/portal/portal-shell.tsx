import Link from "next/link";
import { SignOutButton, UserButton } from "@clerk/nextjs";

import type { Agency, Client } from "@/lib/types";

/**
 * The client-facing chrome. Branding comes straight from the agency's row
 * (logo_url + brand_color), so a client sees the agency's identity and never
 * Revu's.
 *
 * Tailwind cannot turn a runtime hex value into a utility class, so the brand
 * colour is published as the `--brand` custom property here and consumed with
 * inline `style` where it matters (accent bar, avatar, primary actions).
 */
export function PortalShell({
  agency,
  client,
  children,
}: {
  agency: Agency;
  client: Client;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen flex-col bg-white"
      style={{ ["--brand" as string]: agency.brand_color }}
    >
      <div aria-hidden className="h-1 w-full" style={{ backgroundColor: "var(--brand)" }} />

      <header className="border-b border-slate-200">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/portal" className="flex items-center gap-3">
            {agency.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agency.logo_url}
                alt={agency.name}
                className="h-9 w-9 rounded-lg object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {agency.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="font-semibold tracking-tight">{agency.name}</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">
              {client.contact_name || client.name}
            </span>
            <UserButton />
            <SignOutButton redirectUrl="/">
              <button className="text-xs font-medium text-slate-500 hover:text-slate-900">
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-slate-200 py-6">
        <p className="mx-auto max-w-4xl px-6 text-xs text-slate-400">
          {agency.name} · deliverable review portal
        </p>
      </footer>
    </div>
  );
}
