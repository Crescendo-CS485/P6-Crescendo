import { useState } from "react";
import { API_BASE, apiFetch } from "../../lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Loader2, BarChart3, LayoutGrid, List as ListIcon, Music } from "lucide-react";
import { FilterBar } from "../components/FilterBar";
import { ArtistCard } from "../components/ArtistCard";
import { ArtistCardSkeleton } from "../components/ArtistCardSkeleton";
import { EmptyState, ErrorState } from "../components/PageStates";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Artist } from "../data/mockData";

interface ArtistsResponse {
  artists: Artist[];
  total: number;
  page: number;
  pages: number;
}

type SortOption = "activity" | "recent";
type ViewMode = "grid" | "list";

function ArtistRow({ artist }: { artist: Artist }) {
  return (
    <Link
      to={`/artists/${artist.id}`}
      className="flex items-center gap-4 bg-[#252525] border border-[#333333] hover:border-[#5b9dd9] transition-colors p-3"
    >
      {artist.image ? (
        <img src={artist.image} alt={artist.name} className="w-12 h-12 object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
          <Music className="w-5 h-5 text-[#444444]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-white line-clamp-1 hover:text-[#5b9dd9] transition-colors">
          {artist.name}
        </h3>
        <div className="flex gap-1 mt-1">
          {artist.genres.slice(0, 3).map((g) => (
            <span key={g} className="text-[10px] px-1.5 py-0.5 bg-[#1a1a1a] text-[#666666] border border-[#333333] uppercase tracking-wide">
              {g}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-6 flex-shrink-0 text-xs text-[#666666]">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-white font-bold">{artist.discussionCount}</span>
          <span>discussions</span>
        </div>
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-white font-bold">{artist.listenerCount}</span>
          <span>listeners</span>
        </div>
        <div className="px-2.5 py-1 bg-[#5b9dd9] text-white font-bold text-sm">
          {artist.activityScore.toFixed(1)}
        </div>
      </div>
    </Link>
  );
}

// Builds a URL query string, omitting falsy/empty values and expanding arrays
export function buildParams(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => sp.append(key, String(v)));
    } else {
      sp.set(key, String(value));
    }
  }
  return sp.toString();
}

const PER_PAGE = 12;

export default function DiscoveryPage() {
  const [activeDiscussions, setActiveDiscussions] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState("all");
  const [sort, setSort] = useState<SortOption>("activity");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);

  const queryParams = buildParams({
    active_discussions: activeDiscussions || undefined,
    genre: selectedGenres.length > 0 ? selectedGenres : undefined,
    time_range: selectedTimeRange !== "all" ? selectedTimeRange : undefined,
    sort,
    page,
    per_page: PER_PAGE,
  });

  const { data, isLoading, isError, refetch } = useQuery<ArtistsResponse>({
    queryKey: ["artists", { activeDiscussions, selectedGenres, selectedTimeRange, sort, page }],
    queryFn: () =>
      apiFetch(`${API_BASE}/api/artists?${queryParams}`).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch artists");
        return r.json();
      }),
  });

  const artists = data?.artists ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 0;
  const effectiveLoading = isLoading;
  const effectiveError = isError;
  const effectiveEmpty = !isLoading && !isError && artists.length === 0;
  const effectiveSuccess = !effectiveLoading && !effectiveError && !effectiveEmpty;

  const handleReset = () => {
    setActiveDiscussions(false);
    setSelectedGenres([]);
    setSelectedTimeRange("all");
    setSort("activity");
    setPage(1);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 pb-5 border-b border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Artist Discovery
          </h1>
          <p className="text-sm text-[#999999]">
            {total} {total === 1 ? "artist" : "artists"} •{" "}
            Discover and engage with independent artists
          </p>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart3 className="w-4 h-4 text-[#666666]" />
          <span className="text-xs text-[#999999] uppercase tracking-wide">Sort:</span>
          <Select
            value={sort}
            onValueChange={(value) => {
              setSort(value as SortOption);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px] bg-[#252525] border-[#333333] text-white rounded-sm h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] border-[#333333] text-white rounded-sm">
              <SelectItem value="activity" className="text-white focus:bg-[#252525] focus:text-white text-sm">
                Activity Score
              </SelectItem>
              <SelectItem value="recent" className="text-white focus:bg-[#252525] focus:text-white text-sm">
                Most Recent
              </SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex border border-[#333333]">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 ${viewMode === "grid" ? "bg-[#5b9dd9] text-white" : "text-[#666666] hover:text-white"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 ${viewMode === "list" ? "bg-[#5b9dd9] text-white" : "text-[#666666] hover:text-white"}`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        activeDiscussions={activeDiscussions}
        onActiveDiscussionsChange={(v) => {
          setActiveDiscussions(v);
          setPage(1);
        }}
        selectedGenres={selectedGenres}
        onGenresChange={(g) => {
          setSelectedGenres(g);
          setPage(1);
        }}
        selectedTimeRange={selectedTimeRange}
        onTimeRangeChange={setSelectedTimeRange}
        onReset={handleReset}
      />

      {/* Error */}
      {effectiveError && <ErrorState onRetry={() => refetch()} />}

      {/* Loading */}
      {effectiveLoading && (
        viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {Array.from({ length: PER_PAGE }).map((_, i) => (
              <ArtistCardSkeleton key={i} />
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
      {effectiveEmpty && <EmptyState onAction={handleReset} />}

      {/* Success */}
      {effectiveSuccess && (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {artists.map((artist) => (
                <ArtistCard
                  key={artist.id}
                  artist={artist}
                  isActiveFilter={activeDiscussions}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {artists.map((artist) => (
                <ArtistRow key={artist.id} artist={artist} />
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between mt-8 pt-6 border-t border-[#2a2a2a]">
              <div className="text-sm text-[#999999]" aria-live="polite" aria-atomic="true">
                Page {page} of {totalPages}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                  className="border-[#333333] text-white hover:bg-[#252525] disabled:opacity-30 rounded-sm h-8 px-3 text-sm"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) {
                      p = i + 1;
                    } else if (page <= 3) {
                      p = i + 1;
                    } else if (page >= totalPages - 2) {
                      p = totalPages - 4 + i;
                    } else {
                      p = page - 2 + i;
                    }

                    return (
                      <Button
                        key={p}
                        variant={page === p ? "default" : "outline"}
                        onClick={() => setPage(p)}
                        aria-label={`Page ${p}`}
                        aria-current={page === p ? "page" : undefined}
                        className={
                          page === p
                            ? "bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white border-[#5b9dd9] rounded-sm h-8 w-8 p-0"
                            : "border-[#333333] text-[#999999] hover:bg-[#252525] hover:text-white rounded-sm h-8 w-8 p-0"
                        }
                        size="sm"
                      >
                        {p}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  aria-label="Next page"
                  className="border-[#333333] text-white hover:bg-[#252525] disabled:opacity-30 rounded-sm h-8 px-3 text-sm"
                >
                  Next
                </Button>
              </div>

              <div className="text-sm text-[#999999] hidden sm:block">
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
              </div>
            </nav>
          )}
        </>
      )}

    </div>
  );
}
