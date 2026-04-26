import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "../../lib/api";
import { ArrowLeft, Heart, Music, Loader2, Plus, X, Copy } from "lucide-react";
import { AlbumCard } from "../components/AlbumCard";
import { AlbumCardSkeleton } from "../components/AlbumCardSkeleton";
import { AddAlbumModal } from "../components/AddAlbumModal";
import { useAuth } from "../context/AuthContext";
import { UserListDetail } from "../data/mockData";

interface ListDetailResponse {
  list: UserListDetail;
}

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showForkBanner, setShowForkBanner] = useState(false);
  const [forking, setForking] = useState(false);
  const [localLiked, setLocalLiked] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState(0);
  const [liking, setLiking] = useState(false);

  const { data, isLoading, isError } = useQuery<ListDetailResponse>({
    queryKey: ["list", id],
    queryFn: () =>
      fetch(`${API_BASE}/api/lists/${id}`).then((r) => {
        if (!r.ok) throw new Error("List not found");
        return r.json();
      }),
    enabled: !!id,
  });

  const list = data?.list;
  const isOwner = !!user && !!list?.creatorUserId && user.id === list.creatorUserId;

  useEffect(() => {
    if (list) {
      setLocalLiked(list.userHasLiked);
      setLocalLikeCount(list.likes);
    }
  }, [list]);

  async function handleLike() {
    if (!user) return;
    setLiking(true);
    const optimisticLiked = !localLiked;
    setLocalLiked(optimisticLiked);
    setLocalLikeCount((c) => optimisticLiked ? c + 1 : Math.max(0, c - 1));
    try {
      const res = await fetch(`${API_BASE}/api/lists/${id}/like`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json();
        setLocalLiked(result.liked);
        setLocalLikeCount(result.likeCount);
      } else {
        setLocalLiked(!optimisticLiked);
        setLocalLikeCount((c) => optimisticLiked ? c - 1 : c + 1);
      }
    } finally {
      setLiking(false);
    }
  }

  async function handleFork() {
    setForking(true);
    try {
      const res = await fetch(`${API_BASE}/api/lists/${id}/fork`, { method: "POST" });
      const result = await res.json();
      if (res.ok) {
        navigate(`/lists/${result.list.id}`);
      }
    } finally {
      setForking(false);
    }
  }

  async function handleRemove(albumId: string) {
    setRemoving(albumId);
    try {
      await fetch(`${API_BASE}/api/lists/${id}/albums/${albumId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["list", id] });
    } finally {
      setRemoving(null);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="h-6 w-20 bg-[#252525] mb-6" />
        <div className="mb-6 pb-6 border-b border-[#2a2a2a]">
          <div className="h-8 w-64 bg-[#252525] mb-2" />
          <div className="h-4 w-32 bg-[#252525]" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <AlbumCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (isError || !list) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-[#999999] mb-4">List not found.</p>
        <Link to="/lists" className="text-[#5b9dd9] hover:underline text-sm">
          Back to Lists
        </Link>
      </div>
    );
  }

  const existingAlbumIds = list.albums.map((a) => a.id);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      {/* Back nav */}
      <Link
        to="/lists"
        className="inline-flex items-center gap-1.5 text-sm text-[#999999] hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All Lists
      </Link>

      {/* List header */}
      <div className="mb-6 pb-6 border-b border-[#2a2a2a]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">{list.title}</h1>
            <p className="text-sm text-[#5b9dd9] mb-2">by {list.createdBy}</p>
            {list.description && (
              <p className="text-sm text-[#999999] max-w-2xl leading-relaxed">
                {list.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex items-center gap-4 text-sm text-[#666666]">
              <div className="flex items-center gap-1.5">
                <Music className="w-4 h-4" />
                <span>{list.albumCount} albums</span>
              </div>
              {user ? (
                <button
                  onClick={handleLike}
                  disabled={liking}
                  className={`flex items-center gap-1.5 transition-colors ${localLiked ? "text-red-400" : "text-[#666666] hover:text-red-400"}`}
                  title={localLiked ? "Unlike" : "Like"}
                >
                  <Heart className={`w-4 h-4 ${localLiked ? "fill-current" : ""}`} />
                  <span>{localLikeCount}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-[#666666]">
                  <Heart className="w-4 h-4" />
                  <span>{localLikeCount}</span>
                </div>
              )}
            </div>
            {user && (
              <button
                onClick={() => isOwner ? setShowAddModal(true) : setShowForkBanner(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white text-sm font-medium rounded-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Albums
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fork confirmation banner */}
      {showForkBanner && (
        <div className="mb-6 p-4 bg-[#252525] border border-[#5b9dd9] flex flex-col sm:flex-row sm:items-center gap-3">
          <Copy className="w-4 h-4 text-[#5b9dd9] flex-shrink-0" />
          <p className="text-sm text-white flex-1">
            You don't own this list. A copy will be created under your account and you can edit it from there.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleFork}
              disabled={forking}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white text-sm font-medium rounded-sm transition-colors disabled:opacity-60"
            >
              {forking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
              Create Copy
            </button>
            <button
              onClick={() => setShowForkBanner(false)}
              className="px-3 py-1.5 text-sm text-[#999999] hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Albums */}
      {list.albums.length === 0 ? (
        <div className="text-center py-16 bg-[#252525] border border-[#333333]">
          <Music className="w-10 h-10 text-[#444444] mx-auto mb-3" />
          <p className="text-white font-medium mb-1">No albums yet</p>
          {user ? (
            <button
              onClick={() => isOwner ? setShowAddModal(true) : setShowForkBanner(true)}
              className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white text-sm font-medium rounded-sm transition-colors mx-auto"
            >
              <Plus className="w-4 h-4" />
              Add Albums
            </button>
          ) : (
            <p className="text-sm text-[#666666]">Sign in to add albums.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {list.albums.map((album) => (
            <div key={album.id} className="relative group">
              <AlbumCard album={album} />
              {isOwner && (
                <button
                  onClick={() => handleRemove(album.id)}
                  disabled={removing === album.id}
                  className="absolute top-2 left-2 w-6 h-6 bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 rounded-sm z-10"
                  title="Remove from list"
                >
                  {removing === album.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AddAlbumModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        listId={id!}
        existingAlbumIds={existingAlbumIds}
      />
    </div>
  );
}
