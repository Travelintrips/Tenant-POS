import { useState } from "react";
import { Building2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ROLE_LABELS, type UserRole } from "@/hooks/use-auth";

const IS_DEV = import.meta.env.DEV;

const DEV_ACCOUNTS: { role: UserRole; email: string; name: string; color: string }[] = [
  { role: "owner",   email: "owner@dev.local",   name: "Dev Owner",   color: "bg-purple-100 text-purple-800 hover:bg-purple-200" },
  { role: "admin",   email: "admin@dev.local",   name: "Dev Admin",   color: "bg-blue-100 text-blue-800 hover:bg-blue-200" },
  { role: "finance", email: "finance@dev.local", name: "Dev Finance", color: "bg-green-100 text-green-800 hover:bg-green-200" },
  { role: "cashier", email: "cashier@dev.local", name: "Dev Kasir",   color: "bg-orange-100 text-orange-800 hover:bg-orange-200" },
];

async function devLogin(account: (typeof DEV_ACCOUNTS)[number]) {
  const res = await fetch("/api/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: account.email, name: account.name, role: account.role }),
  });
  if (res.ok) {
    window.location.href = "/";
  }
}

export default function Login() {
  const error = new URLSearchParams(window.location.search).get("error");
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);

  const handleDevLogin = async (account: (typeof DEV_ACCOUNTS)[number]) => {
    setLoadingRole(account.role);
    await devLogin(account);
    setLoadingRole(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Portal Admin</CardTitle>
          <CardDescription className="text-sm">
            Manajemen Tenant Mall
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          {error && (
            <div className="text-sm text-destructive text-center bg-destructive/10 rounded-md py-2 px-3">
              Login gagal. Silakan coba lagi.
            </div>
          )}

          <a href="/api/auth/google">
            <Button className="w-full gap-2" size="lg">
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Masuk dengan Google
            </Button>
          </a>

          {IS_DEV && (
            <>
              <div className="flex items-center gap-2 my-1">
                <Separator className="flex-1" />
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                  <FlaskConical className="h-3 w-3" /> DEV MODE
                </span>
                <Separator className="flex-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEV_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.role}
                    onClick={() => handleDevLogin(acc)}
                    disabled={loadingRole !== null}
                    className={`rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${acc.color}`}
                  >
                    {loadingRole === acc.role ? "Masuk..." : ROLE_LABELS[acc.role]}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-center text-muted-foreground">
                Akses cepat untuk pengujian lokal. Tidak tersedia di production.
              </p>
            </>
          )}

          {!IS_DEV && (
            <p className="text-xs text-center text-muted-foreground">
              Hanya akun yang diizinkan yang dapat mengakses portal ini.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
