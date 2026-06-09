import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const INVALIDATION_MAP: Record<string, string[][]> = {
  payment_created: [
    ["tenant-pos-overview"],
    ["tenant-pos-floor-plan"],
    ["laporan-overview"],
    ["laporan-recent-payments"],
    ["laporan-kpi"],
    ["laporan-aging"],
    ["/api/tenant-invoices"],
    ["/api/bookings"],
  ],
  payment_voided: [
    ["tenant-pos-overview"],
    ["tenant-pos-floor-plan"],
    ["laporan-overview"],
    ["laporan-recent-payments"],
    ["laporan-kpi"],
    ["laporan-aging"],
    ["/api/tenant-invoices"],
    ["/api/bookings"],
  ],
  invoice_updated: [
    ["/api/tenant-invoices"],
    ["tenant-pos-floor-plan"],
    ["tenant-pos-overview"],
    ["laporan-kpi"],
  ],
  booking_updated: [
    ["/api/bookings"],
    ["tenant-pos-floor-plan"],
    ["tenant-pos-overview"],
  ],
  unit_updated: [
    ["tenant-pos-floor-plan"],
    ["tenant-pos-overview"],
  ],
};

export function RealtimeSync() {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(2000);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const es = new EventSource(`${BASE}/api/events`, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        reconnectDelay.current = 2000;
      });

      Object.entries(INVALIDATION_MAP).forEach(([eventType, keys]) => {
        es.addEventListener(eventType, () => {
          keys.forEach((key) =>
            queryClient.invalidateQueries({ queryKey: key }),
          );
        });
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!unmounted) {
          const delay = Math.min(reconnectDelay.current, 30000);
          reconnectDelay.current = delay * 2;
          reconnectTimer.current = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [queryClient]);

  return null;
}
