import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchJson } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useSite } from "@/contexts/site-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus, Search, Pencil, Trash2, LayoutGrid, Table2, RefreshCw,
  Building2, MapPin, Package, X, Database, Lock, Unlock,
  RefreshCcw, Wrench, CheckSquare,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MallUnit {
  id: number;
  siteId: number | null;
  unitCode: string;
  floor: string;
  zone: string | null;
  areaKantin: string | null;
  unitType: string;
  sizeM2: string | null;
  defaultRentAmount: string | null;
  storedStatus: string;
  status: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  bookingId: number | null;
  tenantId: number | null;
  businessName: string | null;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  startDate: string | null;
  endDate: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string | null;
  latestInvoiceId: number | null;
  latestInvoiceStatus: string | null;
  latestInvoiceAmount: number | null;
  latestInvoiceDueDate: string | null;
  latestInvoiceOutstanding: number | null;
}

interface UnitFormData {
  unitCode: string;
  areaKantin: string;
  unitType: string;
  sizeM2: string;
  defaultRentAmount: string;
  status: string;
  positionX: string;
  positionY: string;
  width: string;
  height: string;
  notes: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const UNIT_CODE_REGEX = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

function validateUnitCode(code: string): string | null {
  if (!code.trim()) return "Kode unit wajib diisi";
  if (code.length < 2) return "Kode unit minimal 2 karakter";
  if (code.length > 30) return "Kode unit maksimal 30 karakter";
  if (!UNIT_CODE_REGEX.test(code))
    return "Hanya huruf kapital, angka, dan tanda hubung (-). Tidak boleh diawali/diakhiri tanda hubung atau tanda hubung berurutan.";
  return null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_TYPES = [
  { value: "food_booth",      label: "Booth Makanan" },
  { value: "beverage_booth",  label: "Booth Minuman" },
  { value: "shared_kitchen",  label: "Dapur Bersama" },
  { value: "storage",         label: "Gudang" },
  { value: "cashier_area",    label: "Area Kasir" },
  { value: "seating_area",    label: "Area Duduk" },
  { value: "other",           label: "Lainnya" },
] as const;

const UNIT_STATUSES = [
  { value: "available",   label: "Tersedia",    color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "booked",      label: "Dipesan",     color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "occupied",    label: "Terisi",      color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "overdue",     label: "Tunggakan",   color: "bg-red-100 text-red-800 border-red-200" },
  { value: "expired",     label: "Kadaluarsa",  color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: "maintenance", label: "Perawatan",   color: "bg-slate-100 text-slate-700 border-slate-300" },
] as const;

const FLOOR_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  available:   { bg: "#dcfce7", border: "#16a34a", text: "#15803d" },
  booked:      { bg: "#fef3c7", border: "#d97706", text: "#92400e" },
  occupied:    { bg: "#dbeafe", border: "#2563eb", text: "#1d4ed8" },
  overdue:     { bg: "#fee2e2", border: "#dc2626", text: "#991b1b" },
  expired:     { bg: "#f3f4f6", border: "#6b7280", text: "#374151" },
  maintenance: { bg: "#f1f5f9", border: "#94a3b8", text: "#475569" },
};

const EDITABLE_STATUSES = [
  { value: "available",   label: "Tersedia" },
  { value: "maintenance", label: "Perawatan" },
];

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PAID:    "bg-emerald-100 text-emerald-800",
  PARTIAL: "bg-amber-100 text-amber-800",
  UNPAID:  "bg-red-100 text-red-800",
  OVERDUE: "bg-red-100 text-red-800",
};

const DEFAULT_FORM: UnitFormData = {
  unitCode: "",
  areaKantin: "",
  unitType: "other",
  sizeM2: "",
  defaultRentAmount: "",
  status: "available",
  positionX: "0",
  positionY: "0",
  width: "2",
  height: "2",
  notes: "",
};

// ─── Helper functions ─────────────────────────────────────────────────────────

function getUnitTypeLabel(value: string): string {
  return UNIT_TYPES.find(t => t.value === value)?.label ?? value;
}

