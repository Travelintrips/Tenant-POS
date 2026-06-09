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
import { Building2, Store, CalendarRange, Calculator, BarChart3, LogOut, FileText, Shield, ChevronDown, GitCompare, Dumbbell, MapPin, Check, Layers, ClipboardCheck, LayoutGrid, Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth, useLogout, ROLE_LABELS, type UserRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSite, type MallSite, ALL_SITES_SENTINEL } from "@/contexts/site-context";
import { useQuery } from "@tanstack/react-query";

const ROLE_COLORS: Record<UserRole, string> = {
  owner:       "bg-purple-100 text-purple-800",
  admin:       "bg-blue-100 text-blue-800",
  finance:     "bg-green-100 text-green-800",
  cashier:     "bg-orange-100 text-orange-800",
  tenant_user: "bg-teal-100 text-teal-800",
};

const SITE_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  mall_tenant: {
    label: "Mal",
    icon: <Building2 className="h-3.5 w-3.5" />,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  sport_center: {
    label: "Sport",
    icon: <Dumbbell className="h-3.5 w-3.5" />,
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
  },
  all: {
    label: "Semua",
    icon: <Layers className="h-3.5 w-3.5" />,
    color: "text-slate-600",
    bg: "bg-slate-50 border-slate-200",
  },
};

function SiteIcon({ type, className }: { type: string; className?: string }) {
  const cfg = SITE_TYPE_CONFIG[type];
  if (!cfg) return <MapPin className={className ?? "h-3.5 w-3.5"} />;
  return <span className={className}>{cfg.icon}</span>;
}

