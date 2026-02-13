import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchSessions, deleteSession } from "@/lib/api";
import { LANGUAGES } from "@/lib/constants";
import type { SessionSummary } from "@/lib/api";

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

  useEffect(() => {
    fetchSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!window.confirm("Delete this session?")) return;
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">No sessions yet</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {sessions.map((s) => (
        <Card
          key={s.id}
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => navigate(`/sessions/${s.id}`)}
        >
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{languageLabel(s.language)}</Badge>
                <Badge variant="outline">{s.mode}</Badge>
                <span className="text-sm text-muted-foreground">
                  {formatDuration(s.duration_s)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDate(s.started_at)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => handleDelete(e, s.id)}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
