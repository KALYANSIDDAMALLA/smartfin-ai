import { AuthForm } from "@/components/auth-form";
import { forgotPassword } from "@/app/actions/auth";
export const metadata = { title: "Forgot password" };
export default function Page() { return <AuthForm mode="forgot" action={forgotPassword} />; }
