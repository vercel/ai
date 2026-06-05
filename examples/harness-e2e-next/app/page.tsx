import Link from 'next/link';

const VARIANTS = [
  { slug: 'workflow', label: 'Workflow' },
  { slug: 'basic', label: 'Basic' },
  { slug: 'detach', label: 'Detach' },
  { slug: 'ai-sdk-coding', label: 'AI SDK Coding' },
] as const;

const HARNESSES = [
  {
    slug: 'claude-code',
    label: 'Claude Code',
    variants: ['workflow', 'basic', 'detach', 'ai-sdk-coding'],
  },
  {
    slug: 'codex',
    label: 'Codex',
    variants: ['workflow', 'basic', 'detach', 'ai-sdk-coding'],
  },
  { slug: 'pi', label: 'Pi', variants: ['workflow', 'basic', 'ai-sdk-coding'] },
] as const;

const VARIANT_LABELS: Record<string, string> = Object.fromEntries(
  VARIANTS.map(v => [v.slug, v.label]),
);

export default function Home() {
  return (
    <main className="flex flex-col gap-4 pt-12 pb-24 mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-bold">Harness examples</h1>
      <p className="text-sm text-gray-600">
        Each harness ships in several variants. The <strong>Workflow</strong>{' '}
        variant runs as a <strong>durable, multi-turn</strong> agent via the
        Vercel Workflow DevKit: every user message is one workflow run that
        resumes the prior turn&apos;s warm session, sends the new message, and
        slices a long turn across a wall-clock budget — surviving a Fluid
        Compute recycle. The other variants stream the agent directly from the
        route handler.
      </p>
      <ul className="flex flex-col gap-4 pl-0 list-none">
        {HARNESSES.map(h => (
          <li key={h.slug}>
            <span className="font-semibold">{h.label}</span>
            <ul className="list-disc pl-6">
              {h.variants.map(variant => (
                <li key={variant}>
                  <Link
                    href={`/harness/${h.slug}/${variant}`}
                    className="text-blue-600 underline"
                  >
                    {VARIANT_LABELS[variant] ?? variant}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </main>
  );
}
