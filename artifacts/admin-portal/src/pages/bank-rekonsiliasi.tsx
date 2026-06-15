import BankRekonPanel from "@/components/bank-rekon-panel";

export default function BankRekonsiliasi() {
  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rekonsiliasi Mutasi Bank</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Import mutasi rekening, cocokkan otomatis dengan transaksi/invoice, lalu setujui atau tolak.
        </p>
      </div>
      <BankRekonPanel />
    </div>
  );
}
