import { useState } from "react";
import { Heart, Music, Plus, Loader2, LayoutGrid, List as ListIcon } from "lucide-react";
import { API_BASE, apiFetch } from "../../lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { UserList, UserListDetail } from "../data/mockData";
import { CreateListModal } from "../components/CreateListModal";
import { useAuth } from "../context/AuthContext";

type ViewMode = "grid" | "list";

interface ListsResponse {
  lists: UserList[];
  total: number;
}

interface ListDetailResponse {
  list: UserListDetail;
}

interface ListItemProps {
  list: UserList;
  isLikePending: boolean;
  onToggleLike: (list: UserList) => void;
}

function LikeButton({
  list,
  isLikePending,
  onToggleLike,
}: ListItemProps) {
  return (
    <button
      type="button"
      onClick={() => onToggleLike(list)}
      disabled={isLikePending}
      aria-pressed={list.userHasLiked}
      aria-label={
        list.userHasLiked
          ? `Unsave ${list.title}, ${list.likes} likes`
          : `Save ${list.title}, ${list.likes} likes`
      }
      title={list.userHasLiked ? "Saved" : "Save"}
      className={`flex items-center gap-1 transition-colors disabled:opacity-60 ${
        list.userHasLiked ? "text-red-400" : "text-[#666666] hover:text-red-400"
      }`}
    >
      <Heart className={`w-3.5 h-3.5 ${list.userHasLiked ? "fill-current" : ""}`} aria-hidden="true" />
      <span>{list.likes}</span>
    </button>
  );
}

