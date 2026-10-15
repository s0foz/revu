import { SignOutButton } from "@clerk/nextjs";

import { Card } from "@/components/ui";

/**
 * A signed-in Clerk user that no agency has added as a client yet. There is no
 * portal to show, so say so plainly rather than bouncing them around.
 */
export function NotConnected() {
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-16">
      <Card className="p-8 text-center">
        <h1 className="text-lg font-semibold">You are not connected yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ask your agency to add this email address as a client. Once they do,
          signing in again will open your portal.
        </p>
        <p className="mt-4 text-xs text-slate-400">
          Signed in with a different address? Sign out and try again.
        </p>
        <div className="mt-6 flex justify-center">
          <SignOutButton redirectUrl="/">
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </Card>
    </main>
  );
}
