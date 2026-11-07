import SignUp from "@/components/ui/sign-up-1";

export default function SignUpPage() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center synapse-auth-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
      <SignUp mode="signup" />
    </div>
  );
}
