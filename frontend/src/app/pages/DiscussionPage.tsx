import { useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, apiFetch } from "../../lib/api";
import { ArrowLeft, MessageSquare, Loader2 } from "lucide-react";
import { Discussion } from "../data/mockData";
import { CommentList } from "../components/CommentList";
import { CommentBox } from "../components/CommentBox";
import { AuthModal } from "../components/AuthModal";

interface PostsResponse {
  discussion: Discussion;
}

export default function DiscussionPage() {
  const { id } = useParams<{ id: string }>();
  const [authModal, setAuthModal] = useState(false);

  const { data, isLoading, isError } = useQuery<PostsResponse>({
    queryKey: ["discussion-meta", id],
    queryFn: () =>
      apiFetch(`${API_BASE}/api/discussions/${id}/posts?per_page=1`).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch discussion");
        return r.json();
      }),
    enabled: !!id,
  });

  const discussion = data?.discussion;

  const showLoading = isLoading;
  const showNotFound = isError || (!isLoading && !discussion);
  const showContent = !showLoading && !showNotFound;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {showLoading && (
        <div className="flex items-center justify-center py-24 text-[#666666]">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading discussion...</span>
        </div>
      )}

      {showNotFound && (
        <div className="py-12 text-center">
          <p className="text-[#999999] mb-4">Discussion not found.</p>
          <Link to="/" className="text-[#5b9dd9] hover:underline text-sm">
            Back to Discovery
          </Link>
        </div>
      )}

      {showContent && discussion && (
        <>
          {/* Back nav */}
          <Link
            to={`/artists/${discussion.artistId}`}
            className="inline-flex items-center gap-1.5 text-sm text-[#999999] hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Artist
          </Link>

          {/* Discussion header */}
          <div className="mb-6 pb-6 border-b border-[#2a2a2a]">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-[#5b9dd9] flex-shrink-0 mt-0.5" />
              <h1 className="text-xl font-bold text-white leading-snug">{discussion.title}</h1>
            </div>
            <p className="text-xs text-[#888888] mt-2 ml-8">
              {discussion.postCount} {discussion.postCount === 1 ? "comment" : "comments"}
            </p>
          </div>

          {/* Comment box */}
          {id && (
            <div className="mb-6">
              <CommentBox
                discussionId={id}
                onSignInClick={() => setAuthModal(true)}
              />
            </div>
          )}

          {/* Comment list — polls every 8s */}
          {id && <CommentList discussionId={id} />}

          {/* Auth modal */}
          <AuthModal
            isOpen={authModal}
            initialTab="signin"
            onClose={() => setAuthModal(false)}
          />
        </>
      )}

    </div>
  );
}
