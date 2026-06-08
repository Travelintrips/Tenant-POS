import React from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Building2, Store, CalendarRange, Calculator, BarChart3 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="flex flex-row items-center gap-2 px-4 py-4">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-sidebar-foreground">
            Admin Portal
          </span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>PENYEWA TENAN</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/data-tenant"}
                  data-testid="nav-data-tenant"
                >
                  <Link href="/data-tenant">
                    <Store className="mr-2 h-4 w-4" />
                    <span>Data Tenant</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/booking-tenant"}
                  data-testid="nav-booking-tenant"
                >
                  <Link href="/booking-tenant">
                    <CalendarRange className="mr-2 h-4 w-4" />
                    <span>Booking Tenant</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/tenant-pos"}
                  data-testid="nav-tenant-pos"
                >
                  <Link href="/tenant-pos">
                    <Calculator className="mr-2 h-4 w-4" />
                    <span>POS Tenant</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>LAPORAN</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/laporan"}
                  data-testid="nav-laporan"
                >
                  <Link href="/laporan">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    <span>Rekap Pembayaran</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium text-muted-foreground">
            Manajemen Tenan
          </span>
        </header>
        <main className="flex-1 p-6 bg-muted/20">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
