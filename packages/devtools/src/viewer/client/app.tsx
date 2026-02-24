import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Zap,
  Wrench,
  MessageSquare,
  AlertCircle,
  ChevronDown,
  Settings,
  Brain,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { AISDKLogo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Run {
  id: string;
  started_at: string;
  stepCount: number;
  firstMessage?: string;
  hasError?: boolean;
  isInProgress?: boolean;
  type?: 'generate' | 'stream';
}

interface Step {
  id: string;
  run_id: string;
  step_number: number;
  type: 'generate' | 'stream';
  model_id: string;
  provider: string | null;
  started_at: string;
  duration_ms: number | null;
  input: string;
  output: string | null;
  usage: string | null;
  error: string | null;
  raw_request: string | null;
  raw_response: string | null;
  raw_chunks: string | null;
  provider_options: string | null;
}

interface RunDetail {
  run: { id: string; started_at: string; isInProgress?: boolean };
  steps: Step[];
}

type StepType = 'tool-calls' | 'response' | 'error';

interface StepSummary {
  type: StepType;
  icon: 'wrench' | 'message' | 'alert';
  label: string;
  toolDetails?: string;
}

function summarizeToolCalls(toolCalls: any[]): {
  label: string;
  details: string;
} {
  // Count occurrences of each tool
  const counts = toolCalls.reduce((acc: Record<string, number>, call: any) => {
    acc[call.toolName] = (acc[call.toolName] || 0) + 1;
    return acc;
  }, {});

  const uniqueTools = Object.keys(counts);

  // Format tool name with count if > 1
  const formatTool = (name: string) => {
    const count = counts[name] ?? 0;
    return count > 1 ? `${name} (x${count})` : name;
  };

  const allToolsFormatted = uniqueTools.map(formatTool);

  // Single tool type
  if (uniqueTools.length === 1 && uniqueTools[0]) {
    return {
      label: formatTool(uniqueTools[0]),
      details: '', // No tooltip needed
    };
  }

  // Two tools - show both
  if (uniqueTools.length === 2) {
    return {
      label: `${formatTool(uniqueTools[0])}, ${formatTool(uniqueTools[1])}`,
      details: allToolsFormatted.join(', '),
    };
  }

  // 3+ tools: show first two + ellipsis
  return {
    label: `${formatTool(uniqueTools[0])}, ${formatTool(uniqueTools[1])}, ...`,
    details: allToolsFormatted.join(', '),
  };
}

interface StepInputSummary {
  type: 'user' | 'tool';
  label: string;
  fullText?: string; // For tooltip on user messages
  toolDetails?: string; // For tooltip on tool results
}

function getStepInputSummary(
  input: any,
  isFirstStep: boolean,
): StepInputSummary | null {
  const prompt = input?.prompt;
  if (!Array.isArray(prompt)) return null;

  // For first step: always show the last user message (what kicked off this run)
  if (isFirstStep) {
    const userMessages = prompt.filter((msg: any) => msg.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    if (lastUserMessage) {
      const content = lastUserMessage.content;
      let text: string | null = null;

      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        const textPart = content.find((part: any) => part.type === 'text');
        if (textPart?.text) {
          text = textPart.text;
        }
      }

      if (text) {
        return {
          type: 'user',
          label: `"${truncateText(text)}"`,
          fullText: text,
        };
      }
    }
    return null;
  }

  // For subsequent steps: show the last tool results
  const toolMessages = prompt.filter((msg: any) => msg.role === 'tool');
  if (toolMessages.length > 0) {
    // Only get tool names from the last tool message (the most recent tool results)
    const lastToolMessage = toolMessages[toolMessages.length - 1];
    const toolCounts: Record<string, number> = {};

    const content = lastToolMessage.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'tool-result' && part.toolName) {
          toolCounts[part.toolName] = (toolCounts[part.toolName] || 0) + 1;
        }
      }
    }

    const uniqueTools = Object.keys(toolCounts);
    if (uniqueTools.length === 0) {
      return { type: 'tool', label: 'tool result' };
    }

    // Format tool name with count if > 1
    const formatTool = (name: string) => {
      const count = toolCounts[name];
      return count > 1 ? `${name} (x${count})` : name;
    };

    const allToolsFormatted = uniqueTools.map(formatTool);

    if (uniqueTools.length === 1) {
      return { type: 'tool', label: formatTool(uniqueTools[0]) };
    }

    if (uniqueTools.length === 2) {
      return {
        type: 'tool',
        label: `${formatTool(uniqueTools[0])}, ${formatTool(uniqueTools[1])}`,
        toolDetails: allToolsFormatted.join(', '),
      };
    }

    // 3+ tools: show first two + ellipsis
    return {
      type: 'tool',
      label: `${formatTool(uniqueTools[0])}, ${formatTool(uniqueTools[1])}, ...`,
      toolDetails: allToolsFormatted.join(', '),
    };
  }

  // Fall back to last user message
  const userMessages = prompt.filter((msg: any) => msg.role === 'user');
  const lastUserMessage = userMessages[userMessages.length - 1];

  if (!lastUserMessage) return null;

  // Extract text content from the message
  const content = lastUserMessage.content;
  let text: string | null = null;

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    const textPart = content.find((part: any) => part.type === 'text');
    if (textPart?.text) {
      text = textPart.text;
    }
  }

  if (!text) return null;

  return {
    type: 'user',
    label: `"${truncateText(text)}"`,
    fullText: text,
  };
}

function truncateText(text: string, maxLength: number = 30): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}

function getStepSummary(output: any, error: string | null): StepSummary {
  if (error) {
    return { type: 'error', icon: 'alert', label: 'Error' };
  }

  // finishReason can be a string or an object with {unified, raw} properties
  const finishReason =
    typeof output?.finishReason === 'string'
      ? output.finishReason
      : output?.finishReason?.unified;

  if (finishReason === 'tool-calls') {
    const toolCalls =
      output?.toolCalls ||
      output?.content?.filter((p: any) => p.type === 'tool-call') ||
      [];
    const { label, details } = summarizeToolCalls(toolCalls);
    return {
      type: 'tool-calls',
      icon: 'wrench',
      label,
      toolDetails: details || undefined,
    };
  }

  return { type: 'response', icon: 'message', label: 'Response' };
}

