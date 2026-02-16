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
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {result}
        </div>
      </CardContent>
    </Card>
  );
}
