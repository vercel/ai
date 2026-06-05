import Link from 'next/link';

const HARNESSES = [
  { slug: 'claude-code', label: 'Claude Code' },
  { slug: 'codex', label: 'Codex' },
  { slug: 'pi', label: 'Pi' },
] as const;

export default function Home() {
  return (
    <main className="flex flex-col gap-4 pt-12 pb-24 mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-bold">Harness Workflow examples</h1>
      <p className="text-sm text-gray-600">
        Each harness runs as a <strong>durable, multi-turn</strong> agent via
        the Vercel Workflow DevKit: every user message is one workflow run that
        resumes the prior turn&apos;s warm session, sends the new message, and
        slices a long turn across a wall-clock budget — surviving a Fluid
        Compute recycle.
      </p>
      <ul className="list-disc pl-6">
        {HARNESSES.map(h => (
          <li key={h.slug}>
            <Link
              href={`/harness/${h.slug}/workflow`}
              className="text-blue-600 underline"
            >
              {h.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
