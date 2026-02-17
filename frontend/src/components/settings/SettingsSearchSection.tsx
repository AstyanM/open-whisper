import { Search } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { AppConfig } from "@/lib/api";

interface Props {
  draft: AppConfig;
  set: <K extends keyof AppConfig>(section: K, patch: Partial<AppConfig[K]>) => void;
}

export function SettingsSearchSection({ draft, set }: Props) {
  return (
    <Card className="border-accent-top">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Search
        </CardTitle>
        <CardDescription>
          Semantic search relevance settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label>Distance threshold</Label>
              <p className="text-xs text-muted-foreground">
                Maximum cosine distance for results. Lower = stricter filtering.
              </p>
            </div>
            <span className="text-sm text-muted-foreground">
              {draft.search.distance_threshold.toFixed(2)}
            </span>
          </div>
          <Slider
            min={0.1}
            max={1.5}
            step={0.05}
            value={[draft.search.distance_threshold]}
            onValueChange={([v]) => set("search", { distance_threshold: v })}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground/60">
            <span>Strict (0.1)</span>
            <span>Permissive (1.5)</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground">Embedding model</Label>
          <span className="rounded bg-muted px-2 py-1 text-xs font-mono truncate max-w-[300px]">
            {draft.search.embedding_model}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
