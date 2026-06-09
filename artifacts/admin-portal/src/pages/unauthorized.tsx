import { ShieldX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Unauthorized() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-3 items-start">
            <ShieldX className="h-8 w-8 text-destructive shrink-0 mt-0.5" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Akses Ditolak</h1>
              <p className="mt-2 text-sm text-gray-600">
                Anda tidak memiliki izin untuk mengakses halaman ini. Hubungi administrator jika Anda merasa ini adalah kesalahan.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <Button variant="outline" onClick={() => window.history.back()} className="flex-1">
              Kembali
            </Button>
            <Button onClick={() => (window.location.href = "/")} className="flex-1">
              Ke Beranda
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
