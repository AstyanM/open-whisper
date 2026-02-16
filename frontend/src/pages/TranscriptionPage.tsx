import { useEffect, useState } from "react";
import { AlertCircle, Mic, Square, Keyboard, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusIndicator } from "@/components/StatusIndicator";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TranscriptionView } from "@/components/TranscriptionView";
import { ScenarioCards } from "@/components/ScenarioCards";
import { ScenarioResult } from "@/components/ScenarioResult";
import { useTranscriptionContext } from "@/contexts/TranscriptionContext";
import { fetchHealth, processText, type Scenario } from "@/lib/api";

export function TranscriptionPage() {
  const {
    language,
    setLanguage,
    transcription,
    dictation,
    isTranscribing,
    isDictating,
    isActive,
  } = useTranscriptionContext();

  const [modelInfo, setModelInfo] = useState<{
    engine: string;
    model: string;
    device: string;
  } | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((data) => {
        const t = data.checks.transcription;
        if (t?.engine && t?.model) {
          setModelInfo({
            engine: t.engine,
            model: t.model,
            device: t.device ?? "unknown",
          });
        }
      })
      .catch(() => {});
  }, []);

  const { state, start, resume, stop, liveText, error, elapsedMs, device } = transcription;
  const hasText = liveText.length > 0;

  const [loadingScenario, setLoadingScenario] = useState<Scenario | null>(null);
  const [scenarioResult, setScenarioResult] = useState<{
    scenario: Scenario;
    result: string;
  } | null>(null);

  async function handleProcess(scenario: Scenario) {
    setLoadingScenario(scenario);
    setScenarioResult(null);
    try {
      const data = await processText(liveText, scenario, language);
      setScenarioResult({ scenario: data.scenario, result: data.result });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Processing failed";
      toast.error(msg);
    } finally {
      setLoadingScenario(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between rounded-lg bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-4">
          <StatusIndicator state={isDictating ? dictation.state : state} device={isDictating ? dictation.device : device} />
          {isDictating && (
            <Badge variant="dictation">
              <Keyboard className="mr-1 h-3 w-3" />
              Dictation
            </Badge>
          )}
          {isTranscribing && (
            <Badge variant="transcription">
              <Mic className="mr-1 h-3 w-3" />
              Transcription
            </Badge>
          )}
          <Separator orientation="vertical" className="h-6" />
          <LanguageSelector
            value={language}
            onChange={setLanguage}
            disabled={isActive}
          />
        </div>

        {isTranscribing ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                onClick={stop}
                disabled={state === "finalizing"}
              >
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop recording (Ctrl+Shift+T)</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2">
            {hasText && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => resume(language)} disabled={isDictating}>
                    <Play className="mr-2 h-4 w-4" />
                    Continue
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Resume transcription (Ctrl+Shift+T)</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={hasText ? "outline" : "default"}
                  onClick={() => start(language)}
                  disabled={isDictating}
                >
                  <Mic className="mr-2 h-4 w-4" />
                  {hasText ? "New" : "Start"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {hasText ? "Start new session" : "Start transcription (Ctrl+Shift+T)"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Transcription display */}
      <TranscriptionView
        text={liveText}
        state={state}
        elapsedMs={elapsedMs}
        modelLabel={modelInfo ? `${modelInfo.engine} \u00b7 ${modelInfo.model} \u00b7 ${modelInfo.device}` : null}
      />

      {/* Scenario cards — shown when text exists and not recording */}
      {hasText && !isTranscribing && (
        <ScenarioCards
          text={liveText}
          language={language}
          disabled={isDictating}
          loading={loadingScenario}
          onProcess={handleProcess}
        />
      )}

      {/* Scenario result */}
      {scenarioResult && (
        <ScenarioResult
          scenario={scenarioResult.scenario}
          result={scenarioResult.result}
          onDismiss={() => setScenarioResult(null)}
        />
      )}

      {/* Error display */}
      {(error || dictation.error) && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || dictation.error}</span>
        </div>
      )}
    </div>
  );
}
