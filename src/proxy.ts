import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk session middleware.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`; Clerk's docs use this file
 * for Next 16 and `middleware.ts` for 15 and below. The handler is unchanged.
 *
 * This deliberately does NOT gate routes with a path matcher. Clerk now
 * recommends authorizing at the resource that reads or changes the data, so
 * route protection lives in src/lib/authz.ts (`requireActor`, `requireStaff`,
 * `requireClient`) next to every query and mutation.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