function SiteTypeBadge({ type }: { type: string }) {
  const cfg = SITE_TYPE_CONFIG[type];
  if (!cfg) return <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">{type}</Badge>;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[9px] font-semibold tracking-wide ${cfg.color} ${cfg.bg}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// Kelompokkan sites berdasarkan tipe
function groupSites(sites: MallSite[]) {
  const groups: { label: string; sites: MallSite[] }[] = [];
  const mal = sites.filter(s => s.type === "mall_tenant");
  const sport = sites.filter(s => s.type === "sport_center");
  const other = sites.filter(s => s.type !== "mall_tenant" && s.type !== "sport_center");
  if (mal.length) groups.push({ label: "Mal", sites: mal });
  if (sport.length) groups.push({ label: "Sport Center", sites: sport });
  if (other.length) groups.push({ label: "Lainnya", sites: other });
  return groups;
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useAuth();
  const logout = useLogout();
  const { activeSite, sites, setActiveSite } = useSite();

  const role = user?.role as UserRole | undefined;
  const can = (...roles: UserRole[]) => !!role && roles.includes(role);

  const { data: pendingCount = 0 } = useQuery<number>({
    queryKey: ["pending-payments-sidebar-count"],
    queryFn: async () => {
      const res = await fetch("/api/pending-payments/count");
      if (!res.ok) return 0;
      const d = await res.json();
      return d.count ?? 0;
    },
    refetchInterval: 30_000,
    enabled: can("owner", "admin", "finance"),
  });
  const grouped = groupSites(sites);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-row items-center gap-2">
            <Building2 className="h-6 w-6 text-primary shrink-0" />
            <span className="text-lg font-bold text-sidebar-foreground">
              Portal Admin
            </span>
          </div>

          {/* Site switcher premium — grouped dengan separator */}
          {(sites.length > 1 || can("owner")) && activeSite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between h-9 text-xs font-medium border-sidebar-border bg-sidebar hover:bg-sidebar-accent group"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`shrink-0 ${SITE_TYPE_CONFIG[activeSite.type]?.color ?? "text-muted-foreground"}`}>
                      <SiteIcon type={activeSite.type} />
                    </span>
                    <span className="truncate font-semibold">{activeSite.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <SiteTypeBadge type={activeSite.type} />
                    <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[230px] p-1">
                <DropdownMenuLabel className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                  Pilih Lokasi
                </DropdownMenuLabel>
                {/* Semua lokasi */}
                <DropdownMenuItem
                  onClick={() => setActiveSite(ALL_SITES_SENTINEL)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer ${
                    activeSite?.code === "ALL"
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-accent"
                  }`}
                >
                  <span className="shrink-0 text-slate-500"><Layers className="h-3.5 w-3.5" /></span>
                  <span className="flex-1 truncate text-sm">Semua</span>
                  {activeSite?.code === "ALL" && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1" />
                {grouped.map((group, gi) => (
                  <React.Fragment key={group.label}>
                    {gi > 0 && <DropdownMenuSeparator className="my-1" />}
                    <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.label === "Sport Center"
                        ? <Dumbbell className="h-3 w-3 text-emerald-500" />
                        : <Building2 className="h-3 w-3 text-blue-500" />
                      }
                      {group.label}
                    </DropdownMenuLabel>
                    {group.sites.map((site) => {
                      const isActive = activeSite.id === site.id;
                      return (
                        <DropdownMenuItem
                          key={site.id}
                          onClick={() => setActiveSite(site)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer ${
                            isActive
                              ? "bg-primary/10 text-primary font-semibold"
                              : "hover:bg-accent"
                          }`}
                        >
                          <span className={`shrink-0 ${SITE_TYPE_CONFIG[site.type]?.color ?? ""}`}>
                            <SiteIcon type={site.type} />
                          </span>
                          <span className="flex-1 truncate text-sm">{site.name}</span>
                          {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Tampilkan nama site tunggal tanpa dropdown */}
          {sites.length === 1 && activeSite && (
            <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${SITE_TYPE_CONFIG[activeSite.type]?.bg ?? "bg-muted"}`}>
              <span className={`shrink-0 ${SITE_TYPE_CONFIG[activeSite.type]?.color ?? "text-muted-foreground"}`}>
                <SiteIcon type={activeSite.type} />
              </span>
              <span className={`text-xs font-semibold truncate ${SITE_TYPE_CONFIG[activeSite.type]?.color ?? ""}`}>
                {activeSite.name}
              </span>
              <SiteTypeBadge type={activeSite.type} />
            </div>
          )}
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
                {can("owner", "admin") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/unit-tenant"}
                      data-testid="nav-unit-tenant"
                    >
                      <Link href="/unit-tenant">
                        <LayoutGrid className="mr-2 h-4 w-4" />
                        <span>Unit Tenant</span>
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
                {can("owner", "admin", "finance") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/tenant-invoices"}
                      data-testid="nav-tenant-invoices"
                    >
                      <Link href="/tenant-invoices">
                        <FileText className="mr-2 h-4 w-4" />
                        <span>Invoice Tenant</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {can("owner", "admin", "finance") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/tinjau-pembayaran"}
                      data-testid="nav-tinjau-pembayaran"
                    >
                      <Link href="/tinjau-pembayaran" className="flex items-center justify-between w-full">
                        <span className="flex items-center">
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          <span>Tinjau Pembayaran</span>
                        </span>
                        {pendingCount > 0 && (
                          <Badge className="ml-auto h-5 min-w-5 text-[10px] bg-amber-500 hover:bg-amber-500 text-white px-1.5 border-0">
                            {pendingCount}
                          </Badge>
                        )}
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
                    isActive={location === "/rekap-tenant"}
                    data-testid="nav-rekap-tenant"
                  >
                    <Link href="/rekap-tenant">
                      <Users className="mr-2 h-4 w-4" />
                      <span>Rekap Tenant</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/compare-sites"}
                    data-testid="nav-compare-sites"
                  >
                    <Link href="/compare-sites">
                      <GitCompare className="mr-2 h-4 w-4" />
                      <span>Perbandingan Lokasi</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )}
          {can("owner", "admin") && (
            <SidebarGroup>
              <SidebarGroupLabel>SISTEM</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/audit-logs"}
                    data-testid="nav-audit-logs"
                  >
                    <Link href="/audit-logs">
                      <Shield className="mr-2 h-4 w-4" />
                      <span>Audit Log</span>
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
            {activeSite?.name ?? "Manajemen Tenan"}
          </span>
        </header>
        <main className="flex-1 p-6 bg-muted/20">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
