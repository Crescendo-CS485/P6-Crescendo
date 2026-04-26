import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Disc3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, apiFetch } from "../../lib/api";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

interface ArtistLite {
  id: string;
  name: string;
}

interface ArtistsResponse {
  artists: ArtistLite[];
}

interface CreateAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateAlbumModal({ isOpen, onClose, onCreated }: CreateAlbumModalProps) {
  const [title, setTitle] = useState("");
  const [artistId, setArtistId] = useState("");
  const [releaseYear, setReleaseYear] = useState<string>("");
  const [albumType, setAlbumType] = useState("studio");
  const [coverUrl, setCoverUrl] = useState("");
  const [genres, setGenres] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<ArtistsResponse>({
    queryKey: ["artists-lite"],
    queryFn: () => apiFetch(`${API_BASE}/api/artists?per_page=200&sort=activity`).then((r) => r.json()),
    enabled: isOpen,
    staleTime: 60_000,
  });

  const artists = data?.artists ?? [];
  const sortedArtists = useMemo(
    () => [...artists].sort((a, b) => a.name.localeCompare(b.name)),
    [artists]
  );

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setArtistId("");
      setReleaseYear("");
      setAlbumType("studio");
      setCoverUrl("");
      setGenres("");
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !artistId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/albums`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          artistId,
          releaseYear: releaseYear.trim() ? Number(releaseYear.trim()) : undefined,
          albumType,
          coverUrl: coverUrl.trim() || undefined,
          genres: genres
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create album");
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md mx-4 z-10 shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-[#5b9dd9]" />
            <span className="text-white font-bold text-base">Add Album</span>
          </div>
          <button onClick={onClose} className="text-[#666666] hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-sm">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-[#999999] uppercase tracking-wide">
              Title <span className="text-red-400">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={500}
              placeholder="Album title"
              className="bg-[#252525] border-[#333333] text-white placeholder:text-[#555555] h-9 rounded-sm focus-visible:border-[#5b9dd9] focus-visible:ring-[#5b9dd9]/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#999999] uppercase tracking-wide">
              Artist <span className="text-red-400">*</span>
            </Label>

            {isError ? (
              <Button
                type="button"
                onClick={() => refetch()}
                className="w-full bg-[#252525] border border-[#333333] text-white hover:bg-[#1a1a1a] rounded-sm"
              >
                Retry loading artists
              </Button>
            ) : (
              <select
                value={artistId}
                onChange={(e) => setArtistId(e.target.value)}
                disabled={isLoading}
                className="w-full bg-[#252525] border border-[#333333] text-white text-sm px-3 py-2 rounded-sm outline-none focus:border-[#5b9dd9] transition-colors disabled:opacity-60"
              >
                <option value="" disabled>
                  {isLoading ? "Loading artists..." : "Select an artist"}
                </option>
                {sortedArtists.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#999999] uppercase tracking-wide">Year</Label>
              <Input
                value={releaseYear}
                onChange={(e) => setReleaseYear(e.target.value)}
                placeholder="2026"
                inputMode="numeric"
                className="bg-[#252525] border-[#333333] text-white placeholder:text-[#555555] h-9 rounded-sm focus-visible:border-[#5b9dd9] focus-visible:ring-[#5b9dd9]/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#999999] uppercase tracking-wide">Type</Label>
              <select
                value={albumType}
                onChange={(e) => setAlbumType(e.target.value)}
                className="w-full bg-[#252525] border border-[#333333] text-white text-sm px-3 py-2 rounded-sm outline-none focus:border-[#5b9dd9] transition-colors"
              >
                <option value="studio">Studio</option>
                <option value="ep">EP</option>
                <option value="live">Live</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#999999] uppercase tracking-wide">Cover URL</Label>
            <Input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
              className="bg-[#252525] border-[#333333] text-white placeholder:text-[#555555] h-9 rounded-sm focus-visible:border-[#5b9dd9] focus-visible:ring-[#5b9dd9]/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#999999] uppercase tracking-wide">Genres</Label>
            <Input
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
              placeholder="Pop, Indie"
              className="bg-[#252525] border-[#333333] text-white placeholder:text-[#555555] h-9 rounded-sm focus-visible:border-[#5b9dd9] focus-visible:ring-[#5b9dd9]/20"
            />
            <p className="text-[10px] text-[#444444]">Comma-separated.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-[#333333] text-[#999999] hover:text-white hover:bg-[#252525] rounded-sm h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim() || !artistId}
              className="flex-1 bg-[#5b9dd9] hover:bg-[#4a8bc2] text-white rounded-sm h-9 font-medium disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

