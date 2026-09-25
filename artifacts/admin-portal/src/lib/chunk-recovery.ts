import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RECOVERY_KEY = "tenant-pos:chunk-recovery-at";
const RECOVERY_PARAM = "__chunk_reload";
const RECOVERY_WINDOW_MS = 30_000;
const STABLE_BOOT_MS = 8_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

export function isChunkLoadError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("failed to load module script") ||
    message.includes("chunkloaderror") ||
    (message.includes("/assets/") && message.includes(".js") && message.includes("failed"))
  );
}

export function recoverFromChunkError(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;

  const now = Date.now();
  let previous = 0;
  try {
    previous = Number(window.sessionStorage.getItem(RECOVERY_KEY) ?? "0");
  } catch {
    // sessionStorage can be unavailable in strict/private browser modes.
  }

  // Satu automatic recovery per window pendek. Jika deploy/proxy tetap bermasalah,
  // ErrorBoundary akan tampil dan tidak membuat browser masuk reload loop.
  if (previous > 0 && now - previous < RECOVERY_WINDOW_MS) return false;

  try {
    window.sessionStorage.setItem(RECOVERY_KEY, String(now));
  } catch {
    // Best effort only.
  }

  const url = new URL(window.location.href);
  url.searchParams.set(RECOVERY_PARAM, String(now));
  window.location.replace(url.toString());
  return true;
}

export function lazyWithRecovery<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (recoverFromChunkError(error)) {
        // Navigasi reload sudah dimulai; jangan biarkan React menampilkan error screen
        // selama dokumen baru sedang dimuat.
        return await new Promise<{ default: T }>(() => undefined);
      }
      throw error;
    }
  });
}

export function installChunkRecoveryListeners(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onVitePreloadError = (event: Event) => {
    const preloadEvent = event as Event & { payload?: unknown };
    if (recoverFromChunkError(preloadEvent.payload ?? event)) {
      event.preventDefault();
    }
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (recoverFromChunkError(event.reason)) {
      event.preventDefault();
    }
  };

  window.addEventListener("vite:preloadError", onVitePreloadError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  const stableTimer = window.setTimeout(() => {
    try {
      window.sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      // Best effort only.
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has(RECOVERY_PARAM)) {
      url.searchParams.delete(RECOVERY_PARAM);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, STABLE_BOOT_MS);

  return () => {
    window.clearTimeout(stableTimer);
    window.removeEventListener("vite:preloadError", onVitePreloadError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
