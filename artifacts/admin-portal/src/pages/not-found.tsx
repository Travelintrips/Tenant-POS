import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-red-500 shrink-0" />
            <h1 className="text-2xl font-bold text-gray-900">404 — Halaman Tidak Ditemukan</h1>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Halaman yang Anda cari tidak tersedia atau telah dipindahkan.
          </p>
          <Link href="/">
            <Button className="mt-6 gap-2" variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
