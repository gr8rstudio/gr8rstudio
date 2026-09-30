import { signup } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return <AuthForm mode="signup" action={signup} />;
}
