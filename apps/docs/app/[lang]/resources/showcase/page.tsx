import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import { socialCard } from '@/lib/og';
import Image from 'next/image';
import Link from 'next/link';
import { showcaseProjects } from '@/lib/showcase';

export const metadata: Metadata = {
  title: 'AI SDK Showcase',
  description: 'Popular products and projects built with the AI SDK.',
  ...socialCard(
    'AI SDK Showcase',
    'Popular products and projects built with the AI SDK.',
  ),
};

const SiteCard = ({
  title,
  src,
  link,
}: {
  title: string;
  src: string;
  link: string;
}) => (
  <Link
    className="group flex-1 rounded-md border border-gray-100 bg-gray-100 p-4 transition-colors sm:hover:border-gray-400"
    href={link}
    rel="noopener noreferrer"
    target="_blank"
  >
    <div className="mb-2 flex h-[11.3rem] items-center justify-center overflow-hidden rounded bg-gray-100 shadow-sm">
      <Image
        alt={`${title} Logo`}
        className="h-auto min-w-[350px] object-cover"
        height={200}
        src={src}
        width={350}
      />
    </div>
    <span className="inline-flex items-center gap-1 font-medium text-gray-1000 tracking-tight transition-colors group-hover:text-green-700">
      {title}
      <ArrowUpRight className="group-hover:-translate-y-0.5 size-5 transition-transform group-hover:translate-x-0.5" />
    </span>
  </Link>
);

const ShowcasePage = () => (
  <section className="mx-auto w-full max-w-[1200px] px-8 py-12 xl:px-0">
    <div className="mb-12 flex flex-col items-center gap-3 text-center">
      <div className="text-gray-900 text-sm">
        <Link className="hover:underline" href="/resources">
          Resources
        </Link>{' '}
        / Showcase
      </div>
      <h1 className="font-bold text-3xl text-gray-1000 xl:text-5xl">
        Showcase
      </h1>
      <p className="max-w-2xl text-gray-900">
        Popular products and projects built with the AI SDK.
      </p>
    </div>
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {showcaseProjects.map(project => (
        <SiteCard
          key={project.name}
          link={project.link}
          src={`/images/showcase/${project.image}`}
          title={project.name}
        />
      ))}
    </div>
    <div className="mt-12 flex flex-col items-center justify-center">
      <p className="mb-4 font-bold text-gray-1000 text-xl lg:text-3xl">
        Are you using the AI SDK?
      </p>
      <Link
        className="inline-flex items-center justify-center rounded-md bg-gray-1000 px-4 py-2 font-medium text-background-100 transition-opacity hover:opacity-90"
        href="https://github.com/vercel/ai/discussions/1914"
        rel="noopener noreferrer"
        target="_blank"
      >
        Add your company
      </Link>
    </div>
  </section>
);

export default ShowcasePage;
