import { AuthForm } from "@/components/auth-form";
import { resetPassword } from "@/app/actions/auth";
export const metadata = { title: "Reset password" };
export default function Page() { return <AuthForm mode="reset" action={resetPassword} />; }
