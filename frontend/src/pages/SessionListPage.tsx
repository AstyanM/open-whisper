import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, FileAudio, FileText, RefreshCw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DeleteSessionDialog } from "@/components/DeleteSessionDialog";
import { SessionSearchBar } from "@/components/SessionSearchBar";
import { fetchSessions, deleteSession, searchSessions } from "@/lib/api";
import {
  formatDuration,
  formatRelativeDate,
  formatDate,
  languageLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SessionSummary, SearchFilters } from "@/lib/api";

function parseFiltersFromParams(params: URLSearchParams): SearchFilters {
  const filters: SearchFilters = {};
  const q = params.get("q");
  const language = params.get("language");
  const mode = params.get("mode");
  const dateFrom = params.get("date_from");
  const dateTo = params.get("date_to");
  const durationMin = params.get("duration_min");
  const durationMax = params.get("duration_max");

  if (q) filters.q = q;
  if (language) filters.language = language;
  if (mode) filters.mode = mode;
  if (dateFrom) filters.date_from = dateFrom;
  if (dateTo) filters.date_to = dateTo;
  if (durationMin) filters.duration_min = parseFloat(durationMin);
  if (durationMax) filters.duration_max = parseFloat(durationMax);

  return filters;
}

function SessionCardSkeleton() {
  return (
    <Card className="mb-3">
      <CardContent className="flex flex-col gap-1.5 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-10" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
        <Skeleton className="h-3 w-3/4" />
      </CardContent>
    </Card>
  );
}

export function SessionListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [collapsingIds, setCollapsingIds] = useState<Set<number>>(new Set());
  const [fetchId, setFetchId] = useState(0);

  // Derive filters from URL params — depend on the string representation
  // to avoid re-creating the object when React Router v7 returns a new
  // URLSearchParams reference for the same URL.
  const searchString = searchParams.toString();
  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchString],
  );

  const isSearching = useMemo(
    () => Object.values(filters).some((v) => v != null && v !== ""),
    [filters],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const hasFilters = Object.values(filters).some(
      (v) => v != null && v !== "",
    );
    const fetcher = hasFilters ? searchSessions(filters) : fetchSessions();

    fetcher
      .then((data) => {
        if (!cancelled) {
          setSessions(data);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message ?? "Failed to load sessions");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filters, fetchId]);

  const handleFiltersChange = useCallback(
    (newFilters: SearchFilters) => {
      // Sync filters to URL params — the useEffect handles loading state
      const params = new URLSearchParams();
      if (newFilters.q) params.set("q", newFilters.q);
      if (newFilters.language) params.set("language", newFilters.language);
      if (newFilters.mode) params.set("mode", newFilters.mode);
      if (newFilters.date_from) params.set("date_from", newFilters.date_from);
      if (newFilters.date_to) params.set("date_to", newFilters.date_to);
      if (newFilters.duration_min != null)
        params.set("duration_min", String(newFilters.duration_min));
      if (newFilters.duration_max != null)
        params.set("duration_max", String(newFilters.duration_max));
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setFetchId((k) => k + 1);
  }, []);

  async function handleDelete(id: number) {
    setDeletingIds((prev) => new Set(prev).add(id));
    await new Promise((r) => setTimeout(r, 300));

    setCollapsingIds((prev) => new Set(prev).add(id));
    await new Promise((r) => setTimeout(r, 300));

    setSessions((prev) => prev.filter((s) => s.id !== id));
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setCollapsingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      await deleteSession(id);
      toast.success("Session deleted");
    } catch {
      reload();
      toast.error("Failed to delete session");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <SessionSearchBar onFiltersChange={handleFiltersChange} initialFilters={filters} />
        <div>
          {Array.from({ length: 4 }).map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <SessionSearchBar onFiltersChange={handleFiltersChange} initialFilters={filters} />
        <div className="py-12 text-center space-y-3">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive/60" />
          <p className="text-destructive">{error}</p>
          <Button variant="ghost" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <SessionSearchBar onFiltersChange={handleFiltersChange} initialFilters={filters} />
        <div className="py-12 text-center space-y-3">
          {isSearching ? (
            <>
              <div className="mx-auto rounded-full bg-muted p-3 w-fit">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No matching sessions</p>
            </>
          ) : (
            <>
              <div className="mx-auto rounded-full bg-muted p-3 w-fit">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No sessions yet</p>
              <p className="text-xs text-muted-foreground/60">
                Start a transcription to create your first session
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <SessionSearchBar onFiltersChange={handleFiltersChange} initialFilters={filters} />

      {/* Session count */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          {isSearching ? " found" : ""}
        </span>
      </div>

      <div>
        {sessions.map((s) => {
          const isDeleting = deletingIds.has(s.id);
          const isCollapsing = collapsingIds.has(s.id);
          return (
            <div
              key={s.id}
              className={cn(
                "grid transition-[grid-template-rows,margin] duration-300 ease-in-out",
                isCollapsing
                  ? "grid-rows-[0fr] mb-0"
                  : "grid-rows-[1fr] mb-3",
              )}
            >
              <div className="min-h-0 overflow-hidden px-1 -mx-1 pt-1 -mt-1 pb-1 -mb-1">
                <Card
                  className={cn(
                    "cursor-pointer transition-all duration-300",
                    "hover:shadow-md hover:-translate-y-0.5",
                    s.mode === "transcription"
                      ? "border-l-4 border-l-amber-500"
                      : s.mode === "file"
                        ? "border-l-4 border-l-sky-500"
                        : "border-l-4 border-l-emerald-500",
                    isDeleting
                      ? "translate-x-full opacity-0"
                      : "translate-x-0 opacity-100",
                  )}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                >
                  <CardContent className="flex flex-col gap-1.5 py-3">
                    {/* Row 1: metadata + date + delete */}
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {languageLabel(s.language)}
                      </Badge>
                      <Badge
                        variant={
                          s.mode === "transcription"
                            ? "transcription"
                            : s.mode === "file"
                              ? "file"
                              : "dictation"
                        }
                      >
                        {s.mode === "file" ? (
                          <><FileAudio className="mr-1 h-3 w-3" />file</>
                        ) : (
                          s.mode
                        )}
                      </Badge>
                      {s.filename && (
                        <span className="truncate max-w-[180px] text-xs text-muted-foreground/70">
                          {s.filename}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(s.duration_s)}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatRelativeDate(s.started_at)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" align="end">
                            {formatDate(s.started_at)}
                          </TooltipContent>
                        </Tooltip>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DeleteSessionDialog
                            onConfirm={() => handleDelete(s.id)}
                          />
                        </div>
                      </div>
                    </div>
                    {/* Row 2: summary or preview (2 lines max) */}
                    {s.summary ? (
                      <p className="line-clamp-2 text-xs text-amber-600/70 dark:text-amber-400/70 flex items-start gap-1">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="line-clamp-2">{s.summary}</span>
                      </p>
                    ) : s.preview ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground/70">
                        {s.preview}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
