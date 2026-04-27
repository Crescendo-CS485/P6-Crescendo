import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { API_BASE, apiFetch } from "../../lib/api";
import { AlbumCard } from "../components/AlbumCard";
import { AlbumCardSkeleton } from "../components/AlbumCardSkeleton";
import { ErrorState, EmptyState } from "../components/PageStates";
import { Album } from "../data/mockData";

interface GenreInfo {
  name: string;
  albumCount: number;
  avgScore: number;
  coverImages: string[];
}

interface GenresResponse {
  genres: GenreInfo[];
}

interface AlbumsResponse {
  albums: Album[];
  total: number;
  page: number;
  pages: number;
}

// 2x2 cover grid card for genre overview
function GenreCard({ genre, onClick }: { genre: GenreInfo; onClick: () => void }) {
  const covers = genre.coverImages.slice(0, 4);

  return (
    <button
      onClick={onClick}
      className="bg-[#252525] border border-[#333333] hover:border-[#5b9dd9] transition-colors text-left w-full"
    >
      {/* 2x2 cover grid */}
      <div className="grid grid-cols-2 border-b border-[#333333]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-square overflow-hidden">
            {covers[i] ? (
              <img
                src={covers[i]}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#1a1a1a]" />
            )}
          </div>
        ))}
      </div>
      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-bold text-white mb-1">{genre.name}</h3>
        <div className="flex items-center justify-between text-xs text-[#666666]">
          <span>{genre.albumCount} {genre.albumCount === 1 ? "album" : "albums"}</span>
          <span className="text-[#5b9dd9] font-bold">{genre.avgScore.toFixed(1)} avg</span>
        </div>
      </div>
    </button>
  );
}

export default function GenresPage() {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Genres overview query
  const {
    data: genresData,
    isLoading: genresLoading,
    isError: genresError,
    refetch: refetchGenres,
  } = useQuery<GenresResponse>({
    queryKey: ["album-genres"],
    queryFn: () =>
      apiFetch(`${API_BASE}/api/albums/genres`).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch genres");
        return r.json();
      }),
    enabled: selectedGenre === null,
  });

  // Filtered albums query (when genre selected)
  const {
    data: albumsData,
    isLoading: albumsLoading,
    isError: albumsError,
    refetch: refetchAlbums,
  } = useQuery<AlbumsResponse>({
    queryKey: ["albums-by-genre", selectedGenre],
    queryFn: () =>
      apiFetch(`${API_BASE}/api/albums?genre=${encodeURIComponent(selectedGenre!)}&sort=user_score&per_page=50`).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch albums");
        return r.json();
      }),
    enabled: selectedGenre !== null,
  });

  // Derived booleans — override whichever view is currently active
  const liveLoading = selectedGenre !== null ? albumsLoading : genresLoading;
  const liveError = selectedGenre !== null ? albumsError : genresError;
  const liveEmpty =
    selectedGenre !== null
      ? !albumsLoading && !albumsError && (albumsData?.albums ?? []).length === 0
      : !genresLoading && !genresError && (genresData?.genres ?? []).length === 0;

  const effectiveLoading = liveLoading;
  const effectiveError = liveError;
  const effectiveEmpty = liveEmpty;
  const effectiveSuccess = !effectiveLoading && !effectiveError && !effectiveEmpty;

  // Genre detail view
  if (selectedGenre !== null) {
    const albums = albumsData?.albums ?? [];

    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-5 pb-5 border-b border-[#2a2a2a]">
          <button
            onClick={() => setSelectedGenre(null)}
            className="flex items-center gap-2 text-[#999999] hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            All Genres
          </button>
          <span className="text-[#333333]">/</span>
          <h1 className="text-xl font-bold text-white">{selectedGenre}</h1>
          {albumsData && (
            <span className="text-sm text-[#666666]">{albumsData.total} albums</span>
          )}
        </div>

        {effectiveError && <ErrorState onRetry={() => refetchAlbums()} />}

        {effectiveLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <AlbumCardSkeleton key={i} />
            ))}
          </div>
        )}

        {effectiveEmpty && (
          <EmptyState
            title="No Albums Found"
            message={`No albums found in the ${selectedGenre} genre.`}
            onAction={() => setSelectedGenre(null)}
            actionLabel="Back to Genres"
          />
        )}

        {effectiveSuccess && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}

      </div>
    );
  }

  // Genre overview
  const genres = genresData?.genres ?? [];

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      <div className="mb-5 pb-5 border-b border-[#2a2a2a]">
        <h1 className="text-2xl font-bold text-white mb-1">Browse by Genre</h1>
        <p className="text-sm text-[#999999]">
          {genres.length} genres • Click a genre to explore albums
        </p>
      </div>

      {effectiveError && <ErrorState onRetry={() => refetchGenres()} />}

      {effectiveLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-[#252525] border border-[#333333] animate-pulse">
              <div className="grid grid-cols-2">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="aspect-square bg-[#333333]" />
                ))}
              </div>
              <div className="p-3">
                <div className="h-3.5 bg-[#333333] rounded w-2/3 mb-2" />
                <div className="h-3 bg-[#333333] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {effectiveEmpty && (
        <EmptyState
          title="No Genres Found"
          message="Genre data is not available yet."
        />
      )}

      {effectiveSuccess && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {genres.map((genre) => (
            <GenreCard
              key={genre.name}
              genre={genre}
              onClick={() => setSelectedGenre(genre.name)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
