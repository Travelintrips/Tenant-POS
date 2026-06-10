import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface MallSite {
  id: number;
  code: string;
  name: string;
  type: string;
  status: string;
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

  const { data: sites = [], isLoading } = useQuery<MallSite[]>({
    queryKey: ["sites"],
    queryFn: () => fetch("/api/sites").then((r) => {
      if (!r.ok) return [];
      return r.json().then((d: unknown) => Array.isArray(d) ? d : []);
    }),
    staleTime: 5 * 60 * 1000,
  });

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

    setActiveSiteState(found ?? defaultSite);
  }, [sites]);

  const setActiveSite = useCallback(
    (site: MallSite) => {
      setActiveSiteState(site);
      localStorage.setItem(LS_KEY, site.code === "ALL" ? "ALL" : String(site.id));
      // Invalidate all data queries so they reload for the new site
      queryClient.invalidateQueries();
    },
    [queryClient],
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
