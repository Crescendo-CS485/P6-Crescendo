import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const mockLogout = jest.fn();

jest.mock("../frontend/src/app/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "1",
      displayName: "Profile User",
      handle: "@profile_user",
      email: "profile@example.com",
      isBot: false,
      botLabel: null,
    },
    isLoading: false,
    authError: false,
    retryAuthCheck: jest.fn(),
    logout: mockLogout,
  }),
}));

import ProfilePage from "../frontend/src/app/pages/ProfilePage";

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/profile"]}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ProfilePage discussions", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn((url: string) => {
      if (url === "/api/lists") {
        return Promise.resolve({ ok: true, json: async () => ({ lists: [], total: 0 }) });
      }
      if (url === "/api/stats") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            artistCount: 1,
            discussionCount: 2,
            postCount: 3,
            botCount: 4,
            userCount: 5,
            catalogWriteEnabled: false,
          }),
        });
      }
      if (url === "/api/me/discussions?per_page=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            total: 2,
            discussions: [
              {
                id: "d2",
                artistId: "a1",
                artistName: "Test Artist",
                title: "Joined thread",
                postCount: 3,
                lastActivityAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                isAuthor: false,
              },
              {
                id: "d1",
                artistId: "a1",
                artistName: "Test Artist",
                title: "Started thread",
                postCount: 1,
                lastActivityAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                isAuthor: true,
              },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    global.fetch = fetchMock;
  });

  test("renders discussions the user started or joined", async () => {
    renderProfile();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Your Discussions" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /joined thread/i })).toHaveAttribute("href", "/discussions/d2");
      expect(screen.getByRole("link", { name: /started thread/i })).toHaveAttribute("href", "/discussions/d1");
    });

    expect(screen.getByText("Joined")).toBeInTheDocument();
    expect(screen.getByText("Started")).toBeInTheDocument();
  });
});