function ListRow({ list, isLikePending, onToggleLike }: ListItemProps) {
  return (
    <div className="flex items-center gap-4 bg-[#252525] border border-[#333333] hover:border-[#5b9dd9] transition-colors p-3">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-white line-clamp-1 mb-0.5">{list.title}</h3>
        <p className="text-xs text-[#5b9dd9] mb-1">by {list.createdBy}</p>
        {list.description && (
          <p className="text-xs text-[#999999] line-clamp-1">{list.description}</p>
        )}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0 text-xs text-[#666666]">
        <div className="hidden sm:flex items-center gap-1">
          <Music className="w-3 h-3" />
          <span>{list.albumCount}</span>
        </div>
        <div className="hidden sm:flex">
          <LikeButton list={list} isLikePending={isLikePending} onToggleLike={onToggleLike} />
        </div>
        <Link
          to={`/lists/${list.id}`}
          className="text-xs px-3 py-1.5 bg-[#1a1a1a] border border-[#333333] text-[#999999] hover:text-white hover:border-[#5b9dd9] transition-colors rounded-sm"
        >
          View
        </Link>
      </div>
    </div>
  );
}


function ListCard({ list, isLikePending, onToggleLike }: ListItemProps) {
  return (
    <div className="bg-[#252525] border border-[#333333] hover:border-[#5b9dd9] transition-colors p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-white mb-1 line-clamp-1">{list.title}</h3>
          <p className="text-xs text-[#5b9dd9]">by {list.createdBy}</p>
        </div>
        <div className="flex-shrink-0 text-xs">
          <LikeButton list={list} isLikePending={isLikePending} onToggleLike={onToggleLike} />
        </div>
      </div>

      {list.description ? (
        <p className="text-sm text-[#999999] leading-relaxed mb-4 line-clamp-3">
          {list.description}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-[#666666]">
          <Music className="w-3.5 h-3.5" />
          <span>{list.albumCount} albums</span>
        </div>
        <Link
          to={`/lists/${list.id}`}
          className="text-xs px-3 py-1.5 bg-[#1a1a1a] border border-[#333333] text-[#999999] hover:text-white hover:border-[#5b9dd9] transition-colors rounded-sm"
        >
          View List
        </Link>
      </div>
    </div>
  );
}

export default function ListsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [pendingLikeId, setPendingLikeId] = useState<string | null>(null);

  const listsQueryUser = user?.id ?? "anon";

  const { data, isLoading, isError } = useQuery<ListsResponse>({
    queryKey: ["lists", listsQueryUser],
    queryFn: () =>
      apiFetch(`${API_BASE}/api/lists`).then((r) => {
        if (!r.ok) throw new Error("Failed to load lists");
        return r.json();
      }),
  });

  const lists = data?.lists ?? [];

  const effectiveLoading = isLoading;
  const effectiveError = isError;
  const effectiveEmpty = !isLoading && !isError && lists.length === 0;
  const effectiveSuccess = !effectiveLoading && !effectiveError && !effectiveEmpty;

  function handleCreateClick() {
    if (!user) return;
    setShowCreateModal(true);
  }

  function handleCreated(listId: string) {
    setShowCreateModal(false);
    navigate(`/lists/${listId}`);
  }

  function updateListLike(listId: string, liked: boolean, likeCount: number) {
    queryClient.setQueryData<ListsResponse>(["lists", listsQueryUser], (current) => {
      if (!current) return current;
      return {
        ...current,
        lists: current.lists.map((list) =>
          list.id === listId ? { ...list, userHasLiked: liked, likes: likeCount } : list
        ),
      };
    });
    queryClient.setQueryData<ListDetailResponse>(["list", listId, listsQueryUser], (current) => {
      if (!current) return current;
      return {
        ...current,
        list: { ...current.list, userHasLiked: liked, likes: likeCount },
      };
    });
  }

  async function handleToggleLike(list: UserList) {
    if (!user) {
      toast.error("Sign in to save lists.");
      return;
    }
    if (pendingLikeId) return;

    const previousLiked = list.userHasLiked;
    const previousCount = list.likes;
    const nextLiked = !previousLiked;
    const nextCount = nextLiked ? previousCount + 1 : Math.max(0, previousCount - 1);

    setPendingLikeId(list.id);
    updateListLike(list.id, nextLiked, nextCount);
    try {
      const res = await apiFetch(`${API_BASE}/api/lists/${list.id}/like`, { method: "POST" });
      if (!res.ok) {
        let message = `Could not save this list (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          /* non-JSON error body */
        }
        toast.error(message);
        updateListLike(list.id, previousLiked, previousCount);
        return;
      }
      const result = (await res.json()) as { liked: boolean; likeCount: number };
      updateListLike(list.id, result.liked, result.likeCount);
    } catch {
      toast.error("Network error — could not reach the server");
      updateListLike(list.id, previousLiked, previousCount);
    } finally {
      setPendingLikeId(null);
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 pb-5 border-b border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Lists</h1>
          <p className="text-sm text-[#999999]">
            {effectiveLoading ? "Loading..." : `${data?.total ?? 0} curated lists`} • Community-built album collections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[#333333]">
            <button
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              title="Grid view"
              className={`p-1.5 ${viewMode === "grid" ? "bg-[#5b9dd9] text-white" : "text-[#666666] hover:text-white"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              aria-label="List view"
              title="List view"
              className={`p-1.5 ${viewMode === "list" ? "bg-[#5b9dd9] text-white" : "text-[#666666] hover:text-white"}`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
          {user && (
            <button
              onClick={handleCreateClick}
              className="flex items-center gap-2 px-4 py-2 bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white text-sm font-medium rounded-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create List
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {effectiveLoading && (
        <div className="flex items-center justify-center py-24 text-[#666666]">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading lists...</span>
        </div>
      )}

      {/* Error */}
      {effectiveError && (
        <div className="text-center py-16 text-[#999999]">
          <p>Failed to load lists.</p>
        </div>
      )}

      {/* Empty */}
      {effectiveEmpty && (
        <div className="text-center py-16 text-[#999999]">
          <p>No lists yet. Be the first to create one!</p>
        </div>
      )}

      {/* Lists */}
      {effectiveSuccess && (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {lists.map((list) => (
                <ListCard
                  key={list.id}
                  list={list}
                  isLikePending={pendingLikeId === list.id}
                  onToggleLike={handleToggleLike}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2 mb-10">
              {lists.map((list) => (
                <ListRow
                  key={list.id}
                  list={list}
                  isLikePending={pendingLikeId === list.id}
                  onToggleLike={handleToggleLike}
                />
              ))}
            </div>
          )}

          {/* Create List CTA Banner */}
          <div className="bg-gradient-to-r from-[#5b9dd9]/10 to-[#7c3aed]/10 border border-[#5b9dd9]/20 p-6 text-center">
            <div className="w-12 h-12 bg-[#5b9dd9]/20 flex items-center justify-center mx-auto mb-3">
              <Plus className="w-6 h-6 text-[#5b9dd9]" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Create Your Own List</h2>
            <p className="text-sm text-[#999999] mb-4 max-w-md mx-auto">
              Curate your perfect album collection. Share your taste with the community and
              discover what others are listening to.
            </p>
            {user ? (
              <button
                onClick={handleCreateClick}
                className="px-6 py-2.5 bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white text-sm font-medium rounded-sm transition-colors"
              >
                Get Started
              </button>
            ) : (
              <p className="text-sm text-[#666666]">Sign in to create a list.</p>
            )}
          </div>
        </>
      )}

      <CreateListModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
