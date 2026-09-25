import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export interface MallSite {
  id: number;
  code: string;
  name: string;
  type: string;
  status: string;
  companyName?: string;
}

export const ALL_SITES_SENTINEL: MallSite = {
  id: 0,
  code: "ALL",
  name: "Semua",
  type: "all",
  status: "active",
};

interface SiteContextValue {
  activeSite: MallSite | null;
  activeSiteId: number | null;
  sites: MallSite[];
  isLoading: boolean;
  setActiveSite: (site: MallSite) => void;
}

const LS_KEY = "mall_active_site_id";
const DEFAULT_SITE_CODE = "SPORT_CENTER_BANDARA";

const SiteContext = createContext<SiteContextValue>({
  activeSite: null,
  activeSiteId: null,
  sites: [],
  isLoading: true,
  setActiveSite: () => {},
});

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user } = useAuth();
  const bootstrapSites = Array.isArray(user?.sites)
    ? (user.sites as MallSite[]).filter((s) => s.status === "active")
    : [];

  const { data: fetchedSites = [], isLoading: sitesQueryLoading } = useQuery<MallSite[]>({
    queryKey: ["sites"],
    enabled: !!user && bootstrapSites.length === 0,
    queryFn: () => fetch("/api/sites", { credentials: "include" }).then((r) => {
      if (!r.ok) return [];
      return r.json().then((d: unknown) =>
        Array.isArray(d) ? (d as MallSite[]).filter((s) => s.status === "active") : []
      );
    }),
    staleTime: 5 * 60 * 1000,
  });

  const sites = bootstrapSites.length > 0 ? bootstrapSites : fetchedSites;
  const isLoading = !!user && bootstrapSites.length === 0 && sitesQueryLoading;

  const [activeSite, setActiveSiteState] = useState<MallSite | null>(null);

  // Once sites load, resolve the active site
  useEffect(() => {
    if (sites.length === 0) return;

    const stored = localStorage.getItem(LS_KEY);

    if (stored === "ALL") {
      setActiveSiteState(ALL_SITES_SENTINEL);
      return;
    }

    const storedId = Number(stored);
    const found = storedId ? sites.find((s) => s.id === storedId) : null;
    const defaultSite = sites.find((s) => s.code === DEFAULT_SITE_CODE) ?? sites[0];
    const resolvedSite = found ?? defaultSite;

    // Persist the resolved default too. Without this, the UI can show Sport
    // Center while apiFetch sends no x-site-id and the API falls back to TOD M1.
    if (resolvedSite) {
      localStorage.setItem(LS_KEY, String(resolvedSite.id));
    }
    setActiveSiteState(resolvedSite);
  }, [sites]);

  const setActiveSite = useCallback(
    (site: MallSite) => {
      const nextStoredSite = site.code === "ALL" ? "ALL" : String(site.id);
      const currentStoredSite = localStorage.getItem(LS_KEY);

      // Tidak perlu mengulang seluruh refetch bila lokasi yang dipilih sama.
      if (
        activeSite?.code === site.code &&
        activeSite?.id === site.id &&
        currentStoredSite === nextStoredSite
      ) {
        return;
      }

      // apiFetch membaca site dari localStorage. Persist dulu, lalu paksa React
      // commit activeSite sebelum invalidasi query. Tanpa urutan ini, query TOD
      // yang masih aktif dapat ter-refetch memakai header Sport Center (atau
      // sebaliknya) sebelum komponen berpindah ke query key site yang baru.
      localStorage.setItem(LS_KEY, nextStoredSite);
      flushSync(() => {
        setActiveSiteState(site);
      });

      // Hanya refetch query yang sedang aktif pada UI site yang BARU.
      // Cache site lama tetap ditandai stale bila dibuka lagi, tetapi tidak
      // menimbulkan request storm/background refetch.
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const root = String(query.queryKey[0] ?? "");
          return root !== "auth-me" && root !== "sites";
        },
        refetchType: "active",
      });
    },
    [activeSite, queryClient],
  );

  // activeSiteId: 0 for "ALL" (enables queries; API returns all-sites data), null while loading
  const activeSiteId = activeSite === null ? null : activeSite.code === "ALL" ? 0 : activeSite.id;

  return (
    <SiteContext.Provider
      value={{
        activeSite,
        activeSiteId,
        sites,
        isLoading,
        setActiveSite,
      }}
    >
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
