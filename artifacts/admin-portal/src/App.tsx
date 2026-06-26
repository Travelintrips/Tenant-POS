import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Unauthorized from "@/pages/unauthorized";
import Login from "@/pages/login";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useAuth, type UserRole } from "@/hooks/use-auth";
import { RealtimeSync } from "@/components/realtime-sync";
import { SiteProvider } from "@/contexts/site-context";

import DataTenant from "@/pages/data-tenant";
import UnitTenant from "@/pages/unit-tenant";
import RekapTenant from "@/pages/rekap-tenant";
import BookingTenant from "@/pages/booking-tenant";
import TenantPos from "@/pages/tenant-pos";
import Laporan from "@/pages/laporan";
import TenantInvoices from "@/pages/tenant-invoices";
import AuditLogs from "@/pages/audit-logs";
import UsersPage from "@/pages/users";
import SettingsPage from "@/pages/settings";
import CompareSites from "@/pages/compare-sites";
import TenantPortal from "@/pages/tenant-portal";
import TinjauPembayaran from "@/pages/tinjau-pembayaran";
import PaymentProofUpload from "@/pages/payment-proof-upload";
import Dashboard from "@/pages/dashboard";
import TenantProfile from "@/pages/tenant-profile";
import WhatsAppSend from "@/pages/whatsapp-send";
import WhatsAppTemplates from "@/pages/whatsapp-templates";
import BankRekonsiliasi from "@/pages/bank-rekonsiliasi";
import DbMonitoring from "@/pages/db-monitoring";
import DrafPerjanjian from "@/pages/draf-perjanjian";
import DokumenSewa from "@/pages/dokumen-sewa";
import TenantRegister from "@/pages/tenant-register";
import BukuJurnal from "@/pages/buku-jurnal";
import KelolaCoa from "@/pages/kelola-coa";
import PengeluaranOperasional from "@/pages/pengeluaran-operasional";
import RiwayatPembayaran from "@/pages/riwayat-pembayaran";
import PemasukanLain from "@/pages/pemasukan-lain";
import ConsolidatedInvoices from "@/pages/consolidated-invoices";
// Legacy module kept for rollback — DO NOT import Rekonsiliasi as a rendered route
// import Rekonsiliasi from "@/pages/rekonsiliasi";

const queryClient = new QueryClient();

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
      {/* Legacy redirect — /rekonsiliasi → /bank-rekonsiliasi */}
      <Route path="/rekonsiliasi">
        <Redirect to="/bank-rekonsiliasi" />
      </Route>
      {/* Legacy redirect — /reconciliation → /bank-rekonsiliasi */}
      <Route path="/reconciliation">
        <Redirect to="/bank-rekonsiliasi" />
      </Route>
      {/* Legacy redirect — /laporan-rekonsiliasi → /bank-rekonsiliasi */}
      <Route path="/laporan-rekonsiliasi">
        <Redirect to="/bank-rekonsiliasi" />
      </Route>
      <Route path="/bank-rekonsiliasi">
        <AuthGuard roles={["owner", "admin", "finance"]}>
          <SidebarLayout>
            <BankRekonsiliasi />
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SiteProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </SiteProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
