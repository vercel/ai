'use client';

import { useMemo, useState } from 'react';
import type {
  ApproachResult,
  BenchmarkResponse,
  BenchmarkProgressEvent,
  ToolTrace,
} from '@/lib/types';

const defaultModel = 'openai/gpt-5.4-nano';

export default function Page() {
  const [model, setModel] = useState(defaultModel);
  const [result, setResult] = useState<BenchmarkResponse | undefined>();
  const [partialRuns, setPartialRuns] = useState<ApproachResult[]>([]);
  const [progressEvents, setProgressEvents] = useState<
    BenchmarkProgressEvent[]
  >([]);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);

  async function runBenchmark() {
    setIsRunning(true);
    setError(undefined);
    setResult(undefined);
    setPartialRuns([]);
    setProgressEvents([]);
    setStatus('Starting benchmark...');
    try {
      const response = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId: 'case_1842', model }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Benchmark failed');
      }
      if (response.body == null) {
        throw new Error('Benchmark response did not include a stream.');
      }

      await readProgressStream(response.body, handleProgressEvent);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsRunning(false);
    }
  }

  function handleProgressEvent(event: BenchmarkProgressEvent) {
    setProgressEvents(events => [...events, event]);

    switch (event.type) {
      case 'benchmark-start': {
        setStatus(`Benchmarking ${event.caseId} with ${event.model}`);
        break;
      }
      case 'approach-start': {
        setStatus(`Running ${event.label}...`);
        break;
      }
      case 'step-finish': {
        setStatus(
          `${event.label}: completed step ${event.step.stepNumber + 1} (${event.step.finishReason})`,
        );
        break;
      }
      case 'approach-done': {
        setStatus(`Finished ${event.run.label}`);
        setPartialRuns(runs => [
          ...runs.filter(run => run.id !== event.run.id),
          event.run,
        ]);
        break;
      }
      case 'benchmark-done': {
        setStatus('Benchmark complete');
        setResult(event.result);
        setPartialRuns(event.result.runs);
        break;
      }
      case 'benchmark-error': {
        setStatus('Benchmark failed');
        setError(event.error);
        break;
      }
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AI SDK example</p>
        <h1>Code mode vs direct tools</h1>
        <p className="lede">
          Run the same support-case workflow with normal AI SDK tools and with
          the <code>codeMode</code> tool from <code>ai-sdk-code-mode</code>. The
          server records model steps, tool calls, timings, token usage, and a
          final word diff.
        </p>
        <div className="controls">
          <label>
            Model
            <input
              value={model}
              onChange={event => setModel(event.target.value)}
              placeholder={defaultModel}
            />
          </label>
          <button disabled={isRunning} onClick={runBenchmark}>
            {isRunning ? 'Running benchmark...' : 'Run comparison'}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>

      {isRunning || progressEvents.length > 0 ? (
        <ProgressPanel
          events={progressEvents}
          isRunning={isRunning}
          status={status}
        />
      ) : null}

      {result ? (
        <BenchmarkView result={result} />
      ) : partialRuns.length > 0 ? (
        <PartialBenchmarkView runs={partialRuns} />
      ) : (
        <EmptyState />
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <section className="empty">
      <h2>What this compares</h2>
      <p>
        The direct run exposes every host tool to the model. The code-mode run
        exposes one sandboxed tool that can call the same host tools, use
        <code>Promise.all</code>, and return a compact JSON result for the final
        answer.
      </p>
    </section>
  );
}

function PartialBenchmarkView({ runs }: { runs: ApproachResult[] }) {
  const maxTotalMs = Math.max(...runs.map(run => run.totalMs), 1);

  return (
    <>
      <section className="summary">
        {runs.map(run => (
          <MetricCard key={run.id} run={run} maxTotalMs={maxTotalMs} />
        ))}
        <article className="metricCard pendingCard">
          <div className="cardHeader">
            <h2>Waiting for next run</h2>
            <span>...</span>
          </div>
          <p className="muted">
            Completed results appear here as soon as each implementation
            finishes.
          </p>
        </article>
      </section>
      <InspectionPanel runs={runs} />

      <section className="comparisonGrid">
        {runs.map(run => (
          <RunDetails key={run.id} run={run} />
        ))}
      </section>
    </>
  );
}

function ProgressPanel({
  events,
  isRunning,
  status,
}: {
  events: BenchmarkProgressEvent[];
  isRunning: boolean;
  status: string;
}) {
  const didFail = events.some(event => event.type === 'benchmark-error');

  return (
    <section className="progressPanel">
      <div className="progressHeader">
        {isRunning ? (
          <div className="spinner" />
        ) : (
          <div className={didFail ? 'statusIcon errorIcon' : 'statusIcon'}>
            {didFail ? '!' : '✓'}
          </div>
        )}
        <div>
          <p className="eyebrow">Progress</p>
          <h2>{status}</h2>
        </div>
      </div>
      <ProgressWaterfall events={events} />
    </section>
  );
}

function ProgressWaterfall({ events }: { events: BenchmarkProgressEvent[] }) {
  const rows = buildWaterfallRows(events);
  const maxMs = Math.max(...rows.map(row => row.totalMs), 1);

  return (
    <div className="waterfall">
      <div className="waterfallScale" aria-hidden>
        <span>0ms</span>
        <span>{formatMs(maxMs / 2)}</span>
        <span>{formatMs(maxMs)}</span>
      </div>
      {rows.map(row => (
        <article className="waterfallScenario" key={row.id}>
          <div className="waterfallScenarioHeader">
            <div>
              <strong>{row.label}</strong>
              <span>{row.totalMs > 0 ? formatMs(row.totalMs) : 'waiting'}</span>
            </div>
            <span className={`waterfallStatus ${row.status}`}>
              {row.status}
            </span>
          </div>

          <WaterfallLane
            label="Model"
            maxMs={maxMs}
            segments={row.modelSegments}
          />
          <WaterfallLane
            label="Tools"
            maxMs={maxMs}
            segments={row.toolSegments}
          />
        </article>
      ))}
    </div>
  );
}

function WaterfallLane({
  label,
  maxMs,
  segments,
}: {
  label: string;
  maxMs: number;
  segments: WaterfallSegment[];
}) {
  return (
    <div className="waterfallLane">
      <span className="waterfallLaneLabel">{label}</span>
      <div className="waterfallTrack">
        {segments.length === 0 ? (
          <span className="waterfallEmpty">Waiting for data</span>
        ) : null}
        {segments.map(segment => (
          <span
            className={`waterfallSegment ${segment.kind}`}
            key={segment.id}
            style={{
              left: `${(segment.startMs / maxMs) * 100}%`,
              width: `${Math.max(1.5, (segment.durationMs / maxMs) * 100)}%`,
            }}
            title={`${segment.label}: ${formatMs(segment.durationMs)}`}
          >
            {segment.shortLabel}
          </span>
        ))}
      </div>
    </div>
  );
}

function BenchmarkView({ result }: { result: BenchmarkResponse }) {
  const [direct, codeMode] = result.runs;
  const maxTotalMs = Math.max(direct.totalMs, codeMode.totalMs);

  return (
    <>
      <section className="summary">
        {result.runs.map(run => (
          <MetricCard key={run.id} run={run} maxTotalMs={maxTotalMs} />
        ))}
      </section>
      <InspectionPanel runs={result.runs} />

      <section className="comparisonGrid">
        {result.runs.map(run => (
          <RunDetails key={run.id} run={run} />
        ))}
      </section>
    </>
  );
}

function InspectionPanel({ runs }: { runs: ApproachResult[] }) {
  return (
    <section className="panel inspectionPanel">
      <details>
        <summary>
          <div>
            <p className="eyebrow">Inspect</p>
            <h2>Prompts And Tool Definitions</h2>
          </div>
          <span className="pill">Toggle</span>
        </summary>
        <div className="inspectionRuns">
          {runs.map(run => (
            <article className="inspectionRun" key={run.id}>
              <h3>{run.label}</h3>

              <h4>Prompt Sent To The Model</h4>
              <HighlightedCode
                language="markdown"
                value={run.inspection.prompt}
              />

              <h4>Tool Definitions Sent To The Model</h4>
              <div className="toolDefinitionList">
                {run.inspection.toolDefinitions.map(toolDefinition => (
                  <details key={toolDefinition.name}>
                    <summary>{toolDefinition.name}</summary>
                    <ToolDescription value={toolDefinition.description} />
                    <HighlightedCode
                      language="json"
                      value={JSON.stringify(
                        {
                          inputSchema: toolDefinition.inputSchema,
                          outputSchema: toolDefinition.outputSchema,
                        },
                        null,
                        2,
                      )}
                    />
                  </details>
                ))}
              </div>

              {run.inspection.generatedCode ? (
                <>
                  <h4>Generated Code</h4>
                  <HighlightedCode
                    language="ts"
                    value={run.inspection.generatedCode}
                  />
                </>
              ) : null}
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

function ToolDescription({ value }: { value: string }) {
  if (!value.includes('\n') && !value.includes('`')) {
    return <p className="muted">{value}</p>;
  }

  return <HighlightedCode language="markdown" value={value} />;
}

async function readProgressStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: BenchmarkProgressEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim().length > 0) {
        onEvent(JSON.parse(line) as BenchmarkProgressEvent);
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim().length > 0) {
    onEvent(JSON.parse(buffer) as BenchmarkProgressEvent);
  }
}

type WaterfallSegment = {
  id: string;
  kind: 'model' | 'tool';
  label: string;
  shortLabel: string;
  startMs: number;
  durationMs: number;
};

type WaterfallRow = {
  id: ApproachResult['id'];
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  totalMs: number;
  modelSegments: WaterfallSegment[];
  toolSegments: WaterfallSegment[];
};

function buildWaterfallRows(events: BenchmarkProgressEvent[]): WaterfallRow[] {
  const rows: WaterfallRow[] = [
    createWaterfallRow('direct-tools', 'Direct AI SDK tools'),
    createWaterfallRow('code-mode', 'Code mode tool'),
  ];
  const rowsById = new Map(rows.map(row => [row.id, row]));

  for (const event of events) {
    switch (event.type) {
      case 'approach-start': {
        const row = rowsById.get(event.runId);
        if (row != null) {
          row.status = 'running';
        }
        break;
      }
      case 'step-finish': {
        const row = rowsById.get(event.runId);
        if (row == null) {
          break;
        }

        row.status = 'running';
        row.modelSegments = [
          ...row.modelSegments.filter(
            segment => segment.id !== `step-${event.step.stepNumber}`,
          ),
          {
            id: `step-${event.step.stepNumber}`,
            kind: 'model' as const,
            label: `Step ${event.step.stepNumber + 1}`,
            shortLabel: `S${event.step.stepNumber + 1}`,
            startMs: row.modelSegments
              .filter(segment => segment.id !== `step-${event.step.stepNumber}`)
              .reduce((sum, segment) => sum + segment.durationMs, 0),
            durationMs: event.step.performance.stepTimeMs,
          },
        ].sort((a, b) => a.startMs - b.startMs);
        row.toolSegments = event.hostToolTrace.map(call => ({
          id: `tool-${call.id}`,
          kind: 'tool' as const,
          label: call.toolName,
          shortLabel: call.toolName.replace(/[a-z]/g, '').slice(0, 3) || 'T',
          startMs: call.startMs,
          durationMs: call.durationMs,
        }));
        row.totalMs = Math.max(
          row.totalMs,
          ...row.modelSegments.map(
            segment => segment.startMs + segment.durationMs,
          ),
          ...row.toolSegments.map(
            segment => segment.startMs + segment.durationMs,
          ),
        );
        break;
      }
      case 'approach-done': {
        const row = rowsById.get(event.run.id);
        if (row == null) {
          break;
        }

        row.status = 'done';
        row.totalMs = event.run.totalMs;
        row.modelSegments = event.run.steps.reduce<WaterfallSegment[]>(
          (segments, step) => {
            const startMs = segments.reduce(
              (sum, segment) => sum + segment.durationMs,
              0,
            );
            segments.push({
              id: `step-${step.stepNumber}`,
              kind: 'model' as const,
              label: `Step ${step.stepNumber + 1}`,
              shortLabel: `S${step.stepNumber + 1}`,
              startMs,
              durationMs: step.performance.stepTimeMs,
            });
            return segments;
          },
          [],
        );
        row.toolSegments = event.run.hostToolTrace.map(call => ({
          id: `tool-${call.id}`,
          kind: 'tool' as const,
          label: call.toolName,
          shortLabel: call.toolName.replace(/[a-z]/g, '').slice(0, 3) || 'T',
          startMs: call.startMs,
          durationMs: call.durationMs,
        }));
        break;
      }
      case 'benchmark-error': {
        for (const row of rows) {
          if (row.status === 'running') {
            row.status = 'error';
          }
        }
        break;
      }
    }
  }

  return rows;
}

function createWaterfallRow(
  id: ApproachResult['id'],
  label: string,
): WaterfallRow {
  return {
    id,
    label,
    status: 'pending',
    totalMs: 0,
    modelSegments: [],
    toolSegments: [],
  };
}

function MetricCard({
  run,
  maxTotalMs,
}: {
  run: ApproachResult;
  maxTotalMs: number;
}) {
  const totalPercent = (run.totalMs / maxTotalMs) * 100;

  return (
    <article className="metricCard">
      <div className="cardHeader">
        <h2>{run.label}</h2>
        <span>{formatMs(run.totalMs)}</span>
      </div>
      <div className="barTrack">
        <div className="barFill" style={{ width: `${totalPercent}%` }} />
      </div>
      <dl className="metrics">
        <Metric label="Model steps" value={run.metrics.modelSteps} />
        <Metric
          label="Top-level tool calls"
          value={run.metrics.topLevelToolCalls}
        />
        <Metric label="Host tool calls" value={run.metrics.hostToolCalls} />
        <Metric label="Total tokens" value={run.usage.totalTokens ?? 'n/a'} />
        <Metric
          label="Model response"
          value={formatMs(run.metrics.modelResponseMs)}
        />
        <Metric label="Host tools" value={formatMs(run.metrics.hostToolMs)} />
      </dl>
    </article>
  );
}

function RunDetails({ run }: { run: ApproachResult }) {
  return (
    <section className="panel runPanel">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">{run.id}</p>
          <h2>{run.label}</h2>
        </div>
        <span className="pill">{run.finishReason}</span>
      </div>

      <h3>Host Tool Timeline</h3>
      <ToolTimeline trace={run.hostToolTrace} totalMs={run.totalMs} />

      <h3>Model Steps</h3>
      <div className="steps">
        {run.steps.map(step => (
          <article className="step" key={step.stepNumber}>
            <div className="stepHeader">
              <strong>Step {step.stepNumber + 1}</strong>
              <span>{step.finishReason}</span>
            </div>
            <dl className="stepMetrics">
              <Metric
                label="Step time"
                value={formatMs(step.performance.stepTimeMs)}
              />
              <Metric
                label="Response"
                value={formatMs(step.performance.responseTimeMs)}
              />
              <Metric label="Tokens" value={step.usage.totalTokens ?? 'n/a'} />
              <Metric
                label="Tool calls"
                value={
                  step.toolErrors.length > 0
                    ? `${step.toolCalls.length} (${step.toolErrors.length} error)`
                    : step.toolCalls.length
                }
              />
            </dl>
            {step.toolErrors.length > 0 ? (
              <div className="toolErrors">
                {step.toolErrors.map(toolError => (
                  <details key={toolError.toolCallId} open>
                    <summary>{toolError.toolName} error</summary>
                    <pre className="errorBox">{toolError.error}</pre>
                    <JsonPreview value={toolError.input} />
                  </details>
                ))}
              </div>
            ) : null}
            {step.toolCalls.length > 0 ? (
              <div className="toolList">
                {step.toolCalls.map(toolCall => (
                  <details key={toolCall.toolCallId}>
                    <summary>{toolCall.toolName}</summary>
                    <JsonPreview value={toolCall.input} />
                  </details>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <h3>Final Answer</h3>
      <pre className="answer">{run.finalText}</pre>
    </section>
  );
}

function ToolTimeline({
  trace,
  totalMs,
}: {
  trace: ToolTrace[];
  totalMs: number;
}) {
  const rows = useMemo(
    () =>
      trace.map(call => ({
        ...call,
        left: Math.max(0, (call.startMs / totalMs) * 100),
        width: Math.max(2, (call.durationMs / totalMs) * 100),
      })),
    [trace, totalMs],
  );

  if (rows.length === 0) {
    return <p className="muted">No host tools were executed.</p>;
  }

  return (
    <div className="timeline">
      {rows.map(call => (
        <div className="timelineRow" key={call.id}>
          <span>{call.toolName}</span>
          <div className="timelineTrack">
            <div
              className="timelineBar"
              style={{ left: `${call.left}%`, width: `${call.width}%` }}
              title={`${call.toolName}: ${formatMs(call.durationMs)}`}
            />
          </div>
          <strong>{formatMs(call.durationMs)}</strong>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

function HighlightedCode({
  language,
  value,
}: {
  language: 'json' | 'markdown' | 'ts';
  value: string;
}) {
  const children =
    language === 'json'
      ? highlightJson(value)
      : language === 'markdown'
        ? highlightMarkdown(value)
        : highlightTypeScript(value);

  return <pre className="inspectionPre syntaxPre">{children}</pre>;
}

function highlightMarkdown(value: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = value.split('\n');

  lines.forEach((line, lineIndex) => {
    const heading = /^(#{1,6}\s)(.*)$/.exec(line);
    const fence = /^(```.*)$/.exec(line);
    const bullet = /^(\s*(?:[-*]|\d+\.)\s)(.*)$/.exec(line);

    if (heading) {
      nodes.push(
        <span className="tokenPunctuation" key={`${lineIndex}-prefix`}>
          {heading[1]}
        </span>,
        <span className="tokenHeading" key={`${lineIndex}-heading`}>
          {heading[2]}
        </span>,
      );
    } else if (fence) {
      nodes.push(
        <span className="tokenCodeFence" key={`${lineIndex}-fence`}>
          {fence[1]}
        </span>,
      );
    } else if (bullet) {
      nodes.push(
        <span className="tokenPunctuation" key={`${lineIndex}-bullet`}>
          {bullet[1]}
        </span>,
        ...highlightMarkdownInline(bullet[2], `${lineIndex}-text`),
      );
    } else {
      nodes.push(...highlightMarkdownInline(line, `${lineIndex}-text`));
    }

    if (lineIndex < lines.length - 1) {
      nodes.push('\n');
    }
  });

  return nodes;
}

function highlightMarkdownInline(
  value: string,
  keyPrefix: string,
): React.ReactNode[] {
  return tokenize(
    value,
    /(`[^`]*`|\*\*[^*]+\*\*)/g,
    (token, key) => {
      if (token.startsWith('`')) {
        return (
          <span className="tokenInlineCode" key={key}>
            {token}
          </span>
        );
      }
      return (
        <span className="tokenStrong" key={key}>
          {token}
        </span>
      );
    },
    keyPrefix,
  );
}

function highlightJson(value: string): React.ReactNode[] {
  return tokenize(
    value,
    /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|[{}[\],:])/g,
    (token, key, index, source) => {
      const className = token.startsWith('"')
        ? source
            .slice(index + token.length)
            .trimStart()
            .startsWith(':')
          ? 'tokenKey'
          : 'tokenString'
        : /^(true|false|null)$/.test(token)
          ? 'tokenLiteral'
          : /^-?\d/.test(token)
            ? 'tokenNumber'
            : 'tokenPunctuation';

      return (
        <span className={className} key={key}>
          {token}
        </span>
      );
    },
  );
}

function highlightTypeScript(value: string): React.ReactNode[] {
  return tokenize(
    value,
    /(\/\/.*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:async|await|const|let|var|return|if|else|true|false|null|undefined|Promise|all|map)\b|\b\d+(?:\.\d+)?\b|[{}()[\].,;:])/g,
    (token, key) => {
      const className =
        token.startsWith('//') || token.startsWith('/*')
          ? 'tokenComment'
          : /^["'`]/.test(token)
            ? 'tokenString'
            : /^(true|false|null|undefined)$/.test(token)
              ? 'tokenLiteral'
              : /^(async|await|const|let|var|return|if|else|Promise|all|map)$/.test(
                    token,
                  )
                ? 'tokenKeyword'
                : /^-?\d/.test(token)
                  ? 'tokenNumber'
                  : 'tokenPunctuation';

      return (
        <span className={className} key={key}>
          {token}
        </span>
      );
    },
  );
}

function tokenize(
  value: string,
  expression: RegExp,
  renderToken: (
    token: string,
    key: string,
    index: number,
    source: string,
  ) => React.ReactNode,
  keyPrefix = 'token',
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  expression.lastIndex = 0;

  while ((match = expression.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }

    nodes.push(
      renderToken(match[0], `${keyPrefix}-${match.index}`, match.index, value),
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
}

function formatMs(value: number): string {
  return `${Math.round(value)}ms`;
}
