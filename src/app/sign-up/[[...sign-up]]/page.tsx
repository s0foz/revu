import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <SignUp
        appearance={{ elements: { rootBox: "mx-auto" } }}
        signInUrl="/sign-in"
        forceRedirectUrl="/onboarding"
      />
    </main>
  );
}
