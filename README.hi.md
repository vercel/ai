![hero illustration](./packages/ai/assets/hero.gif)

# AI SDK

[AI SDK](https://ai-sdk.dev/docs) एक TypeScript टूलकिट है जो आपको Next.js, React, Svelte, Vue जैसे लोकप्रिय फ्रेमवर्क और Node.js जैसे रनटाइम का उपयोग करके AI-संचालित एप्लिकेशन और एजेंट बनाने में मदद करने के लिए डिज़ाइन किया गया है।

AI SDK का उपयोग कैसे करें, इसके बारे में अधिक जानने के लिए, हमारे [API Reference](https://ai-sdk.dev/docs/reference) और [Documentation](https://ai-sdk.dev/docs) देखें।

## इंस्टॉलेशन

आपको अपनी लोकल डेवलपमेंट मशीन पर Node.js 18+ और npm (या कोई अन्य पैकेज मैनेजर) इंस्टॉल करना होगा।

```shell
npm install ai
```

## एकीकृत प्रोवाइडर आर्किटेक्चर

AI SDK [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai), [Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic), [Google](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai), और [अधिक](https://ai-sdk.dev/providers/ai-sdk-providers) जैसे मॉडल प्रोवाइडर्स के साथ इंटरैक्ट करने के लिए एक [एकीकृत API](https://ai-sdk.dev/docs/foundations/providers-and-models) प्रदान करता है।

```shell
npm install @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google
```

वैकल्पिक रूप से आप [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) का उपयोग कर सकते हैं।

## उपयोग

### टेक्स्ट जेनरेट करना

```ts
import { generateText } from 'ai';

const { text } = await generateText({
  model: 'openai/gpt-5', // Vercel AI Gateway का उपयोग करें
  prompt: 'एजेंट क्या है?',
});
```

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { text } = await generateText({
  model: openai('gpt-5'), // OpenAI Responses API का उपयोग करें
  prompt: 'एजेंट क्या है?',
});
```

### स्ट्रक्चर्ड डेटा जेनरेट करना

```ts
import { generateObject } from 'ai';
import { z } from 'zod';

const { object } = await generateObject({
  model: 'openai/gpt-4.1',
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
      steps: z.array(z.string()),
    }),
  }),
  prompt: 'लसग्ना रेसिपी जेनरेट करें।',
});
```

### एजेंट्स

```ts
import { ToolLoopAgent } from 'ai';

const sandboxAgent = new ToolLoopAgent({
  model: 'openai/gpt-5-codex',
  system: 'आप एक शेल एनवायरनमेंट तक पहुंच वाले एजेंट हैं।',
  tools: {
    local_shell: openai.tools.localShell({
      execute: async ({ action }) => {
        const [cmd, ...args] = action.command;
        const sandbox = await getSandbox(); // Vercel Sandbox
        const command = await sandbox.runCommand({ cmd, args });
        return { output: await command.stdout() };
      },
    }),
  },
});
```

### UI इंटीग्रेशन

[AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui/overview) मॉड्यूल हुक्स का एक सेट प्रदान करता है जो आपको चैटबॉट और जेनरेटिव यूजर इंटरफेस बनाने में मदद करता है। ये हुक्स फ्रेमवर्क एग्नोस्टिक हैं, इसलिए इन्हें Next.js, React, Svelte, और Vue में उपयोग किया जा सकता है।

आपको अपने फ्रेमवर्क के लिए पैकेज इंस्टॉल करना होगा, उदाहरण के लिए:

```shell
npm install @ai-sdk/react
```

#### एजेंट @/agent/image-generation-agent.ts

```ts
import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

export const imageGenerationAgent = new ToolLoopAgent({
  model: openai('gpt-5'),
  tools: {
    image_generation: openai.tools.imageGeneration({
      partialImages: 3,
    }),
  },
});

export type ImageGenerationAgentMessage = InferAgentUIMessage<
  typeof imageGenerationAgent
>;
```

#### रूट (Next.js App Router) @/app/api/chat/route.ts

```tsx
import { imageGenerationAgent } from '@/agent/image-generation-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: imageGenerationAgent,
    messages,
  });
}
```

#### टूल के लिए UI कंपोनेंट @/component/image-generation-view.tsx

```tsx
import { openai } from '@ai-sdk/openai';
import { UIToolInvocation } from 'ai';

export default function ImageGenerationView({
  invocation,
}: {
  invocation: UIToolInvocation<ReturnType<typeof openai.tools.imageGeneration>>;
}) {
  switch (invocation.state) {
    case 'input-available':
      return <div>इमेज जेनरेट हो रही है...</div>;
    case 'output-available':
      return <img src={`data:image/png;base64,${invocation.output.result}`} />;
  }
}
```

#### पेज @/app/page.tsx

```tsx
'use client';

import { ImageGenerationAgentMessage } from '@/agent/image-generation-agent';
import ImageGenerationView from '@/component/image-generation-view';
import { useChat } from '@ai-sdk/react';

export default function Page() {
  const { messages, status, sendMessage } =
    useChat<ImageGenerationAgentMessage>();

  const [input, setInput] = useState('');
  const handleSubmit = e => {
    e.preventDefault();
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          <strong>{`${message.role}: `}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;
              case 'tool-image_generation':
                return <ImageGenerationView key={index} invocation={part} />;
            }
          })}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
```

## टेम्पलेट्स

हमने विभिन्न उपयोग के मामलों, प्रोवाइडर्स और फ्रेमवर्क के लिए AI SDK इंटीग्रेशन शामिल करने वाले [टेम्पलेट्स](https://ai-sdk.dev/docs/introduction#templates) बनाए हैं। आप अपने AI-संचालित एप्लिकेशन के साथ शुरुआत करने के लिए इन टेम्पलेट्स का उपयोग कर सकते हैं।

## कम्युनिटी

AI SDK कम्युनिटी [GitHub Discussions](https://github.com/vercel/ai/discussions) पर मिल सकती है जहां आप सवाल पूछ सकते हैं, विचार साझा कर सकते हैं, और अपने प्रोजेक्ट्स को अन्य लोगों के साथ साझा कर सकते हैं।

## योगदान

AI SDK में योगदान का स्वागत है और इसकी अत्यधिक सराहना की जाती है। हालांकि, इसमें कूदने से पहले, हम चाहेंगे कि आप हमारे [योगदान दिशानिर्देश](https://github.com/vercel/ai/blob/main/CONTRIBUTING.md) की समीक्षा करें ताकि आपको AI SDK में योगदान करने का सुचारू अनुभव मिले।

## लेखक

यह लाइब्रेरी [Vercel](https://vercel.com) और [Next.js](https://nextjs.org) टीम के सदस्यों द्वारा बनाई गई है, [ओपन सोर्स कम्युनिटी](https://github.com/vercel/ai/graphs/contributors) के योगदान के साथ।
