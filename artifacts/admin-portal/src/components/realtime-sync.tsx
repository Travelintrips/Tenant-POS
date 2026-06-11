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
    ["laporan-summary"],
    ["laporan-piutang"],
    ["laporan-summary-dashboard"],
    ["/api/tenant-invoices"],
    ["/api/bookings"],
    ["pending-payments-sidebar-count"],
    ["dashboard-summary"],
  ],
  payment_voided: [
    ["tenant-pos-overview"],
    ["tenant-pos-floor-plan"],
    ["laporan-overview"],
    ["laporan-recent-payments"],
    ["laporan-kpi"],
    ["laporan-aging"],
    ["laporan-summary"],
    ["laporan-piutang"],
    ["laporan-summary-dashboard"],
    ["/api/tenant-invoices"],
    ["/api/bookings"],
    ["pending-payments-sidebar-count"],
    ["dashboard-summary"],
  ],
  payment_approved: [
    ["pending-payments"],
    ["pending-payments-counts"],
    ["pending-payments-sidebar-count"],
    ["tenant-pos-overview"],
    ["tenant-pos-floor-plan"],
    ["laporan-overview"],
    ["laporan-recent-payments"],
    ["laporan-kpi"],
    ["laporan-aging"],
    ["laporan-summary"],
    ["laporan-piutang"],
    ["laporan-summary-dashboard"],
    ["/api/tenant-invoices"],
    ["dashboard-summary"],
    ["invoice-upcoming-notification"],
  ],
  payment_rejected: [
    ["pending-payments"],
    ["pending-payments-counts"],
    ["pending-payments-sidebar-count"],
    ["tenant-pos-overview"],
    ["/api/tenant-invoices"],
    ["laporan-overview"],
    ["laporan-kpi"],
    ["dashboard-summary"],
  ],
  payment_proof_submitted: [
    ["pending-payments"],
    ["pending-payments-counts"],
    ["pending-payments-sidebar-count"],
  ],
  invoice_updated: [
    ["/api/tenant-invoices"],
    ["tenant-pos-floor-plan"],
    ["tenant-pos-overview"],
    ["laporan-kpi"],
    ["laporan-overview"],
    ["laporan-aging"],
    ["laporan-summary"],
    ["laporan-piutang"],
    ["laporan-summary-dashboard"],
    ["invoice-upcoming-notification"],
    ["pending-payments-sidebar-count"],
    ["dashboard-summary"],
    ["invoices-overdue"],
    ["invoice-upcoming-dashboard"],
  ],
  booking_updated: [
    ["/api/bookings"],
    ["tenant-pos-floor-plan"],
    ["tenant-pos-overview"],
    ["rekap-tenant"],
    ["laporan-tenants-list"],
    ["dashboard-summary"],
    ["dashboard-unit-stats"],
    ["/api/tenants"],
  ],
  unit_updated: [
    ["tenant-pos-floor-plan"],
    ["tenant-pos-overview"],
    ["/api/mall-units"],
    ["dashboard-unit-stats"],
  ],
  tenant_updated: [
    ["/api/tenants"],
    ["all-tenants-list"],
    ["rekap-tenant"],
    ["laporan-tenants-list"],
    ["dashboard-summary"],
    ["dashboard-unit-stats"],
    ["compare-summary"],
    ["compare-kpi"],
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
