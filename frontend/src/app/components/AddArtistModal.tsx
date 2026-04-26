import { useEffect, useState } from "react";
import { X, Loader2, UserPlus } from "lucide-react";
import { API_BASE, apiFetch } from "../../lib/api";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

interface AddArtistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function AddArtistModal({ isOpen, onClose, onCreated }: AddArtistModalProps) {
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bio, setBio] = useState("");
  const [genres, setGenres] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setImageUrl("");
      setBio("");
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
    if (!name.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/artists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          imageUrl: imageUrl.trim() || undefined,
          bio: bio.trim() || undefined,
          genres: genres
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create artist");
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
            <UserPlus className="w-5 h-5 text-[#5b9dd9]" />
            <span className="text-white font-bold text-base">Add Artist</span>
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
              Name <span className="text-red-400">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="Artist name"
              className="bg-[#252525] border-[#333333] text-white placeholder:text-[#555555] h-9 rounded-sm focus-visible:border-[#5b9dd9] focus-visible:ring-[#5b9dd9]/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#999999] uppercase tracking-wide">Image URL</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className="bg-[#252525] border-[#333333] text-white placeholder:text-[#555555] h-9 rounded-sm focus-visible:border-[#5b9dd9] focus-visible:ring-[#5b9dd9]/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#999999] uppercase tracking-wide">Genres</Label>
            <Input
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
              placeholder="Pop, Indie, Electronic"
              className="bg-[#252525] border-[#333333] text-white placeholder:text-[#555555] h-9 rounded-sm focus-visible:border-[#5b9dd9] focus-visible:ring-[#5b9dd9]/20"
            />
            <p className="text-[10px] text-[#444444]">Comma-separated.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-[#999999] uppercase tracking-wide">Bio</Label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Short bio…"
              rows={4}
              className="w-full bg-[#252525] border border-[#333333] text-white placeholder:text-[#555555] text-sm px-3 py-2 rounded-sm resize-none outline-none focus:border-[#5b9dd9] transition-colors"
            />
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
              disabled={isSubmitting || !name.trim()}
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

