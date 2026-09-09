'use client';

import { useState } from 'react';
import {
  FIRST_PARTY_PROVIDERS,
  InteractiveCodePreview,
} from './interactive-code-preview';
import { resolveDocsHref } from './resolve-href';

const CODE_TEMPLATE = `import { generateText } from "ai";
__PROVIDER_IMPORT__;

const { text } = await generateText({
  model: __TEXT_MODEL__,
  prompt: "What is love?",
});`;

// Rendered gateway template (import line removed):
//   1  import { generateText } from "ai";
//   2  (blank)
//   3  const { text } = await generateText({
//   4    model: "...",
// so [4] / [5] highlight the interactive `model:` line on every tab, matching
// the legacy wrapper (geist CodeBlock counts 1-based over all lines).
const HIGHLIGHTED_LINES = [4];
const HIGHLIGHTED_LINES_WITH_IMPORT = [5];

const RESPONSES = [
  'Love is a complex and multifaceted emotion that can be felt and expressed in many different ways. It involves deep affection, care, compassion, and connection towards another person or thing.',
  'Love is a profound emotional bond characterized by attachment, caring, and intimacy. It encompasses romantic love, familial love, and the love between friends.',
  'Love is both a feeling and a choice - an emotional connection that grows through shared experiences, trust, and mutual respect between people.',
  'Love is a universal human experience that transcends cultures and time. It motivates acts of kindness, sacrifice, and deep commitment to others.',
  'Love is the warm feeling of connection and belonging we experience with those who matter most to us. It shapes our relationships and gives meaning to life.',
  'Love is an intense feeling of deep affection and emotional attachment that binds us to others in meaningful relationships.',
  'Love is the force that drives us to care for others selflessly, putting their needs and happiness alongside or even before our own.',
  'Love is a combination of passion, intimacy, and commitment that creates lasting bonds between individuals.',
  'Love is an emotion that inspires us to be better versions of ourselves and brings out the best in those around us.',
  'Love is the foundation of trust, understanding, and acceptance that allows us to be vulnerable with another person.',
  'Love is a powerful emotion that can bring immense joy and fulfillment, while also requiring patience, forgiveness, and understanding.',
  'Love is the deep sense of caring and devotion we feel toward someone, marked by a desire for their well-being and happiness.',
  'Love is an enduring connection that weathers challenges and grows stronger through shared experiences and mutual support.',
  'Love is both an action and a feeling - it requires effort, communication, and dedication to nurture and maintain.',
  'Love is the emotional glue that binds families, friendships, and romantic partnerships together across time and distance.',
];

export const PreviewSwitchProviders = ({
  versionPrefix = '',
}: {
  versionPrefix?: string;
}) => {
  const [responseIndex, setResponseIndex] = useState(0);
  const resolveHref = (href: string) => resolveDocsHref(href, versionPrefix);

  const handleModelChange = () => {
    setResponseIndex(prev => (prev + 1) % RESPONSES.length);
  };

  return (
    <div id="preview-switch-providers">
      <InteractiveCodePreview
        allowedProviders={FIRST_PARTY_PROVIDERS}
        code={CODE_TEMPLATE}
        defaultModelId="anthropic/claude-sonnet-4.5"
        highlightedLines={HIGHLIGHTED_LINES}
        highlightedLinesWithImport={HIGHLIGHTED_LINES_WITH_IMPORT}
        language="typescript"
        onModelChange={handleModelChange}
        resolveHref={resolveHref}
      >
        <div className="rounded-md border border-gray-alpha-400 p-2 px-4 font-mono text-gray-1000 text-sm leading-5 md:leading-6">
          {RESPONSES[responseIndex]}
        </div>
      </InteractiveCodePreview>
    </div>
  );
};
