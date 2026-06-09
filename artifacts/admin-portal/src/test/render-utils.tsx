import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import type { AuthUser } from "@/hooks/use-auth";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function withUser(user: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "1",
    dbId: 1,
    email: "owner@test.local",
    name: "Test Owner",
    role: "owner",
    avatar: null,
    ...user,
  };
}

interface WrapperProps {
  user?: AuthUser | null;
  initialPath?: string;
}

function createWrapper({ initialPath = "/" }: WrapperProps = {}) {
  const queryClient = makeQueryClient();

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={initialPath !== "/" ? "" : undefined}>
        {children}
      </WouterRouter>
    </QueryClientProvider>
  );
  Wrapper.displayName = "TestWrapper";
  return { Wrapper, queryClient };
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: WrapperProps & RenderOptions = {}
) {
  const { user, initialPath, ...renderOptions } = options;
  const { Wrapper, queryClient } = createWrapper({ user, initialPath });

  if (user !== undefined) {
    queryClient.setQueryData(["auth-me"], user);
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

export function mockFetchResponse(url: string, data: unknown, status = 200) {
  const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
  const existing = fetchMock.getMockImplementation();

  fetchMock.mockImplementation((reqUrl: string) => {
    if (String(reqUrl).includes(url)) {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
      } as Response);
    }
    return existing ? existing(reqUrl) : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
  });
}
