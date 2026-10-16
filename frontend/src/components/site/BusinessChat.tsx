import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessageCircle, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { getBusinessAnswer, type ChatAnswer } from "@/lib/businessChat";
import type { Client, Job } from "@/types";

type ChatMessage = {
  id: number;
  from: "visitor" | "assistant";
  text: string;
  actions?: ChatAnswer["actions"];
};

const STARTERS = ["What services do you offer?", "How do I apply for a job?", "I need workers", "Contact details"];

export default function BusinessChat({ jobs, clients }: { jobs: Job[] | null; clients: Client[] | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      from: "assistant",
      text: `Hi! I'm the ${BRAND.name} website assistant. Ask me about staffing, job applications, compliance or how to reach our team.`,
    },
  ]);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages.length]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const ask = (value: string) => {
    const question = value.trim();
    if (!question) return;
    const answer = getBusinessAnswer(question, jobs, clients);
    setMessages((previous) => [
      ...previous,
      { id: nextId.current++, from: "visitor", text: question },
      { id: nextId.current++, from: "assistant", text: answer.text, actions: answer.actions },
    ]);
    setDraft("");
    inputRef.current?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[60] sm:bottom-6 sm:right-6" data-testid="business-chat">
      {open ? (
        <section
          id="business-chat-panel"
          role="dialog"
          aria-label="Brothers Workforce Solutions chat"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className="flex h-[min(620px,calc(100dvh-5rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,36,68,0.30)]"
        >
          <div className="flex items-center gap-3 bg-[#0F2444] px-4 py-4 text-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C2410C]">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Ask Brothers Workforce</h2>
              <p className="text-xs text-slate-300">Website information and helpful links</p>
            </div>
            <button type="button" onClick={close} aria-label="Close chat" className="rounded-lg p-2 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F8FAFC] p-4" role="log" aria-live="polite" aria-label="Chat messages">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.from === "visitor" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${message.from === "visitor" ? "rounded-br-sm bg-[#0F2444] text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"}`}>
                  <p className="whitespace-pre-line">{message.text}</p>
                  {message.actions && message.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.actions.map((action) => (
                        <a
                          key={`${message.id}-${action.href}`}
                          href={action.href}
                          onClick={() => {
                            if (action.href.startsWith("#")) setOpen(false);
                          }}
                          target={action.href.startsWith("https://") ? "_blank" : undefined}
                          rel={action.href.startsWith("https://") ? "noopener noreferrer" : undefined}
                          className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-[#9A3412] transition-colors hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA580C]"
                        >
                          {action.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
                {STARTERS.map((question) => (
                  <button key={question} type="button" onClick={() => ask(question)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-[#0F2444] shadow-sm hover:border-[#EA580C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA580C]">
                    {question}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="border-t border-slate-200 bg-white p-3">
            <label htmlFor="business-chat-input" className="sr-only">Ask a business question</label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                id="business-chat-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={300}
                placeholder="Ask about jobs, staffing, services..."
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-[#0F2444] outline-none focus:border-[#EA580C] focus:ring-2 focus:ring-orange-100"
              />
              <button type="submit" disabled={!draft.trim()} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C2410C] text-white hover:bg-[#9A3412] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA580C] disabled:cursor-not-allowed disabled:opacity-50">
                <ArrowUp className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-500">Questions stay in this browser tab. Please use the application form for personal details.</p>
          </form>
        </section>
      ) : (
        <button
          ref={launcherRef}
          type="button"
          aria-label="Open business chat"
          aria-expanded={false}
          aria-controls="business-chat-panel"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-[#C2410C] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(15,36,68,0.28)] transition-transform hover:-translate-y-0.5 hover:bg-[#9A3412] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA580C]"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Ask us
        </button>
      )}
    </div>
  );
}
