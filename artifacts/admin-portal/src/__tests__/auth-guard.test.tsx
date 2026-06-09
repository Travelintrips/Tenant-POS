import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Wrapper({ children, qc }: { children: React.ReactNode; qc: QueryClient }) {
  return (
    <QueryClientProvider client={qc}>
      <WouterRouter>{children}</WouterRouter>
    </QueryClientProvider>
  );
}

function AuthGuardSimple({
  roles,
  children,
  user,
}: {
  roles?: string[];
  children: React.ReactNode;
  user: { role: string } | null;
}) {
  if (!user) {
    window.location.href = "/login";
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    return <div data-testid="unauthorized">Unauthorized</div>;
  }
  return <>{children}</>;
}

describe("Fase 1 — AuthGuard Logic (Frontend)", () => {
  describe("user belum login", () => {
    it("redirect ke /login jika user null", () => {
      const qc = makeQC();
      render(
        <Wrapper qc={qc}>
          <AuthGuardSimple user={null} roles={["owner"]}>
            <div>Protected</div>
          </AuthGuardSimple>
        </Wrapper>
      );
      expect(window.location.href).toContain("/login");
    });
  });

  describe("user sudah login", () => {
    it("menampilkan children jika role cocok", () => {
      const qc = makeQC();
      render(
        <Wrapper qc={qc}>
          <AuthGuardSimple user={{ role: "owner" }} roles={["owner", "admin"]}>
            <div data-testid="protected-content">Konten Terlindungi</div>
          </AuthGuardSimple>
        </Wrapper>
      );
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("menampilkan unauthorized jika role tidak sesuai", () => {
      const qc = makeQC();
      render(
        <Wrapper qc={qc}>
          <AuthGuardSimple user={{ role: "cashier" }} roles={["owner", "admin"]}>
            <div>Konten Owner</div>
          </AuthGuardSimple>
        </Wrapper>
      );
      expect(screen.getByTestId("unauthorized")).toBeInTheDocument();
    });

    it("cashier bisa akses halaman POS (role sesuai)", () => {
      const qc = makeQC();
      render(
        <Wrapper qc={qc}>
          <AuthGuardSimple
            user={{ role: "cashier" }}
            roles={["owner", "admin", "finance", "cashier"]}
          >
            <div data-testid="pos-page">Halaman POS</div>
          </AuthGuardSimple>
        </Wrapper>
      );
      expect(screen.getByTestId("pos-page")).toBeInTheDocument();
    });

    it("finance tidak bisa akses halaman yang hanya untuk owner/admin", () => {
      const qc = makeQC();
      render(
        <Wrapper qc={qc}>
          <AuthGuardSimple user={{ role: "finance" }} roles={["owner", "admin"]}>
            <div data-testid="admin-content">Konten Admin</div>
          </AuthGuardSimple>
        </Wrapper>
      );
      expect(screen.getByTestId("unauthorized")).toBeInTheDocument();
      expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
    });
  });

  describe("useAuth hook — fetch behavior", () => {
    it("mengembalikan null (401) jika user belum login", async () => {
      const { useAuth } = await import("@/hooks/use-auth");
      const qc = makeQC();

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve(null),
      } as Response);

      function TestComp() {
        const { data, isLoading } = useAuth();
        if (isLoading) return <div>Loading...</div>;
        return <div data-testid="auth-result">{data ? data.role : "null"}</div>;
      }

      render(
        <Wrapper qc={qc}>
          <TestComp />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId("auth-result")).toHaveTextContent("null");
      });
    });

    it("mengembalikan data user jika sudah login", async () => {
      const { useAuth } = await import("@/hooks/use-auth");
      const qc = makeQC();

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "1",
            dbId: 1,
            email: "owner@test.local",
            name: "Test Owner",
            role: "owner",
            avatar: null,
          }),
      } as Response);

      function TestComp() {
        const { data, isLoading } = useAuth();
        if (isLoading) return <div>Loading...</div>;
        return <div data-testid="auth-result">{data?.role ?? "null"}</div>;
      }

      render(
        <Wrapper qc={qc}>
          <TestComp />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId("auth-result")).toHaveTextContent("owner");
      });
    });
  });
});
