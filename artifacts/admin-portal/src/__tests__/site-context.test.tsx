import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { SiteProvider, useSite } from "@/contexts/site-context";

function SiteProbe() {
  const { activeSite, sites, setActiveSite } = useSite();

  return (
    <div>
      <span data-testid="active-site">{activeSite?.name ?? "loading"}</span>
      {sites.map((site) => (
        <button key={site.id} type="button" onClick={() => setActiveSite(site)}>
          {site.name}
        </button>
      ))}
    </div>
  );
}

describe("SiteProvider site switching", () => {
  it("mengganti site secara langsung dan hanya me-refetch query aktif", async () => {
    localStorage.clear();

    vi.mocked(global.fetch).mockImplementation((input) => {
      const url = String(input);

      if (url.includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "owner-1",
              dbId: "1",
              email: "owner@test.local",
              name: "Test Owner",
              role: "owner",
              avatar: null,
            }),
        } as Response);
      }

      if (url.includes("/api/sites")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              {
                id: 1,
                code: "TOD_M1_BANDARA",
                name: "TOD M1 Bandara",
                type: "mall_tenant",
                status: "active",
              },
              {
                id: 2,
                code: "SPORT_CENTER_BANDARA",
                name: "Sport Center Bandara",
                type: "sport_center",
                status: "active",
              },
            ]),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <SiteProvider>
          <SiteProbe />
        </SiteProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("active-site")).toHaveTextContent("Sport Center Bandara");
    });
    expect(localStorage.getItem("mall_active_site_id")).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "TOD M1 Bandara" }));

    expect(screen.getByTestId("active-site")).toHaveTextContent("TOD M1 Bandara");
    expect(localStorage.getItem("mall_active_site_id")).toBe("1");
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchType: "active",
      }),
    );
  });

  it("tidak memicu refetch bila user memilih site yang sudah aktif", async () => {
    localStorage.setItem("mall_active_site_id", "2");

    vi.mocked(global.fetch).mockImplementation((input) => {
      const url = String(input);

      if (url.includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "owner-1",
              dbId: "1",
              email: "owner@test.local",
              name: "Test Owner",
              role: "owner",
              avatar: null,
            }),
        } as Response);
      }

      if (url.includes("/api/sites")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              {
                id: 1,
                code: "TOD_M1_BANDARA",
                name: "TOD M1 Bandara",
                type: "mall_tenant",
                status: "active",
              },
              {
                id: 2,
                code: "SPORT_CENTER_BANDARA",
                name: "Sport Center Bandara",
                type: "sport_center",
                status: "active",
              },
            ]),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <SiteProvider>
          <SiteProbe />
        </SiteProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("active-site")).toHaveTextContent("Sport Center Bandara");
    });

    invalidateSpy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Sport Center Bandara" }));

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("mall_active_site_id")).toBe("2");
  });
});
