import { Sparkles } from "lucide-react";
import { aiStatus } from "@/lib/server/ai";
import { Badge } from "./ui";

/**
 * Tells people, in plain words, whether written AI summaries are on. Everyday users only see a short friendly note; the technical
 * setup steps for whoever runs the app are tucked into a collapsed section. Never exposes keys.
 */
export function AiStatus() {
  const s = aiStatus();
  if (s.configured) return <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted"><Sparkles size={14} className="text-brand" aria-hidden /><Badge tone="good">AI summaries on</Badge>Written by {s.provider} ({s.model}) and checked against your own numbers.</p>;
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-sm">
      <p className="flex flex-wrap items-center gap-2"><Sparkles size={15} className="text-brand" aria-hidden /><b>Your analysis is ready.</b><Badge tone="info">Smart analysis</Badge></p>
      <p className="mt-1 text-muted">Every figure below is worked out from your own transactions. AI-written summaries are switched off for now, and nothing here depends on them.</p>
      <details className="mt-2"><summary className="cursor-pointer text-brand">App owner? How to switch AI summaries on</summary>
        <ol className="mt-2 list-decimal pl-5 text-muted">
          <li>Get a free key at <a className="font-medium text-brand underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>.</li>
          <li>Add <code>GEMINI_API_KEY=your-key</code> to <code>.env.local</code>, or <code>OPENAI_API_KEY=your-key</code> for OpenAI (get one at <a className="font-medium text-brand underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com/api-keys</a>). With both set, add <code>AI_PROVIDER=openai</code> to use OpenAI first; the other is the backup.</li>
          <li>Restart the app and reload this page.</li>
        </ol></details>
    </div>
  );
}
