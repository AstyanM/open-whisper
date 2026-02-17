import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ChevronRight, Copy, Check, FileAudio, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DeleteSessionDialog } from "@/components/DeleteSessionDialog";
import { fetchSession, deleteSession, summarizeSession } from "@/lib/api";
import {
  formatDuration,
  formatDateLong,
  formatMs,
  languageLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SessionDetail } from "@/lib/api";

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchSession(parseInt(id))
      .then(setData)
      .catch((e) => {
        const msg = e.message ?? "";
        if (msg.includes("404") || msg.includes("not found")) {
          setNotFound(true);
        } else {
          setError(msg || "Failed to load session");
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!data) return;
    try {
      await deleteSession(data.session.id);
      toast.success("Session deleted");
      navigate("/sessions");
    } catch {
      toast.error("Failed to delete session");
    }
  }

  async function handleSummarize() {
    if (!data) return;
    setSummarizing(true);
    try {
      const result = await summarizeSession(data.session.id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              session: { ...prev.session, summary: result.summary },
            }
          : prev,
      );
      toast.success("Summary generated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate summary";
      toast.error(msg);
    } finally {
      setSummarizing(false);
    }
  }

  async function handleCopy() {
    if (!data) return;
    await navigator.clipboard.writeText(data.full_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Breadcrumb skeleton */}
        <Skeleton className="h-4 w-40" />
        {/* Metadata skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-32" />
        </div>
        {/* Full text card skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
        {/* Segments skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 rounded-md p-2">
                <Skeleton className="h-4 w-24 shrink-0" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center space-y-3">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive/60" />
        <p className="text-destructive">{error}</p>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center space-y-3">
        <div className="mx-auto rounded-full bg-muted p-3 w-fit">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">Session not found</p>
        <Button variant="ghost" onClick={() => navigate("/sessions")}>
          Back to sessions
        </Button>
      </div>
    );
  }

  const { session, segments, full_text } = data;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Breadcrumbs + Delete */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            to="/sessions"
            className="hover:text-foreground transition-colors"
          >
            Sessions
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">Session #{id}</span>
        </nav>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <DeleteSessionDialog onConfirm={handleDelete} />
            </div>
          </TooltipTrigger>
          <TooltipContent>Delete this session</TooltipContent>
        </Tooltip>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3">
        <Badge variant="secondary">{languageLabel(session.language)}</Badge>
        <Badge
          variant={
            session.mode === "transcription"
              ? "transcription"
              : session.mode === "file"
                ? "file"
                : "dictation"
          }
        >
          {session.mode === "file" ? (
            <><FileAudio className="mr-1 h-3 w-3" />file</>
          ) : (
            session.mode
          )}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {formatDuration(session.duration_s)}
        </span>
        <Separator orientation="vertical" className="h-4" />
        <span className="text-sm text-muted-foreground">
          {formatDateLong(session.started_at)}
        </span>
        {session.filename && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <FileAudio className="h-3.5 w-3.5" />
              {session.filename}
            </span>
          </>
        )}
      </div>

      {/* Summary */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Summary
          </CardTitle>
          {session.summary && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSummarize}
              disabled={summarizing || !full_text}
            >
              {summarizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Regenerate
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {session.summary ? (
            <p className="text-sm leading-relaxed">{session.summary}</p>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              {summarizing ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                  <p className="text-sm text-muted-foreground">Generating summary...</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">No summary yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSummarize}
                    disabled={!full_text}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate summary
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full text */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Full text</CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy full text to clipboard</TooltipContent>
          </Tooltip>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {full_text || (
              <span className="italic text-muted-foreground">
                No text in this session
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Segments */}
      {segments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Segments ({segments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {segments.map((seg, i) => (
              <div
                key={seg.id}
                className={cn(
                  "flex items-start gap-3 rounded-md p-2",
                  i % 2 === 0 ? "bg-secondary/30" : "",
                )}
              >
                <span className="shrink-0 font-mono text-xs text-amber-600 dark:text-amber-400">
                  {formatMs(seg.start_ms)}
                  {seg.end_ms != null && ` \u2192 ${formatMs(seg.end_ms)}`}
                </span>
                <span className="text-sm">{seg.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
