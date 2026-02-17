import { useState } from "react";
import { Copy, Check, X, FileText, ListTodo, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Scenario } from "@/lib/api";

interface ScenarioResultProps {
  scenario: Scenario;
  result: string;
  onDismiss: () => void;
}

const SCENARIO_META: Record<
  Scenario,
  { title: string; icon: typeof FileText }
> = {
  summarize: { title: "Summary", icon: FileText },
  todo_list: { title: "To-do List", icon: ListTodo },
  reformulate: { title: "Reformulated Text", icon: Wand2 },
};

/** Render markdown checkboxes as styled HTML for todo_list results. */
function TodoRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <ul className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        // Match "- [ ] task" or "- [x] task" or "* [ ] task" patterns
        const checkboxMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
        if (checkboxMatch) {
          const checked = checkboxMatch[1].toLowerCase() === "x";
          const taskText = checkboxMatch[2];
          return (
            <li key={i} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-amber-500"
              />
              <span className={checked ? "line-through text-muted-foreground" : ""}>
                {taskText}
              </span>
            </li>
          );
        }
        // Group headers (e.g. "**Category:**" or "### Category")
        const headerMatch = trimmed.match(/^(?:\*\*(.+?)\*\*:?|#{1,3}\s+(.+))$/);
        if (headerMatch) {
          const headerText = headerMatch[1] || headerMatch[2];
          return (
            <li key={i} className="mt-3 first:mt-0 font-semibold text-sm">
              {headerText}
            </li>
          );
        }
        // Skip empty lines
        if (!trimmed) return null;
        // Plain text fallback
        return (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
            <span>{trimmed.replace(/^[-*]\s+/, "")}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ScenarioResult({
  scenario,
  result,
  onDismiss,
}: ScenarioResultProps) {
  const [copied, setCopied] = useState(false);
  const meta = SCENARIO_META[scenario];
  const Icon = meta.icon;

  async function handleCopy() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-amber-500" />
          {meta.title}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? "Copied!" : "Copy to clipboard"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dismiss</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-y-auto text-sm leading-relaxed">
          {scenario === "todo_list" ? (
            <TodoRenderer text={result} />
          ) : (
            <div className="whitespace-pre-wrap">{result}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
