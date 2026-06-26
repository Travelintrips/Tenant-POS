import BankRekonPanel from "@/components/bank-rekon-panel";
import { Banknote } from "lucide-react";

export default function BankRekonsiliasi() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Banknote className="h-5 w-5 text-orange-500" />Rekonsiliasi Bank
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Cocokkan mutasi rekening dengan transaksi di sistem
        </p>
      </div>
      <BankRekonPanel />
    </div>
  );
}
