import { Suspense, useEffect } from "react";
import { lazyWithRecovery } from "@/lib/chunk-recovery";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import Unauthorized from "@/pages/unauthorized";
import Login from "@/pages/login";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useAuth, type UserRole } from "@/hooks/use-auth";
import { RealtimeSync } from "@/components/realtime-sync";
import { SiteProvider } from "@/contexts/site-context";

// Route-level code splitting: login tetap ringan dan halaman operasional
// hanya diunduh ketika benar-benar dibuka.
const loadDataTenant = () => import("@/pages/data-tenant");
const DataTenant = lazyWithRecovery(loadDataTenant);
const loadUnitTenant = () => import("@/pages/unit-tenant");
const UnitTenant = lazyWithRecovery(loadUnitTenant);
const loadRekapTenant = () => import("@/pages/rekap-tenant");
const RekapTenant = lazyWithRecovery(loadRekapTenant);
const loadBookingTenant = () => import("@/pages/booking-tenant");
const BookingTenant = lazyWithRecovery(loadBookingTenant);
const loadTenantPos = () => import("@/pages/tenant-pos");
const TenantPos = lazyWithRecovery(loadTenantPos);
const loadLaporan = () => import("@/pages/laporan");
const Laporan = lazyWithRecovery(loadLaporan);
const loadTenantInvoices = () => import("@/pages/tenant-invoices");
const TenantInvoices = lazyWithRecovery(loadTenantInvoices);
const AuditLogs = lazyWithRecovery(() => import("@/pages/audit-logs"));
const UsersPage = lazyWithRecovery(() => import("@/pages/users"));
const SettingsPage = lazyWithRecovery(() => import("@/pages/settings"));
const CompareSites = lazyWithRecovery(() => import("@/pages/compare-sites"));
const TenantPortal = lazyWithRecovery(() => import("@/pages/tenant-portal"));
const loadTinjauPembayaran = () => import("@/pages/tinjau-pembayaran");
const TinjauPembayaran = lazyWithRecovery(loadTinjauPembayaran);
const PaymentProofUpload = lazyWithRecovery(() => import("@/pages/payment-proof-upload"));
const loadDashboard = () => import("@/pages/dashboard");
const Dashboard = lazyWithRecovery(loadDashboard);
const TenantProfile = lazyWithRecovery(() => import("@/pages/tenant-profile"));
const WhatsAppSend = lazyWithRecovery(() => import("@/pages/whatsapp-send"));
const WhatsAppTemplates = lazyWithRecovery(() => import("@/pages/whatsapp-templates"));
const DbMonitoring = lazyWithRecovery(() => import("@/pages/db-monitoring"));
const loadDrafPerjanjian = () => import("@/pages/draf-perjanjian");
const DrafPerjanjian = lazyWithRecovery(loadDrafPerjanjian);
const DokumenSewa = lazyWithRecovery(() => import("@/pages/dokumen-sewa"));
const TenantRegister = lazyWithRecovery(() => import("@/pages/tenant-register"));
const loadBukuJurnal = () => import("@/pages/buku-jurnal");
const BukuJurnal = lazyWithRecovery(loadBukuJurnal);
const KelolaCoa = lazyWithRecovery(() => import("@/pages/kelola-coa"));
const loadPengeluaranOperasional = () => import("@/pages/pengeluaran-operasional");
const PengeluaranOperasional = lazyWithRecovery(loadPengeluaranOperasional);
const loadRiwayatPembayaran = () => import("@/pages/riwayat-pembayaran");
const RiwayatPembayaran = lazyWithRecovery(loadRiwayatPembayaran);
const PemasukanLain = lazyWithRecovery(() => import("@/pages/pemasukan-lain"));
const loadConsolidatedInvoices = () => import("@/pages/consolidated-invoices");
const ConsolidatedInvoices = lazyWithRecovery(loadConsolidatedInvoices);
const loadRekonsiliasiBank = () => import("@/pages/rekonsiliasi-bank");
const RekonsiliasiBank = lazyWithRecovery(loadRekonsiliasiBank);

// Start downloading the current page chunk immediately, in parallel with the
// auth/session check. Previously the page import only started after auth
// completed, creating a visible auth -> chunk waterfall on full reload.
if (typeof window !== "undefined") {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const activeRouteLoaders: Record<string, () => Promise<unknown>> = {
    "/dashboard": loadDashboard,
    "/data-tenant": loadDataTenant,
    "/unit-tenant": loadUnitTenant,
    "/booking-tenant": loadBookingTenant,
    "/tenant-pos": loadTenantPos,
    "/laporan": loadLaporan,
    "/tenant-invoices": loadTenantInvoices,
    "/invoice-konsolidasi": loadConsolidatedInvoices,
    "/tinjau-pembayaran": loadTinjauPembayaran,
    "/riwayat-pembayaran": loadRiwayatPembayaran,
    "/draf-perjanjian": loadDrafPerjanjian,
    "/pengeluaran-operasional": loadPengeluaranOperasional,
    "/buku-jurnal": loadBukuJurnal,
    "/rekonsiliasi-bank": loadRekonsiliasiBank,
    "/rekap-tenant": loadRekapTenant,
  };
  void activeRouteLoaders[path]?.().catch(() => undefined);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // RealtimeSync + polling tetap menjaga freshness. Cache lebih lama menghindari\n      // refetch berulang ketika user berpindah menu dan kembali dalam sesi yang sama.\n      staleTime: 2 * 60 * 1000,\n      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const Spinner = () => (
  <div className="min-h-screen bg-background">
    <div className="flex min-h-screen">
      <aside className="hidden md:block w-56 border-r bg-background p-4">
        <div className="h-7 w-32 rounded bg-muted animate-pulse mb-8" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-muted animate-pulse" />
          ))}
        </div>
      </aside>
      <div className="flex-1">
        <div className="h-16 border-b bg-background" />
        <main className="p-4 sm:p-6 space-y-4">
          <div className="h-8 w-56 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-xl bg-muted animate-pulse" />
        </main>
      </div>
    </div>
  </div>
);

