import Link from "next/link";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";

const FEATURES = [
  {
    title: "A portal per client",
    body: "Every client gets their own branded login. No more shared drives, no more “which version is latest”.",
  },
  {
    title: "Approvals that are recorded",
    body: "Clients approve work or request changes with one click. Every decision is timestamped and attributed.",
  },
  {
    title: "Feedback in context",
    body: "Comments sit next to the deliverable they are about, with the file right there.",
  },
  {
    title: "Built for your team",
    body: "Your staff sign in once and see every client. Roles keep the right people in the right place.",
  },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    detail: "Try Revu on a single project.",
    features: ["1 staff seat", "1 client", "Deliverable approvals"],
  },
  {
    name: "Starter",
    price: "$29",
    detail: "per month",
    features: ["Up to 5 clients", "Unlimited projects", "Comments & activity feed"],
  },
  {
    name: "Unlimited",
    price: "$79",
    detail: "per month",
    features: ["Unlimited clients", "Priority support", "Everything in Starter"],
  },
];

export default function LandingPage() {
  return (
    <div className="flex-1">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold tracking-tight">
          Revu
          <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wider text-white">
            beta
          </span>
        </span>
        <nav className="flex items-center gap-3 text-sm">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:text-slate-900">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700">
                Start free
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
            >
              Go to dashboard
            </Link>
          </Show>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6">
        <section className="py-16 sm:py-24">
          <p className="mb-4 inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            Client portals for agencies
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Stop chasing approvals in email threads.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            Revu gives each of your clients a login to review deliverables,
            approve work and leave feedback — in one branded place your agency
            controls.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Show when="signed-out">
              <SignUpButton mode="modal">
                <button className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500">
                  Create your agency
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500"
              >
                Open your dashboard
              </Link>
            </Show>
            <a
              href="#pricing"
              className="rounded-lg border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700 hover:border-slate-300"
            >
              See pricing
            </a>
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <h2 className="font-medium">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {feature.body}
              </p>
            </div>
          ))}
        </section>

        <section id="pricing" className="pb-24">
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-2 text-sm text-slate-600">
            Billing arrives in Phase 4. These are the tiers the schema already
            supports.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6"
              >
                <span className="text-sm font-medium text-slate-600">
                  {tier.name}
                </span>
                <span className="mt-3 text-3xl font-semibold tracking-tight">
                  {tier.price}
                </span>
                <span className="text-xs text-slate-500">{tier.detail}</span>
                <ul className="mt-6 space-y-2 text-sm text-slate-600">
                  {tier.features.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden className="text-emerald-500">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8">
        <p className="mx-auto max-w-6xl px-6 text-xs text-slate-500">
          Revu — built with Next.js, Clerk and Supabase.
        </p>
      </footer>
    </div>
  );
}
