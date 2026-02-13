import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchSession, deleteSession } from "@/lib/api";
import { LANGUAGES } from "@/lib/constants";
import type { SessionDetail } from "@/lib/api";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "--:--";
  const totalSec = Math.floor(seconds);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date(iso));
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const millis = ms % 1000;
  return `${min}:${sec.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchSession(parseInt(id))
      .then(setData)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!data || !window.confirm("Delete this session?")) return;
    await deleteSession(data.session.id);
    navigate("/sessions");
  }

  async function handleCopy() {
    if (!data) return;
    await navigator.clipboard.writeText(data.full_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-muted-foreground">Session not found</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/sessions")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to sessions
        </Button>
      </div>
    );
  }

  const { session, segments, full_text } = data;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/sessions")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Sessions
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3">
        <Badge variant="secondary">{languageLabel(session.language)}</Badge>
        <Badge variant="outline">{session.mode}</Badge>
        <span className="text-sm text-muted-foreground">
          {formatDuration(session.duration_s)}
        </span>
        <Separator orientation="vertical" className="h-4" />
        <span className="text-sm text-muted-foreground">
          {formatDate(session.started_at)}
        </span>
      </div>

      {/* Full text */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Full text</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
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
          <CardContent className="space-y-2">
            {segments.map((seg) => (
              <div
                key={seg.id}
                className="flex items-start gap-3 rounded-md border p-2"
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatMs(seg.start_ms)}
                  {seg.end_ms != null && ` → ${formatMs(seg.end_ms)}`}
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
