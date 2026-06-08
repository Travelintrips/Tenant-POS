import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { SidebarLayout } from "@/components/layout/sidebar-layout";

import DataTenant from "@/pages/data-tenant";
import BookingTenant from "@/pages/booking-tenant";
import TenantPos from "@/pages/tenant-pos";
import Laporan from "@/pages/laporan";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">
        {/* Redirect to /data-tenant */}
        {() => {
          window.location.replace(import.meta.env.BASE_URL + "data-tenant");
          return null;
        }}
      </Route>
      <Route path="/data-tenant">
        <SidebarLayout>
          <DataTenant />
        </SidebarLayout>
      </Route>
      <Route path="/booking-tenant">
        <SidebarLayout>
          <BookingTenant />
        </SidebarLayout>
      </Route>
      <Route path="/tenant-pos">
        <SidebarLayout>
          <TenantPos />
        </SidebarLayout>
      </Route>
      <Route path="/laporan">
        <SidebarLayout>
          <Laporan />
        </SidebarLayout>
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
