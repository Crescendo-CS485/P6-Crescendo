import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, apiFetch } from "../../lib/api";
import { Loader2, Send } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

interface CommentBoxProps {
  discussionId: string;
  onSignInClick: () => void;
}

export function CommentBox({ discussionId, onSignInClick }: CommentBoxProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [triggerLlm, setTriggerLlm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="border border-[#2a2a2a] bg-[#252525] p-4 text-center">
        <p className="text-sm text-[#999999] mb-3">
          Sign in to join the discussion
        </p>
        <Button
          onClick={onSignInClick}
          className="bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white rounded-sm h-8 px-4 text-sm"
        >
          Sign In
        </Button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/discussions/${discussionId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), triggerLlm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post comment");
      setBody("");
      // Refresh the comment list
      queryClient.invalidateQueries({ queryKey: ["posts", discussionId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[#2a2a2a] bg-[#252525]">
      {/* Author label */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[#2a2a2a]">
        <div className="w-6 h-6 rounded-sm bg-[#5b9dd9] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <span className="text-xs text-white font-medium">{user.displayName}</span>
        <span className="text-xs text-[#555555]">{user.handle}</span>
      </div>

      {/* Textarea */}
      <textarea
        id="comment-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share your thoughts on this discussion..."
        aria-label="Your comment"
        rows={3}
        className="w-full bg-transparent text-sm text-white placeholder:text-[#888888] px-4 py-3 resize-none outline-none"
      />

      {/* Footer */}
      <div className="flex flex-col gap-3 px-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        {error ? (
          <p role="alert" className="text-xs text-red-400">{error}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs text-[#888888]" aria-live="polite" aria-label={`${body.length} of 2000 characters`}>{body.length}/2000</span>
            <label className="flex items-center gap-2 text-xs text-[#999999]">
              <Switch
                checked={triggerLlm}
                onCheckedChange={setTriggerLlm}
                aria-label="Trigger LLM replies"
                className="data-[state=checked]:bg-[#5b9dd9]"
              />
              <span>Trigger LLM replies</span>
            </label>
          </div>
        )}
        <Button
          type="submit"
          disabled={isSubmitting || !body.trim()}
          className="bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white rounded-sm h-8 px-4 text-xs font-medium disabled:opacity-40"
          size="sm"
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <><Send className="w-3.5 h-3.5 mr-1.5" />Post</>
          )}
        </Button>
      </div>
    </form>
  );
}