function App() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/runs');
      const data = await res.json();
      setRuns(data);
    } catch (error) {
      console.error('Failed to fetch runs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    await fetch('/api/clear', { method: 'POST' });
    setRuns([]);
    setSelectedRun(null);
  };

  // Initial fetch
  useEffect(() => {
    fetchRuns();
  }, []);

  // SSE connection for real-time updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      eventSource = new EventSource('/api/events');

      eventSource.addEventListener('connected', () => {
        console.log('[DevTools] Connected to real-time updates');
      });

      eventSource.addEventListener('update', () => {
        // Refresh the runs list when data changes
        fetchRuns();
        // Also refresh selected run if one is selected
        if (selectedRun) {
          fetch(`/api/runs/${selectedRun.run.id}`)
            .then(res => res.json())
            .then(data => {
              if (data && !data.error) {
                setSelectedRun(data);
              }
            })
            .catch(() => {});
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // Connection is alive
      });

      eventSource.onerror = () => {
        console.log('[DevTools] SSE connection lost, reconnecting...');
        eventSource?.close();
        // Reconnect after 2 seconds
        reconnectTimeout = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [selectedRun?.run.id]);

  const selectRun = async (runId: string) => {
    const res = await fetch(`/api/runs/${runId}`);
    const data = await res.json();
    setSelectedRun(data);
    // Start with all steps collapsed
    setExpandedSteps(new Set());
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const parseJson = (str: string | null) => {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  };

  const getFirstUserMessage = (steps: Step[]): string => {
    const firstStep = steps[0];
    if (!firstStep) return 'Empty run';
    const input = parseJson(firstStep.input);
    const userMsg = input?.prompt?.find((m: any) => m.role === 'user');
    if (userMsg) {
      const content =
        typeof userMsg.content === 'string'
          ? userMsg.content
          : userMsg.content?.[0]?.text || '';
      return content.slice(0, 50) + (content.length > 50 ? '...' : '');
    }
    return 'No user message';
  };

  const hasRunError = (steps: Step[]): boolean => {
    return steps.some(s => s.error);
  };

  const getTotalDuration = (steps: Step[]): number => {
    return steps.reduce((acc, s) => acc + (s.duration_ms || 0), 0);
  };

  const getTotalTokens = (
    steps: Step[],
  ): { input: InputTokenBreakdown; output: OutputTokenBreakdown } => {
    return steps.reduce(
      (acc, s) => {
        const usage = parseJson(s.usage);
        const inputBreakdown = getInputTokenBreakdown(usage?.inputTokens);
        const outputBreakdown = getOutputTokenBreakdown(usage?.outputTokens);

        const input: InputTokenBreakdown = {
          total: acc.input.total + inputBreakdown.total,
        };

        // Only add breakdown properties if they exist in either accumulator or current breakdown
        if (
          acc.input.noCache !== undefined ||
          inputBreakdown.noCache !== undefined
        ) {
          input.noCache =
            (acc.input.noCache ?? 0) + (inputBreakdown.noCache ?? 0);
        }
        if (
          acc.input.cacheRead !== undefined ||
          inputBreakdown.cacheRead !== undefined
        ) {
          input.cacheRead =
            (acc.input.cacheRead ?? 0) + (inputBreakdown.cacheRead ?? 0);
        }
        if (
          acc.input.cacheWrite !== undefined ||
          inputBreakdown.cacheWrite !== undefined
        ) {
          input.cacheWrite =
            (acc.input.cacheWrite ?? 0) + (inputBreakdown.cacheWrite ?? 0);
        }

        const output: OutputTokenBreakdown = {
          total: acc.output.total + outputBreakdown.total,
        };

        // Only add breakdown properties if they exist in either accumulator or current breakdown
        if (
          acc.output.text !== undefined ||
          outputBreakdown.text !== undefined
        ) {
          output.text = (acc.output.text ?? 0) + (outputBreakdown.text ?? 0);
        }
        if (
          acc.output.reasoning !== undefined ||
          outputBreakdown.reasoning !== undefined
        ) {
          output.reasoning =
            (acc.output.reasoning ?? 0) + (outputBreakdown.reasoning ?? 0);
        }

        return { input, output };
      },
      {
        input: { total: 0 },
        output: { total: 0 },
      } as { input: InputTokenBreakdown; output: OutputTokenBreakdown },
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex justify-between items-center px-5 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <AISDKLogo />
          <span className="text-base font-medium text-muted-foreground">
            DevTools
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchRuns}
            className="h-8 px-3 text-xs"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-8 px-3 text-xs text-destructive-foreground hover:bg-destructive/20"
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[300px] border-r border-border bg-sidebar flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Runs
            </span>
          </div>
          <ScrollArea className="flex-1 overflow-hidden">
            {loading ? (
              <p className="p-4 text-muted-foreground text-sm">Loading...</p>
            ) : runs.length === 0 ? (
              <p className="p-4 text-muted-foreground text-sm">No runs yet</p>
            ) : (
              <div>
                {runs.map(run => {
                  const isSelected = selectedRun?.run.id === run.id;
                  return (
                    <button
                      key={run.id}
                      className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors ${
                        isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                      }`}
                      onClick={() => selectRun(run.id)}
                    >
                      <div className="flex items-start gap-2 mb-1.5 min-w-0">
                        {run.isInProgress ? (
                          <Loader2 className="size-3.5 text-blue-400 mt-0.5 shrink-0 animate-spin" />
                        ) : run.hasError ? (
                          <AlertCircle className="size-3.5 text-destructive-foreground mt-0.5 shrink-0" />
                        ) : (
                          <MessageSquare className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <span className="text-[13px] text-foreground leading-tight line-clamp-1 break-all">
                          {run.firstMessage || 'Loading...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-5.5 text-[11px] text-muted-foreground">
                        {run.type && (
                          <span
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              run.type === 'stream'
                                ? 'bg-blue-500/15 text-blue-400'
                                : 'bg-emerald-500/15 text-emerald-400'
                            }`}
                          >
                            {run.type === 'stream' && (
                              <Zap className="size-2.5" />
                            )}
                            {run.type}
                          </span>
                        )}
                        <span>
                          {run.stepCount}{' '}
                          {run.stepCount === 1 ? 'step' : 'steps'}
                        </span>
                        <span>·</span>
                        <span className="font-mono">
                          {new Date(run.started_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {!selectedRun ? (
              <div className="flex items-center justify-center min-h-[calc(100vh-57px)] text-muted-foreground">
                <p className="text-sm">Select a run to view details</p>
              </div>
            ) : (
              <div className="p-5">
                {/* Run Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-medium text-foreground">
                      {getFirstUserMessage(selectedRun.steps)}
                    </h2>
                    {selectedRun.run.isInProgress && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-5 gap-1.5 bg-blue-500/15 text-blue-400 border-blue-500/30"
                      >
                        <Loader2 className="size-3 animate-spin" />
                        In Progress
                      </Badge>
                    )}
                    {hasRunError(selectedRun.steps) && (
                      <Badge variant="destructive" className="text-[10px] h-5">
                        Error
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <span>{selectedRun.steps.length} steps</span>
                    <span className="px-3 text-muted-foreground/30">·</span>
                    <span className="font-mono">
                      {formatDuration(getTotalDuration(selectedRun.steps))}
                    </span>
                    <span className="px-3 text-muted-foreground/30">·</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-mono cursor-help">
                          input:{' '}
                          {formatInputTokens(
                            getTotalTokens(selectedRun.steps).input,
                          )}{' '}
                          <span className="text-muted-foreground/50">→</span>{' '}
                          output:{' '}
                          {formatOutputTokens(
                            getTotalTokens(selectedRun.steps).output,
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <TokenBreakdownTooltip
                          input={getTotalTokens(selectedRun.steps).input}
                          output={getTotalTokens(selectedRun.steps).output}
                        />
                      </TooltipContent>
                    </Tooltip>
                    <span className="px-3 text-muted-foreground/30">·</span>
                    <span>
                      {new Date(selectedRun.run.started_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Steps */}
                <div className="flex flex-col gap-3">
                  {selectedRun.steps.map((step, index) => {
                    const isExpanded = expandedSteps.has(step.id);
                    const isLastStep = index === selectedRun.steps.length - 1;
                    const isActiveStep =
                      isLastStep && selectedRun.run.isInProgress;
                    const input = parseJson(step.input);
                    const output = parseJson(step.output);
                    const usage = parseJson(step.usage);

                    // Get tool results from next step's input
                    const nextStep = selectedRun.steps[index + 1];
                    const nextInput = nextStep
                      ? parseJson(nextStep.input)
                      : null;
                    const toolResults =
                      nextInput?.prompt
                        ?.filter((msg: any) => msg.role === 'tool')
                        ?.flatMap((msg: any) => msg.content) ?? [];

                    const summary = getStepSummary(output, step.error);
                    const isFirstStep = index === 0;
                    const inputSummary = getStepInputSummary(
                      input,
                      isFirstStep,
                    );

                    return (
                      <Collapsible
                        key={step.id}
                        open={isExpanded}
                        onOpenChange={() => toggleStep(step.id)}
                      >
                        <Card
                          className={`overflow-hidden py-0 gap-0 ${isActiveStep ? 'ring-2 ring-blue-500/50 ring-offset-1 ring-offset-background' : ''}`}
                        >
                          {/* Step Header */}
                          <CollapsibleTrigger asChild>
                            <button
                              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
                                isExpanded ? 'border-b border-border' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground font-mono w-4">
                                  {step.step_number}
                                </span>
                                <div className="flex items-center gap-2">
                                  {/* Input side */}
                                  {inputSummary && (
                                    <>
                                      {inputSummary.type === 'user' ? (
                                        <MessageSquare className="size-3.5 text-muted-foreground" />
                                      ) : (
                                        <Wrench className="size-3.5 text-muted-foreground" />
                                      )}
                                      {inputSummary.fullText ||
                                      inputSummary.toolDetails ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span
                                              className={`text-sm text-muted-foreground ${inputSummary.type === 'tool' ? 'font-mono' : ''}`}
                                            >
                                              {inputSummary.label}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="bottom"
                                            className="max-w-sm max-h-40 overflow-hidden"
                                          >
                                            <span className="line-clamp-6">
                                              {inputSummary.fullText ||
                                                inputSummary.toolDetails}
                                            </span>
                                          </TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        <span
                                          className={`text-sm text-muted-foreground ${inputSummary.type === 'tool' ? 'font-mono' : ''}`}
                                        >
                                          {inputSummary.label}
                                        </span>
                                      )}
                                      <span className="text-muted-foreground/50 mx-1">
                                        →
                                      </span>
                                    </>
                                  )}

                                  {/* Output side */}
                                  {summary.icon === 'wrench' && (
                                    <Wrench className="size-3.5 text-muted-foreground" />
                                  )}
                                  {summary.icon === 'message' && (
                                    <MessageSquare className="size-3.5 text-muted-foreground" />
                                  )}
                                  {summary.icon === 'alert' && (
                                    <AlertCircle className="size-3.5 text-destructive" />
                                  )}

                                  {summary.toolDetails ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-sm font-medium font-mono">
                                          {summary.label}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {summary.toolDetails}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span
                                      className={`text-sm font-medium ${
                                        summary.icon === 'wrench'
                                          ? 'font-mono'
                                          : ''
                                      }`}
                                    >
                                      {summary.label}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                {isActiveStep ? (
                                  <span className="text-[11px] text-blue-400 font-medium flex items-center gap-1.5">
                                    <Loader2 className="size-3 animate-spin" />
                                    streaming
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground font-mono">
                                    {formatDuration(step.duration_ms)}
                                  </span>
                                )}
                                {usage && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-[11px] font-mono text-muted-foreground cursor-help">
                                        {formatInputTokens(
                                          getInputTokenBreakdown(
                                            usage.inputTokens,
                                          ),
                                        )}{' '}
                                        <span className="text-muted-foreground/50">
                                          →
                                        </span>{' '}
                                        {formatOutputTokens(
                                          getOutputTokenBreakdown(
                                            usage.outputTokens,
                                          ),
                                        )}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <TokenBreakdownTooltip
                                        input={getInputTokenBreakdown(
                                          usage.inputTokens,
                                        )}
                                        output={getOutputTokenBreakdown(
                                          usage.outputTokens,
                                        )}
                                        raw={usage.raw}
                                      />
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                <ChevronDown
                                  className={`size-4 text-muted-foreground transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </div>
                            </button>
                          </CollapsibleTrigger>

                          {/* Step Content */}
                          <CollapsibleContent>
                            {/* Config Bar */}
                            <StepConfigBar
                              modelId={step.model_id}
                              provider={step.provider}
                              input={input}
                              providerOptions={parseJson(step.provider_options)}
                              usage={usage}
                            />

                            {/* Two Panel Layout */}
                            <div className="grid grid-cols-2 divide-x divide-border">
                              {/* INPUT Panel */}
                              <div className="bg-card/50">
                                <InputPanel input={input} />
                              </div>

                              {/* OUTPUT Panel */}
                              <div className="p-4 bg-background min-h-full">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                  Output
                                </h3>

                                {step.error ? (
                                  <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive-foreground font-mono">
                                    {step.error}
                                  </div>
                                ) : output ? (
                                  <OutputDisplay
                                    output={output}
                                    toolResults={toolResults}
                                  />
                                ) : isActiveStep ? (
                                  <div className="flex items-center gap-2 text-sm text-blue-400">
                                    <Loader2 className="size-4 animate-spin" />
                                    <span>Waiting for response...</span>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    No output
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Raw Data Toggle */}
                            <RawDataSection
                              rawRequest={step.raw_request}
                              rawResponse={step.raw_response}
                              rawChunks={step.raw_chunks}
                              isStream={step.type === 'stream'}
                            />
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
                </div>
              </div>
            )}
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}

function StepConfigBar({
  modelId,
  provider,
  input,
  providerOptions,
  usage,
}: {
  modelId?: string;
  provider?: string | null;
  input: any;
  providerOptions?: any;
  usage?: any;
}) {
  const toolCount = input?.tools?.length ?? 0;

  // Collect parameters
  const params: { label: string; value: string }[] = [];
  if (input?.temperature != null)
    params.push({ label: 'temp', value: String(input.temperature) });
  if (input?.maxOutputTokens != null)
    params.push({ label: 'max tokens', value: String(input.maxOutputTokens) });
  if (input?.topP != null)
    params.push({ label: 'topP', value: String(input.topP) });
  if (input?.topK != null)
    params.push({ label: 'topK', value: String(input.topK) });
  if (input?.toolChoice != null) {
    const choice =
      typeof input.toolChoice === 'string'
        ? input.toolChoice
        : input.toolChoice.type;
    params.push({ label: 'tool choice', value: choice });
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border text-[11px] text-muted-foreground">
      {provider && (
        <span className="px-1.5 py-0.5 rounded bg-sidebar-primary/10 text-sidebar-primary text-[10px] font-medium">
          {provider}
        </span>
      )}
      <span className="font-mono">{modelId}</span>

      {params.length > 0 && (
        <>
          <span className="text-muted-foreground/30">·</span>
          {params.map((p, i) => (
            <span key={i}>
              {p.label}: <span className="text-foreground">{p.value}</span>
              {i < params.length - 1 && (
                <span className="text-muted-foreground/30 mx-1">·</span>
              )}
            </span>
          ))}
        </>
      )}

      {toolCount > 0 && (
        <>
          <span className="text-muted-foreground/30">·</span>
          <Drawer direction="right">
            <DrawerTrigger asChild>
              <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                <Wrench className="size-3" />
                {toolCount} available {toolCount === 1 ? 'tool' : 'tools'}
              </button>
            </DrawerTrigger>
            <DrawerContent className="h-full w-[800px] sm:max-w-[800px] overflow-hidden">
              <DrawerHeader className="border-b border-border shrink-0">
                <DrawerTitle>Available Tools ({toolCount})</DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  {input?.tools?.map((tool: any, i: number) => (
                    <ToolItem key={i} tool={tool} />
                  ))}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

      {providerOptions && Object.keys(providerOptions).length > 0 && (
        <>
          <span className="text-muted-foreground/30">·</span>
          <Drawer direction="right">
            <DrawerTrigger asChild>
              <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                <Settings className="size-3" />
                Provider options
              </button>
            </DrawerTrigger>
            <DrawerContent className="h-full w-[800px] sm:max-w-[800px] overflow-hidden">
              <DrawerHeader className="border-b border-border shrink-0">
                <DrawerTitle>Provider Options</DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto p-4">
                <JsonBlock data={providerOptions} size="lg" />
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

      {usage && (
        <>
          <span className="text-muted-foreground/30">·</span>
          <Drawer direction="right">
            <DrawerTrigger asChild>
              <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                <BarChart3 className="size-3" />
                Usage
              </button>
            </DrawerTrigger>
            <DrawerContent className="h-full w-[800px] sm:max-w-[800px] overflow-hidden">
              <DrawerHeader className="border-b border-border shrink-0">
                <DrawerTitle>Token Usage</DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto p-4">
                <UsageDetails usage={usage} />
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  );
}

function InputPanel({ input }: { input: any }) {
  const messages = input?.prompt ?? [];
  const messageCount = messages.length;

  // Get last two messages to display
  const lastTwoMessages = messages.slice(-2);
  const previousMessageCount = Math.max(0, messageCount - 2);

  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <button className="w-full h-full text-left p-4 hover:bg-accent/30 transition-colors cursor-pointer flex flex-col justify-start">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Input
          </h3>

          <div className="space-y-3">
            {/* Previous messages indicator */}
            {previousMessageCount > 0 && (
              <div className="text-[11px] text-muted-foreground/60 text-center py-1.5 rounded-md bg-muted/30">
                + {previousMessageCount} previous{' '}
                {previousMessageCount === 1 ? 'message' : 'messages'}
              </div>
            )}

            {/* Last two messages displayed inline */}
            {lastTwoMessages.map((msg: any, i: number) => (
              <InputMessagePreview
                key={i}
                message={msg}
                index={previousMessageCount + i + 1}
              />
            ))}

            {/* Empty state */}
            {messageCount === 0 && (
              <p className="text-sm text-muted-foreground">No messages</p>
            )}
          </div>
        </button>
      </DrawerTrigger>
      <DrawerContent className="h-full w-[800px] sm:max-w-[800px] overflow-hidden">
        <DrawerHeader className="border-b border-border shrink-0">
          <DrawerTitle>All Messages ({messageCount})</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {messages.map((msg: any, i: number) => (
              <MessageBubble key={i} message={msg} index={i + 1} />
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function InputMessagePreview({
  message,
  index,
}: {
  message: any;
  index?: number;
}) {
  const role = message.role;
  const content = message.content;

  const roleLabels: Record<string, string> = {
    user: 'User',
    assistant: 'Assistant',
    system: 'System',
    tool: 'Tool',
  };

  // Get text content
  const getTextContent = (content: any): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('');
    }
    return '';
  };

  // Get tool calls from assistant message
  const getToolCalls = (content: any): any[] => {
    if (Array.isArray(content)) {
      return content.filter(p => p.type === 'tool-call');
    }
    return [];
  };

  // Get tool results from tool message
  const getToolResults = (content: any): any[] => {
    if (Array.isArray(content)) {
      return content.filter(p => p.type === 'tool-result');
    }
    return [];
  };

  // Get reasoning/thinking content
  const getReasoningContent = (content: any): string => {
    if (Array.isArray(content)) {
      return content
        .filter(p => p.type === 'thinking' || p.type === 'reasoning')
        .map(p => p.thinking || p.text || p.reasoning)
        .join('');
    }
    return '';
  };

  const textContent = getTextContent(content);
  const toolCalls = getToolCalls(content);
  const toolResults = getToolResults(content);
  const reasoningContent = getReasoningContent(content);

  // Count total parts
  const partCount =
    (textContent ? 1 : 0) +
    (reasoningContent ? 1 : 0) +
    toolCalls.length +
    toolResults.length;

  return (
    <div className="rounded-md border border-border/50 bg-background/50 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        {index && (
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {index}
          </span>
        )}
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {roleLabels[role] || role}
        </span>
        {partCount > 1 && (
          <span className="text-[10px] text-muted-foreground/60">
            {partCount} parts
          </span>
        )}
      </div>

      {/* Reasoning/Thinking content */}
      {reasoningContent && (
        <div className="text-xs text-amber-500/60">[thinking]</div>
      )}

      {/* Text content */}
      {textContent && (
        <div className="text-xs text-foreground/90 line-clamp-3">
          {textContent}
        </div>
      )}

      {/* Tool calls (from assistant) */}
      {toolCalls.length > 0 && (
        <div className="space-y-1">
          {toolCalls.slice(0, 3).map((call: any, i: number) => {
            const args = call.args ?? call.input;
            const parsedArgs =
              typeof args === 'string' ? safeParseJson(args) : args;
            return (
              <div
                key={i}
                className="text-[11px] font-mono text-muted-foreground truncate"
              >
                {call.toolName}({formatToolParamsInline(parsedArgs)})
              </div>
            );
          })}
          {toolCalls.length > 3 && (
            <div className="text-[11px] text-muted-foreground/60">
              +{toolCalls.length - 3} more tool{' '}
              {toolCalls.length - 3 === 1 ? 'call' : 'calls'}
            </div>
          )}
        </div>
      )}

      {/* Tool results */}
      {toolResults.length > 0 && (
        <div className="space-y-1">
          {toolResults.slice(0, 3).map((result: any, i: number) => {
            const resultContent = result.result ?? result.output ?? result;
            const resultPreview = formatResultPreview(resultContent);
            return (
              <div
                key={i}
                className="text-[11px] font-mono text-muted-foreground truncate"
              >
                {result.toolName || 'tool'}(…) =&gt; {resultPreview}
              </div>
            );
          })}
          {toolResults.length > 3 && (
            <div className="text-[11px] text-muted-foreground/60">
              +{toolResults.length - 3} more tool{' '}
              {toolResults.length - 3 === 1 ? 'result' : 'results'}
            </div>
          )}
        </div>
      )}

      {/* Empty content fallback */}
      {!textContent &&
        !reasoningContent &&
        toolCalls.length === 0 &&
        toolResults.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic">
            Empty message
          </div>
        )}
    </div>
  );
}

function ToolItem({ tool }: { tool: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border bg-background overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-2.5 hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-sm font-mono text-purple">{tool.name}</span>
        {tool.parameters && (
          <ChevronRight
            className={`size-3 text-muted-foreground transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        )}
      </button>
      {expanded && tool.parameters && (
        <div className="px-2.5 pb-2.5 border-t border-border">
          {tool.description && (
            <p className="text-xs text-muted-foreground mb-2 pt-2">
              {tool.description}
            </p>
          )}
          <JsonBlock data={tool.parameters} compact />
        </div>
      )}
      {!expanded && tool.description && (
        <div className="px-2.5 pb-2 -mt-1">
          <p className="text-[11px] text-muted-foreground truncate">
            {tool.description}
          </p>
        </div>
      )}
    </div>
  );
}

function CollapsibleToolCall({
  toolName,
  toolCallId,
  data,
}: {
  toolName: string;
  toolCallId?: string;
  data: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const parsedData = typeof data === 'string' ? safeParseJson(data) : data;

  return (
    <div className="rounded-md border border-purple/30 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-purple/10 hover:bg-purple/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`size-3 text-purple transition-transform shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <Wrench className="size-3 text-purple shrink-0" />
        <span className="text-xs font-mono font-medium text-purple">
          {toolName}
        </span>
        {!expanded && parsedData && (
          <span className="text-[11px] font-mono text-purple/70 truncate">
            {formatToolParams(parsedData)}
          </span>
        )}
        {toolCallId && (
          <span className="text-[10px] font-mono text-muted-foreground/60 ml-auto shrink-0">
            {toolCallId}
          </span>
        )}
      </button>
      {expanded && (
        <div className="p-3 bg-card/50 border-t border-purple/30">
          <JsonBlock data={parsedData} />
        </div>
      )}
    </div>
  );
}

function CollapsibleToolResult({
  toolName,
  toolCallId,
  data,
}: {
  toolName?: string;
  toolCallId?: string;
  data: any;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-success/30 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-success/10 hover:bg-success/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`size-3 text-success transition-transform shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <span className="text-xs font-medium text-success">Result</span>
        {toolName && (
          <span className="text-[11px] font-mono text-muted-foreground">
            {toolName}
          </span>
        )}
        {toolCallId && (
          <span className="text-[10px] font-mono text-muted-foreground/60 ml-auto shrink-0">
            {toolCallId}
          </span>
        )}
      </button>
      {expanded && (
        <div className="p-3 bg-card/50 border-t border-success/30">
          <JsonBlock data={data} />
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, index }: { message: any; index?: number }) {
  const role = message.role;
  const content = message.content;

  const roleLabels: Record<string, string> = {
    user: 'User',
    assistant: 'Assistant',
    system: 'System',
    tool: 'Tool',
  };

  const getTextContent = (content: any): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('');
    }
    return '';
  };

  const getToolCalls = (content: any): any[] => {
    if (Array.isArray(content)) {
      return content.filter(p => p.type === 'tool-call');
    }
    return [];
  };

  const getToolResults = (content: any): any[] => {
    if (Array.isArray(content)) {
      return content.filter(p => p.type === 'tool-result');
    }
    return [];
  };

  const getReasoningContent = (content: any): string => {
    if (Array.isArray(content)) {
      return content
        .filter(p => p.type === 'thinking' || p.type === 'reasoning')
        .map(p => p.thinking || p.text || p.reasoning)
        .join('');
    }
    return '';
  };

  const textContent = getTextContent(content);
  const toolCalls = getToolCalls(content);
  const toolResults = getToolResults(content);
  const reasoningContent = getReasoningContent(content);

  // Count total parts
  const partCount =
    (textContent ? 1 : 0) +
    (reasoningContent ? 1 : 0) +
    toolCalls.length +
    toolResults.length;

  return (
    <div className="rounded-md border border-border/50 bg-background/50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {index && (
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {index}
          </span>
        )}
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {roleLabels[role] || role}
        </span>
        {partCount > 1 && (
          <span className="text-[10px] text-muted-foreground/60">
            {partCount} parts
          </span>
        )}
      </div>

      {/* Reasoning/Thinking content - full display */}
      {reasoningContent && <ReasoningBlock content={reasoningContent} />}

      {/* Full text content */}
      {textContent && (
        <TextBlock
          content={textContent}
          defaultExpanded={
            !reasoningContent &&
            toolCalls.length === 0 &&
            toolResults.length === 0
          }
          isSystem={role === 'system'}
        />
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <div className="space-y-2">
          {toolCalls.map((call: any, i: number) => (
            <CollapsibleToolCall
              key={i}
              toolName={call.toolName}
              toolCallId={call.toolCallId}
              data={call.args ?? call.input}
            />
          ))}
        </div>
      )}

      {/* Tool results */}
      {toolResults.length > 0 && (
        <div className="space-y-2">
          {toolResults.map((result: any, i: number) => (
            <CollapsibleToolResult
              key={i}
              toolName={result.toolName}
              toolCallId={result.toolCallId}
              data={result.result ?? result.output ?? result}
            />
          ))}
        </div>
      )}

      {/* Empty content fallback */}
      {!textContent &&
        !reasoningContent &&
        toolCalls.length === 0 &&
        toolResults.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic">
            Empty message
          </div>
        )}
    </div>
  );
}

function OutputDisplay({
  output,
  toolResults = [],
}: {
  output: any;
  toolResults?: any[];
}) {
  const getToolResult = (toolCallId: string) => {
    return toolResults.find((r: any) => r.toolCallId === toolCallId);
  };

  const toolCalls =
    output?.toolCalls ||
    output?.content?.filter((p: any) => p.type === 'tool-call') ||
    [];

  const textParts =
    output?.textParts ||
    output?.content?.filter((p: any) => p.type === 'text') ||
    [];

  // Get reasoning/thinking parts
  const reasoningParts =
    output?.reasoningParts ||
    output?.content?.filter(
      (p: any) => p.type === 'thinking' || p.type === 'reasoning',
    ) ||
    [];

  const textContent = textParts.map((p: any) => p.text).join('');
  const reasoningContent = reasoningParts.map((p: any) => p.text).join('');

  // Check if text is the only content
  const isTextOnly = textContent && !reasoningContent && toolCalls.length === 0;

  return (
    <div className="space-y-3">
      {/* Reasoning/Thinking */}
      {reasoningContent && <ReasoningBlock content={reasoningContent} />}

      {/* Text Response */}
      {textContent && (
        <TextBlock content={textContent} defaultExpanded={isTextOnly} />
      )}

      {/* Tool Calls with Results */}
      {toolCalls.map((call: any, i: number) => {
        const result = getToolResult(call.toolCallId);
        return (
          <ToolCallCard
            key={i}
            toolName={call.toolName}
            args={call.args ?? call.input}
            result={result?.output ?? result?.result}
          />
        );
      })}
    </div>
  );
}

function ToolCallCard({
  toolName,
  args,
  result,
}: {
  toolName: string;
  args: any;
  result?: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const parsedArgs = typeof args === 'string' ? safeParseJson(args) : args;
  const parsedResult =
    typeof result === 'string' ? safeParseJson(result) : result;

  return (
    <div className="rounded-md border border-purple/30 overflow-hidden">
      {/* Tool Call Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-purple/10 hover:bg-purple/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`size-3 text-purple transition-transform shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <Wrench className="size-3 text-purple shrink-0" />
        <span className="text-xs font-mono font-medium text-purple">
          {toolName}
        </span>
        {!expanded && parsedArgs && (
          <span className="text-[11px] font-mono text-purple/70 truncate">
            {formatToolParams(parsedArgs)}
          </span>
        )}
      </button>

      {expanded && (
        <>
          {/* Arguments */}
          <div className="p-3 bg-card/50 border-t border-purple/30">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Input
            </div>
            <JsonBlock data={parsedArgs} />
          </div>

          {/* Result */}
          {parsedResult && (
            <div className="p-3 border-t border-border bg-success/5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-success mb-2">
                Output
              </div>
              <JsonBlock data={parsedResult} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReasoningBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  // Truncate preview to first 200 characters
  const previewContent =
    content.length > 200 ? content.slice(0, 200) + '…' : content;

  return (
    <div className="rounded-md border border-amber-500/30 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`size-3 text-amber-500 transition-transform shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <Brain className="size-3 text-amber-500 shrink-0" />
        <span className="text-xs font-medium text-amber-500">Thinking</span>
        {!expanded && (
          <span className="text-[11px] text-amber-500/70 truncate ml-1">
            {previewContent}
          </span>
        )}
      </button>

      {expanded && (
        <div className="p-3 bg-card/50 border-t border-amber-500/30">
          <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}

function TextBlock({
  content,
  defaultExpanded = false,
  isSystem = false,
}: {
  content: string;
  defaultExpanded?: boolean;
  isSystem?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Truncate preview to first 200 characters
  const previewContent =
    content.length > 200 ? content.slice(0, 200) + '…' : content;

  const borderColor = isSystem ? 'border-blue-500/30' : 'border-border';
  const bgColor = isSystem ? 'bg-blue-500/10' : 'bg-muted/30';
  const hoverBgColor = isSystem ? 'hover:bg-blue-500/20' : 'hover:bg-muted/50';
  const iconColor = isSystem ? 'text-blue-400' : 'text-muted-foreground';
  const labelColor = isSystem ? 'text-blue-400' : 'text-foreground';

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-md border ${borderColor} overflow-hidden`}>
      <button
        className={`w-full flex items-center gap-2 px-3 py-2 ${bgColor} ${hoverBgColor} transition-colors`}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`size-3 ${iconColor} transition-transform shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <MessageSquare className={`size-3 ${iconColor} shrink-0`} />
        <span className={`text-xs font-medium ${labelColor}`}>Text</span>
        {!expanded && (
          <span
            className={`text-[11px] ${isSystem ? 'text-blue-400/70' : 'text-muted-foreground'} truncate ml-1`}
          >
            {previewContent}
          </span>
        )}
      </button>

      {expanded && (
        <div
          className={`p-3 bg-card/50 border-t ${borderColor} group relative`}
        >
          <button
            onClick={handleCopy}
            className="absolute top-1.5 right-1.5 p-1.5 rounded-md border border-border bg-background opacity-0 group-hover:opacity-100 transition-opacity z-10"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="size-3 text-success" />
            ) : (
              <Copy className="size-3 text-muted-foreground" />
            )}
          </button>
          <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}

function JsonBlock({
  data,
  compact = false,
  size = 'sm',
}: {
  data: any;
  compact?: boolean;
  size?: 'sm' | 'base' | 'lg';
}) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);
  const displayString =
    compact && jsonString.length > 200 ? JSON.stringify(data) : jsonString;

  const sizeClasses = {
    sm: 'text-xs',
    base: 'text-sm',
    lg: 'text-base',
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1.5 rounded-md border border-border bg-background opacity-0 group-hover:opacity-100 transition-opacity z-10"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="size-3 text-success" />
        ) : (
          <Copy className="size-3 text-muted-foreground" />
        )}
      </button>
      <pre
        className={`font-mono ${sizeClasses[size]} text-muted-foreground whitespace-pre-wrap wrap-break-words bg-background rounded p-2 ${
          compact ? 'max-h-20 overflow-hidden' : ''
        }`}
      >
        {displayString}
      </pre>
    </div>
  );
}

function RawDataSection({
  rawRequest,
  rawResponse,
  rawChunks,
  isStream,
}: {
  rawRequest: string | null;
  rawResponse: string | null;
  rawChunks: string | null;
  isStream: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [responseView, setResponseView] = useState<'parsed' | 'raw'>('parsed');

  if (!rawRequest && !rawResponse) return null;

  const hasRawChunks = isStream && rawChunks;

  return (
    <div className="border-t border-border">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="font-medium uppercase tracking-wider">
          Request / Response
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-4">
          {rawRequest && (
            <div className="flex flex-col">
              <div className="h-7 flex items-end mb-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Request
                </span>
              </div>
              <div className="max-h-[400px] overflow-auto rounded-md border border-border">
                <JsonBlock data={safeParseJson(rawRequest)} />
              </div>
            </div>
          )}
          {(rawResponse || rawChunks) && (
            <div className="flex flex-col">
              <div className="h-7 flex items-end justify-between mb-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {isStream ? 'Stream' : 'Response'}
                </span>
                {hasRawChunks && (
                  <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                    <button
                      onClick={() => setResponseView('parsed')}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                        responseView === 'parsed'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      AI SDK
                    </button>
                    <button
                      onClick={() => setResponseView('raw')}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                        responseView === 'raw'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Provider
                    </button>
                  </div>
                )}
              </div>
              <div className="max-h-[400px] overflow-auto rounded-md border border-border">
                <JsonBlock
                  data={safeParseJson(
                    hasRawChunks && responseView === 'raw'
                      ? rawChunks
                      : rawResponse,
                  )}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UsageDetails({ usage }: { usage: any }) {
  const inputBreakdown = getInputTokenBreakdown(usage?.inputTokens);
  const outputBreakdown = getOutputTokenBreakdown(usage?.outputTokens);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Input Tokens
          </div>
          <div className="text-2xl font-semibold">{inputBreakdown.total}</div>
          {(inputBreakdown.cacheRead !== undefined ||
            inputBreakdown.cacheWrite !== undefined) && (
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              {inputBreakdown.cacheRead !== undefined && (
                <div className="flex justify-between">
                  <span>Cache read</span>
                  <span className="font-mono">{inputBreakdown.cacheRead}</span>
                </div>
              )}
              {inputBreakdown.cacheWrite !== undefined && (
                <div className="flex justify-between">
                  <span>Cache write</span>
                  <span className="font-mono">{inputBreakdown.cacheWrite}</span>
                </div>
              )}
              {inputBreakdown.noCache !== undefined && (
                <div className="flex justify-between">
                  <span>No cache</span>
                  <span className="font-mono">{inputBreakdown.noCache}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Output Tokens
          </div>
          <div className="text-2xl font-semibold">{outputBreakdown.total}</div>
          {(outputBreakdown.text !== undefined ||
            outputBreakdown.reasoning !== undefined) && (
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              {outputBreakdown.text !== undefined && (
                <div className="flex justify-between">
                  <span>Text</span>
                  <span className="font-mono">{outputBreakdown.text}</span>
                </div>
              )}
              {outputBreakdown.reasoning !== undefined && (
                <div className="flex justify-between">
                  <span>Reasoning</span>
                  <span className="font-mono">{outputBreakdown.reasoning}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Raw Usage Data */}
      {usage?.raw && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Raw Provider Usage
          </div>
          <JsonBlock data={usage.raw} size="sm" />
        </div>
      )}

      {/* Full Usage Object */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Full Usage Object
        </div>
        <JsonBlock data={usage} size="sm" />
      </div>
    </div>
  );
}

function TokenBreakdownTooltip({
  input,
  output,
  raw,
}: {
  input: InputTokenBreakdown;
  output: OutputTokenBreakdown;
  raw?: unknown;
}) {
  // Check if we have any breakdown metadata (even if values are 0)
  const hasInputBreakdown =
    input.noCache !== undefined ||
    input.cacheRead !== undefined ||
    input.cacheWrite !== undefined;
  const hasOutputBreakdown =
    output.text !== undefined || output.reasoning !== undefined;
  const hasBreakdown = hasInputBreakdown || hasOutputBreakdown;

  if (!hasBreakdown) {
    return (
      <div className="text-xs">
        <div>Input: {input.total}</div>
        <div>Output: {output.total}</div>
      </div>
    );
  }

  return (
    <div className="text-xs space-y-2">
      <div>
        <div className="font-medium mb-1">Input: {input.total}</div>
        {input.cacheRead !== undefined && (
          <div className="text-muted-foreground ml-2">
            Cache read: {input.cacheRead}
          </div>
        )}
        {input.cacheWrite !== undefined && (
          <div className="text-muted-foreground ml-2">
            Cache write: {input.cacheWrite}
          </div>
        )}
      </div>
      <div>
        <div className="font-medium mb-1">Output: {output.total}</div>
        {output.text !== undefined && (
          <div className="text-muted-foreground ml-2">Text: {output.text}</div>
        )}
        {output.reasoning !== undefined && (
          <div className="text-muted-foreground ml-2">
            Reasoning: {output.reasoning}
          </div>
        )}
      </div>
      {raw !== undefined && (
        <div className="pt-1 border-t border-border mt-1">
          <div className="text-muted-foreground/70 font-mono text-[10px] max-w-[200px] truncate">
            Raw: {JSON.stringify(raw)}
          </div>
        </div>
      )}
    </div>
  );
}

function safeParseJson(value: any): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Token usage can be either a number (old format) or an object with breakdown (ai@6.0.0-beta.139+).
 * Old format: inputTokens: 4456
 * New format for input: { total: 4456, noCache: 9, cacheRead: 4100, cacheWrite: 347 }
 * New format for output: { total: 1262, text: 1262, reasoning: 0 }
 */
interface InputTokenBreakdown {
  total: number;
  noCache?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

interface OutputTokenBreakdown {
  total: number;
  text?: number;
  reasoning?: number;
}

function getInputTokenBreakdown(
  tokens: number | InputTokenBreakdown | null | undefined,
): InputTokenBreakdown {
  if (tokens == null) return { total: 0 };
  if (typeof tokens === 'number') return { total: tokens };
  if (typeof tokens === 'object') {
    // Handle case where total might be missing or not a number
    const total =
      'total' in tokens && typeof tokens.total === 'number' ? tokens.total : 0;
    return {
      total,
      // Only include cache fields if they are actual numbers
      ...(typeof tokens.noCache === 'number' && { noCache: tokens.noCache }),
      ...(typeof tokens.cacheRead === 'number' && {
        cacheRead: tokens.cacheRead,
      }),
      ...(typeof tokens.cacheWrite === 'number' && {
        cacheWrite: tokens.cacheWrite,
      }),
    };
  }
  return { total: 0 };
}

function getOutputTokenBreakdown(
  tokens: number | OutputTokenBreakdown | null | undefined,
): OutputTokenBreakdown {
  if (tokens == null) return { total: 0 };
  if (typeof tokens === 'number') return { total: tokens };
  if (typeof tokens === 'object') {
    // Handle case where total might be missing or not a number
    const total =
      'total' in tokens && typeof tokens.total === 'number' ? tokens.total : 0;
    return {
      total,
      // Only include text/reasoning if they are actual numbers
      ...(typeof tokens.text === 'number' && { text: tokens.text }),
      ...(typeof tokens.reasoning === 'number' && {
        reasoning: tokens.reasoning,
      }),
    };
  }
  return { total: 0 };
}

/**
 * Formats input token count with cache info in parentheses if available.
 * e.g., "4456" or "4456 (4100 cached)"
 */
function formatInputTokens(breakdown: InputTokenBreakdown): string {
  const { total, cacheRead } = breakdown;
  if (cacheRead && cacheRead > 0) {
    return `${total} (${cacheRead} cached)`;
  }
  return String(total);
}

/**
 * Formats output token count with reasoning info if available.
 * e.g., "1054" or "1054 (500 reasoning)"
 */
function formatOutputTokens(breakdown: OutputTokenBreakdown): string {
  const { total, reasoning } = breakdown;
  if (reasoning && reasoning > 0) {
    return `${total} (${reasoning} reasoning)`;
  }
  return String(total);
}

/**
 * Truncates tool call parameters for preview display.
 */
function formatToolParams(args: any, maxLength = 40): string {
  if (!args || typeof args !== 'object') return '';

  const entries = Object.entries(args);
  if (entries.length === 0) return '';

  const formatValue = (value: any, maxLen = 20): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return `[${value.length}]`;
      }
      return '{…}';
    }
    if (typeof value === 'string') {
      if (value.length > maxLen) {
        return `"${value.slice(0, maxLen)}…"`;
      }
      return `"${value}"`;
    }
    return String(value);
  };

  const firstEntry = entries[0];
  if (!firstEntry) return '';

  const [firstKey, firstValue] = firstEntry;
  const firstFormatted = `${firstKey}: ${formatValue(firstValue)}`;

  if (entries.length === 1) {
    return `{ ${firstFormatted} }`;
  }

  return `{ ${firstFormatted}, … }`;
}

/**
 * Formats tool params inline for JS-like syntax: { key: "value", … }
 */
function formatToolParamsInline(args: any): string {
  if (!args || typeof args !== 'object') return '';

  const entries = Object.entries(args);
  if (entries.length === 0) return '';

  const formatValue = (value: any, maxLen = 20): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return `[${value.length}]`;
      }
      return '{…}';
    }
    if (typeof value === 'string') {
      if (value.length > maxLen) {
        return `"${value.slice(0, maxLen)}…"`;
      }
      return `"${value}"`;
    }
    return String(value);
  };

  const firstEntry = entries[0];
  if (!firstEntry) return '';

  const [firstKey, firstValue] = firstEntry;
  const firstFormatted = `${firstKey}: ${formatValue(firstValue)}`;

  if (entries.length === 1) {
    return `{ ${firstFormatted} }`;
  }

  return `{ ${firstFormatted}, … }`;
}

/**
 * Formats tool result for preview display in JS-like syntax
 */
function formatResultPreview(result: any): string {
  if (result === null) return 'null';
  if (result === undefined) return 'undefined';

  if (typeof result === 'string') {
    if (result.length > 30) {
      return `"${result.slice(0, 30)}…"`;
    }
    return `"${result}"`;
  }

  if (Array.isArray(result)) {
    return `[${result.length}]`;
  }

  if (typeof result === 'object') {
    const entries = Object.entries(result);
    if (entries.length === 0) return '{}';

    const firstEntry = entries[0];
    if (!firstEntry) return '{…}';

    const [firstKey, firstValue] = firstEntry;
    let valueStr: string;
    if (typeof firstValue === 'string' && firstValue.length > 15) {
      valueStr = `"${firstValue.slice(0, 15)}…"`;
    } else if (typeof firstValue === 'string') {
      valueStr = `"${firstValue}"`;
    } else if (typeof firstValue === 'object') {
      valueStr = Array.isArray(firstValue) ? `[${firstValue.length}]` : '{…}';
    } else {
      valueStr = String(firstValue);
    }

    if (entries.length === 1) {
      return `{ ${firstKey}: ${valueStr} }`;
    }
    return `{ ${firstKey}: ${valueStr}, … }`;
  }

  return String(result);
}

export default App;
