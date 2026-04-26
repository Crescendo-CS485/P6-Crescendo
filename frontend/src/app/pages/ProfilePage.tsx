import { useState } from "react";
import { User, Mail, AtSign, LogOut, ListMusic, Heart, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../components/PageStates";
import { API_BASE, apiFetch } from "../../lib/api";
import type { UserList } from "../data/mockData";
import { AddArtistModal } from "../components/AddArtistModal";
import { CreateAlbumModal } from "../components/CreateAlbumModal";

interface ListsResponse {
  lists: UserList[];
  total: number;
}

export default function ProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const [addArtistOpen, setAddArtistOpen] = useState(false);
  const [addAlbumOpen, setAddAlbumOpen] = useState(false);

  if (isLoading) {
    return <LoadingState message="Loading your profile..." />;
  }

  if (!user) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-10">
        <EmptyState
          title="You're not signed in"
          message="Sign in to view your profile and manage your lists."
        />
      </div>
    );
  }

  const initial = user.displayName?.charAt(0)?.toUpperCase() ?? "U";

  const {
    data: listsData,
    isLoading: listsLoading,
    isError: listsError,
    refetch: refetchLists,
  } = useQuery<ListsResponse>({
    queryKey: ["lists"],
    queryFn: () => apiFetch(`${API_BASE}/api/lists`).then((r) => r.json()),
    staleTime: 30_000,
  });

  const allLists = listsData?.lists ?? [];
  const yourLists = allLists.filter((l) => l.createdBy === user.displayName);
  const totalLikes = yourLists.reduce((s, l) => s + (l.likes ?? 0), 0);
  const totalAlbums = yourLists.reduce((s, l) => s + (l.albumCount ?? 0), 0);

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 pb-6 border-b border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Your Profile</h1>
          <p className="text-sm text-[#999999]">Account and list activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild className="bg-[#252525] border border-[#333333] text-white hover:bg-[#1a1a1a] rounded-sm">
            <Link to="/lists">
              <ListMusic className="w-4 h-4 mr-2" />
              Lists
            </Link>
          </Button>
          <Button
            onClick={() => setAddArtistOpen(true)}
            className="bg-[#252525] border border-[#333333] text-white hover:bg-[#1a1a1a] rounded-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Artist
          </Button>
          <Button
            onClick={() => setAddAlbumOpen(true)}
            className="bg-[#252525] border border-[#333333] text-white hover:bg-[#1a1a1a] rounded-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Album
          </Button>
          <Button
            onClick={logout}
            className="bg-[#252525] border border-[#333333] text-white hover:bg-[#1a1a1a] rounded-sm"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>

      <div className="bg-[#252525] border border-[#333333] p-6 mb-4">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 bg-[#5b9dd9] flex items-center justify-center text-white font-bold text-xl">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#666666]" />
              <h2 className="text-lg font-bold text-white truncate">{user.displayName}</h2>
            </div>
            <p className="text-sm text-[#999999] truncate">{user.handle}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="bg-[#1a1a1a] border border-[#333333] p-4">
            <div className="flex items-center gap-2 text-xs text-[#666666] uppercase tracking-wide mb-2">
              <Mail className="w-3.5 h-3.5" />
              Email
            </div>
            <div className="text-sm text-white break-all">{user.email}</div>
          </div>

          <div className="bg-[#1a1a1a] border border-[#333333] p-4">
            <div className="flex items-center gap-2 text-xs text-[#666666] uppercase tracking-wide mb-2">
              <AtSign className="w-3.5 h-3.5" />
              Username
            </div>
            <div className="text-sm text-white">{user.handle}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Your Lists", value: yourLists.length },
            { label: "Albums Saved", value: totalAlbums },
            { label: "Total Likes", value: totalLikes },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#1a1a1a] border border-[#333333] p-4 text-center">
              <div className="text-xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-[10px] text-[#666666] uppercase tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="bg-[#252525] border border-[#333333] p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Your Lists</h3>
            <p className="text-xs text-[#999999]">Lists you’ve created in this environment.</p>
          </div>
          <Button asChild className="bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white rounded-sm">
            <Link to="/lists">Browse all</Link>
          </Button>
        </div>

        {listsError && <ErrorState title="Couldn't load lists" onRetry={() => refetchLists()} />}

        {listsLoading && (
          <div className="py-10">
            <LoadingState message="Loading your lists..." />
          </div>
        )}

        {!listsLoading && !listsError && yourLists.length === 0 && (
          <EmptyState
            title="No lists yet"
            message="Create your first list to start curating albums."
            actionLabel="Go to Lists"
            onAction={() => (window.location.href = "/lists")}
          />
        )}

        {!listsLoading && !listsError && yourLists.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {yourLists.slice(0, 6).map((l) => (
              <Link
                key={l.id}
                to={`/lists/${l.id}`}
                className="bg-[#1a1a1a] border border-[#333333] hover:border-[#5b9dd9] transition-colors p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white line-clamp-1">{l.title}</div>
                    <div className="text-xs text-[#666666] line-clamp-1">{l.albumCount} albums</div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[#666666] flex-shrink-0">
                    <Heart className="w-3.5 h-3.5" />
                    <span>{l.likes}</span>
                  </div>
                </div>
                <p className="text-xs text-[#999999] leading-relaxed line-clamp-2">{l.description}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <AddArtistModal
        isOpen={addArtistOpen}
        onClose={() => setAddArtistOpen(false)}
        onCreated={() => refetchLists()}
      />
      <CreateAlbumModal
        isOpen={addAlbumOpen}
        onClose={() => setAddAlbumOpen(false)}
        onCreated={() => refetchLists()}
      />
    </div>
  );
}

