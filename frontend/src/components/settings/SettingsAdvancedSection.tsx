import { Wrench } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AppConfig } from "@/lib/api";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="rounded bg-muted px-2 py-1 text-xs font-mono">
        {value}
      </span>
    </div>
  );
}

interface Props {
  draft: AppConfig;
}

export function SettingsAdvancedSection({ draft }: Props) {
  return (
    <Card className="border-accent-top">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Advanced
        </CardTitle>
        <CardDescription>
          Read-only values. Edit config.yaml directly to change these.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Backend" value={`${draft.backend.host}:${draft.backend.port}`} />
        <InfoRow label="Database" value={draft.storage.db_path} />
      </CardContent>
    </Card>
  );
}
