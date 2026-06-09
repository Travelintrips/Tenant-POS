import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface MallSite {
  id: number;
  code: string;
  name: string;
  type: string;
  status: string;
}

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
    queryFn: () => fetch("/api/sites").then((r) => r.ok ? r.json() : []),
    staleTime: 5 * 60 * 1000,
  });

  const [activeSite, setActiveSiteState] = useState<MallSite | null>(null);

  // Once sites load, resolve the active site
  useEffect(() => {
    if (sites.length === 0) return;

    const storedId = Number(localStorage.getItem(LS_KEY));
    const found = storedId ? sites.find((s) => s.id === storedId) : null;
    const defaultSite = sites.find((s) => s.code === DEFAULT_SITE_CODE) ?? sites[0];

    setActiveSiteState(found ?? defaultSite);
  }, [sites]);

  const setActiveSite = useCallback(
    (site: MallSite) => {
      setActiveSiteState(site);
      localStorage.setItem(LS_KEY, String(site.id));
      // Invalidate all data queries so they reload for the new site
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  return (
    <SiteContext.Provider
      value={{
        activeSite,
        activeSiteId: activeSite?.id ?? null,
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
