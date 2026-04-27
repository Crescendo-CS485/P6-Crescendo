import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { genres, timeRanges } from "../data/mockData";

interface FilterBarProps {
  // Activity Level section — only rendered when provided
  activeDiscussions?: boolean;
  onActiveDiscussionsChange?: (value: boolean) => void;
  // Genre section — only rendered when provided
  selectedGenres?: string[];
  onGenresChange?: (genres: string[]) => void;
  // Time Range section — only rendered when onTimeRangeChange is provided; custom options override the default list
  selectedTimeRange?: string;
  onTimeRangeChange?: (range: string) => void;
  timeRangeOptions?: { value: string; label: string }[];
  defaultTimeRange?: string;
  onReset: () => void;
}

export function FilterBar({
  activeDiscussions,
  onActiveDiscussionsChange,
  selectedGenres,
  onGenresChange,
  selectedTimeRange,
  onTimeRangeChange,
  timeRangeOptions,
  defaultTimeRange = "all",
  onReset,
}: FilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleGenreToggle = (genre: string) => {
    if (!onGenresChange || !selectedGenres) return;
    if (selectedGenres.includes(genre)) {
      onGenresChange(selectedGenres.filter(g => g !== genre));
    } else {
      onGenresChange([...selectedGenres, genre]);
    }
  };

  const resolvedTimeRangeOptions = timeRangeOptions ?? timeRanges;
  const availableTimeRangeValues = new Set(resolvedTimeRangeOptions.map((opt) => opt.value));
  const fallbackTimeRange = availableTimeRangeValues.has(defaultTimeRange)
    ? defaultTimeRange
    : (resolvedTimeRangeOptions[0]?.value ?? "all");
  const safeSelectedTimeRange = selectedTimeRange ?? fallbackTimeRange;
  const showGenreSection = Boolean(onGenresChange && selectedGenres !== undefined);
  const sectionCount = [
    !!onActiveDiscussionsChange,
    !!onTimeRangeChange,
    showGenreSection,
  ].filter(Boolean).length;
  const gridClass = sectionCount >= 3 ? "grid-cols-1 md:grid-cols-3" : sectionCount === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 max-w-sm";

  const activeFilterCount =
    ((activeDiscussions ?? false) ? 1 : 0) +
    (selectedGenres?.length ?? 0) +
    (onTimeRangeChange && safeSelectedTimeRange !== defaultTimeRange ? 1 : 0);

  return (
    <div className="bg-[#252525] border border-[#333333] mb-6">
      {/* Header - Always Visible */}
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center justify-between p-4 hover:bg-[#2a2a2a] transition-colors text-left cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsExpanded(!isExpanded); }}
        aria-expanded={isExpanded}
        aria-controls="filter-bar-content"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">Filters</h2>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-[#5b9dd9] text-white text-xs font-bold rounded-sm">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeFilterCount > 0 && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              variant="ghost"
              size="sm"
              className="text-[#999999] hover:text-white hover:bg-transparent text-xs h-7"
            >
              Reset All
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-[#999999]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#999999]" />
          )}
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div id="filter-bar-content" className="px-4 pb-4 pt-2 border-t border-[#333333]">
          <div className={`grid ${gridClass} gap-6`}>
            {/* Activity Level (Discovery only) */}
            {onActiveDiscussionsChange && (
              <div className="space-y-2">
                <Label className="text-xs text-[#999999] uppercase tracking-wide">Activity Level</Label>
                <div className="flex items-center justify-between p-3 bg-[#1a1a1a] border border-[#333333]">
                  <div className="flex-1 pr-3">
                    <Label htmlFor="active-discussions" className="text-white cursor-pointer text-sm">
                      Active Discussions
                    </Label>
                    <p className="text-xs text-[#666666] mt-0.5">
                      Score ≥ 8.5
                    </p>
                  </div>
                  <Switch
                    id="active-discussions"
                    checked={activeDiscussions ?? false}
                    onCheckedChange={onActiveDiscussionsChange}
                    className="data-[state=checked]:bg-[#5b9dd9]"
                  />
                </div>
                {activeDiscussions && (
                  <div className="text-[10px] text-[#5b9dd9] font-mono">
                    GET /api/artists?active_discussions=true
                  </div>
                )}
              </div>
            )}

            {/* Time Range */}
            {onTimeRangeChange && (
              <div className="space-y-2">
                <Label className="text-xs text-[#999999] uppercase tracking-wide">Time Range</Label>
                <Select value={safeSelectedTimeRange} onValueChange={onTimeRangeChange}>
                  <SelectTrigger className="bg-[#1a1a1a] border-[#333333] text-white rounded-sm h-[52px]">
                    <SelectValue placeholder="Select time range" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border-[#333333] text-white rounded-sm">
                    {resolvedTimeRangeOptions.map((range) => (
                      <SelectItem
                        key={range.value}
                        value={range.value}
                        className="text-white focus:bg-[#252525] focus:text-white"
                      >
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Genre */}
            {onGenresChange && selectedGenres !== undefined && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-[#999999] uppercase tracking-wide">Quick Genres</Label>
                  {selectedGenres.length > 0 && (
                    <span className="text-xs text-[#5b9dd9] font-medium">
                      {selectedGenres.length} selected
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {genres.slice(0, 8).map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => handleGenreToggle(genre)}
                      aria-pressed={selectedGenres.includes(genre)}
                      className={`px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                        selectedGenres.includes(genre)
                          ? 'bg-[#5b9dd9] border-[#5b9dd9] text-white'
                          : 'bg-[#1a1a1a] border-[#333333] text-[#999999] hover:border-[#5b9dd9] hover:text-white'
                      }`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* All Genres - Expandable */}
          {onGenresChange && selectedGenres !== undefined && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-[#5b9dd9] hover:text-[#4a8bc2] uppercase tracking-wide font-medium">
                Show All Genres ({genres.length})
              </summary>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 p-3 bg-[#1a1a1a] border border-[#333333]">
                {genres.map((genre) => (
                  <div
                    key={genre}
                    className="flex items-center gap-2 p-1.5 hover:bg-[#252525] transition-colors rounded-sm"
                  >
                    <Checkbox
                      id={`genre-all-${genre}`}
                      checked={selectedGenres.includes(genre)}
                      onCheckedChange={() => handleGenreToggle(genre)}
                      className="border-[#666666] data-[state=checked]:bg-[#5b9dd9] data-[state=checked]:border-[#5b9dd9] rounded-sm"
                    />
                    <label
                      htmlFor={`genre-all-${genre}`}
                      className="text-xs text-[#e8e8e8] cursor-pointer flex-1"
                    >
                      {genre}
                    </label>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
