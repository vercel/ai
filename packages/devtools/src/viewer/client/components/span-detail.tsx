import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ChevronRight,
  Wrench,
  MessageSquare,
  Brain,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Span, SpanType } from '@/lib/trace-builder';

const TYPE_LABELS: Record<SpanType, string> = {
  run: 'Run',
  step: 'Step',
  'tool-call': 'Tool Call',
  reasoning: 'Thinking',
  text: 'Text',
};

const TYPE_COLORS: Record<SpanType, { badge: string; icon: string }> = {
  run: {
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: 'text-blue-400',
  },
  step: {
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: 'text-blue-400',
  },
  'tool-call': {
    badge: 'bg-purple/15 text-purple border-purple/30',
    icon: 'text-purple',
  },
  reasoning: {
    badge: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    icon: 'text-amber-500',
  },
  text: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: 'text-emerald-400',
  },
};

const TYPE_ICONS: Record<SpanType, React.ReactNode> = {
  run: <Layers className="size-4" />,
  step: <Sparkles className="size-4" />,
  'tool-call': <Wrench className="size-4" />,
  reasoning: <Brain className="size-4" />,
  text: <MessageSquare className="size-4" />,
};

function formatDuration(ms: number): string {
  if (ms < 1) return '0.00s';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

interface SpanDetailProps {
  span: Span;
  onClose: () => void;
}

export function SpanDetail({ span, onClose }: SpanDetailProps) {
  const colors = TYPE_COLORS[span.type];

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={colors.icon}>{TYPE_ICONS[span.type]}</span>
          <span className="text-sm font-medium text-foreground truncate">
            {span.label}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] h-5 shrink-0 ${colors.badge}`}
          >
            {TYPE_LABELS[span.type]}
          </Badge>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-accent transition-colors shrink-0 ml-2"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Timing bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/20 text-[11px] text-muted-foreground shrink-0">
        <span>
          Duration:{' '}
          <span className="text-foreground font-mono">
            {formatDuration(span.durationMs)}
          </span>
        </span>
        {span.metadata.usage != null && (
          <TokenSummary usage={span.metadata.usage} />
        )}
        {span.metadata.modelId && (
          <span>
            Model:{' '}
            <span className="text-foreground font-mono">
              {span.metadata.modelId}
            </span>
          </span>
        )}
        {span.metadata.provider && (
          <span className="px-1.5 py-0.5 rounded bg-sidebar-primary/10 text-sidebar-primary text-[10px] font-medium">
            {span.metadata.provider}
          </span>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {span.type === 'run' && <RunDetail span={span} />}
          {span.type === 'step' && <StepDetail span={span} />}
          {span.type === 'tool-call' && <ToolCallDetail span={span} />}
          {span.type === 'reasoning' && <ContentDetail span={span} />}
          {span.type === 'text' && <ContentDetail span={span} />}
        </div>
      </ScrollArea>
    </div>
  );
}

function RunDetail({ span }: { span: Span }) {
  const usage = span.metadata.usage as Record<string, unknown> | null;

  return (
    <div className="space-y-4">
      <Section title="Overview">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Steps" value={String(span.children.length)} />
          <StatCard label="Duration" value={formatDuration(span.durationMs)} />
          {usage && (
            <>
              <StatCard
                label="Input Tokens"
                value={String(
                  typeof usage.inputTokens === 'number'
                    ? usage.inputTokens
                    : ((usage.inputTokens as Record<string, number>)?.total ??
                        0),
                )}
              />
              <StatCard
                label="Output Tokens"
                value={String(
                  typeof usage.outputTokens === 'number'
                    ? usage.outputTokens
                    : ((usage.outputTokens as Record<string, number>)?.total ??
                        0),
                )}
              />
            </>
          )}
        </div>
      </Section>

      <Section title="Steps">
        <div className="space-y-2">
          {span.children.map(child => (
            <div
              key={child.id}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-xs"
            >
              <span className={TYPE_COLORS[child.type].icon}>
                {TYPE_ICONS[child.type]}
              </span>
              <span className="font-mono truncate">{child.label}</span>
              <span className="ml-auto font-mono text-muted-foreground">
                {formatDuration(child.durationMs)}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function StepDetail({ span }: { span: Span }) {
  const {
    input,
    output,
    usage,
    rawRequest,
    rawResponse,
    rawChunks,
    providerOptions,
  } = span.metadata;

  const parsedInput = input as Record<string, unknown> | null;
  const parsedOutput = output as Record<string, unknown> | null;

  const messages = (parsedInput?.prompt ?? []) as Array<
    Record<string, unknown>
  >;
  const toolCount = (parsedInput?.tools as unknown[])?.length ?? 0;

  const params: { label: string; value: string }[] = [];
  if (parsedInput?.temperature != null)
    params.push({ label: 'temp', value: String(parsedInput.temperature) });
  if (parsedInput?.maxOutputTokens != null)
    params.push({
      label: 'max tokens',
      value: String(parsedInput.maxOutputTokens),
    });
  if (parsedInput?.topP != null)
    params.push({ label: 'topP', value: String(parsedInput.topP) });
  if (parsedInput?.topK != null)
    params.push({ label: 'topK', value: String(parsedInput.topK) });

  return (
    <div className="space-y-4">
      {/* Config */}
      {(params.length > 0 || toolCount > 0) && (
        <Section title="Configuration">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {params.map((p, i) => (
              <span
                key={i}
                className="px-2 py-1 rounded bg-muted/50 text-muted-foreground"
              >
                {p.label}: <span className="text-foreground">{p.value}</span>
              </span>
            ))}
            {toolCount > 0 && (
              <span className="px-2 py-1 rounded bg-muted/50 text-muted-foreground">
                <Wrench className="size-3 inline mr-1" />
                {toolCount} tools
              </span>
            )}
          </div>
        </Section>
      )}

      {/* Input messages */}
      {messages.length > 0 && (
        <Section title={`Input (${messages.length} messages)`}>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {messages.map((msg, i) => (
              <MessagePreview key={i} message={msg} index={i + 1} />
            ))}
          </div>
        </Section>
      )}

      {/* Output */}
      {parsedOutput != null && (
        <Section title="Output">
          <DetailJsonBlock data={parsedOutput} />
        </Section>
      )}

      {/* Usage */}
      {usage != null && (
        <Section title="Usage">
          <DetailJsonBlock data={usage} />
        </Section>
      )}

      {/* Provider options */}
      {providerOptions != null && (
        <CollapsibleSection title="Provider Options">
          <DetailJsonBlock data={providerOptions} />
        </CollapsibleSection>
      )}

      {/* Raw request/response */}
      {(rawRequest != null || rawResponse != null) && (
        <CollapsibleSection title="Request / Response">
          <div className="space-y-3">
            {rawRequest != null && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Request
                </div>
                <div className="max-h-[300px] overflow-auto rounded-md border border-border">
                  <DetailJsonBlock data={rawRequest} />
                </div>
              </div>
            )}
            {rawResponse != null && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Response
                </div>
                <div className="max-h-[300px] overflow-auto rounded-md border border-border">
                  <DetailJsonBlock data={rawResponse} />
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {rawChunks != null && (
        <CollapsibleSection title="Raw Provider Chunks">
          <div className="max-h-[300px] overflow-auto rounded-md border border-border">
            <DetailJsonBlock data={rawChunks} />
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function ToolCallDetail({ span }: { span: Span }) {
  const { args, output, error, success, toolCallId } = span.metadata;
  const parsedArgs = typeof args === 'string' ? safeParseJson(args) : args;
  const parsedOutput =
    typeof output === 'string' ? safeParseJson(output) : output;

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2">
        {success === false ? (
          <Badge variant="destructive" className="text-[10px] h-5">
            Failed
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="text-[10px] h-5 bg-success/15 text-success border-success/30"
          >
            Success
          </Badge>
        )}
        {toolCallId && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {toolCallId}
          </span>
        )}
      </div>

      {/* Input */}
      <Section title="Input">
        {parsedArgs ? (
          <DetailJsonBlock data={parsedArgs} />
        ) : (
          <p className="text-xs text-muted-foreground">No arguments</p>
        )}
      </Section>

      {/* Output */}
      <Section title="Output">
        {error ? (
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive-foreground font-mono">
            {typeof error === 'string' ? error : JSON.stringify(error, null, 2)}
          </div>
        ) : parsedOutput ? (
          <DetailJsonBlock data={parsedOutput} />
        ) : (
          <p className="text-xs text-muted-foreground">No output</p>
        )}
      </Section>
    </div>
  );
}

function ContentDetail({ span }: { span: Span }) {
  const [copied, setCopied] = useState(false);
  const content = (span.metadata.content ?? '') as string;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <Section title="Content">
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
          <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap bg-background rounded-md border border-border p-3 max-h-[500px] overflow-y-auto">
            {content || 'Empty'}
          </div>
        </div>
      </Section>
    </div>
  );
}

/* --- Shared sub-components --- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-medium uppercase tracking-wider">{title}</span>
      </button>
      {open && <div className="p-3 border-t border-border">{children}</div>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}

function TokenSummary({ usage }: { usage: unknown }) {
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
  return (
    <span className="font-mono">
      {inputTotal} <span className="text-muted-foreground/50">→</span>{' '}
      {outputTotal} tokens
    </span>
  );
}

function MessagePreview({
  message,
  index,
}: {
  message: Record<string, unknown>;
  index: number;
}) {
  const role = message.role as string;
  const content = message.content;

  const roleLabels: Record<string, string> = {
    user: 'User',
    assistant: 'Assistant',
    system: 'System',
    tool: 'Tool',
  };

  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((p: Record<string, unknown>) => p.type === 'text')
      .map((p: Record<string, unknown>) => p.text)
      .join('');
  }

  return (
    <div className="rounded-md border border-border/50 bg-background/50 p-2.5 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground/50">
          {index}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {roleLabels[role] || role}
        </span>
      </div>
      {text && (
        <div className="text-xs text-foreground/90 line-clamp-3">{text}</div>
      )}
    </div>
  );
}

function DetailJsonBlock({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);

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
      <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap wrap-break-words bg-background rounded p-2">
        {jsonString}
      </pre>
    </div>
  );
}

function safeParseJson(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
