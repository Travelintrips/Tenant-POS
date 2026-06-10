import React, { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Settings, Building2, FileText, DollarSign, Save, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MallConfig {
  mallName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  invoicePrefix: string;
  taxRate: number;
  currency: string;
  logoUrl: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery<MallConfig>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Gagal memuat pengaturan");
      return res.json();
    },
  });

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<MallConfig>({
    defaultValues: config,
  });

  useEffect(() => {
    if (config) reset(config);
  }, [config, reset]);

  const mutation = useMutation({
    mutationFn: async (data: MallConfig) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Gagal menyimpan");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Pengaturan disimpan", description: "Konfigurasi sistem berhasil diperbarui." });
      qc.setQueryData(["settings"], data);
      reset(data);
    },
    onError: (err: Error) => {
      toast({ title: "Gagal", description: err.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: MallConfig) => mutation.mutate(data);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Pengaturan Sistem
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Konfigurasi umum portal admin mall
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Informasi Mall */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Informasi Mall
            </CardTitle>
            <CardDescription className="text-xs">
              Nama dan detail kontak mall yang tampil di sistem
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nama Mall *</Label>
                    <Input {...register("mallName")} placeholder="Mall Admin" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tagline</Label>
                    <Input {...register("tagline")} placeholder="Manajemen Tenant Mall" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alamat</Label>
                  <Input {...register("address")} placeholder="Jl. Contoh No. 1, Kota" className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telepon</Label>
                    <Input {...register("phone")} placeholder="021-12345678" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input {...register("email")} type="email" placeholder="admin@mall.com" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">URL Logo (opsional)</Label>
                  <Input {...register("logoUrl")} placeholder="https://..." className="h-8 text-sm" />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pengaturan Invoice */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Pengaturan Invoice
            </CardTitle>
            <CardDescription className="text-xs">
              Format dan aturan penomoran invoice
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="h-16 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prefix Invoice</Label>
                  <Input {...register("invoicePrefix")} placeholder="INV-TENANT" className="h-8 text-sm font-mono" />
                  <p className="text-[10px] text-muted-foreground">Contoh: INV-TENANT/202506/00001</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mata Uang</Label>
                  <Input {...register("currency")} placeholder="IDR" className="h-8 text-sm" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pengaturan Pajak */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Pengaturan Pajak
            </CardTitle>
            <CardDescription className="text-xs">
              Tarif pajak yang diterapkan pada invoice
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-32 space-y-1.5">
                  <Label className="text-xs">PPN / Tarif Pajak (%)</Label>
                  <Input
                    {...register("taxRate", { valueAsNumber: true })}
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-5">
                  Isi 0 jika tidak ada pajak. Contoh: 11 untuk PPN 11%.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!isDirty || mutation.isPending} className="gap-1.5">
            <Save className="h-4 w-4" />
            {mutation.isPending ? "Menyimpan..." : "Simpan Pengaturan"}
          </Button>
          {isDirty && (
            <Button type="button" variant="ghost" size="sm" onClick={() => reset(config)} className="gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