function getDefaultRoute(role: UserRole): string {
  switch (role) {
    case "cashier":     return "tenant-pos";
    case "tenant_user": return "tenant-portal";
    default:            return "dashboard";
  }
}

function AuthGuard({ children, roles }: { children: React.ReactNode; roles?: UserRole[] }) {
  const { data: user, isLoading } = useAuth();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const run = async () => {
      // Warm route chunks setelah halaman pertama sudah interaktif. Dengan ini,
      // klik menu admin tidak perlu menunggu download/parse chunk untuk pertama kali.
      // Tetap bertahap agar koneksi dan main thread tidak tersumbat.
      const highPriorityLoads = [
        loadDashboard,
        loadDataTenant,
        loadUnitTenant,
        loadBookingTenant,
        loadTenantPos,
        loadTenantInvoices,
        loadConsolidatedInvoices,
        loadTinjauPembayaran,
        loadRiwayatPembayaran,
      ];
      const lowerPriorityLoads = [
        loadRekapTenant,
        loadLaporan,
        loadDrafPerjanjian,
        loadPengeluaranOperasional,
        loadBukuJurnal,
        loadRekonsiliasiBank,
      ];

      for (const load of highPriorityLoads) {
        if (cancelled) break;
        await load().catch(() => undefined);
        await new Promise((resolve) => window.setTimeout(resolve, 24));
      }
      for (const load of lowerPriorityLoads) {
        if (cancelled) break;
        await load().catch(() => undefined);
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }
    };

    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(() => void run(), { timeout: 1200 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(id);
      };
    }

    const id = window.setTimeout(() => void run(), 600);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [user?.id, user?.role]);

  if (isLoading) return <Spinner />;

  if (!user) {
    window.location.href = "/login";
    return null;
  }

  if (roles && !roles.includes(user.role)) {
    return <Redirect to="/unauthorized" />;
  }

  return (
    <>
      <RealtimeSync />
      {children}
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Login />
      </Route>
      <Route path="/unauthorized">
        <Unauthorized />
      </Route>
      <Route path="/tenant-portal">
        <TenantPortal />
      </Route>
      <Route path="/bayar/:token">
        <PaymentProofUpload />
      </Route>
      <Route path="/tenant/register">
        <TenantRegister />
      </Route>
      <Route path="/mitra/register">
        <TenantRegister />
      </Route>
      <Route path="/dokumen/:token">
        <DokumenSewa />
      </Route>
      <Route path="/">
        {() => {
          const { data: user, isLoading } = useAuth();
          if (isLoading) return <Spinner />;
          if (!user) {
            window.location.href = "/login";
            return null;
          }
          window.location.replace(import.meta.env.BASE_URL + getDefaultRoute(user.role));
          return null;
        }}
      </Route>
      <Route path="/dashboard">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <Dashboard />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/data-tenant">
        <AuthGuard roles={["owner", "admin"]}>
          <SidebarLayout>
            <DataTenant />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/unit-tenant">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <UnitTenant />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/booking-tenant">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <BookingTenant />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/invoice-konsolidasi">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <ConsolidatedInvoices />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/tenant-pos">
        <AuthGuard roles={["owner", "admin", "finance", "cashier"]}>
          <SidebarLayout>
            <TenantPos />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/laporan">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <Laporan />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/tenant-invoices">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <TenantInvoices />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/audit-logs">
        <AuthGuard roles={["owner", "admin"]}>
          <SidebarLayout>
            <AuditLogs />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/users">
        <AuthGuard roles={["owner"]}>
          <SidebarLayout>
            <UsersPage />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/settings">
        <AuthGuard roles={["owner"]}>
          <SidebarLayout>
            <SettingsPage />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/rekap-tenant">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <RekapTenant />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/buku-jurnal">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <BukuJurnal />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/kelola-coa">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <KelolaCoa />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/compare-sites">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <CompareSites />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/tinjau-pembayaran">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <TinjauPembayaran />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/riwayat-pembayaran">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <RiwayatPembayaran />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/tenant-profile/:id">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <TenantProfile />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/kirim-wa">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <WhatsAppSend />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/template-wa">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <WhatsAppTemplates />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/db-monitoring">
        <AuthGuard roles={["owner"]}>
          <SidebarLayout>
            <DbMonitoring />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/pengeluaran-operasional">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <PengeluaranOperasional />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/draf-perjanjian">
        <AuthGuard roles={["owner", "admin"]}>
          <SidebarLayout>
            <DrafPerjanjian />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/pemasukan-lain">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <PemasukanLain />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/rekonsiliasi-bank">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <RekonsiliasiBank />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route>
        <SidebarLayout>
          <NotFound />
        </SidebarLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SiteProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ErrorBoundary>
                <Suspense fallback={<Spinner />}>
                  <Router />
                </Suspense>
              </ErrorBoundary>
            </WouterRouter>
            <Toaster />
          </SiteProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
