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

// Route-level code splitting: login tetap ringan. Setelah staf berhasil login,
// chunk menu yang boleh diakses diprefetch saat browser idle agar klik pertama
// tidak menunggu download + parse JavaScript.
const loadDataTenant = () => import("@/pages/data-tenant");
const loadUnitTenant = () => import("@/pages/unit-tenant");
const loadRekapTenant = () => import("@/pages/rekap-tenant");
const loadBookingTenant = () => import("@/pages/booking-tenant");
const loadTenantPos = () => import("@/pages/tenant-pos");
const loadLaporan = () => import("@/pages/laporan");
const loadTenantInvoices = () => import("@/pages/tenant-invoices");
const loadAuditLogs = () => import("@/pages/audit-logs");
const loadUsers = () => import("@/pages/users");
const loadSettings = () => import("@/pages/settings");
const loadCompareSites = () => import("@/pages/compare-sites");
const loadTenantPortal = () => import("@/pages/tenant-portal");
const loadTinjauPembayaran = () => import("@/pages/tinjau-pembayaran");
const loadPaymentProofUpload = () => import("@/pages/payment-proof-upload");
const loadDashboard = () => import("@/pages/dashboard");
const loadTenantProfile = () => import("@/pages/tenant-profile");
const loadWhatsAppSend = () => import("@/pages/whatsapp-send");
const loadWhatsAppTemplates = () => import("@/pages/whatsapp-templates");
const loadDbMonitoring = () => import("@/pages/db-monitoring");
const loadDrafPerjanjian = () => import("@/pages/draf-perjanjian");
const loadDokumenSewa = () => import("@/pages/dokumen-sewa");
const loadTenantRegister = () => import("@/pages/tenant-register");
const loadBukuJurnal = () => import("@/pages/buku-jurnal");
const loadKelolaCoa = () => import("@/pages/kelola-coa");
const loadPengeluaranOperasional = () => import("@/pages/pengeluaran-operasional");
const loadRiwayatPembayaran = () => import("@/pages/riwayat-pembayaran");
const loadPemasukanLain = () => import("@/pages/pemasukan-lain");
const loadConsolidatedInvoices = () => import("@/pages/consolidated-invoices");
const loadRekonsiliasiBank = () => import("@/pages/rekonsiliasi-bank");

const DataTenant = lazy(loadDataTenant);
const UnitTenant = lazy(loadUnitTenant);
const RekapTenant = lazy(loadRekapTenant);
const BookingTenant = lazy(loadBookingTenant);
const TenantPos = lazy(loadTenantPos);
const Laporan = lazy(loadLaporan);
const TenantInvoices = lazy(loadTenantInvoices);
const AuditLogs = lazy(loadAuditLogs);
const UsersPage = lazy(loadUsers);
const SettingsPage = lazy(loadSettings);
const CompareSites = lazy(loadCompareSites);
const TenantPortal = lazy(loadTenantPortal);
const TinjauPembayaran = lazy(loadTinjauPembayaran);
const PaymentProofUpload = lazy(loadPaymentProofUpload);
const Dashboard = lazy(loadDashboard);
const TenantProfile = lazy(loadTenantProfile);
const WhatsAppSend = lazy(loadWhatsAppSend);
const WhatsAppTemplates = lazy(loadWhatsAppTemplates);
const DbMonitoring = lazy(loadDbMonitoring);
const DrafPerjanjian = lazy(loadDrafPerjanjian);
const DokumenSewa = lazy(loadDokumenSewa);
const TenantRegister = lazy(loadTenantRegister);
const BukuJurnal = lazy(loadBukuJurnal);
const KelolaCoa = lazy(loadKelolaCoa);
const PengeluaranOperasional = lazy(loadPengeluaranOperasional);
const RiwayatPembayaran = lazy(loadRiwayatPembayaran);
const PemasukanLain = lazy(loadPemasukanLain);
const ConsolidatedInvoices = lazy(loadConsolidatedInvoices);
const RekonsiliasiBank = lazy(loadRekonsiliasiBank);

type PageLoader = () => Promise<unknown>;

const commonStaffLoaders: PageLoader[] = [
  loadDashboard,
  loadTenantPos,
  loadTenantInvoices,
  loadBookingTenant,
  loadUnitTenant,
  loadRiwayatPembayaran,
  loadRekapTenant,
  loadLaporan,
];

function getPrefetchLoaders(role: UserRole): PageLoader[] {
  if (role === "tenant_user") return [loadTenantPortal];
  if (role === "cashier") return [loadTenantPos];

  const financeLoaders: PageLoader[] = [
    ...commonStaffLoaders,
    loadConsolidatedInvoices,
    loadTinjauPembayaran,
    loadPengeluaranOperasional,
    loadPemasukanLain,
    loadBukuJurnal,
    loadRekonsiliasiBank,
    loadKelolaCoa,
    loadCompareSites,
    loadWhatsAppSend,
    loadWhatsAppTemplates,
  ];

  if (role === "finance") return financeLoaders;

  const adminLoaders: PageLoader[] = [
    ...financeLoaders,
    loadDataTenant,
    loadDrafPerjanjian,
    loadAuditLogs,
  ];

  if (role === "admin") return adminLoaders;

  return [...adminLoaders, loadUsers, loadSettings, loadDbMonitoring];
}

function prefetchRolePages(role: UserRole): () => void {
  let cancelled = false;
  const loaders = Array.from(new Set(getPrefetchLoaders(role)));

  const run = async () => {
    // Bertahap agar prefetch tidak berebut bandwidth/CPU dengan halaman aktif.
    for (let i = 0; i < loaders.length && !cancelled; i += 3) {
      const batch = loaders.slice(i, i + 3);
      await Promise.all(batch.map((load) => load().catch(() => undefined)));
      if (!cancelled) await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
  };

  const idleWindow = window as typeof window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (idleWindow.requestIdleCallback) {
    const id = idleWindow.requestIdleCallback(() => void run(), { timeout: 1800 });
    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(id);
    };
  }

  const id = window.setTimeout(() => void run(), 900);
  return () => {
    cancelled = true;
    window.clearTimeout(id);
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // RealtimeSync tetap meng-invalidasi query saat data berubah. Cache lebih lama
      // mencegah refetch berulang saat user bolak-balik menu dalam sesi yang sama.
      staleTime: 2 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
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
    return prefetchRolePages(user.role);
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
