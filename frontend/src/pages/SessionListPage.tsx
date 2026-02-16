import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteSessionDialog } from "@/components/DeleteSessionDialog";
import { SessionSearchBar } from "@/components/SessionSearchBar";
import { fetchSessions, deleteSession, searchSessions } from "@/lib/api";
import { LANGUAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { SessionSummary, SearchFilters } from "@/lib/api";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "--:--";
  const totalSec = Math.floor(seconds);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
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

  // Trigger a new fetch when filters or fetchId change.
  // Loading/error are reset via the event handlers that change filters/fetchId.
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
    // Phase 1: slide out
    setDeletingIds((prev) => new Set(prev).add(id));
    await new Promise((r) => setTimeout(r, 300));

    // Phase 2: collapse height
    setCollapsingIds((prev) => new Set(prev).add(id));
    await new Promise((r) => setTimeout(r, 300));

    // Remove from state
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

    // Backend call
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
        <div className="py-12 text-center text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <SessionSearchBar onFiltersChange={handleFiltersChange} />
        <div className="py-12 text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="ghost" className="mt-4" onClick={reload}>
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
        <div className="py-12 text-center">
          {isSearching ? (
            <>
              <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No matching sessions</p>
            </>
          ) : (
            <>
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No sessions yet</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <SessionSearchBar onFiltersChange={handleFiltersChange} />
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
                    "hover:bg-accent/50",
                    isDeleting
                      ? "translate-x-full opacity-0"
                      : "translate-x-0 opacity-100",
                  )}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {languageLabel(s.language)}
                        </Badge>
                        <Badge variant="outline">{s.mode}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDuration(s.duration_s)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(s.started_at)}
                      </span>
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
