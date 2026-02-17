import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, FileAudio, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TranscriptionView } from "@/components/TranscriptionView";
import { ScenarioCards } from "@/components/ScenarioCards";
import { ScenarioResult } from "@/components/ScenarioResult";
import { useFileTranscription } from "@/hooks/useFileTranscription";
import { fetchHealth, fetchFullConfig, processText, type Scenario } from "@/lib/api";
import { DEFAULT_LANGUAGE } from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = ".wav,.mp3,.flac,.ogg,.m4a,.webm,.wma,.aac,.opus";
const ACCEPTED_FORMATS_LABEL = "WAV, MP3, FLAC, OGG, M4A, WebM, WMA, AAC, Opus";

export function FileUploadPage() {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [maxSizeMb, setMaxSizeMb] = useState(500);

  const ft = useFileTranscription();

  const isProcessing =
    ft.state !== "idle" && ft.state !== "completed" && ft.state !== "error";
  const hasText = ft.liveText.length > 0;
  const isDone = ft.state === "completed";

  // Fetch model info + config once
  useEffect(() => {
    fetchHealth()
      .then((data) => {
        const t = data.checks?.transcription;
        if (t?.engine && t?.model) {
          const parts = [t.engine, t.model];
          if (t.device) parts.push(t.device);
          setModelLabel(parts.join(" · "));
        }
      })
      .catch(() => {});
    fetchFullConfig()
      .then((cfg) => {
        if (cfg.max_upload_size_mb) setMaxSizeMb(cfg.max_upload_size_mb);
      })
      .catch(() => {});
  }, []);

  // LLM scenario processing (same pattern as TranscriptionPage)
  const [loadingScenario, setLoadingScenario] = useState<Scenario | null>(null);
  const [scenarioResult, setScenarioResult] = useState<{
    scenario: Scenario;
    result: string;
  } | null>(null);

  const handleProcess = useCallback(
    async (scenario: Scenario) => {
      setLoadingScenario(scenario);
      setScenarioResult(null);
      try {
        const data = await processText(ft.liveText, scenario, language);
        setScenarioResult({ scenario: data.scenario, result: data.result });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Processing failed";
        toast.error(msg);
      } finally {
        setLoadingScenario(null);
      }
    },
    [ft.liveText, language],
  );

  function handleFileSelect(file: File) {
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`File too large (max ${maxSizeMb} MB)`);
      return;
    }
    setSelectedFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleUpload() {
    if (!selectedFile) return;
    ft.upload(selectedFile, language);
  }

  function handleReset() {
    ft.reset();
    setSelectedFile(null);
    setScenarioResult(null);
    setLoadingScenario(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* File drop zone (shown when idle) */}
      {ft.state === "idle" && (
        <>
          {/* Controls bar: Language + model info + Upload button (ABOVE drop zone) */}
          <div className="flex items-center justify-between rounded-lg bg-secondary/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <LanguageSelector value={language} onChange={setLanguage} />
              {modelLabel && (
                <span className="font-mono text-xs text-muted-foreground/50">
                  {modelLabel}
                </span>
              )}
            </div>
            <Button onClick={handleUpload} disabled={!selectedFile}>
              <Upload className="mr-2 h-4 w-4" />
              Transcribe
            </Button>
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-4 py-12 border-2 border-dashed rounded-lg transition-colors cursor-pointer",
              dragOver
                ? "border-sky-500 bg-sky-500/5"
                : selectedFile
                  ? "border-sky-500/50 bg-sky-500/5"
                  : "border-border hover:border-sky-500/50",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            {selectedFile ? (
              <>
                <div className="rounded-full bg-sky-500/10 p-4">
                  <FileAudio className="h-8 w-8 text-sky-500" />
                </div>
                <div className="text-center">
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                >
                  <X className="mr-1 h-4 w-4" /> Remove
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-full bg-sky-500/10 p-4">
                  <Upload className="h-8 w-8 text-sky-500/60" />
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">
                    Drop an audio file here or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    {ACCEPTED_FORMATS_LABEL}
                  </p>
                  <p className="text-xs text-muted-foreground/40">
                    Max {maxSizeMb} MB
                  </p>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Active transcription UI */}
      {ft.state !== "idle" && (
        <>
          {/* Status bar */}
          <div className="flex items-center justify-between rounded-lg bg-secondary/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <Badge variant="file">
                <FileAudio className="mr-1 h-3 w-3" />
                File
              </Badge>
              {ft.filename && (
                <span className="max-w-[200px] truncate text-sm text-muted-foreground">
                  {ft.filename}
                </span>
              )}
              {ft.audioDurationS != null && (
                <span className="text-sm text-muted-foreground">
                  {formatDuration(ft.audioDurationS)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isProcessing && (
                <Button variant="destructive" size="sm" onClick={ft.cancel}>
                  Cancel
                </Button>
              )}
              {(isDone || ft.state === "error") && (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  New Upload
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar (during transcription) */}
          {ft.state === "transcribing" && ft.progress > 0 && (
            <Progress value={ft.progress} className="h-2" />
          )}

          {/* Transcription view */}
          <TranscriptionView
            text={ft.liveText}
            state={ft.state}
            elapsedMs={ft.elapsedMs}
            progress={ft.progress}
          />

          {/* Scenario cards */}
          {hasText && isDone && (
            <ScenarioCards
              text={ft.liveText}
              language={language}
              disabled={false}
              loading={loadingScenario}
              onProcess={handleProcess}
            />
          )}

          {scenarioResult && (
            <ScenarioResult
              scenario={scenarioResult.scenario}
              result={scenarioResult.result}
              onDismiss={() => setScenarioResult(null)}
            />
          )}
        </>
      )}

      {/* Error display */}
      {ft.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ft.error}</span>
        </div>
      )}
    </div>
  );
}
