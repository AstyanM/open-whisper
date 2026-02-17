import { useState, useEffect } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LANGUAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { SearchFilters } from "@/lib/api";

interface SessionSearchBarProps {
  onFiltersChange: (filters: SearchFilters) => void;
}

export function SessionSearchBar({ onFiltersChange }: SessionSearchBarProps) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string>("");
  const [mode, setMode] = useState<string>("");
  const [durationMin, setDurationMin] = useState<string>("");
  const [durationMax, setDurationMax] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Debounced emission
  useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange({
        q: query || undefined,
        language: language || undefined,
        mode: mode || undefined,
        duration_min: durationMin ? parseFloat(durationMin) * 60 : undefined,
        duration_max: durationMax ? parseFloat(durationMax) * 60 : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, language, mode, durationMin, durationMax, dateFrom, dateTo, onFiltersChange]);

  const hasFilters =
    query || language || mode || durationMin || durationMax || dateFrom || dateTo;
  const hasAdvancedFilters =
    language || mode || durationMin || durationMax || dateFrom || dateTo;

  function clearAll() {
    setQuery("");
    setLanguage("");
    setMode("");
    setDurationMin("");
    setDurationMax("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="space-y-3">
      {/* Search input row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sessions by topic..."
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showFilters || hasAdvancedFilters ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filters</TooltipContent>
        </Tooltip>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Filter row (animated collapsible) */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          showFilters ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={mode}
              onValueChange={(v) => setMode(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                <SelectItem value="transcription">Transcription</SelectItem>
                <SelectItem value="dictation">Dictation</SelectItem>
                <SelectItem value="file">File Upload</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="Min (min)"
                className="w-[100px]"
                min={0}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="number"
                placeholder="Max (min)"
                className="w-[100px]"
                min={0}
                value={durationMax}
                onChange={(e) => setDurationMax(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-1">
              <Input
                type="date"
                className="w-[140px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="date"
                className="w-[140px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
