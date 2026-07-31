'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  AsyncApisMaintainer,
  AsyncApisProgressUpdate,
  AsyncApisRepository,
} from '@/workflow/async-apis';

interface MaintainerState extends AsyncApisMaintainer {
  avatarStatus: 'waiting' | 'downloading' | 'downloaded';
  videoStatus: 'waiting' | 'generating' | 'completed';
  videoUrl?: string;
  warnings: string[];
}

type PageStatus = 'idle' | 'running' | 'complete' | 'error';

export default function AsyncApisPage() {
  const [repositoryUrl, setRepositoryUrl] = useState(
    'https://github.com/vercel/ai',
  );
  const [repository, setRepository] = useState<AsyncApisRepository>();
  const [maintainers, setMaintainers] = useState<MaintainerState[]>([]);
  const [updates, setUpdates] = useState<string[]>([]);
  const [status, setStatus] = useState<PageStatus>('idle');
  const [error, setError] = useState<string>();
  const [runId, setRunId] = useState<string>();
  const abortControllerRef = useRef<AbortController>();

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const applyUpdate = (update: AsyncApisProgressUpdate) => {
    setUpdates(current => [...current, describeUpdate(update)]);

    switch (update.type) {
      case 'maintainers':
        setRepository(update.repository);
        setMaintainers(
          update.maintainers.map(maintainer => ({
            ...maintainer,
            avatarStatus: 'waiting',
            videoStatus: 'waiting',
            warnings: [],
          })),
        );
        break;
      case 'avatar':
        setMaintainers(current =>
          current.map(maintainer =>
            maintainer.login === update.maintainer.login
              ? { ...maintainer, avatarStatus: update.status }
              : maintainer,
          ),
        );
        break;
      case 'video':
        setMaintainers(current =>
          current.map(maintainer =>
            maintainer.login !== update.maintainer.login
              ? maintainer
              : update.status === 'generating'
                ? { ...maintainer, videoStatus: 'generating' }
                : {
                    ...maintainer,
                    videoStatus: 'completed',
                    videoUrl: update.videoUrl,
                    warnings: update.warnings,
                  },
          ),
        );
        break;
      case 'complete':
        setStatus('complete');
        break;
      case 'error':
        setError(update.message);
        setStatus('error');
        break;
    }
  };

  const startWorkflow = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRepository(undefined);
    setMaintainers([]);
    setUpdates([]);
    setError(undefined);
    setRunId(undefined);
    setStatus('running');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let sawTerminalUpdate = false;

    try {
      const response = await fetch('/api/async-apis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `Request failed (${response.status}).`);
      }
      if (response.body == null) {
        throw new Error('The workflow did not return a progress stream.');
      }

      setRunId(response.headers.get('x-workflow-run-id') ?? undefined);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim().length === 0) continue;
          const update = JSON.parse(line) as AsyncApisProgressUpdate;
          sawTerminalUpdate ||=
            update.type === 'complete' || update.type === 'error';
          applyUpdate(update);
        }

        if (done) break;
      }

      if (buffer.trim().length > 0) {
        const update = JSON.parse(buffer) as AsyncApisProgressUpdate;
        sawTerminalUpdate ||=
          update.type === 'complete' || update.type === 'error';
        applyUpdate(update);
      }

      if (!sawTerminalUpdate) {
        throw new Error(
          'The progress stream closed before the workflow ended.',
        );
      }
    } catch (caughtError) {
      if (abortController.signal.aborted) return;
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      setError(message);
      setStatus('error');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
          <div>
            <Link
              href="/"
              className="text-sm text-sky-300 transition hover:text-sky-200"
            >
              ← WorkflowAgent example
            </Link>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
                Maintainer hellos
              </h1>
              <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-200">
                async APIs
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Find the top three people merging a repository&apos;s pull
              requests, then turn their GitHub portraits into short, friendly
              FAL videos.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            <div className="font-medium">Webhook-aware</div>
            <div className="mt-1 max-w-xs text-xs leading-5 text-amber-100/70">
              Public deployments suspend on a durable FAL webhook. Localhost
              automatically uses durable status polling.
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-violet-950/30 backdrop-blur sm:p-8">
          <form onSubmit={startWorkflow}>
            <label
              htmlFor="repository-url"
              className="text-sm font-medium text-slate-200"
            >
              GitHub repository URL
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                id="repository-url"
                type="url"
                required
                value={repositoryUrl}
                onChange={event => setRepositoryUrl(event.target.value)}
                disabled={status === 'running'}
                placeholder="https://github.com/owner/repository"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === 'running'}
                className="rounded-xl bg-gradient-to-r from-sky-400 to-violet-500 px-6 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'running'
                  ? 'Workflow running…'
                  : 'Meet maintainers'}
              </button>
            </div>
          </form>

          {(status !== 'idle' || runId != null) && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5 text-xs text-slate-400">
              <StatusBadge status={status} />
              {runId != null && <span className="font-mono">run {runId}</span>}
              {repository != null && (
                <a
                  href={repository.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-300 hover:text-sky-200"
                >
                  {repository.nameWithOwner} · {repository.mergedPullRequests}{' '}
                  merged PRs
                </a>
              )}
            </div>
          )}
        </section>

        {error != null && (
          <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}

        {maintainers.length > 0 && (
          <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {maintainers.map(maintainer => (
              <article
                key={maintainer.login}
                className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80"
              >
                <div className="relative aspect-square bg-slate-900">
                  {maintainer.videoUrl == null ? (
                    <img
                      src={maintainer.avatarUrl}
                      alt={`@${maintainer.login}`}
                      className={`h-full w-full object-cover transition duration-700 ${
                        maintainer.videoStatus === 'generating'
                          ? 'scale-105 opacity-50 blur-sm'
                          : ''
                      }`}
                    />
                  ) : (
                    <video
                      src={maintainer.videoUrl}
                      poster={maintainer.avatarUrl}
                      controls
                      muted
                      playsInline
                      loop
                      className="h-full w-full object-cover"
                    />
                  )}

                  {maintainer.videoStatus === 'generating' && (
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="rounded-full border border-white/20 bg-slate-950/70 px-4 py-2 text-sm backdrop-blur">
                        FAL is animating…
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <a
                        href={maintainer.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-lg font-semibold hover:text-sky-300"
                      >
                        @{maintainer.login}
                      </a>
                      <p className="mt-1 text-sm text-slate-400">
                        Merged {maintainer.mergedPullRequests}{' '}
                        {maintainer.mergedPullRequests === 1 ? 'PR' : 'PRs'}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">
                      {maintainer.videoStatus === 'completed'
                        ? 'video ready'
                        : maintainer.avatarStatus === 'downloaded'
                          ? maintainer.videoStatus
                          : maintainer.avatarStatus}
                    </span>
                  </div>

                  {maintainer.warnings.map(warning => (
                    <p
                      key={warning}
                      className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}

        {updates.length > 0 && (
          <section className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-200">
              Workflow progress
            </h2>
            <ol className="mt-4 space-y-3">
              {updates.map((update, index) => (
                <li
                  key={`${index}-${update}`}
                  className="flex gap-3 text-sm text-slate-400"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400" />
                  <span>{update}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: PageStatus }) {
  const label = {
    idle: 'idle',
    running: 'running',
    complete: 'complete',
    error: 'failed',
  }[status];
  const className = {
    idle: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    running: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
    complete: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    error: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  }[status];

  return (
    <span className={`rounded-full border px-2.5 py-1 ${className}`}>
      {label}
    </span>
  );
}

function describeUpdate(update: AsyncApisProgressUpdate): string {
  switch (update.type) {
    case 'status':
      return update.message;
    case 'maintainers':
      return `Found ${update.maintainers.length} maintainers across ${update.repository.mergedPullRequests} recently merged pull requests.`;
    case 'avatar':
      return update.status === 'downloading'
        ? `Downloading @${update.maintainer.login}'s GitHub profile image…`
        : `Downloaded @${update.maintainer.login}'s profile image.`;
    case 'video':
      return update.status === 'generating'
        ? `Generating @${update.maintainer.login}'s wave with FAL…`
        : `@${update.maintainer.login}'s video is ready.`;
    case 'complete':
      return `Workflow complete with ${update.videoCount} videos.`;
    case 'error':
      return `Workflow failed: ${update.message}`;
  }
}
