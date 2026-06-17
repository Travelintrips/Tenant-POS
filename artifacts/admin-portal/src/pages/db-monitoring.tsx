import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  Wifi,
  WifiOff,
  RefreshCw,
  Server,
  Table2,
  Users,
  FileText,
  CreditCard,
  CalendarRange,
  Store,
  LayoutGrid,
  ShieldCheck,
  Clock,
} from "lucide-react";

type DbStatus = {
  status: "ok" | "error";
  pingMs: number;
  database: {
    host: string;
    isSupabase: boolean;
    env: string;
    ssl: boolean;
  };
  pool: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  tables: {
    tenants: number;
    bookings: number;
    invoices: number;
    payments: number;
    users: number;
    mall_units: number;
  };
  checkedAt: string;
  error?: string;
};

const TABLE_META = [
  { key: "tenants",   label: "Tenant",        icon: Store,         color: "text-blue-600"   },
  { key: "bookings",  label: "Booking",        icon: CalendarRange, color: "text-violet-600" },
  { key: "invoices",  label: "Invoice",        icon: FileText,      color: "text-amber-600"  },
  { key: "payments",  label: "Pembayaran",     icon: CreditCard,    color: "text-green-600"  },
  { key: "users",     label: "Pengguna",       icon: Users,         color: "text-pink-600"   },
  { key: "mall_units",label: "Unit Mal",       icon: LayoutGrid,    color: "text-cyan-600"   },
] as const;

function PingBadge({ ms }: { ms: number }) {
  if (ms < 100)  return <Badge className="bg-green-100 text-green-700 border-green-200 font-mono">{ms} ms</Badge>;
  if (ms < 500)  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 font-mono">{ms} ms</Badge>;
  return               <Badge className="bg-red-100 text-red-700 border-red-200 font-mono">{ms} ms</Badge>;
}

export default function DbMonitoring() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt, error } = useQuery<DbStatus>({
    queryKey: ["system-db-status"],
    queryFn: async () => {
      const res = await fetch("/api/system/db-status");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  const isOk      = data?.status === "ok";
  const lastCheck = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Monitoring Database
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Status koneksi dan statistik tabel database Supabase
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Mengecek..." : "Refresh"}
        </Button>
      </div>

      {/* Status Koneksi */}
      <Card className={isLoading ? "opacity-60" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            Status Koneksi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Menghubungi database...</span>
            </div>
          )}
          {!isLoading && (error || data?.status === "error") && (
            <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4">
              <WifiOff className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-700">Koneksi Gagal</p>
                <p className="text-sm text-red-600 mt-0.5 font-mono break-all">
                  {data?.error ?? (error instanceof Error ? error.message : String(error))}
                </p>
              </div>
            </div>
          )}
          {!isLoading && data?.status === "ok" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status baris */}
              <div className="flex items-center gap-3 rounded-lg border bg-green-50 border-green-200 p-3">
                <Wifi className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-semibold text-green-700">Terhubung</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Clock className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Latensi Ping</p>
                  <PingBadge ms={data.pingMs} />
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
                <Database className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Host</p>
                  <p className="font-mono text-sm truncate">{data.database.host}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {data.database.isSupabase && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Supabase</Badge>
                  )}
                  {data.database.ssl && (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      SSL
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {data.database.env === "production" ? "Production" : "Development"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connection Pool */}
      {data?.status === "ok" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Connection Pool
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center rounded-lg border p-4">
                <p className="text-2xl font-bold text-primary">{data.pool.totalCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Koneksi</p>
              </div>
              <div className="text-center rounded-lg border p-4">
                <p className="text-2xl font-bold text-green-600">{data.pool.idleCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Idle</p>
              </div>
              <div className="text-center rounded-lg border p-4">
                <p className={`text-2xl font-bold ${data.pool.waitingCount > 0 ? "text-amber-600" : "text-slate-400"}`}>
                  {data.pool.waitingCount}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Antrian</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistik Tabel */}
      {data?.status === "ok" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Table2 className="h-4 w-4" />
              Jumlah Data per Tabel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TABLE_META.map(({ key, label, icon: Icon, color }) => (
                <div key={key} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                  <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                  <div>
                    <p className="text-xl font-bold leading-none">
                      {(data.tables[key as keyof typeof data.tables] ?? 0).toLocaleString("id-ID")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center">
        Terakhir diperbarui: {lastCheck} — auto-refresh setiap 30 detik
      </p>
    </div>
  );
}
