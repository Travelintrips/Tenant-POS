import { lazy, Suspense, useEffect } from "react";
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
const DataTenant = lazy(() => import("@/pages/data-tenant"));
const UnitTenant = lazy(() => import("@/pages/unit-tenant"));
const RekapTenant = lazy(() => import("@/pages/rekap-tenant"));
const BookingTenant = lazy(() => import("@/pages/booking-tenant"));
const loadTenantPos = () => import("@/pages/tenant-pos");
const TenantPos = lazy(loadTenantPos);
const Laporan = lazy(() => import("@/pages/laporan"));
const loadTenantInvoices = () => import("@/pages/tenant-invoices");
const TenantInvoices = lazy(loadTenantInvoices);
const AuditLogs = lazy(() => import("@/pages/audit-logs"));
const UsersPage = lazy(() => import("@/pages/users"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const CompareSites = lazy(() => import("@/pages/compare-sites"));
const TenantPortal = lazy(() => import("@/pages/tenant-portal"));
const TinjauPembayaran = lazy(() => import("@/pages/tinjau-pembayaran"));
const PaymentProofUpload = lazy(() => import("@/pages/payment-proof-upload"));
const loadDashboard = () => import("@/pages/dashboard");
const Dashboard = lazy(loadDashboard);
const TenantProfile = lazy(() => import("@/pages/tenant-profile"));
const WhatsAppSend = lazy(() => import("@/pages/whatsapp-send"));
const WhatsAppTemplates = lazy(() => import("@/pages/whatsapp-templates"));
const DbMonitoring = lazy(() => import("@/pages/db-monitoring"));
const DrafPerjanjian = lazy(() => import("@/pages/draf-perjanjian"));
const DokumenSewa = lazy(() => import("@/pages/dokumen-sewa"));
const TenantRegister = lazy(() => import("@/pages/tenant-register"));
const BukuJurnal = lazy(() => import("@/pages/buku-jurnal"));
const KelolaCoa = lazy(() => import("@/pages/kelola-coa"));
const PengeluaranOperasional = lazy(() => import("@/pages/pengeluaran-operasional"));
const RiwayatPembayaran = lazy(() => import("@/pages/riwayat-pembayaran"));
const PemasukanLain = lazy(() => import("@/pages/pemasukan-lain"));
const ConsolidatedInvoices = lazy(() => import("@/pages/consolidated-invoices"));
const RekonsiliasiBank = lazy(() => import("@/pages/rekonsiliasi-bank"));

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
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
      // Prefetch menu operasional paling sering dipakai setelah browser idle.
      // Bertahap supaya tidak berebut CPU/network dengan halaman yang sedang dibuka.
      for (const load of [loadDashboard, loadTenantPos, loadTenantInvoices]) {
        if (cancelled) break;
        await load().catch(() => undefined);
        await new Promise((resolve) => window.setTimeout(resolve, 40));
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
