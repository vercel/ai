import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Tab, Tabs } from '@/components/docs/tabs';
import { HighlightedCode } from '@/components/resources/highlighted-code';
import { socialCard } from '@/lib/og';
import { tools } from '@/lib/tools-registry';

const linkButtonClass =
  'inline-flex items-center justify-center rounded-md border border-gray-alpha-400 bg-background-100 px-3 py-1.5 font-medium text-gray-1000 text-sm transition-colors hover:border-gray-500';

const packageManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const;

const ToolPage = async ({ params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const tool = tools.find(candidate => candidate.slug === slug);

  if (!tool) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-8 pb-40 pt-12">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {tool.websiteUrl ? (
            <Link
              className="font-semibold text-4xl text-gray-1000 transition-opacity hover:opacity-80"
              href={tool.websiteUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {tool.name}
            </Link>
          ) : (
            <h1 className="font-semibold text-4xl text-gray-1000">
              {tool.name}
            </h1>
          )}
          <div className="flex flex-wrap gap-2">
            {tool.npmUrl ? (
              <Link
                className={linkButtonClass}
                href={tool.npmUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                npm
              </Link>
            ) : null}
            {tool.docsUrl ? (
              <Link
                className={linkButtonClass}
                href={tool.docsUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Learn More
              </Link>
            ) : null}
          </div>
        </div>
        {tool.tags && tool.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tool.tags.map(tag => (
              <span
                className="rounded-full bg-gray-100 px-3 py-1 text-gray-900 text-sm"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <p className="text-gray-900 text-lg">{tool.description}</p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex flex-col gap-6 lg:w-1/2">
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-gray-1000 text-xl">
              Installation
            </h2>
            <Tabs items={[...packageManagers]} label="Package manager">
              {packageManagers.map(packageManager => (
                <Tab key={packageManager}>
                  <HighlightedCode
                    code={tool.installCommand[packageManager]}
                    lang="bash"
                  />
                </Tab>
              ))}
            </Tabs>
          </div>

          {tool.apiKeyUrl && tool.apiKeyEnvName ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-1000 text-xl">
                  API Key
                </h2>
                <Link
                  className={linkButtonClass}
                  href={tool.apiKeyUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Get API Key
                </Link>
              </div>
              <HighlightedCode
                code={`# Add to your .env file\n${tool.apiKeyEnvName}=your_api_key_here`}
                lang="bash"
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-6 lg:w-1/2">
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-gray-1000 text-xl">Usage</h2>
            <HighlightedCode code={tool.codeExample} lang="typescript" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const generateStaticParams = () =>
  tools.map(tool => ({ slug: tool.slug }));

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> => {
  const { slug } = await params;
  const tool = tools.find(candidate => candidate.slug === slug);

  if (!tool) {
    notFound();
  }

  const description = `Use the ${tool.name} tool in your AI SDK agent with just a few lines of code.`;

  return {
    title: tool.name,
    description,
    ...socialCard(tool.name, description),
  };
};

export default ToolPage;
