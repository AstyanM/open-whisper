import { FileText, ListTodo, Wand2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Scenario } from "@/lib/api";

interface ScenarioCardsProps {
  text: string;
  language: string;
  disabled: boolean;
  loading: Scenario | null;
  onProcess: (scenario: Scenario) => void;
}

const SCENARIOS = [
  {
    id: "summarize" as Scenario,
    title: "Summarize",
    description: "Key points in 2-4 sentences",
    icon: FileText,
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    ring: "hover:ring-amber-500/30",
    activeRing: "ring-amber-500/20",
  },
  {
    id: "todo_list" as Scenario,
    title: "To-do list",
    description: "Extract actionable tasks",
    icon: ListTodo,
    bg: "bg-emerald-500/10",
    text: "text-emerald-500",
    ring: "hover:ring-emerald-500/30",
    activeRing: "ring-emerald-500/20",
  },
  {
    id: "reformulate" as Scenario,
    title: "Reformulate",
    description: "Clean up artifacts & grammar",
    icon: Wand2,
    bg: "bg-sky-500/10",
    text: "text-sky-500",
    ring: "hover:ring-sky-500/30",
    activeRing: "ring-sky-500/20",
  },
] as const;

export function ScenarioCards({
  text,
  language: _language,
  disabled,
  loading,
  onProcess,
}: ScenarioCardsProps) {
  const isDisabled = disabled || !text.trim() || loading !== null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {SCENARIOS.map((s) => {
        const Icon = loading === s.id ? Loader2 : s.icon;
        const isLoading = loading === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onProcess(s.id)}
            disabled={isDisabled}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-all",
              !isDisabled && s.ring,
              !isDisabled && "hover:shadow-sm",
              isDisabled && "opacity-50 cursor-not-allowed",
              isLoading && s.activeRing && "ring-2",
            )}
          >
            <div
              className={cn(
                "rounded-md p-2",
                s.bg,
                isLoading && "animate-pulse",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  s.text,
                  isLoading && "animate-spin",
                )}
              />
            </div>
            <div>
              <div className="text-sm font-medium">{s.title}</div>
              <div className="text-xs text-muted-foreground">
                {s.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
