'use client';

import { useMemo, useState } from 'react';
import type {
  ApproachResult,
  BenchmarkResponse,
  BenchmarkProgressEvent,
  DiffPart,
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
      <ol className="progressList">
        {events.map((event, index) => (
          <li key={index}>{formatProgressEvent(event)}</li>
        ))}
      </ol>
    </section>
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

      <section className="comparisonGrid">
        {result.runs.map(run => (
          <RunDetails key={run.id} run={run} />
        ))}
      </section>

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Final output</p>
            <h2>Word Diff</h2>
          </div>
          <p className="muted">
            Red text appears only in direct tools. Green text appears only in
            code mode.
          </p>
        </div>
        <DiffView diff={result.diff} />
      </section>
    </>
  );
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

function formatProgressEvent(event: BenchmarkProgressEvent): string {
  switch (event.type) {
    case 'benchmark-start':
      return `Started ${event.caseId} with ${event.model}`;
    case 'approach-start':
      return `Started ${event.label}`;
    case 'step-finish':
      return `${event.label}: step ${event.step.stepNumber + 1} finished with ${event.step.toolCalls.length} tool call(s)`;
    case 'approach-done':
      return `${event.run.label} finished in ${formatMs(event.run.totalMs)}`;
    case 'benchmark-done':
      return 'Final metrics and diff are ready';
    case 'benchmark-error':
      return `Error: ${event.error}`;
  }
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
    <section className="panel">
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

function DiffView({ diff }: { diff: DiffPart[] }) {
  return (
    <div className="diff">
      {diff.map((part, index) => (
        <span className={part.type} key={`${part.type}-${index}`}>
          {part.value}
        </span>
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

function formatMs(value: number): string {
  return `${Math.round(value)}ms`;
}
