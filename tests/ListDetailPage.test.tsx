import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const mockNavigate = jest.fn();

jest.mock("react-router", () => ({
  ...jest.requireActual("react-router"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../frontend/src/app/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "2",
      displayName: "Test User",
      handle: "@tester",
      email: "test@example.com",
      isBot: false,
      botLabel: null,
    },
    isLoading: false,
    authError: false,
    retryAuthCheck: jest.fn(),
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import { toast } from "sonner";
import ListDetailPage from "../frontend/src/app/pages/ListDetailPage";

function makeAlbum(overrides: Record<string, unknown> = {}) {
  return {
    id: "10",
    title: "Test Album",
    artistId: "1",
    artistName: "Test Artist",
    coverUrl: "https://example.com/cover.jpg",
    artistImage: null,
    releaseDate: "January 1, 2024",
    releaseYear: 2024,
    userScore: 8,
    criticScore: null,
    reviewCount: 0,
    discussionCount: 0,
    listAppearances: 0,
    albumType: "studio",
    genres: ["Rock"],
    ...overrides,
  };
}

function makeList(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    title: "Shared List",
    description: "A list owned by someone else.",
    createdBy: "Other User",
    creatorUserId: "1",
    albumCount: 1,
    likes: 3,
    userHasLiked: false,
    albums: [makeAlbum()],
    ...overrides,
  };
}

function renderPage(listId = "1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/lists/${listId}`]}>
        <Routes>
          <Route path="/lists/:id" element={<ListDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ListDetailPage", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    mockNavigate.mockClear();
    jest.mocked(toast.error).mockClear();
  });

  test("like button calls API and updates count from server response", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/lists/1/like") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ liked: true, likeCount: 10 }),
        });
      }
      if (typeof url === "string" && url.includes("/api/lists/1") && !url.includes("/like")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ list: makeList({ likes: 3, userHasLiked: false }) }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared List" })).toBeInTheDocument());

    const likeBtn = screen.getByRole("button", { name: /like this list, 3 likes/i });
    expect(likeBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(likeBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/lists/1/like",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /unlike this list, 10 likes/i })).toBeInTheDocument();
    });
  });

  test("like rolls back optimistic state when API returns non-OK", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/lists/1/like") && init?.method === "POST") {
        return Promise.resolve({ ok: false, json: async () => ({ error: "nope" }) });
      }
      if (typeof url === "string" && url.includes("/api/lists/1") && !url.includes("/like")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ list: makeList({ likes: 3, userHasLiked: false }) }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /like this list, 3 likes/i }));

    fireEvent.click(screen.getByRole("button", { name: /like this list, 3 likes/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /like this list, 3 likes/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /like this list, 3 likes/i })).toHaveAttribute("aria-pressed", "false");
    });
  });

  test("like rolls back optimistic state when fetch throws", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/lists/1/like") && init?.method === "POST") {
        return Promise.reject(new Error("network"));
      }
      if (typeof url === "string" && url.includes("/api/lists/1") && !url.includes("/like")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ list: makeList({ likes: 3, userHasLiked: false }) }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /like this list, 3 likes/i }));

    fireEvent.click(screen.getByRole("button", { name: /like this list, 3 likes/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /like this list, 3 likes/i })).toBeInTheDocument();
    });
  });

  test("fork from banner navigates to new list id on success", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/lists/1/fork") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ list: { id: "99", title: "Copy" } }),
        });
      }
      if (typeof url === "string" && url.includes("/api/lists/1") && !url.includes("/fork")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ list: makeList() }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: "Add Albums" }));

    fireEvent.click(screen.getByRole("button", { name: "Add Albums" }));
    expect(await screen.findByText(/don't own this list/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Copy" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/lists/99");
    });
  });

  test("fork failure shows toast and does not navigate", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/lists/1/fork") && init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: "Sign in to copy a list" }),
        });
      }
      if (typeof url === "string" && url.includes("/api/lists/1") && !url.includes("/fork")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ list: makeList() }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: "Add Albums" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Albums" }));
    await screen.findByText(/don't own this list/i);

    fireEvent.click(screen.getByRole("button", { name: "Create Copy" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Sign in to copy a list");
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("add album modal loads additional album pages from the API", async () => {
    const firstPageAlbum = makeAlbum({ id: "20", title: "First Page Album" });
    const secondPageAlbum = makeAlbum({ id: "21", title: "Second Page Album" });

    fetchMock.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/lists/1")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            list: makeList({
              creatorUserId: "2",
              albums: [makeAlbum({ id: "99", title: "Existing Album" })],
              albumCount: 1,
            }),
          }),
        });
      }

      if (typeof url === "string" && url.includes("/api/albums")) {
        const parsed = new URL(url, "http://localhost");
        const page = parsed.searchParams.get("page");
        return Promise.resolve({
          ok: true,
          json: async () => ({
            albums: page === "2" ? [secondPageAlbum] : [firstPageAlbum],
            total: 2,
            page: Number(page ?? "1"),
            pages: 2,
          }),
        });
      }

      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: "Add Albums" }));

    fireEvent.click(screen.getByRole("button", { name: "Add Albums" }));

    expect(await screen.findByText("First Page Album")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/albums?per_page=25"),
        expect.any(Object)
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("Second Page Album")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.any(Object)
      );
    });
  });

  test("add album modal sends search terms to the album endpoint", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/lists/1")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            list: makeList({
              creatorUserId: "2",
              albums: [makeAlbum({ id: "99", title: "Existing Album" })],
              albumCount: 1,
            }),
          }),
        });
      }

      if (typeof url === "string" && url.includes("/api/albums")) {
        const parsed = new URL(url, "http://localhost");
        const query = parsed.searchParams.get("q");
        return Promise.resolve({
          ok: true,
          json: async () => ({
            albums: query === "late" ? [makeAlbum({ id: "30", title: "Late Catalog Find" })] : [],
            total: query === "late" ? 1 : 0,
            page: 1,
            pages: 1,
          }),
        });
      }

      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: "Add Albums" }));

    fireEvent.click(screen.getByRole("button", { name: "Add Albums" }));
    fireEvent.change(await screen.findByPlaceholderText("Search albums or artists..."), {
      target: { value: "late" },
    });

    expect(await screen.findByText("Late Catalog Find")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("q=late"),
        expect.any(Object)
      );
    });
  });
});
