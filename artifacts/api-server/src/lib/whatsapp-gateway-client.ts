import { logger } from "./logger";

export interface GatewaySendResult {
  ok: boolean;
  skipped?: boolean;
  queued?: boolean;
  duplicate?: boolean;
  messageId?: string | null;
  response?: unknown;
  error?: string;
}

export interface GatewayStatus {
  configured: boolean;
  connected: boolean | null;
  provider: "CST WA Gateway";
  message: string;
  onlineWorkers?: number;
  queueCount?: number;
  workers?: Array<Record<string, unknown>>;
}

function gatewayBaseUrl(): string {
  return (process.env.CST_WA_GATEWAY_URL ?? "https://wa.cstlogistic.co.id").replace(/\/+$/, "");
}

function gatewayApiKey(): string {
  return process.env.CST_WA_GATEWAY_API_KEY?.trim() ?? "";
}

function gatewayDeviceId(): string | undefined {
  const value = process.env.CST_WA_DEVICE_ID?.trim();
  return value || undefined;
}

export function isCstWaGatewayConfigured(): boolean {
  return gatewayApiKey().length > 0;
}

export function normalizeWhatsappDestination(value: string): string {
  const trimmed = value.trim();
  if (/^[0-9]+(?:-[0-9]+)?@g\.us$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return "62" + digits;
}

async function gatewayFetch(
  path: string,
  init: RequestInit = {},
  requireAuth = true,
): Promise<Response> {
  const key = gatewayApiKey();
  if (requireAuth && !key) {
    throw new Error("CST_WA_GATEWAY_API_KEY belum dikonfigurasi");
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.CST_WA_GATEWAY_TIMEOUT_MS ?? "15000");
  const timeoutId = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000);

  try {
    return await fetch(`${gatewayBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(requireAuth ? { Authorization: `Bearer ${key}` } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function responseError(data: Record<string, unknown>, status: number): string {
  const raw = data["error"] ?? data["message"] ?? data["detail"] ?? `HTTP ${status}`;
  return `CST WA Gateway: ${String(raw)}`;
}

async function sendPayload(
  payload: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<GatewaySendResult> {
  if (!isCstWaGatewayConfigured()) {
    logger.warn("[wa-gateway] CST_WA_GATEWAY_API_KEY belum dikonfigurasi");
    return { ok: true, skipped: true, error: "CST_WA_GATEWAY_API_KEY belum dikonfigurasi" };
  }

  try {
    const res = await gatewayFetch("/v1/messages", {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      body: JSON.stringify({
        ...(gatewayDeviceId() ? { deviceId: gatewayDeviceId() } : {}),
        ...payload,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const error = responseError(data, res.status);
      logger.error({ status: res.status, data }, "[wa-gateway] pengiriman gagal");
      return { ok: false, error, response: data };
    }

    const status = String(data["status"] ?? "").toLowerCase();
    const messageId = typeof data["messageId"] === "string" ? data["messageId"] : null;
    const duplicate = status === "duplicate";
    const queued = status === "queued" || duplicate;

    if (!queued) {
      return {
        ok: false,
        error: `CST WA Gateway mengembalikan status tidak dikenal: ${status || "kosong"}`,
        response: data,
      };
    }

    return { ok: true, queued, duplicate, messageId, response: data };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const error = isTimeout
      ? "CST WA Gateway timeout"
      : err instanceof Error
        ? err.message
        : String(err);
    logger.error({ err }, "[wa-gateway] request gagal");
    return { ok: false, error };
  }
}

export async function sendGatewayText(
  to: string,
  text: string,
  idempotencyKey?: string,
): Promise<GatewaySendResult> {
  return sendPayload(
    {
      to: normalizeWhatsappDestination(to),
      type: "text",
      text,
    },
    idempotencyKey,
  );
}

function mediaDescriptor(fileUrl: string): {
  type: "image" | "video" | "audio" | "document";
  fileName?: string;
  mimetype?: string;
} {
  let pathname = "";
  try {
    pathname = new URL(fileUrl).pathname.toLowerCase();
  } catch {
    pathname = fileUrl.toLowerCase();
  }
  const fileName = decodeURIComponent(pathname.split("/").pop() || "lampiran");

  if (/\.(png|jpe?g|webp)$/i.test(pathname)) {
    const mimetype = pathname.endsWith(".png")
      ? "image/png"
      : pathname.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return { type: "image", mimetype };
  }
  if (/\.(mp4|mov|webm)$/i.test(pathname)) {
    return { type: "video", mimetype: pathname.endsWith(".webm") ? "video/webm" : "video/mp4" };
  }
  if (/\.(mp3|ogg|m4a|wav)$/i.test(pathname)) {
    return { type: "audio", mimetype: pathname.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg" };
  }
  return {
    type: "document",
    fileName,
    mimetype: pathname.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
  };
}

export async function sendGatewayMedia(
  to: string,
  caption: string,
  fileUrl: string,
  idempotencyKey?: string,
): Promise<GatewaySendResult> {
  const media = mediaDescriptor(fileUrl);
  return sendPayload(
    {
      to: normalizeWhatsappDestination(to),
      type: media.type,
      mediaUrl: fileUrl,
      ...(caption ? { caption } : {}),
      ...(media.fileName ? { fileName: media.fileName } : {}),
      ...(media.mimetype ? { mimetype: media.mimetype } : {}),
    },
    idempotencyKey,
  );
}

export async function getCstWaGatewayStatus(): Promise<GatewayStatus> {
  const configured = isCstWaGatewayConfigured();
  try {
    const res = await gatewayFetch("/v1/status", { method: "GET" }, false);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const workers = Array.isArray(data["workers"])
      ? (data["workers"] as Array<Record<string, unknown>>)
      : [];
    const onlineWorkers = Number(data["onlineWorkers"] ?? 0);
    const queue = (data["queue"] ?? {}) as Record<string, unknown>;
    const queueCount =
      Number(queue["waiting"] ?? 0) +
      Number(queue["active"] ?? 0) +
      Number(queue["delayed"] ?? 0);
    // /v1/status sengaja mengembalikan HTTP 503 jika overall gateway degraded,
    // misalnya satu device QR_REQUIRED. Selama masih ada worker ONLINE,
    // Tenant-POS tetap memiliki jalur pengiriman WhatsApp yang aktif.
    const connected = onlineWorkers > 0;
    const overallStatus = String(data["overallStatus"] ?? "unknown");

    return {
      configured,
      connected,
      provider: "CST WA Gateway",
      message: connected
        ? overallStatus === "operational"
          ? "WhatsApp aktif melalui CST WA Gateway"
          : `CST WA Gateway degraded, tetapi ${onlineWorkers} worker WhatsApp masih online`
        : "CST WA Gateway belum memiliki worker WhatsApp online",
      onlineWorkers,
      queueCount,
      workers,
    };
  } catch (err) {
    return {
      configured,
      connected: null,
      provider: "CST WA Gateway",
      message: err instanceof Error ? err.message : "Tidak dapat menghubungi CST WA Gateway",
    };
  }
}

export async function verifyCstWaInboundEvent(
  eventId: string,
  incomingPayload: unknown,
): Promise<boolean> {
  if (!eventId || !isCstWaGatewayConfigured()) return false;

  try {
    const res = await gatewayFetch(`/v1/inbound-events/${encodeURIComponent(eventId)}`, {
      method: "GET",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as Record<string, unknown>;
    return JSON.stringify(data["payload"]) === JSON.stringify(incomingPayload);
  } catch (err) {
    logger.warn({ err, eventId }, "[wa-gateway] verifikasi inbound event gagal");
    return false;
  }
}
