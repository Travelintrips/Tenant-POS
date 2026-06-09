import React from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { Building2, Store, CalendarRange, Calculator, BarChart3, LogOut } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth, useLogout, ROLE_LABELS, type UserRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ROLE_COLORS: Record<UserRole, string> = {
  owner:   "bg-purple-100 text-purple-800",
  admin:   "bg-blue-100 text-blue-800",
  finance: "bg-green-100 text-green-800",
  cashier: "bg-orange-100 text-orange-800",
};

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useAuth();
  const logout = useLogout();

  const role = user?.role as UserRole | undefined;
  const can = (...roles: UserRole[]) => !!role && roles.includes(role);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="flex flex-row items-center gap-2 px-4 py-4">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-sidebar-foreground">
            Portal Admin
          </span>
        </SidebarHeader>
        <SidebarContent>
          {can("owner", "admin", "finance", "cashier") && (
            <SidebarGroup>
              <SidebarGroupLabel>PENYEWA TENAN</SidebarGroupLabel>
              <SidebarMenu>
                {can("owner", "admin") && (
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
                )}
                {can("owner", "admin", "finance") && (
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
                )}
                {can("owner", "admin", "finance", "cashier") && (
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
                )}
              </SidebarMenu>
            </SidebarGroup>
          )}
          {can("owner", "admin", "finance") && (
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
          )}
        </SidebarContent>
        {user && role && (
          <SidebarFooter className="border-t px-3 py-3">
            <div className="flex items-center gap-2 mb-2">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{user.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
              <Badge className={`text-[10px] px-1.5 py-0 h-4 shrink-0 border-0 ${ROLE_COLORS[role]}`}>
                {ROLE_LABELS[role]}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="text-xs">{logout.isPending ? "Keluar..." : "Keluar"}</span>
            </Button>
          </SidebarFooter>
        )}
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
