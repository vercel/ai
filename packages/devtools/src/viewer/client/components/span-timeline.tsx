import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Wrench,
  MessageSquare,
  Brain,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Span, SpanType } from '@/lib/trace-builder';
import { flattenSpans } from '@/lib/trace-builder';

const SPAN_COLORS: Record<
  SpanType,
  { bar: string; bg: string; text: string; border: string }
> = {
  run: {
    bar: 'bg-blue-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  step: {
    bar: 'bg-blue-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  'tool-call': {
    bar: 'bg-purple',
    bg: 'bg-purple/10',
    text: 'text-purple',
    border: 'border-purple/30',
  },
  reasoning: {
    bar: 'bg-amber-500',
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    border: 'border-amber-500/30',
  },
  text: {
    bar: 'bg-emerald-500',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
};

const SPAN_ICONS: Record<SpanType, React.ReactNode> = {
  run: <Layers className="size-3.5" />,
  step: <Sparkles className="size-3.5" />,
  'tool-call': <Wrench className="size-3.5" />,
  reasoning: <Brain className="size-3.5" />,
  text: <MessageSquare className="size-3.5" />,
};

function formatDuration(ms: number): string {
  if (ms < 1) return '0.00s';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(usage: unknown): string | null {
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown>;
  const inp = u.inputTokens;
  const out = u.outputTokens;
  const inputTotal =
    typeof inp === 'number'
      ? inp
      : ((inp as Record<string, number>)?.total ?? 0);
  const outputTotal =
    typeof out === 'number'
      ? out
      : ((out as Record<string, number>)?.total ?? 0);
  if (inputTotal === 0 && outputTotal === 0) return null;
  return `${inputTotal} → ${outputTotal}`;
}

interface SpanTimelineProps {
  root: Span;
  selectedSpanId: string | null;
  onSelectSpan: (span: Span) => void;
}

export function SpanTimeline({
  root,
  selectedSpanId,
  onSelectSpan,
}: SpanTimelineProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const flatRows = useMemo(
    () => flattenSpans(root, collapsedIds),
    [root, collapsedIds],
  );

  const totalDurationMs = root.durationMs || 1;

  const timeMarkers = useMemo(() => {
    const markers: number[] = [];
    const count = 6;
    for (let i = 0; i <= count; i++) {
      markers.push((i / count) * totalDurationMs);
    }
    return markers;
  }, [totalDurationMs]);

  const LABEL_WIDTH = 340;

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-card">
      {/* Time axis header */}
      <div className="flex border-b border-border bg-muted/20 shrink-0">
        <div
          className="shrink-0 px-4 py-2 border-r border-border text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center"
          style={{ width: LABEL_WIDTH }}
        >
          Span
        </div>
        <div className="flex-1 relative py-2 px-2">
          <div className="flex justify-between">
            {timeMarkers.map((ms, i) => (
              <span
                key={i}
                className="text-[10px] font-mono text-muted-foreground/60"
              >
                {formatDuration(ms)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Span rows */}
      <ScrollArea className="flex-1">
        <div className="min-w-0">
          {flatRows.map(({ span, depth }) => {
            const hasChildren = span.children.length > 0;
            const isCollapsed = collapsedIds.has(span.id);
            const isSelected = selectedSpanId === span.id;
            const colors = SPAN_COLORS[span.type];
            const icon = SPAN_ICONS[span.type];

            const leftPct =
              totalDurationMs > 0 ? (span.startMs / totalDurationMs) * 100 : 0;
            const widthPct =
              totalDurationMs > 0
                ? Math.max((span.durationMs / totalDurationMs) * 100, 0.5)
                : 0;

            const tokenStr =
              span.type === 'step' || span.type === 'run'
                ? formatTokens(span.metadata.usage)
                : null;

            return (
              <div
                key={span.id}
                className={`flex border-b border-border/50 cursor-pointer transition-colors group ${
                  isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
                onClick={() => onSelectSpan(span)}
              >
                {/* Label column */}
                <div
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-r border-border min-w-0"
                  style={{
                    width: LABEL_WIDTH,
                    paddingLeft: `${12 + depth * 20}px`,
                  }}
                >
                  {/* Collapse toggle */}
                  {hasChildren ? (
                    <button
                      className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors"
                      onClick={e => toggleCollapse(span.id, e)}
                    >
                      {isCollapsed ? (
                        <ChevronRight className={`size-3 ${colors.text}`} />
                      ) : (
                        <ChevronDown className={`size-3 ${colors.text}`} />
                      )}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}

                  {/* Icon */}
                  <span className={`shrink-0 ${colors.text}`}>{icon}</span>

                  {/* Label */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`text-xs truncate ${
                          span.type === 'step' || span.type === 'tool-call'
                            ? 'font-mono'
                            : ''
                        } ${
                          span.type === 'run'
                            ? 'font-medium text-foreground'
                            : 'text-foreground/90'
                        }`}
                      >
                        {span.label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="text-xs">
                        <div className="font-medium">{span.label}</div>
                        <div className="text-muted-foreground mt-0.5">
                          {formatDuration(span.durationMs)}
                          {tokenStr && ` · ${tokenStr} tokens`}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>

                  {/* Duration + tokens */}
                  <span className="ml-auto shrink-0 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    {formatDuration(span.durationMs)}
                    {tokenStr && (
                      <span className="text-muted-foreground/60">
                        {tokenStr}
                      </span>
                    )}
                  </span>
                </div>

                {/* Bar column */}
                <div className="flex-1 relative flex items-center px-2 min-h-[36px]">
                  {/* Grid lines */}
                  {timeMarkers.slice(1, -1).map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/30"
                      style={{
                        left: `${((i + 1) / (timeMarkers.length - 1)) * 100}%`,
                      }}
                    />
                  ))}

                  {/* Span bar */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`absolute h-5 rounded-sm ${colors.bar} opacity-80 group-hover:opacity-100 transition-opacity`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          minWidth: '4px',
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs font-mono">
                        {formatDuration(span.durationMs)}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
