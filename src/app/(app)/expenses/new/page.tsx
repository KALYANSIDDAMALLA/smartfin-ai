import { requireUser } from "@/lib/server/auth";
import { loadLookups, loadMerchants } from "@/lib/server/data";
import { PageHeader } from "@/components/ui";
import { PasteTx } from "@/components/paste-tx";
import { aiStatus } from "@/lib/server/ai";
import { draftStart } from "@/lib/server/drafts";

export default async function NewExpense({ searchParams }: { searchParams: Promise<{ draft?: string; date?: string; amount?: string }> }) {
  const sp = await searchParams; const { supabase } = await requireUser();
  const [lookups, start, merchants] = await Promise.all([loadLookups(supabase), draftStart(supabase, sp), loadMerchants(supabase, "expense")]);
  return (<><PageHeader title={start?.draftId ? "Finish your draft" : "Add expense"} desc={start?.draftId ? "Check the details, then save it as a real transaction." : "Record money you spent — type it in, or paste your bank/UPI alert."} /><PasteTx lookups={lookups} mode="expense" ai={aiStatus().configured} start={start} merchants={merchants} /></>);
}
