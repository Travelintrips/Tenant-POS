import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function RealtimeSync() {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const supabase = await getSupabaseClient();
      if (!supabase || cancelled) return;

      const channel = supabase
        .channel("db-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tenants" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["tenants"] });
            queryClient.invalidateQueries({ queryKey: ["floor-plan"] });
            queryClient.invalidateQueries({ queryKey: ["pos-overview"] });
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tenant_bookings" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
            queryClient.invalidateQueries({ queryKey: ["floor-plan"] });
            queryClient.invalidateQueries({ queryKey: ["pos-overview"] });
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tenant_payments" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            queryClient.invalidateQueries({ queryKey: ["pos-overview"] });
            queryClient.invalidateQueries({ queryKey: ["laporan-summary"] });
            queryClient.invalidateQueries({ queryKey: ["laporan-rekap"] });
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            console.log("[realtime] Terhubung ke Supabase Realtime ✓");
          }
        });

      if (cancelled) {
        supabase.removeChannel(channel);
        return;
      }

      channelRef.current = channel;
    }

    setup();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        getSupabaseClient().then((supabase) => {
          if (supabase && channelRef.current) {
            supabase.removeChannel(channelRef.current!);
          }
        });
        channelRef.current = null;
      }
    };
  }, [queryClient]);

  return null;
}
