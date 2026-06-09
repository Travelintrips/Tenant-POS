/**
 * apiFetch — wrapper di sekitar fetch() yang otomatis mengirim
 * header x-site-id berdasarkan active site yang tersimpan di localStorage.
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
  if (siteId) {
    headers["x-site-id"] = siteId;
  }
  return fetch(url, { ...options, headers });
}
