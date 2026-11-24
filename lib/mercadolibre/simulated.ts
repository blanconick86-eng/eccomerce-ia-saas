export const DEFAULT_MELI_CHANNEL_NAME = "Mercado Libre · Tienda";
export const DEFAULT_MELI_SELLER_NICKNAME = "MI_TIENDA_ML";

export type MercadoLibreMode = "simulated" | "live";

export type MercadoLibreChannelCredentials = {
  mode: MercadoLibreMode;
  seller_nickname: string;
};

export type MercadoLibreThreadMeta = {
  item_title: string;
  buyer_nickname: string;
  mode: MercadoLibreMode;
};

/**
 * Parses Mercado Libre channel credentials stored in Supabase `channels.credentials`.
 */
export function parseMercadoLibreCredentials(
  raw: unknown
): MercadoLibreChannelCredentials | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (record.mode !== "simulated" && record.mode !== "live") {
    return null;
  }

  const sellerNickname =
    typeof record.seller_nickname === "string" && record.seller_nickname.trim()
      ? record.seller_nickname.trim()
      : DEFAULT_MELI_SELLER_NICKNAME;

  return {
    mode: record.mode,
    seller_nickname: sellerNickname,
  };
}

/**
 * Returns true when a Mercado Libre channel is configured in simulated mode.
 */
export function isSimulatedMercadoLibreChannel(credentials: unknown): boolean {
  return parseMercadoLibreCredentials(credentials)?.mode === "simulated";
}

/**
 * Encodes Mercado Libre question metadata inside `conversations.external_thread_id`.
 */
export function encodeMercadoLibreThreadMeta(meta: {
  itemTitle: string;
  buyerNickname: string;
  mode?: MercadoLibreMode;
}): string {
  return JSON.stringify({
    item_title: meta.itemTitle.trim(),
    buyer_nickname: meta.buyerNickname.trim(),
    mode: meta.mode ?? "simulated",
  });
}

/**
 * Parses Mercado Libre listing/buyer metadata from `conversations.external_thread_id`.
 */
export function parseMercadoLibreThreadMeta(
  raw: string | null | undefined
): MercadoLibreThreadMeta | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const rawItemTitle =
      typeof record.item_title === "string"
        ? record.item_title
        : typeof record.itemTitle === "string"
          ? record.itemTitle
          : "";
    const rawBuyerNickname =
      typeof record.buyer_nickname === "string"
        ? record.buyer_nickname
        : typeof record.buyerNickname === "string"
          ? record.buyerNickname
          : "";

    const itemTitle = rawItemTitle.trim();
    const buyerNickname = rawBuyerNickname.trim();

    if (!itemTitle && !buyerNickname) {
      return null;
    }

    const mode: MercadoLibreMode =
      record.mode === "live" ? "live" : "simulated";

    return {
      item_title: itemTitle,
      buyer_nickname: buyerNickname,
      mode,
    };
  } catch {
    return null;
  }
}

/**
 * Formats an incoming Mercado Libre buyer question with its listing title as product context.
 */
export function formatMercadoLibreQuestionMessage(params: {
  itemTitle: string;
  questionText: string;
}): string {
  return `Publicación: ${params.itemTitle.trim()}\n\n${params.questionText.trim()}`;
}
