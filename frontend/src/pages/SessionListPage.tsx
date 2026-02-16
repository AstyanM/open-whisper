import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, FileText, RefreshCw, Search } from "lucide-react";
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

function SessionCardSkeleton() {
  return (
    <Card className="mb-3">
      <CardContent className="flex items-center justify-between py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </CardContent>
    </Card>
  );
}

export function SessionListPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [collapsingIds, setCollapsingIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<SearchFilters>({});
  const [fetchId, setFetchId] = useState(0);

  const isSearching = useMemo(
    () => Object.values(filters).some((v) => v != null && v !== ""),
    [filters],
  );

  useEffect(() => {
    let cancelled = false;
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

  const handleFiltersChange = useCallback((newFilters: SearchFilters) => {
    setLoading(true);
    setError(null);
    setFilters(newFilters);
  }, []);

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
        <SessionSearchBar onFiltersChange={handleFiltersChange} />
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
        <SessionSearchBar onFiltersChange={handleFiltersChange} />
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
        <SessionSearchBar onFiltersChange={handleFiltersChange} />
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
      <SessionSearchBar onFiltersChange={handleFiltersChange} />

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
              <div className="min-h-0 overflow-hidden">
                <Card
                  className={cn(
                    "cursor-pointer transition-all duration-300",
                    "hover:shadow-md hover:-translate-y-0.5",
                    s.mode === "transcription"
                      ? "border-l-4 border-l-amber-500"
                      : "border-l-4 border-l-emerald-500",
                    isDeleting
                      ? "translate-x-full opacity-0"
                      : "translate-x-0 opacity-100",
                  )}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {languageLabel(s.language)}
                        </Badge>
                        <Badge
                          variant={
                            s.mode === "transcription"
                              ? "transcription"
                              : "dictation"
                          }
                        >
                          {s.mode}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDuration(s.duration_s)}
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeDate(s.started_at)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start">
                          {formatDate(s.started_at)}
                        </TooltipContent>
                      </Tooltip>
                      {s.preview && (
                        <p className="truncate text-xs text-muted-foreground/70">
                          {s.preview}
                        </p>
                      )}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DeleteSessionDialog
                        onConfirm={() => handleDelete(s.id)}
                      />
                    </div>
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
