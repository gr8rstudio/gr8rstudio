import { login } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return <AuthForm mode="login" action={login} />;
}
