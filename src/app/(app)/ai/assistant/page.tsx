import { requireUser } from "@/lib/server/auth";
import { askAssistant, clearConversations } from "@/app/actions/ai";
import { AiStatus } from "@/components/ai-status";
import { ActionForm } from "@/components/action-form";
import { Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";

const EXAMPLES = ["How much did I spend this month?", "Which category increased the most?", "Compare this month with last month", "How much did I spend using UPI?", "What recurring payments do I have?", "Suggest a realistic budget based on my recent spending"];

export default async function Assistant({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 300);
  const { supabase } = await requireUser();
  const { data: conv } = await supabase.from("ai_conversations").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: msgs } = conv ? await supabase.from("ai_messages").select("id,role,content").eq("conversation_id", conv.id).order("created_at") : { data: [] };
  return (
    <>
      <PageHeader title="AI assistant" desc="Ask about your own records. Answers use verified calculations over your data only." action={msgs?.length ? <ActionForm action={clearConversations} submit="Clear history" variant="outline" confirm="Delete all assistant history?" /> : undefined} />
      <AiStatus />
      <Card>
        {!msgs?.length ? <EmptyState title="Ask a question" hint={EXAMPLES.join(" · ")} /> : <ul className="mb-4 grid gap-3" aria-live="polite">{msgs.map((m) => <li key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-brand/10 px-3 py-2 text-sm" : "max-w-[85%] whitespace-pre-line rounded-xl bg-surface2 px-3 py-2 text-sm"}>{m.content}</li>)}</ul>}
        <ActionForm action={askAssistant} submit="Ask" className="mt-4">{conv && <input type="hidden" name="conversationId" value={conv.id} />}<Field label="Your question"><Input name="question" defaultValue={q} required minLength={3} maxLength={300} placeholder="How much did I spend on groceries this year?" /></Field></ActionForm>
      </Card>
    </>
  );
}
