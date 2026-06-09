import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useAuth } from "@/hooks/use-auth";
import { RealtimeSync } from "@/components/realtime-sync";

import DataTenant from "@/pages/data-tenant";
import BookingTenant from "@/pages/booking-tenant";
import TenantPos from "@/pages/tenant-pos";
import Laporan from "@/pages/laporan";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    window.location.href = "/login";
    return null;
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
      <Route path="/">
        {() => {
          window.location.replace(import.meta.env.BASE_URL + "data-tenant");
          return null;
        }}
      </Route>
      <Route path="/data-tenant">
        <AuthGuard>
          <SidebarLayout>
            <DataTenant />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/booking-tenant">
        <AuthGuard>
          <SidebarLayout>
            <BookingTenant />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/tenant-pos">
        <AuthGuard>
          <SidebarLayout>
            <TenantPos />
          </SidebarLayout>
        </AuthGuard>
      </Route>
      <Route path="/laporan">
        <AuthGuard>
          <SidebarLayout>
            <Laporan />
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
