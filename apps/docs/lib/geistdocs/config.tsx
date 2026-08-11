import { defineConfig } from '@vercel/geistdocs/config';
import {
  content,
  Logo,
  nav,
  siteId,
  title,
  translations,
  versions,
} from '@/geistdocs';

export const config = defineConfig({
  title,
  defaultLanguage: 'en',
  logo: <Logo />,
  nav,
  content,
  versions,
  translations,
  siteId,
  github: { owner: 'vercel', repo: 'ai' },
  agent: {
    product: {
      name: 'AI SDK',
      description:
        'The TypeScript toolkit for building AI applications and agents.',
      category: 'Developer tools',
      audience: ['JavaScript and TypeScript developers'],
      useCases: [
        'Generate text and structured data',
        'Build agents and chat interfaces',
        'Integrate language model providers',
      ],
    },
  },
  ai: {
    enabled: true,
    suggestions: [
      'How do I stream text with streamText?',
      'How do I define tools and handle tool calls?',
      'How do I generate structured output with generateObject?',
      'How do I build a chatbot with useChat?',
    ],
  },
  // No edit-source action yet. Upstream content still uses `NN-` filename
  // prefixes, so page paths here don't match source paths. Enable once the
  // content codemod lands on `main`.
  // Package defaults for copyPage/askAI/openInChat/scrollTop apply; only
  // edit-source stays off. Upstream content still uses `NN-` filename
  // prefixes, so page paths here don't match source paths. Enable once the
  // content codemod lands on `main`.
  pageActions: {
    editSource: false,
  },
  // Feedback uses the package default (enabled): the widget posts to the
  // Geistdocs platform, which files GitHub issues labeled with `siteId`.
});
