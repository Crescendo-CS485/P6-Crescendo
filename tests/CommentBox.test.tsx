import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
  }),
}));

import { CommentBox } from "../frontend/src/app/components/CommentBox";

function renderCommentBox() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CommentBox discussionId="d1" onSignInClick={jest.fn()} />
    </QueryClientProvider>
  );
}

describe("CommentBox", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ post: { id: "p1", body: "Great thread" } }),
    });
    global.fetch = fetchMock;
  });

  test("posts comments with LLM replies disabled by default", async () => {
    renderCommentBox();

    fireEvent.change(screen.getByLabelText("Your comment"), {
      target: { value: "Great thread" },
    });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/discussions/d1/posts",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ body: "Great thread", triggerLlm: false }),
          credentials: "include",
        }),
      );
    });
  });

  test("posts comments with LLM replies when the toggle is on", async () => {
    renderCommentBox();

    fireEvent.click(screen.getByRole("switch", { name: /trigger llm replies/i }));
    fireEvent.change(screen.getByLabelText("Your comment"), {
      target: { value: "Invite bot replies" },
    });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/discussions/d1/posts",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ body: "Invite bot replies", triggerLlm: true }),
          credentials: "include",
        }),
      );
    });
  });
});