function getStatusConfig(value: string) {
  return UNIT_STATUSES.find(s => s.value === value)
    ?? { label: value, color: "bg-gray-100 text-gray-700 border-gray-200" };
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function fmtRp(n: number): string {
  return n > 0 ? `Rp ${n.toLocaleString("id-ID")}` : "—";
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── UnitTypeBadge ────────────────────────────────────────────────────────────

function UnitTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 border border-slate-200">
      {getUnitTypeLabel(type)}
    </span>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryCounts({ units }: { units: MallUnit[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const u of units) map[u.status] = (map[u.status] ?? 0) + 1;
    return map;
  }, [units]);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs text-muted-foreground font-medium">
        Total {units.length} unit:
      </span>
      {UNIT_STATUSES.map(s => {
        const n = counts[s.value] ?? 0;
        if (n === 0) return null;
        return (
          <span key={s.value} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${s.color}`}>
            {s.label} ({n})
          </span>
        );
      })}
    </div>
  );
}

// ─── Floor Plan ───────────────────────────────────────────────────────────────

function FloorPlan({
  units,
  onSelectUnit,
  selectedId,
}: {
  units: MallUnit[];
  onSelectUnit: (u: MallUnit) => void;
  selectedId: number | null;
}) {
  if (units.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <Package className="h-12 w-12 opacity-20" />
        <p className="text-sm">Tidak ada unit untuk ditampilkan</p>
      </div>
    );
  }

  const maxX = Math.max(...units.map(u => u.positionX + u.width));
  const maxY = Math.max(...units.map(u => u.positionY + u.height));
  const CELL = 60;
  const GAP = 2;

  return (
    <div className="border rounded-lg bg-slate-50 p-4 overflow-auto">
      <div
        className="relative"
        style={{
          width: maxX * (CELL + GAP),
          height: maxY * (CELL + GAP),
          minWidth: 300,
          minHeight: 200,
        }}
      >
        {units.map(u => {
          const cfg = FLOOR_COLORS[u.status] ?? FLOOR_COLORS.available;
          const isSelected = u.id === selectedId;
          return (
            <button
              key={u.id}
              onClick={() => onSelectUnit(u)}
              title={`${u.unitCode}${u.businessName ? ` — ${u.businessName}` : ""}`}
              style={{
                position: "absolute",
                left: u.positionX * (CELL + GAP),
                top: u.positionY * (CELL + GAP),
                width: u.width * (CELL + GAP) - GAP,
                height: u.height * (CELL + GAP) - GAP,
                backgroundColor: cfg.bg,
                borderColor: isSelected ? "#0f172a" : cfg.border,
                borderWidth: isSelected ? 3 : 1.5,
                borderStyle: "solid",
                borderRadius: 6,
                cursor: "pointer",
                transition: "all 0.12s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 4,
                boxShadow: isSelected ? "0 0 0 2px rgba(15,23,42,0.2)" : undefined,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: cfg.text, lineHeight: 1.2, textAlign: "center" }}>
                {u.unitCode}
              </span>
              {u.businessName && (
                <span style={{
                  fontSize: 9, color: cfg.text, opacity: 0.75, lineHeight: 1.2,
                  textAlign: "center", marginTop: 2, maxWidth: "90%",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {u.businessName}
                </span>
              )}
              <span style={{ fontSize: 9, color: cfg.text, opacity: 0.6, marginTop: 2 }}>
                {getStatusConfig(u.status).label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
        {UNIT_STATUSES.map(s => (
          <span key={s.value} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${s.color}`}>
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: FLOOR_COLORS[s.value]?.border }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Unit Detail Panel ────────────────────────────────────────────────────────

function UnitDetailPanel({
  unit,
  onClose,
  onEdit,
  canEdit,
}: {
  unit: MallUnit;
  onClose: () => void;
  onEdit: (u: MallUnit) => void;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{unit.unitCode}</span>
          <StatusBadge status={unit.status} />
        </div>
        <div className="flex items-center gap-1">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => onEdit(unit)} className="h-7 text-xs">
              <Pencil className="h-3 w-3 mr-1" />Edit
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Info Unit</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <dt className="text-xs text-muted-foreground">Jenis</dt>
              <dd className="text-xs font-medium"><UnitTypeBadge type={unit.unitType} /></dd>
              <dt className="text-xs text-muted-foreground">Area</dt>
              <dd className="text-xs font-medium">{unit.areaKantin ?? "—"}</dd>
              <dt className="text-xs text-muted-foreground">Luas</dt>
              <dd className="text-xs font-medium">{unit.sizeM2 ? `${unit.sizeM2} m²` : "—"}</dd>
              <dt className="text-xs text-muted-foreground">Harga Sewa</dt>
              <dd className="text-xs font-medium text-emerald-700">
                {unit.defaultRentAmount && Number(unit.defaultRentAmount) > 0
                  ? `Rp ${Number(unit.defaultRentAmount).toLocaleString("id-ID")}`
                  : "—"}
              </dd>
              <dt className="text-xs text-muted-foreground">Posisi</dt>
              <dd className="text-xs font-medium">({unit.positionX}, {unit.positionY}) {unit.width}×{unit.height}</dd>
              {unit.notes && (
                <>
                  <dt className="text-xs text-muted-foreground">Catatan</dt>
                  <dd className="text-xs font-medium">{unit.notes}</dd>
                </>
              )}
            </dl>
          </div>

          {unit.businessName && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tenant Aktif</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <dt className="text-xs text-muted-foreground">Usaha</dt>
                  <dd className="text-xs font-medium">{unit.businessName}</dd>
                  <dt className="text-xs text-muted-foreground">Pemilik</dt>
                  <dd className="text-xs font-medium">{unit.ownerName ?? "—"}</dd>
                  {unit.phone && (
                    <>
                      <dt className="text-xs text-muted-foreground">Telepon</dt>
                      <dd className="text-xs font-medium">{unit.phone}</dd>
                    </>
                  )}
                  <dt className="text-xs text-muted-foreground">Periode</dt>
                  <dd className="text-xs font-medium">{fmtDate(unit.startDate)} — {fmtDate(unit.endDate)}</dd>
                  <dt className="text-xs text-muted-foreground">Total Sewa</dt>
                  <dd className="text-xs font-medium">{fmtRp(unit.totalAmount)}</dd>
                  <dt className="text-xs text-muted-foreground">Sudah Bayar</dt>
                  <dd className="text-xs font-medium">{fmtRp(unit.paidAmount)}</dd>
                  <dt className="text-xs text-muted-foreground">Sisa</dt>
                  <dd className="text-xs font-medium text-red-600">{fmtRp(unit.remainingAmount)}</dd>
                  {unit.paymentStatus && (
                    <>
                      <dt className="text-xs text-muted-foreground">Status Bayar</dt>
                      <dd>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ${PAYMENT_STATUS_COLORS[unit.paymentStatus.toUpperCase()] ?? "bg-gray-100 text-gray-700"}`}>
                          {unit.paymentStatus.toUpperCase()}
                        </span>
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            </>
          )}

          {unit.latestInvoiceId && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Invoice Terbaru</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="text-xs font-medium capitalize">{unit.latestInvoiceStatus ?? "—"}</dd>
                  <dt className="text-xs text-muted-foreground">Total</dt>
                  <dd className="text-xs font-medium">{unit.latestInvoiceAmount ? fmtRp(unit.latestInvoiceAmount) : "—"}</dd>
                  <dt className="text-xs text-muted-foreground">Tagihan</dt>
                  <dd className="text-xs font-medium text-red-600">
                    {unit.latestInvoiceOutstanding ? fmtRp(unit.latestInvoiceOutstanding) : "—"}
                  </dd>
                  <dt className="text-xs text-muted-foreground">Jatuh Tempo</dt>
                  <dd className="text-xs font-medium">{fmtDate(unit.latestInvoiceDueDate)}</dd>
                </dl>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Unit Form Drawer ─────────────────────────────────────────────────────────

function UnitFormDrawer({
  open,
  onClose,
  editingUnit,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  editingUnit: MallUnit | null;
  onSave: (data: UnitFormData) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<UnitFormData>(DEFAULT_FORM);
  const [unitCodeTouched, setUnitCodeTouched] = useState(false);

  useEffect(() => {
    if (editingUnit) {
      setForm({
        unitCode: editingUnit.unitCode,
        areaKantin: editingUnit.areaKantin ?? "",
        unitType: editingUnit.unitType ?? "other",
        sizeM2: editingUnit.sizeM2 ?? "",
        defaultRentAmount: editingUnit.defaultRentAmount ?? "",
        status: editingUnit.storedStatus ?? "available",
        positionX: String(editingUnit.positionX),
        positionY: String(editingUnit.positionY),
        width: String(editingUnit.width),
        height: String(editingUnit.height),
        notes: editingUnit.notes ?? "",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setUnitCodeTouched(false);
  }, [editingUnit, open]);

  const set = (field: keyof UnitFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const unitCodeError = unitCodeTouched ? validateUnitCode(form.unitCode) : null;
  const isUnitCodeValid = validateUnitCode(form.unitCode) === null;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{editingUnit ? "Edit Unit" : "Tambah Unit"}</SheetTitle>
          <SheetDescription>
            {editingUnit
              ? `Memperbarui unit ${editingUnit.unitCode}`
              : "Tambah unit kantin baru ke lokasi ini"}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="unitCode" className="text-xs">
                  Kode Unit <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="unitCode"
                  className={`mt-1 h-9 text-sm font-mono ${unitCodeError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  value={form.unitCode}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
                    set("unitCode", val);
                  }}
                  onBlur={() => setUnitCodeTouched(true)}
                  placeholder="Contoh: SC-KTN-04"
                  disabled={!!editingUnit}
                />
                {unitCodeError ? (
                  <p className="text-xs text-red-500 mt-1">{unitCodeError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Gunakan huruf kapital, angka, dan tanda hubung. Contoh: <span className="font-mono">TOD-ELMIRA-01</span>
                  </p>
                )}
              </div>

              <div className="col-span-2">
                <Label htmlFor="areaKantin" className="text-xs">Area Kantin</Label>
                <Input
                  id="areaKantin"
                  className="mt-1 h-9 text-sm"
                  value={form.areaKantin}
                  onChange={e => set("areaKantin", e.target.value)}
                  placeholder="Contoh: Area Kantin, Area Belakang"
                />
              </div>

              <div>
                <Label className="text-xs">
                  Jenis Unit <span className="text-red-500">*</span>
                </Label>
                <Select value={form.unitType} onValueChange={v => set("unitType", v)}>
                  <SelectTrigger className="mt-1 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="sizeM2" className="text-xs">Luas (m²)</Label>
                <Input
                  id="sizeM2"
                  type="number"
                  className="mt-1 h-9 text-sm"
                  value={form.sizeM2}
                  onChange={e => set("sizeM2", e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="defaultRentAmount" className="text-xs">Harga Sewa (Rp)</Label>
                <Input
                  id="defaultRentAmount"
                  type="number"
                  className="mt-1 h-9 text-sm"
                  value={form.defaultRentAmount}
                  onChange={e => set("defaultRentAmount", e.target.value)}
                  placeholder="Contoh: 3000000"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Harga sewa default untuk unit ini (akan otomatis terisi saat tambah tenant).
                </p>
              </div>

              <div className="col-span-2">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger className="mt-1 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDITABLE_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Status otomatis dihitung dari data booking &amp; pembayaran.
                </p>
              </div>
            </div>

            <Separator />

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Posisi di Denah
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="posX" className="text-xs">Kolom (X)</Label>
                <Input
                  id="posX"
                  type="number"
                  className="mt-1 h-9 text-sm"
                  value={form.positionX}
                  onChange={e => set("positionX", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="posY" className="text-xs">Baris (Y)</Label>
                <Input
                  id="posY"
                  type="number"
                  className="mt-1 h-9 text-sm"
                  value={form.positionY}
                  onChange={e => set("positionY", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="unitW" className="text-xs">Lebar (kotak)</Label>
                <Input
                  id="unitW"
                  type="number"
                  min={1}
                  className="mt-1 h-9 text-sm"
                  value={form.width}
                  onChange={e => set("width", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="unitH" className="text-xs">Tinggi (kotak)</Label>
                <Input
                  id="unitH"
                  type="number"
                  min={1}
                  className="mt-1 h-9 text-sm"
                  value={form.height}
                  onChange={e => set("height", e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes" className="text-xs">Catatan</Label>
              <Textarea
                id="notes"
                className="mt-1 text-sm resize-none"
                rows={3}
                value={form.notes}
                onChange={e => set("notes", e.target.value)}
                placeholder="Catatan tambahan (opsional)"
              />
            </div>
          </div>
        </ScrollArea>
        <div className="px-6 py-4 border-t flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-9"
            onClick={onClose}
            disabled={isSaving}
          >
            Batal
          </Button>
          <Button
            className="flex-1 h-9"
            onClick={() => {
              setUnitCodeTouched(true);
              if (!editingUnit && !isUnitCodeValid) return;
              onSave(form);
            }}
            disabled={isSaving || (!editingUnit && !isUnitCodeValid)}
          >
            {isSaving
              ? "Menyimpan..."
              : editingUnit
              ? "Simpan Perubahan"
              : "Tambah Unit"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UnitTenant() {
  const { data: user } = useAuth();
  const { activeSite, activeSiteId } = useSite();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const role = user?.role ?? "";
  const canEdit = role === "owner" || role === "admin";
  const isFinance = role === "finance";

  const [viewMode, setViewMode] = useState<"table" | "floorplan">("table");
  const [filterArea, setFilterArea] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<MallUnit | null>(null);
  const [editingUnit, setEditingUnit] = useState<MallUnit | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MallUnit | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const queryKey = ["mall-units", activeSiteId];

  const { data: units = [], isLoading, refetch } = useQuery<MallUnit[]>({
    queryKey,
    queryFn: () => apiFetchJson<MallUnit[]>("/api/mall-units"),
    enabled: activeSiteId !== null,
  });

  const { data: areas = [] } = useQuery<string[]>({
    queryKey: ["mall-unit-areas", activeSiteId],
    queryFn: () => apiFetchJson<string[]>("/api/mall-units/areas"),
    enabled: activeSiteId !== null,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetchJson<MallUnit>("/api/mall-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["mall-unit-areas"] });
      toast({ title: "Unit berhasil ditambahkan" });
      setShowForm(false);
      setEditingUnit(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Gagal menambahkan unit",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiFetchJson<MallUnit>(`/api/mall-units/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["mall-unit-areas"] });
      toast({ title: "Unit berhasil diperbarui" });
      setShowForm(false);
      setEditingUnit(null);
      if (selectedUnit?.id === updated.id) {
        setSelectedUnit(u => u ? { ...u, ...updated } : null);
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Gagal memperbarui unit",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/mall-units/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Gagal menghapus");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Unit berhasil dihapus" });
      if (selectedUnit?.id === deleteTarget?.id) setSelectedUnit(null);
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Gagal menghapus unit",
        description: err.message,
        variant: "destructive",
      });
      setDeleteTarget(null);
    },
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      apiFetchJson<{ count: number; message: string }>("/api/mall-units/seed-kantin", {
        method: "POST",
      }),
    onSuccess: d => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: d.message });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal seed data", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetchJson<MallUnit>(`/api/mall-units/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey });
      const isNowOccupied = updated.storedStatus !== "available";
      toast({
        title: isNowOccupied
          ? `🔒 Unit ${updated.unitCode} ditandai Terisi`
          : `🔓 Unit ${updated.unitCode} dikosongkan`,
      });
      if (selectedUnit?.id === updated.id) {
        setSelectedUnit(u => u ? { ...u, ...updated } : null);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Gagal mengubah status unit", description: err.message, variant: "destructive" });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: string }) =>
      apiFetchJson<{ ok: boolean; updatedCount: number }>("/api/mall-units/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      }),
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey });
      setSelectedIds(new Set());
      const label = vars.status === "occupied" ? "Terisi" : vars.status === "available" ? "Kosong" : "Perawatan";
      const emoji = vars.status === "occupied" ? "🔒" : vars.status === "available" ? "🔓" : "🔧";
      toast({
        title: `${emoji} ${result.updatedCount} unit ditandai ${label}`,
        description: `Perubahan status berhasil diterapkan ke ${result.updatedCount} unit.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal update status massal", description: err.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiFetchJson<{ ok: boolean; message: string; totalChanged: number; toOccupied: number; toAvailable: number }>(
        "/api/mall-units/sync-from-bookings",
        { method: "POST" },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: result.totalChanged > 0 ? "✅ Sinkronisasi selesai" : "✅ Data sudah sinkron",
        description: result.message,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal sinkronisasi", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(
        ids.map(id => apiFetch(`/api/mall-units/${id}`, { method: "DELETE" })),
      );
      const failed = results.filter(r => r.status === "rejected").length;
      const succeeded = results.filter(r => r.status === "fulfilled").length;
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      queryClient.invalidateQueries({ queryKey });
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      toast({
        title: `🗑️ ${succeeded} unit dihapus`,
        description: failed > 0 ? `${failed} unit gagal dihapus (mungkin masih ada booking aktif).` : undefined,
        variant: failed > 0 ? "destructive" : "default",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal hapus unit", description: err.message, variant: "destructive" });
      setShowBulkDeleteConfirm(false);
    },
  });

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const editableFiltered = filtered.filter(u => u.storedStatus === "available" || (u.storedStatus === "occupied" && !u.tenantId) || u.storedStatus === "maintenance");
    const allSelected = editableFiltered.every(u => selectedIds.has(u.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(editableFiltered.map(u => u.id)));
    }
  }

  function handleSaveForm(formData: UnitFormData) {
    const payload = {
      unitCode: formData.unitCode.trim(),
      areaKantin: formData.areaKantin.trim() || undefined,
      unitType: formData.unitType,
      sizeM2: formData.sizeM2 || undefined,
      defaultRentAmount: formData.defaultRentAmount || "0",
      status: formData.status,
      positionX: parseInt(formData.positionX, 10) || 0,
      positionY: parseInt(formData.positionY, 10) || 0,
      width: parseInt(formData.width, 10) || 2,
      height: parseInt(formData.height, 10) || 2,
      notes: formData.notes.trim() || undefined,
      floor: "Main",
    };
    if (editingUnit) {
      updateMutation.mutate({ id: editingUnit.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleEdit(u: MallUnit) {
    setEditingUnit(u);
    setShowForm(true);
  }

  const filtered = useMemo(() => {
    let result = units;
    if (filterArea !== "all") result = result.filter(u => u.areaKantin === filterArea);
    if (filterType !== "all") result = result.filter(u => u.unitType === filterType);
    if (filterStatus !== "all") result = result.filter(u => u.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.unitCode.toLowerCase().includes(q) ||
        (u.businessName ?? "").toLowerCase().includes(q) ||
        (u.areaKantin ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [units, filterArea, filterType, filterStatus, search]);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isDev = !import.meta.env.PROD;

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" />
              Unit Kantin
            </h1>
            {activeSite && (
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {activeSite.name}
                {isFinance && (
                  <Badge variant="outline" className="ml-2 text-xs text-amber-700 border-amber-300 bg-amber-50">
                    Hanya Lihat
                  </Badge>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {isDev && canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="h-8 text-xs gap-1"
              >
                <Database className="h-3 w-3" />
                {seedMutation.isPending ? "Seeding..." : "Seed Kantin"}
              </Button>
            )}
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="h-8 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                  >
                    <RefreshCcw className={`h-3 w-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                    {syncMutation.isPending ? "Menyinkron..." : "Sinkron Booking"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Sinkronkan status unit dengan data booking aktif</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="h-8 text-xs gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
            {canEdit && (
              <Button
                size="sm"
                onClick={() => { setEditingUnit(null); setShowForm(true); }}
                className="h-8 text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Unit
              </Button>
            )}
          </div>
        </div>

        {/* ── Bulk action bar ── */}
        {canEdit && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
            <span className="text-xs font-semibold text-primary flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" />
              {selectedIds.size} unit dipilih
            </span>
            <div className="flex gap-1.5 flex-wrap ml-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: "occupied" })}
                disabled={bulkStatusMutation.isPending}
              >
                <Lock className="h-3 w-3" /> Tandai Terisi
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: "available" })}
                disabled={bulkStatusMutation.isPending}
              >
                <Unlock className="h-3 w-3" /> Tandai Kosong
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: "maintenance" })}
                disabled={bulkStatusMutation.isPending}
              >
                <Wrench className="h-3 w-3" /> Perawatan
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 bg-red-50 text-red-700 border-red-300 hover:bg-red-100"
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="h-3 w-3" /> Hapus
              </Button>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 ml-auto text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Summary strip */}
        {!isLoading && units.length > 0 && <SummaryCounts units={units} />}

        {/* View toggle + Filter bar */}
        <div className="flex flex-wrap gap-2 items-center">
          <Tabs
            value={viewMode}
            onValueChange={v => setViewMode(v as "table" | "floorplan")}
          >
            <TabsList className="h-8">
              <TabsTrigger value="table" className="text-xs px-3 h-7 gap-1">
                <Table2 className="h-3 w-3" />Tabel
              </TabsTrigger>
              <TabsTrigger value="floorplan" className="text-xs px-3 h-7 gap-1">
                <LayoutGrid className="h-3 w-3" />Denah
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-7 h-8 w-44 text-xs"
              placeholder="Cari kode / tenant..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {areas.length > 0 && (
            <Select value={filterArea} onValueChange={setFilterArea}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Semua Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Area</SelectItem>
                {areas.map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Semua Jenis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Jenis</SelectItem>
              {UNIT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>

        {/* ── Status filter pills ── */}
        {!isLoading && units.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {/* Semua */}
            <button
              onClick={() => setFilterStatus("all")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                filterStatus === "all"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-white text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              Semua
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
                filterStatus === "all" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {units.length}
              </span>
            </button>

            {/* Per status */}
            {UNIT_STATUSES.map(s => {
              const count = units.filter(u => u.status === s.value).length;
              if (count === 0) return null;
              const isActive = filterStatus === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => setFilterStatus(isActive ? "all" : s.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    isActive
                      ? `${s.color} border-current shadow-sm ring-1 ring-current/30`
                      : "bg-white text-muted-foreground border-border hover:border-current/40"
                  }`}
                >
                  {s.label}
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
                    isActive ? "bg-current/20" : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : activeSiteId === null ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground gap-2">
            <Package className="h-10 w-10 opacity-20" />
            <p className="text-sm">Memuat lokasi...</p>
          </div>
        ) : viewMode === "table" ? (
          /* ── Table View ── */
          <div className="border rounded-lg overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {canEdit && (
                    <TableHead className="w-8 pl-3">
                      <Checkbox
                        checked={
                          filtered.length > 0 &&
                          filtered.every(u => selectedIds.has(u.id))
                        }
                        onCheckedChange={toggleSelectAll}
                        aria-label="Pilih semua"
                        className="h-3.5 w-3.5"
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-xs w-28">Kode Unit</TableHead>
                  <TableHead className="text-xs">Area</TableHead>
                  <TableHead className="text-xs">Jenis</TableHead>
                  <TableHead className="text-xs w-16">Luas</TableHead>
                  <TableHead className="text-xs w-28">Harga Sewa</TableHead>
                  <TableHead className="text-xs w-24">Status</TableHead>
                  <TableHead className="text-xs">Tenant Aktif</TableHead>
                  <TableHead className="text-xs w-24">Status Bayar</TableHead>
                  {canEdit && (
                    <TableHead className="text-xs w-20 text-right">Aksi</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canEdit ? 10 : 8}
                      className="text-center py-12 text-muted-foreground text-sm"
                    >
                      {units.length === 0
                        ? canEdit
                          ? 'Belum ada unit. Klik "Tambah Unit" atau "Seed Kantin" untuk memulai.'
                          : "Belum ada unit untuk lokasi ini."
                        : "Tidak ada unit yang sesuai filter."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(u => (
                    <TableRow
                      key={u.id}
                      className={`hover:bg-muted/20 cursor-pointer ${selectedIds.has(u.id) ? "bg-primary/5" : ""}`}
                      onClick={() => setSelectedUnit(u)}
                    >
                      {canEdit && (
                        <TableCell className="pl-3 py-2.5" onClick={e => { e.stopPropagation(); toggleSelect(u.id); }}>
                          <Checkbox
                            checked={selectedIds.has(u.id)}
                            onCheckedChange={() => toggleSelect(u.id)}
                            aria-label={`Pilih ${u.unitCode}`}
                            className="h-3.5 w-3.5"
                          />
                        </TableCell>
                      )}
                      <TableCell className="py-2.5">
                        <span className="font-mono text-xs font-semibold">{u.unitCode}</span>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">
                        {u.areaKantin ?? "—"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <UnitTypeBadge type={u.unitType} />
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground">
                        {u.sizeM2 ? `${u.sizeM2} m²` : "—"}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs font-medium">
                        {u.defaultRentAmount && Number(u.defaultRentAmount) > 0
                          ? `Rp ${Number(u.defaultRentAmount).toLocaleString("id-ID")}`
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <StatusBadge status={u.status} />
                      </TableCell>
                      <TableCell className="py-2.5 text-xs">
                        {u.businessName
                          ? <span className="font-medium">{u.businessName}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="py-2.5">
                        {u.paymentStatus ? (
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ${PAYMENT_STATUS_COLORS[u.paymentStatus.toUpperCase()] ?? "bg-gray-100 text-gray-700"}`}>
                            {u.paymentStatus.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell
                          className="py-2.5 text-right"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex gap-1 justify-end">
                            {(u.storedStatus === "available" || (u.storedStatus === "occupied" && !u.tenantId)) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className={u.storedStatus === "available"
                                  ? "h-7 w-7 bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 hover:text-amber-900"
                                  : "h-7 w-7 bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 hover:text-emerald-900"}
                                onClick={() => statusMutation.mutate({
                                  id: u.id,
                                  status: u.storedStatus === "available" ? "occupied" : "available",
                                })}
                                disabled={statusMutation.isPending}
                                title={u.storedStatus === "available" ? "Tandai Terisi" : "Kosongkan Unit"}
                              >
                                {u.storedStatus === "available"
                                  ? <Lock className="h-3.5 w-3.5" />
                                  : <Unlock className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleEdit(u)}
                              title="Edit unit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(u)}
                              title="Hapus unit"
                              disabled={u.status === "occupied" || u.status === "booked"}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {filtered.length > 0 && (
              <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                Menampilkan {filtered.length} dari {units.length} unit
              </div>
            )}
          </div>
        ) : (
          /* ── Floor Plan View ── */
          <FloorPlan
            units={filtered}
            onSelectUnit={setSelectedUnit}
            selectedId={selectedUnit?.id ?? null}
          />
        )}
      </div>

      {/* ── Detail panel ── */}
      {selectedUnit && (
        <div className="w-72 shrink-0 border rounded-lg bg-white overflow-hidden flex flex-col shadow-sm">
          <UnitDetailPanel
            unit={selectedUnit}
            onClose={() => setSelectedUnit(null)}
            onEdit={handleEdit}
            canEdit={canEdit}
          />
        </div>
      )}

      {/* ── Form drawer ── */}
      <UnitFormDrawer
        open={showForm}
        onClose={() => { setShowForm(false); setEditingUnit(null); }}
        editingUnit={editingUnit}
        onSave={handleSaveForm}
        isSaving={isSaving}
      />

      {/* ── Delete dialog ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={v => { if (!v) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus Unit {deleteTarget?.unitCode}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Unit ini akan dihapus permanen. Jika masih ada booking aktif,
              penghapusan akan ditolak secara otomatis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk delete dialog ── */}
      <AlertDialog
        open={showBulkDeleteConfirm}
        onOpenChange={v => { if (!v) setShowBulkDeleteConfirm(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus {selectedIds.size} unit sekaligus?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size} unit yang dipilih akan dihapus secara permanen.
              Unit yang masih memiliki booking aktif akan ditolak penghapusannya secara otomatis.
              Tindakan ini tidak dapat diurungkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Menghapus..." : `Hapus ${selectedIds.size} Unit`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
