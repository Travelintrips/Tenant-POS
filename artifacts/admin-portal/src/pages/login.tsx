import { useState, useEffect } from "react";
import { Building2, FlaskConical, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS, type UserRole } from "@/hooks/use-auth";

const DEV_ACCOUNTS: { role: UserRole; label: string; color: string }[] = [
  { role: "owner",       label: "Pemilik",      color: "bg-purple-100 text-purple-800 hover:bg-purple-200" },
  { role: "admin",       label: "Admin",         color: "bg-blue-100 text-blue-800 hover:bg-blue-200" },
  { role: "finance",     label: "Keuangan",      color: "bg-green-100 text-green-800 hover:bg-green-200" },
  { role: "cashier",     label: "Kasir",          color: "bg-orange-100 text-orange-800 hover:bg-orange-200" },
  { role: "tenant_user", label: "Tenant User",   color: "bg-teal-100 text-teal-800 hover:bg-teal-200" },
];

type Step = "phone" | "otp";

export default function Login() {
  const error = new URLSearchParams(window.location.search).get("error");
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);
  const [devLoginEnabled, setDevLoginEnabled] = useState<boolean | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    const tryFetch = (attemptsLeft: number) => {
      fetch("/api/auth/dev-login-enabled", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setDevLoginEnabled(data.enabled === true);
        })
        .catch(() => {
          if (cancelled) return;
          if (attemptsLeft > 1) {
            setTimeout(() => tryFetch(attemptsLeft - 1), 1500);
          } else {
            setDevLoginEnabled(false);
          }
        });
    };
    tryFetch(5);
    return () => { cancelled = true; };
  }, []);

  const handleDevLogin = async (role: UserRole) => {
    setLoadingRole(role);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const user = await res.json();
        qc.setQueryData(["auth-me"], user);
        if (user.role === "tenant_user") {
          window.location.href = "/tenant-portal";
        } else {
          window.location.href = "/";
        }
      } else {
        const body = await res.json().catch(() => ({}));
        setLoginError(body.error ?? `Login gagal (${res.status})`);
        setLoadingRole(null);
      }
    } catch {
      setLoginError("Tidak dapat terhubung ke server");
      setLoadingRole(null);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;
    setOtpLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/whatsapp/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error ?? "Gagal mengirim OTP");
      } else {
        if (data.devOtp) setDevOtp(data.devOtp);
        setStep("otp");
      }
    } catch {
      setLoginError("Tidak dapat terhubung ke server");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setOtpLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/whatsapp/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phoneNumber, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error ?? "Verifikasi gagal");
      } else {
        qc.setQueryData(["auth-me"], data);
        if (data.role === "tenant_user") {
          window.location.href = "/tenant-portal";
        } else {
          window.location.href = "/";
        }
      }
    } catch {
      setLoginError("Tidak dapat terhubung ke server");
    } finally {
      setOtpLoading(false);
    }
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
          {(error || loginError) && (
            <div className="text-sm text-destructive text-center bg-destructive/10 rounded-md py-2 px-3">
              {loginError ?? "Login gagal. Silakan coba lagi."}
            </div>
          )}

          {step === "phone" ? (
            <form onSubmit={handleRequestOtp} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Nomor WhatsApp</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="08123456789"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={otpLoading}
                  autoComplete="tel"
                />
              </div>
              <Button type="submit" className="w-full gap-2" size="lg" disabled={otpLoading || !phoneNumber.trim()}>
                {otpLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                Kirim Kode OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground text-center">
                Kode OTP dikirim ke <span className="font-medium text-foreground">{phoneNumber}</span>
              </p>
              {devOtp && (
                <div className="text-xs text-center bg-yellow-50 border border-yellow-200 rounded-md py-2 px-3 text-yellow-800">
                  <span className="font-semibold">Dev OTP:</span> {devOtp}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="otp">Kode OTP (6 digit)</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  disabled={otpLoading}
                  autoComplete="one-time-code"
                />
              </div>
              <Button type="submit" className="w-full gap-2" size="lg" disabled={otpLoading || otp.length !== 6}>
                {otpLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Verifikasi & Masuk
              </Button>
              <button
                type="button"
                onClick={() => { setStep("phone"); setOtp(""); setDevOtp(null); setLoginError(null); }}
                className="text-xs text-center text-muted-foreground hover:text-foreground underline"
              >
                Ganti nomor
              </button>
            </form>
          )}

          {devLoginEnabled && (
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
                    onClick={() => handleDevLogin(acc.role)}
                    disabled={loadingRole !== null}
                    className={`rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${acc.color}`}
                  >
                    {loadingRole === acc.role ? "Masuk..." : acc.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-center text-muted-foreground">
                Akses cepat untuk pengujian. Tidak tersedia di production.
              </p>
            </>
          )}

          {devLoginEnabled === false && (
            <p className="text-xs text-center text-muted-foreground">
              Hanya akun yang diizinkan yang dapat mengakses portal ini.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
