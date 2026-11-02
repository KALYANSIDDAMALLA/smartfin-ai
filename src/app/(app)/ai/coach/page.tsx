import { redirect } from "next/navigation";

/** The coach lives on the "AI analysis" page (its original name), so this older address just forwards there. */
export default function CoachRedirect() { redirect("/ai/analysis"); }
