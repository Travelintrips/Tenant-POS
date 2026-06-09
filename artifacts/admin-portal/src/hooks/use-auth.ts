import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const USER_ROLES = ["owner", "admin", "finance", "cashier", "tenant_user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Pemilik",
  admin: "Admin",
  finance: "Keuangan",
  cashier: "Kasir",
  tenant_user: "Tenant",
};

export interface TenantAccessEntry {
  tenantId: number;
  siteId: number;
  accessLevel: string;
  tenantName?: string;
  siteName?: string;
}

export interface AuthUser {
  id: string;
  dbId: number;
  email: string | null;
  name: string;
  phoneNumber: string | null;
  avatar: string | null;
  role: UserRole;
  allowedSites?: number[];
  tenantAccess?: TenantAccessEntry[];
}

export function useAuth() {
  return useQuery<AuthUser | null>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Auth check failed");
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      qc.setQueryData(["auth-me"], null);
      window.location.href = "/login";
    },
  });
}

export function hasRole(user: AuthUser | null | undefined, ...roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function isAdminRole(user: AuthUser | null | undefined): boolean {
  return hasRole(user, "owner", "admin", "finance", "cashier");
}
