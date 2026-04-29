import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
          <Route path="/lists/:id" element={<div>Created list detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ProfilePage discussions", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/lists" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            list: {
              id: "new-list",
              title: "Profile Picks",
              description: "Albums from the profile page",
            },
          }),
        });
      }
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

  test("creates a list from the profile page", async () => {
    renderProfile();

    fireEvent.click(await screen.findByRole("button", { name: /create list/i }));
    fireEvent.change(screen.getByPlaceholderText(/my favourite jazz albums/i), {
      target: { value: "Profile Picks" },
    });
    fireEvent.change(screen.getByPlaceholderText(/what's this list about/i), {
      target: { value: "Albums from the profile page" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /create list/i }).at(-1)!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/lists",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            title: "Profile Picks",
            description: "Albums from the profile page",
            createdBy: "Profile User",
          }),
          credentials: "include",
        }),
      );
      expect(screen.getByText("Created list detail")).toBeInTheDocument();
    });
  });
});
