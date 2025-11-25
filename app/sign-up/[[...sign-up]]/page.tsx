import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <SignUp
        fallbackRedirectUrl="/invoice"
        signInUrl="/sign-in"
      />
    </div>
  );
}
