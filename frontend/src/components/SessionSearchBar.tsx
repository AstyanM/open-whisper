import { useState, useEffect, useRef } from "react";
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
import { DatePicker } from "@/components/ui/date-picker";
import { LANGUAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { SearchFilters } from "@/lib/api";

interface SessionSearchBarProps {
  onFiltersChange: (filters: SearchFilters) => void;
  initialFilters?: SearchFilters;
}

export function SessionSearchBar({ onFiltersChange, initialFilters }: SessionSearchBarProps) {
  const [query, setQuery] = useState(initialFilters?.q ?? "");
  const [language, setLanguage] = useState<string>(initialFilters?.language ?? "");
  const [mode, setMode] = useState<string>(initialFilters?.mode ?? "");
  const [durationMin, setDurationMin] = useState<string>(
    initialFilters?.duration_min != null ? String(initialFilters.duration_min / 60) : ""
  );
  const [durationMax, setDurationMax] = useState<string>(
    initialFilters?.duration_max != null ? String(initialFilters.duration_max / 60) : ""
  );
  const [dateFrom, setDateFrom] = useState<string>(initialFilters?.date_from ?? "");
  const [dateTo, setDateTo] = useState<string>(initialFilters?.date_to ?? "");

  const hasInitialAdvanced = !!(
    initialFilters?.language || initialFilters?.mode ||
    initialFilters?.duration_min != null || initialFilters?.duration_max != null ||
    initialFilters?.date_from || initialFilters?.date_to
  );
  const [showFilters, setShowFilters] = useState(hasInitialAdvanced);
  const isFirstRender = useRef(true);
  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;

  // Debounced emission — skip initial mount (parent already has the filters from URL)
  // Uses a ref for the callback to avoid re-firing when the parent re-renders
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onFiltersChangeRef.current({
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
  }, [query, language, mode, durationMin, durationMax, dateFrom, dateTo]);

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
                placeholder="Min"
                className="w-[72px]"
                min={0}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="number"
                placeholder="Max"
                className="w-[72px]"
                min={0}
                value={durationMax}
                onChange={(e) => setDurationMax(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>

            <div className="flex items-center gap-1">
              <DatePicker
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="From"
                className="w-[140px]"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <DatePicker
                value={dateTo}
                onChange={setDateTo}
                placeholder="To"
                className="w-[140px]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
