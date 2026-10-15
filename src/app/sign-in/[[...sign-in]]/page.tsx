import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <SignIn
        appearance={{ elements: { rootBox: "mx-auto" } }}
        signUpUrl="/sign-up"
        forceRedirectUrl="/onboarding"
      />
    </main>
  );
}
