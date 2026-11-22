"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Clock,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";

type WidgetMessage = {
  id: string;
  role: "customer" | "assistant";
  content: string;
  status: "greeting" | "received" | "auto_sent" | "pending_approval" | "error";
};

type WidgetChatClientProps = {
  storeId: string;
  storeName: string;
  initialLanguage: "es" | "en";
  channelId?: string;
  channelName?: string;
};

function subscribeNoop() {
  return () => {};
}

function getIsInIframeSnapshot() {
  return window.self !== window.top;
}

function getIsInIframeServerSnapshot() {
  return false;
}

function createGreetingMessage(
  storeName: string,
  language: "es" | "en"
): WidgetMessage {
  return {
    id: "greeting-initial",
    role: "assistant",
    status: "greeting",
    content:
      language === "en"
        ? `Hi! I'm the AI assistant for ${storeName}. How can I help you today?`
        : `¡Hola! Soy el asistente virtual de ${storeName}. ¿En qué puedo ayudarte hoy?`,
  };
}

export function WidgetChatClient({
  storeId,
  storeName,
  initialLanguage,
  channelId,
  channelName,
}: WidgetChatClientProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>(() => [
    createGreetingMessage(storeName, initialLanguage),
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const inIframe = useSyncExternalStore(
    subscribeNoop,
    getIsInIframeSnapshot,
    getIsInIframeServerSnapshot
  );

  const messageCounterRef = useRef(0);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  const isEn = initialLanguage === "en";

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const nextLocalId = (prefix: string) => {
    messageCounterRef.current += 1;
    return `${prefix}-${messageCounterRef.current}`;
  };

  const handleReset = () => {
    if (isSending) return;
    setConversationId(null);
    setMessages([createGreetingMessage(storeName, initialLanguage)]);
    setInput("");
  };

  const handleCloseIframe = () => {
    if (!inIframe) return;
    window.parent.postMessage({ type: "storeone:close" }, "*");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const optimisticUserMsg: WidgetMessage = {
      id: nextLocalId("customer"),
      role: "customer",
      content: trimmed,
      status: "received",
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          ...(channelId ? { channelId } : {}),
          ...(conversationId ? { conversationId } : {}),
          message: trimmed,
        }),
      });

      const payload = (await response.json()) as {
        conversationId?: string;
        messageId?: string;
        status?: "auto_sent" | "pending_approval";
        reply?: string;
        error?: string;
      };

      if (!response.ok || !payload.reply || !payload.status) {
        throw new Error(
          payload.error ||
            (isEn
              ? "Could not send your message. Please try again."
              : "No pudimos enviar tu mensaje. Intentá nuevamente.")
        );
      }

      if (payload.conversationId) {
        setConversationId(payload.conversationId);
      }

      const assistantMsg: WidgetMessage = {
        id: payload.messageId || nextLocalId("assistant"),
        role: "assistant",
        content: payload.reply,
        status: payload.status,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const fallbackError = isEn
        ? "Could not send your message. Please try again."
        : "No pudimos enviar tu mensaje. Intentá nuevamente.";
      const message =
        err instanceof Error && err.message ? err.message : fallbackError;

      setMessages((prev) => [
        ...prev,
        {
          id: nextLocalId("error"),
          role: "assistant",
          content: message,
          status: "error",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-white sm:border-x sm:border-slate-200">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 bg-indigo-600 px-4 py-3 text-white shadow-xs">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight text-white">
              {storeName}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-indigo-100">
              <span
                className="h-2 w-2 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              <span>
                {channelName
                  ? `${channelName} · StoreOne`
                  : isEn
                    ? "StoreOne AI Support"
                    : "Asistente StoreOne"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSending}
            title={isEn ? "New conversation" : "Nueva conversación"}
            aria-label={isEn ? "New conversation" : "Nueva conversación"}
            className="rounded-lg p-1.5 text-indigo-100 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>

          {inIframe && (
            <button
              type="button"
              onClick={handleCloseIframe}
              title={isEn ? "Close chat" : "Cerrar chat"}
              aria-label={isEn ? "Close chat" : "Cerrar chat"}
              className="rounded-lg p-1.5 text-indigo-100 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {/* Messages list */}
      <main className="flex-1 space-y-3 overflow-y-auto bg-slate-50/80 px-4 py-4">
        {messages.map((msg) => {
          if (msg.role === "customer") {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-xs">
                  {msg.content}
                </div>
              </div>
            );
          }

          if (msg.status === "pending_approval") {
            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm leading-relaxed text-amber-950 shadow-2xs">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {isEn ? "Forwarded to advisor" : "Derivado a un asesor"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            );
          }

          if (msg.status === "error") {
            return (
              <div key={msg.id} className="flex justify-start">
                <div className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-bl-sm border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm leading-relaxed text-rose-900">
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
                    aria-hidden="true"
                  />
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex justify-start">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-2xs">
                {msg.content}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-500 shadow-2xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" aria-hidden="true" />
              <span>{isEn ? "Typing..." : "Escribiendo..."}</span>
            </div>
          </div>
        )}

        <div ref={endOfMessagesRef} />
      </main>

      {/* Input footer */}
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
            placeholder={
              isEn ? "Type your question..." : "Escribí tu consulta..."
            }
            maxLength={4000}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || input.trim().length === 0}
            aria-label={isEn ? "Send message" : "Enviar mensaje"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </form>
        <p className="mt-1.5 text-center text-[11px] text-slate-400">
          Powered by StoreOne
        </p>
      </footer>
    </div>
  );
}
