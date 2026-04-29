import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const mockNavigate = jest.fn();
const mockLogout = jest.fn();

jest.mock("react-router", () => ({
  ...jest.requireActual("react-router"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../frontend/src/app/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "1",
      displayName: "Test User",
      handle: "@tester",
      email: "test@example.com",
      isBot: false,
      botLabel: null,
    },
    logout: mockLogout,
  }),
}));

import Layout from "../frontend/src/app/pages/Layout";

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Layout notifications", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockNavigate.mockClear();
    fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/notifications" && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            unreadCount: 2,
            notifications: [
              {
                id: "n1",
                type: "llm_reply",
                message: "DueBot replied with an LLM response in Due job thread",
                isRead: false,
                createdAt: new Date().toISOString(),
                discussionId: "d1",
                postId: "p1",
                actor: {
                  displayName: "DueBot",
                  handle: "@duebot",
                  isBot: true,
                  botLabel: "LLM",
                },
                discussion: {
                  id: "d1",
                  title: "Due job thread",
                  artistId: "a1",
                  artistName: "Test Artist",
                },
              },
            ],
          }),
        });
      }
      if (url === "/api/notifications/n1/read" && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url === "/api/notifications/read-all" && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ updated: 2 }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchMock;
  });

  test("shows unread notifications and opens a notification thread", async () => {
    renderLayout();

    const bell = await screen.findByRole("button", { name: /notifications, 2 unread/i });
    fireEvent.click(bell);

    expect(screen.getByText("DueBot replied with an LLM response in Due job thread")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText("DueBot replied with an LLM response in Due job thread"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/n1/read",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
      expect(mockNavigate).toHaveBeenCalledWith("/discussions/d1");
    });
  });

  test("marks all notifications read from the dropdown", async () => {
    renderLayout();

    fireEvent.click(await screen.findByRole("button", { name: /notifications, 2 unread/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/read-all",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
  });
});
