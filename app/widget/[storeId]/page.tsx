import { Suspense } from "react";
import { connection } from "next/server";
import { AlertCircle, Loader2 } from "lucide-react";
import { WidgetChatClient } from "@/components/widget/widget-chat-client";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import {
  widgetChannelIdSchema,
  widgetStoreIdSchema,
} from "@/lib/validation/ai";

export default function WidgetStorePage({
  params,
  searchParams,
}: PageProps<"/widget/[storeId]">) {
  return (
    <Suspense fallback={<WidgetLoadingState />}>
      <WidgetLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function WidgetLoadingState() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-slate-50 p-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2
          className="h-4 w-4 animate-spin text-indigo-600"
          aria-hidden="true"
        />
        <span>Loading chat...</span>
      </div>
    </div>
  );
}

function WidgetUnavailableState({ message }: { message: string }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="mt-3 text-base font-semibold text-slate-900">
          StoreMind AI
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}

async function WidgetLoader({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { storeId } = await params;
  const query = await searchParams;

  const validId = widgetStoreIdSchema.safeParse(storeId);
  if (!validId.success) {
    return (
      <WidgetUnavailableState message="El identificador de tienda no es válido / Invalid store ID." />
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return (
      <WidgetUnavailableState message="El chat no está configurado en el servidor / Widget is not configured." />
    );
  }

  const rawChannelParam = query.channelId;
  const rawChannelId = Array.isArray(rawChannelParam)
    ? rawChannelParam[0]
    : rawChannelParam;
  const validChannelId = rawChannelId
    ? widgetChannelIdSchema.safeParse(rawChannelId.trim())
    : null;

  const supabase = createAdminClient();
  const [storeResult, settingsResult, channelResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, language")
      .eq("id", validId.data)
      .maybeSingle(),
    supabase
      .from("ai_settings")
      .select("language")
      .eq("store_id", validId.data)
      .maybeSingle(),
    validChannelId?.success
      ? supabase
          .from("channels")
          .select("id, name, type")
          .eq("id", validChannelId.data)
          .eq("store_id", validId.data)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (storeResult.error || !storeResult.data) {
    return (
      <WidgetUnavailableState message="Tienda no encontrada / Store not found." />
    );
  }

  const store = storeResult.data;
  const resolvedChannel =
    !channelResult.error && channelResult.data ? channelResult.data : null;
  const settingsLang = settingsResult.data?.language;
  const initialLanguage: "es" | "en" =
    settingsLang === "es" || settingsLang === "en"
      ? settingsLang
      : store.language === "en"
        ? "en"
        : "es";

  return (
    <WidgetChatClient
      storeId={store.id}
      storeName={store.name}
      initialLanguage={initialLanguage}
      channelId={resolvedChannel?.id}
      channelName={resolvedChannel?.name}
    />
  );
}
