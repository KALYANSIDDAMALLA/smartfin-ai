import { AuthForm } from "@/components/auth-form";
import { GoogleButton } from "@/components/google-button";
import { register } from "@/app/actions/auth";
export const metadata = { title: "Create account" };
export default function Page() { return <><AuthForm mode="register" action={register} /><GoogleButton /></>; }
