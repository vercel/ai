import { Inter } from 'next/font/google';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'] });

const examples = [
  {
    title: 'Generate object',
    link: '/basics/generate-object',
  },
  {
    title: 'Generate text',
    link: '/basics/generate-text',
  },
  {
    title: 'Stream text',
    link: '/basics/stream-text',
  },
  {
    title: 'Generate chat completion',
    link: '/chat/generate-chat',
  },
  {
    title: 'Generate chat completion',
    link: '/chat/stream-chat',
  },
  {
    title: 'Generate chat completion (API route)',
    link: '/chat/stream-chat-api-route',
  },
  {
    title: 'Generate chat completion (edge runtime)',
    link: '/chat/stream-chat-edge',
  },
  {
    title: 'Stream chat completion',
    link: '/chat/stream-chat',
  },
  {
    title: 'Call tools',
    link: '/tools/call-tool',
  },
  {
    title: 'Call tools in parallel',
    link: '/tools/call-tools-in-parallel',
  },
  {
    title: 'Route components using language model',
    link: '/generative-user-interface/route-components',
  },
  {
    title: 'Stream OpenAI Assistant API response',
    link: '/assistants/stream-assistant-response',
  },
  {
    title: 'Stream OpenAI Assistant API response with tool calls',
    link: '/assistants/stream-assistant-response-with-tools',
  },
];

export default function Home() {
  return (
    <main className={`flex flex-col gap-2 p-2 ${inter.className}`}>
      {examples.map((example, index) => (
        <Link key={example.link} className="flex flex-row" href={example.link}>
          <div className="w-8 text-zinc-400">{index + 1}.</div>
          <div className="hover:underline">{example.title}</div>
        </Link>
      ))}
    </main>
  );
}
