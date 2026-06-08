import React from "react";
import { Map, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TenantPos() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">POS Tenant</h1>
        <p className="text-muted-foreground mt-1">
          Klik tenant pada denah untuk proses pembayaran
        </p>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        <Card className="flex-1 min-w-[60%] border-dashed border-2 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
            <Map className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">
              Denah tenant akan tampil di sini
            </p>
          </CardContent>
        </Card>

        <Card className="w-[40%] flex-shrink-0 border-dashed border-2 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
            <Receipt className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">
              Pilih tenant untuk melihat detail pembayaran
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
