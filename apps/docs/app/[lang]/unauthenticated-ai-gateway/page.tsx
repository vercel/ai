import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoIconVercel } from '@vercel/geistdocs/assets/logos';
import { Snippet } from '@/components/docs/snippet';

export const metadata: Metadata = {
  title: 'Get your API key',
  description:
    'Connect the AI SDK to AI Gateway or configure a dedicated model provider.',
};

const code = (value: string) => (
  <pre className="not-prose my-4 overflow-x-auto rounded-md border border-gray-400 bg-background-100 p-4 font-mono text-[13px] leading-6">
    <code>{value}</code>
  </pre>
);

export default function UnauthenticatedAiGatewayPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <article className="prose">
        <h1>Get your API key</h1>

        <h2>AI Gateway</h2>
        <p>
          The{' '}
          <Link href="/providers/ai-sdk-providers/ai-gateway" prefetch={true}>
            Vercel AI Gateway
          </Link>{' '}
          gives the AI SDK access to models from OpenAI, Anthropic, Google, and
          other providers. Authenticate with an{' '}
          <a href="https://vercel.com/docs/ai-gateway/getting-started#set-up-your-api-key">
            AI Gateway API key
          </a>{' '}
          or{' '}
          <a href="https://vercel.com/docs/ai-gateway/authentication#oidc-token">
            OIDC
          </a>
          .
        </p>
        <p>
          <a
            className="not-prose inline-flex items-center gap-2 rounded-md border border-gray-400 bg-background-100 px-4 py-2 text-sm font-medium no-underline hover:bg-background-200"
            href="https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys%3Futm_source%3Dgateway-models-page%26showCreateKeyModal%3Dtrue&title=Get+Started+with+Vercel+AI+Gateway"
          >
            <LogoIconVercel />
            Get an API key
          </a>
        </p>
        <p>Add your API key to your environment:</p>
        <Snippet prompt={false} text="AI_GATEWAY_API_KEY=your_api_key_here" />
        <p>
          AI Gateway is the default{' '}
          <Link
            href="/docs/ai-sdk-core/provider-management#global-provider-configuration"
            prefetch={true}
          >
            global provider
          </Link>
          , so you can use a <code>creator/model</code> string without importing
          a provider package.
        </p>
        {code(`import { generateText } from 'ai';

const { text } = await generateText({
  model: 'anthropic/claude-sonnet-4.5',
  prompt: 'What is love?',
});`)}

        <h2>Using dedicated providers</h2>
        <p>
          You can use{' '}
          <Link href="/providers/ai-sdk-providers" prefetch={true}>
            first-party providers
          </Link>
          , OpenAI-compatible providers, and community providers directly.
        </p>
        <Snippet text="pnpm add @ai-sdk/anthropic" />
        {code(`import { anthropic } from '@ai-sdk/anthropic';

model: anthropic('claude-sonnet-4-5');`)}

        <h2>Custom providers</h2>
        <p>
          You can implement the AI SDK model specification to integrate another
          model service. See{' '}
          <Link
            href="/providers/community-providers/custom-providers"
            prefetch={true}
          >
            Writing a custom provider
          </Link>{' '}
          for the complete provider contract.
        </p>
      </article>
    </main>
  );
}
