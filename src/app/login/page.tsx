import Home from "../page";
import { AuthModal } from "@/components/auth-modal";
import { LoginBody, type LoginSP } from "@/components/auth-bodies";
export const metadata = { title: "Log in" };

/** Log in is always a pop-up over the (blurred) home page — on a click, a refresh or a direct link alike. */
export default async function Page({ searchParams }: { searchParams: Promise<LoginSP> }) {
  const sp = await searchParams;
  return <><Home /><AuthModal><LoginBody sp={sp} /></AuthModal></>;
}
