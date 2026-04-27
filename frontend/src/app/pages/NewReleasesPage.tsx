import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, MessageSquare, Music, LayoutGrid, List as ListIcon } from "lucide-react";
import { API_BASE, apiFetch } from "../../lib/api";
import { Link } from "react-router";
import { AlbumCardSkeleton } from "../components/AlbumCardSkeleton";
import { ErrorState, EmptyState } from "../components/PageStates";
import { Album } from "../data/mockData";
import { FilterBar } from "../components/FilterBar";

interface AlbumsResponse {
  albums: Album[];
  total: number;
  page: number;
  pages: number;
}

type TimeFilter = "all-time" | "this-month" | "this-week" | "today" | "upcoming";
type ViewMode = "grid" | "list";

function AlbumRow({ album }: { album: Album }) {
  const displayCover = album.coverUrl || album.artistImage;
  return (
    <Link
      to={`/artists/${album.artistId}`}
      className="flex items-center gap-4 bg-[#252525] border border-[#333333] hover:border-[#5b9dd9] transition-colors p-3"
    >
      {displayCover ? (
        <img src={displayCover} alt={album.title} className="w-12 h-12 object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
          <Music className="w-6 h-6 text-[#444444]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-white line-clamp-1 hover:text-[#5b9dd9] transition-colors">
          {album.title}
        </h3>
        <p className="text-xs text-[#999999] line-clamp-1">{album.artistName}</p>
        <div className="flex gap-1 mt-1">
          {album.genres.slice(0, 2).map((g) => (
            <span key={g} className="text-[10px] px-1.5 py-0.5 bg-[#1a1a1a] text-[#666666] border border-[#333333] uppercase tracking-wide">
              {g}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-6 flex-shrink-0 text-xs text-[#666666]">
        <div className="hidden sm:flex items-center gap-1">
          <Star className="w-3 h-3" />
          <span>{album.reviewCount.toLocaleString()}</span>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          <span>{album.discussionCount}</span>
        </div>
        <div className={`px-2.5 py-1 font-bold text-sm ${album.userScore >= 9 ? "bg-[#5b9dd9] text-white" : "bg-[#444444] text-white"}`}>
          {album.userScore.toFixed(1)}
        </div>
      </div>
    </Link>
  );
}

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "all-time", label: "All Releases" },
  { value: "this-month", label: "This Month" },
  { value: "this-week", label: "This Week" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
];

function groupByDate(albums: Album[]): Record<string, Album[]> {
  return albums.reduce<Record<string, Album[]>>((acc, album) => {
    const key = album.releaseDate ?? "Unknown Date";
    if (!acc[key]) acc[key] = [];
    acc[key].push(album);
    return acc;
  }, {});
}

export default function NewReleasesPage() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all-time");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const params = new URLSearchParams();
  params.set("sort", "release_date");
  params.set("per_page", "50");
  if (timeFilter !== "all-time") params.set("time_range", timeFilter);

  const { data, isLoading, isError, refetch } = useQuery<AlbumsResponse>({
    queryKey: ["albums-releases", { timeFilter }],
    queryFn: () =>
      apiFetch(`${API_BASE}/api/albums?${params}`).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch releases");
        return r.json();
      }),
  });

  const albums = data?.albums ?? [];
  const grouped = groupByDate(albums);
  const dateKeys = Object.keys(grouped);

  const effectiveLoading = isLoading;
  const effectiveError = isError;
  const effectiveEmpty = !isLoading && !isError && albums.length === 0;
  const effectiveSuccess = !effectiveLoading && !effectiveError && !effectiveEmpty;

  // Stats
  const totalReviews = albums.reduce((s, a) => s + a.reviewCount, 0);
  const totalDiscussions = albums.reduce((s, a) => s + a.discussionCount, 0);
  const avgScore =
    albums.length > 0
      ? (albums.reduce((s, a) => s + a.userScore, 0) / albums.length).toFixed(1)
      : "—";

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 pb-5 border-b border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">New Releases</h1>
          <p className="text-sm text-[#999999]">
            {albums.length} {albums.length === 1 ? "release" : "releases"} • Grouped by release date
          </p>
        </div>
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
      </div>

      {/* Filter Bar */}
      <FilterBar
        selectedTimeRange={timeFilter}
        onTimeRangeChange={(v) => setTimeFilter(v as TimeFilter)}
        timeRangeOptions={TIME_FILTERS}
        defaultTimeRange="all-time"
        onReset={() => setTimeFilter("all-time")}
      />

      {/* Error */}
      {effectiveError && <ErrorState onRetry={() => refetch()} />}

      {/* Loading */}
      {effectiveLoading && (
        viewMode === "grid" ? (
          <div className="space-y-8">
            {[1, 2].map((s) => (
              <div key={s}>
                <div className="h-5 w-40 bg-[#333333] rounded animate-pulse mb-3" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <AlbumCardSkeleton key={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-[#252525] border border-[#333333] animate-pulse" />
            ))}
          </div>
        )
      )}

      {/* Empty */}
      {effectiveEmpty && (
        <EmptyState
          title="No Releases Found"
          message="No albums match the selected time range. Try 'All Releases'."
          onAction={() => setTimeFilter("all-time")}
          actionLabel="Show All"
        />
      )}

      {/* Grouped Releases */}
      {effectiveSuccess && (
        <div className="space-y-8">
          {dateKeys.map((dateKey) => (
            <section key={dateKey}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-base font-bold text-white">{dateKey}</h2>
                <span className="text-xs text-[#666666]">
                  {grouped[dateKey].length} {grouped[dateKey].length === 1 ? "release" : "releases"}
                </span>
                <div className="flex-1 border-t border-[#2a2a2a]" />
              </div>

              {/* Albums for this date */}
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {grouped[dateKey].map((album) => (
                    <Link
                      key={album.id}
                      to={`/artists/${album.artistId}`}
                      className="bg-[#252525] border border-[#333333] hover:border-[#5b9dd9] transition-colors flex flex-col"
                    >
                      <div className="relative aspect-square overflow-hidden border-b border-[#333333]">
                        {(album.coverUrl || album.artistImage) ? (
                          <img
                            src={album.coverUrl || album.artistImage}
                            alt={album.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                            <Music className="w-12 h-12 text-[#444444]" />
                          </div>
                        )}
                        <div
                          className={`absolute top-2 right-2 px-2 py-1 font-bold text-sm ${
                            album.userScore >= 9 ? "bg-[#5b9dd9] text-white" : "bg-[#444444] text-white"
                          }`}
                        >
                          {album.userScore.toFixed(1)}
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-bold text-white line-clamp-1 mb-0.5 hover:text-[#5b9dd9] transition-colors">
                          {album.title}
                        </h3>
                        <p className="text-xs text-[#999999] line-clamp-1 mb-2">{album.artistName}</p>
                        <div className="flex items-center justify-between text-[10px] text-[#666666]">
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            <span>{album.reviewCount.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            <span>{album.discussionCount}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {grouped[dateKey].map((album) => (
                    <AlbumRow key={album.id} album={album} />
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* Stats Footer */}
          <div className="mt-10 pt-6 border-t border-[#2a2a2a] grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Releases", value: albums.length },
              { label: "Total Reviews", value: totalReviews.toLocaleString() },
              { label: "Total Discussions", value: totalDiscussions.toLocaleString() },
              { label: "Avg Score", value: avgScore },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#252525] border border-[#333333] p-4 text-center">
                <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-xs text-[#666666] uppercase tracking-wide">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
