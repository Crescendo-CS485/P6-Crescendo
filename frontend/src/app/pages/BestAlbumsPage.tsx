import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, LayoutGrid, List, Star, MessageSquare } from "lucide-react";
import { API_BASE, apiFetch } from "../../lib/api";
import { Link } from "react-router";
import { AlbumCard } from "../components/AlbumCard";
import { AlbumCardSkeleton } from "../components/AlbumCardSkeleton";
import { ErrorState, EmptyState } from "../components/PageStates";
import { FilterBar } from "../components/FilterBar";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Album, genres } from "../data/mockData";

interface AlbumsResponse {
  albums: Album[];
  total: number;
  page: number;
  pages: number;
}

type SortOption = "user_score" | "critic_score" | "release_date" | "review_count";
type TimeRange = "all-time" | "2026" | "2025" | "2024";
type ViewMode = "grid" | "list";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "all-time", label: "All Time" },
  { value: "2026", label: "2026" },
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
];

const PER_PAGE = 12;

// Inline list-view row component
function AlbumRow({ album, rank }: { album: Album; rank: number }) {
  const displayCover = album.coverUrl || album.artistImage;
  return (
    <Link
      to={`/artists/${album.artistId}`}
      className="flex items-center gap-4 bg-[#252525] border border-[#333333] hover:border-[#5b9dd9] transition-colors p-3"
    >
      <span className="text-lg font-bold text-[#444444] w-8 text-right flex-shrink-0">
        {rank}
      </span>
      <img
        src={displayCover}
        alt={album.title}
        className="w-12 h-12 object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-white line-clamp-1 hover:text-[#5b9dd9] transition-colors">
          {album.title}
        </h3>
        <p className="text-xs text-[#999999] line-clamp-1">{album.artistName}</p>
        <div className="flex gap-1 mt-1">
          {album.genres.slice(0, 2).map((g) => (
            <span
              key={g}
              className="text-[10px] px-1.5 py-0.5 bg-[#1a1a1a] text-[#666666] border border-[#333333] uppercase tracking-wide"
            >
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
        <div
          className={`px-2.5 py-1 font-bold text-sm ${
            album.userScore >= 9 ? "bg-[#5b9dd9] text-white" : "bg-[#444444] text-white"
          }`}
        >
          {album.userScore.toFixed(1)}
        </div>
      </div>
    </Link>
  );
}

export default function BestAlbumsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("all-time");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("user_score");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  params.set("sort", sort);
  if (timeRange !== "all-time") params.set("time_range", timeRange);
  selectedGenres.forEach((g) => params.append("genre", g));
  params.set("page", String(page));
  params.set("per_page", String(PER_PAGE));

  const { data, isLoading, isError, refetch } = useQuery<AlbumsResponse>({
    queryKey: ["albums", { timeRange, selectedGenres, sort, page }],
    queryFn: () =>
      apiFetch(`${API_BASE}/api/albums?${params}`).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch albums");
        return r.json();
      }),
  });

  const albums = data?.albums ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 0;

  const effectiveLoading = isLoading;
  const effectiveError = isError;
  const effectiveEmpty = !isLoading && !isError && albums.length === 0;
  const effectiveSuccess = !effectiveLoading && !effectiveError && !effectiveEmpty;

  const handleReset = () => {
    setTimeRange("all-time");
    setSelectedGenres([]);
    setSort("user_score");
    setPage(1);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 pb-5 border-b border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Best Albums</h1>
          <p className="text-sm text-[#999999]">
            {total} {total === 1 ? "album" : "albums"} • Ranked by community score
          </p>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort */}
          <BarChart3 className="w-4 h-4 text-[#666666]" />
          <span className="text-xs text-[#999999] uppercase tracking-wide">Sort:</span>
          <Select
            value={sort}
            onValueChange={(v) => { setSort(v as SortOption); setPage(1); }}
          >
            <SelectTrigger className="w-[160px] bg-[#252525] border-[#333333] text-white rounded-sm h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] border-[#333333] text-white rounded-sm">
              <SelectItem value="user_score" className="text-white focus:bg-[#252525] focus:text-white text-sm">
                User Score
              </SelectItem>
              <SelectItem value="critic_score" className="text-white focus:bg-[#252525] focus:text-white text-sm">
                Critic Score
              </SelectItem>
              <SelectItem value="release_date" className="text-white focus:bg-[#252525] focus:text-white text-sm">
                Release Date
              </SelectItem>
              <SelectItem value="review_count" className="text-white focus:bg-[#252525] focus:text-white text-sm">
                Most Reviewed
              </SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex border border-[#333333]">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              title="Grid view"
              className={`p-1.5 ${viewMode === "grid" ? "bg-[#5b9dd9] text-white" : "text-[#666666] hover:text-white"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              title="List view"
              className={`p-1.5 ${viewMode === "list" ? "bg-[#5b9dd9] text-white" : "text-[#666666] hover:text-white"}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        selectedTimeRange={timeRange}
        onTimeRangeChange={(v) => { setTimeRange(v as TimeRange); setPage(1); }}
        timeRangeOptions={TIME_RANGES}
        defaultTimeRange="all-time"
        selectedGenres={selectedGenres}
        onGenresChange={(g) => { setSelectedGenres(g); setPage(1); }}
        onReset={handleReset}
      />

      {/* Error */}
      {effectiveError && <ErrorState onRetry={() => refetch()} />}

      {/* Loading */}
      {effectiveLoading && (
        viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {Array.from({ length: PER_PAGE }).map((_, i) => (
              <AlbumCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: PER_PAGE }).map((_, i) => (
              <div key={i} className="h-16 bg-[#252525] border border-[#333333] animate-pulse" />
            ))}
          </div>
        )
      )}

      {/* Empty */}
      {effectiveEmpty && (
        <EmptyState
          title="No Albums Found"
          message="Try a different time range or reset your filters."
          onAction={handleReset}
        />
      )}

      {/* Success */}
      {effectiveSuccess && (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {albums.map((album, idx) => (
                <AlbumRow
                  key={album.id}
                  album={album}
                  rank={(page - 1) * PER_PAGE + idx + 1}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#2a2a2a]">
              <div className="text-sm text-[#999999]">Page {page} of {totalPages}</div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border-[#333333] text-white hover:bg-[#252525] disabled:opacity-30 rounded-sm h-8 px-3 text-sm"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="border-[#333333] text-white hover:bg-[#252525] disabled:opacity-30 rounded-sm h-8 px-3 text-sm"
                >
                  Next
                </Button>
              </div>
              <div className="text-sm text-[#999999] hidden sm:block">
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
