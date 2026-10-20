import { IconArrowUpRight } from '@vercel/geistdocs/assets/icons/icon-arrow-up-right';
import { LogoNextjs, LogoSvelteKit } from '@vercel/geistdocs/assets/logos';
import Link from 'next/link';
import { NodeIcon, PuzzleIcon } from '@/components/docs/framework-icons';

/**
 * Infer the framework glyph from the example href, matching the legacy
 * `ExampleLinks` (ai-studio packages/components/docs/example-links.tsx).
 */
const FrameworkGlyph = ({ href }: { href: string }) => {
  if (href.includes('next')) {
    return <LogoNextjs className="text-gray-1000" height={18} />;
  }
  if (href.includes('node')) {
    return <NodeIcon size={18} />;
  }
  if (href.includes('svelte')) {
    return <LogoSvelteKit className="text-[#FF3E00]" height={18} />;
  }
  return <PuzzleIcon size={16} />;
};

export const ExampleLinks = ({
  examples,
  resolveHref = href => href,
}: {
  examples: { title: string; link: string }[];
  resolveHref?: (href: string) => string;
}) => (
  <div className="not-prose my-4 flex flex-col">
    {examples.map((example, index) => (
      <Link
        className="group flex flex-row items-start justify-between gap-3 border-gray-alpha-400 border-b p-3 text-gray-1000"
        href={resolveHref(example.link)}
        key={`${example.link}-${example.title}-${index}`}
        // Fully prefetch static docs pages so navigation never shows a shell.
        prefetch
      >
        <span className="flex min-w-0 flex-row items-start gap-3">
          <span
            aria-hidden
            className="mt-[3px] flex size-[18px] shrink-0 items-center justify-center text-gray-700"
          >
            <FrameworkGlyph href={example.link} />
          </span>
          <span className="pr-8 leading-6 group-hover:underline">
            {example.title}
          </span>
        </span>
        <span aria-hidden className="mt-1 shrink-0 text-gray-900">
          <IconArrowUpRight size={16} />
        </span>
      </Link>
    ))}
  </div>
);
