import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { API_BASE, apiFetch } from "../../lib/api";
import { useAuth } from "../context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Loader2, Music, Send } from "lucide-react";
import { toast } from "sonner";
import { Artist, Discussion } from "../data/mockData";
import { Button } from "../components/ui/button";
import { AuthModal } from "../components/AuthModal";
import { Switch } from "../components/ui/switch";

interface ArtistResponse {
  artist: Artist;
}

interface DiscussionsResponse {
  discussions: Discussion[];
  total: number;
}

export function formatTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [discussionTitle, setDiscussionTitle] = useState("");
  const [discussionBody, setDiscussionBody] = useState("");
  const [triggerLlm, setTriggerLlm] = useState(false);
  const [creatingDiscussion, setCreatingDiscussion] = useState(false);
  const [discussionError, setDiscussionError] = useState<string | null>(null);

  const { data: artistData, isLoading: artistLoading } = useQuery<ArtistResponse>({
    queryKey: ["artist", id],
    queryFn: () =>
      apiFetch(`${API_BASE}/api/artists/${id}`).then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      }),
    enabled: !!id,
  });

  const artist = artistData?.artist;

  const { data: discussionData, isLoading: discLoading, refetch: refetchDiscussions } =
    useQuery<DiscussionsResponse>({
      queryKey: ["discussions", id],
      queryFn: () =>
        apiFetch(`${API_BASE}/api/artists/${id}/discussions`).then((r) => {
          if (!r.ok) throw new Error("Failed to fetch discussions");
          return r.json();
        }),
      enabled: !!id,
      refetchInterval: 8000,
    });

  const discussions = discussionData?.discussions ?? [];

  async function handleCreateDiscussion(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    const title = discussionTitle.trim();
    const body = discussionBody.trim();
    if (!title || !body) {
      setDiscussionError("Title and opening comment are required.");
      return;
    }

    setCreatingDiscussion(true);
    setDiscussionError(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/artists/${id}/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, triggerLlm }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start discussion");
      }
      setDiscussionTitle("");
      setDiscussionBody("");
      await refetchDiscussions();
      toast.success("Discussion started");
      navigate(`/discussions/${data.discussion.id}`);
    } catch (err) {
      setDiscussionError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreatingDiscussion(false);
    }
  }

  const showLoading = artistLoading;
  const showNotFound = !artistLoading && !artist;
  const showContent = !showLoading && !showNotFound;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {showLoading && (
        <div role="status" aria-live="polite" className="flex items-center justify-center py-24 text-[#666666]">
          <Loader2 className="w-6 h-6 animate-spin mr-2" aria-hidden="true" />
          <span>Loading artist...</span>
        </div>
      )}

      {showNotFound && (
        <div className="py-12 text-center">
          <p className="text-[#999999] mb-4">Artist not found.</p>
          <Link to="/" className="text-[#5b9dd9] hover:underline text-sm">
            Back to Discovery
          </Link>
        </div>
      )}

      {showContent && artist && (
        <>
          {/* Back nav */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-[#999999] hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Discovery
          </Link>

          {/* Hero */}
          <div className="flex gap-6 mb-8">
            <div className="w-40 h-40 flex-shrink-0 overflow-hidden border border-[#333333]">
              {artist.image ? (
                <img src={artist.image} alt={artist.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center" aria-hidden="true">
                  <Music className="w-10 h-10 text-[#444444]" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-1 mb-2">
                {artist.genres.map((g) => (
                  <span
                    key={g}
                    className="text-[10px] px-1.5 py-0.5 bg-[#1a1a1a] text-[#999999] border border-[#333333] uppercase tracking-wide"
                  >
                    {g}
                  </span>
                ))}
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">{artist.name}</h1>
              <p className="text-sm text-[#999999] mb-4 leading-relaxed">{artist.bio ?? "No artist bio available."}</p>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-[#666666]">Activity</span>
                  <span
                    className={`ml-2 font-bold ${
                      artist.activityScore >= 8.5 ? "text-[#5b9dd9]" : "text-white"
                    }`}
                  >
                    {artist.activityScore.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-[#666666]">Discussions</span>
                  <span className="ml-2 font-bold text-white">{discussions.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Discussions */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#5b9dd9]" />
                Discussions
              </h2>
              {!user && (
                <Button
                  onClick={() => setAuthModalOpen(true)}
                  className="bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white rounded-sm h-8 px-3 text-xs"
                >
                  Sign In to Post
                </Button>
              )}
            </div>

            {user ? (
              <form onSubmit={handleCreateDiscussion} className="mb-6 border border-[#2a2a2a] bg-[#252525]">
                <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[#2a2a2a]">
                  <div className="w-6 h-6 rounded-sm bg-[#5b9dd9] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-white font-medium">{user.displayName}</span>
                  <span className="text-xs text-[#555555]">{user.handle}</span>
                </div>
                <div className="p-4 space-y-3">
                  <input
                    value={discussionTitle}
                    onChange={(e) => setDiscussionTitle(e.target.value)}
                    placeholder={`Start a discussion about ${artist.name}`}
                    aria-label="Discussion title"
                    maxLength={500}
                    className="w-full bg-[#1a1a1a] border border-[#333333] text-sm text-white placeholder:text-[#888888] px-3 py-2 rounded-sm outline-none focus:border-[#5b9dd9]"
                  />
                  <textarea
                    value={discussionBody}
                    onChange={(e) => setDiscussionBody(e.target.value)}
                    placeholder="Add the opening comment..."
                    aria-label="Opening comment"
                    rows={4}
                    className="w-full bg-[#1a1a1a] border border-[#333333] text-sm text-white placeholder:text-[#888888] px-3 py-2 rounded-sm resize-none outline-none focus:border-[#5b9dd9]"
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      {discussionError ? (
                        <p role="alert" className="text-xs text-red-400">{discussionError}</p>
                      ) : (
                        <label className="flex items-center gap-2 text-xs text-[#999999]">
                          <Switch
                            checked={triggerLlm}
                            onCheckedChange={setTriggerLlm}
                            aria-label="Trigger LLM replies"
                            className="data-[state=checked]:bg-[#5b9dd9]"
                          />
                          <span>Trigger LLM replies</span>
                        </label>
                      )}
                    </div>
                    <Button
                      type="submit"
                      disabled={creatingDiscussion || !discussionTitle.trim() || !discussionBody.trim()}
                      className="bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white rounded-sm h-8 px-4 text-xs font-medium disabled:opacity-40 flex items-center gap-1.5"
                      size="sm"
                    >
                      {creatingDiscussion ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <><Send className="w-3.5 h-3.5" />Post Discussion</>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="mb-6 border border-[#2a2a2a] bg-[#252525] p-4 text-center">
                <p className="text-sm text-[#999999] mb-3">
                  Sign in to start a discussion about this artist or album.
                </p>
                <Button
                  onClick={() => setAuthModalOpen(true)}
                  className="bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white rounded-sm h-8 px-4 text-sm"
                >
                  Sign In
                </Button>
              </div>
            )}

            {discLoading && (
              <div role="status" aria-live="polite" className="flex items-center gap-2 text-[#666666] py-4">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Loading discussions...</span>
              </div>
            )}

            {!discLoading && discussions.length === 0 && (
              <p className="text-sm text-[#666666] py-4">
                No discussions yet. Start the first thread.
              </p>
            )}

            {!discLoading && discussions.length > 0 && (
              <div className="space-y-2">
                {discussions.map((disc) => (
                  <Link
                    key={disc.id}
                    to={`/discussions/${disc.id}`}
                    className="block bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#5b9dd9] p-4 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white mb-1 line-clamp-2">{disc.title}</p>
                        <p className="text-[11px] text-[#888888]">
                          {disc.postCount} {disc.postCount === 1 ? "post" : "posts"} ·{" "}
                          {formatTime(disc.lastActivityAt)}
                        </p>
                      </div>
                      <MessageSquare className="w-4 h-4 text-[#444444] flex-shrink-0 mt-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <AuthModal
        isOpen={authModalOpen}
        initialTab="signin"
        onClose={() => setAuthModalOpen(false)}
      />

    </div>
  );
}
