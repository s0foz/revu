import Link from "next/link";
import { OrganizationSwitcher, SignOutButton, UserButton } from "@clerk/nextjs";

import { requireStaff } from "@/lib/authz";
import { STAFF_ROLE_LABELS } from "@/lib/constants";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/team", label: "Team", adminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight">
            Revu
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
            {NAV.filter((item) => !item.adminOnly || staff.isAdmin).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <OrganizationSwitcher
              hidePersonal
              afterSelectOrganizationUrl="/dashboard"
              afterCreateOrganizationUrl="/onboarding"
            />
            <span className="hidden text-xs text-slate-500 sm:inline">
              {STAFF_ROLE_LABELS[staff.staffRole]}
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-slate-200 py-6">
        <p className="mx-auto max-w-6xl px-6 text-xs text-slate-400">
          {staff.agency.name} · {staff.agency.slug} · plan {staff.agency.plan}
        </p>
      </footer>
    </div>
  );
}
