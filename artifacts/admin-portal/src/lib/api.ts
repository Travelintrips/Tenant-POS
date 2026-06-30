/**
 * apiFetch — wrapper di sekitar fetch() yang otomatis mengirim
 * header x-site-id berdasarkan active site yang tersimpan di localStorage.
 * Juga otomatis menyertakan credentials: "include" untuk sesi auth.
 *
 * Digunakan oleh semua halaman untuk semua request ke /api/*.
 * Saat user mengganti site, SiteProvider invalidates semua query
 * sehingga halaman otomatis reload dengan site baru.
 */

const LS_KEY = "mall_active_site_id";

export function getActiveSiteId(): string | null {
  return localStorage.getItem(LS_KEY);
}

export function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const siteId = getActiveSiteId();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (siteId === "ALL") {
    headers["x-site-code"] = "ALL";
  } else if (siteId) {
    headers["x-site-id"] = siteId;
  }
  return fetch(url, { credentials: "include", ...options, headers });
}

/** Shorthand: apiFetch + parse JSON */
export async function apiFetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // coba parse JSON error dulu untuk pesan yang lebih informatif
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      const msg = json.error ?? json.message ?? text;
      throw new Error(msg || `HTTP ${res.status}`);
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        throw new Error(text || `HTTP ${res.status}`);
      }
      throw parseErr;
    }
  }
  return res.json() as Promise<T>;
}
