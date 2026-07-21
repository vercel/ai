import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';

const quotedDescription =
  "Create 'Why Pace exists' section with calm video background (clip_6). Headline 'Why Pace exists' with body text explaining the problem: 'Today you post every run to Strava to keep a history and check how friends train, but Strava doesn't answer the question: \"What should I do next after this run?\". It's a great log, but it isn't adaptive. Your races are saved from random websites, your plan sits in a spreadsheet, and your coach gets screenshots in chat. Pace is an early product that wants to fix this by putting adaptive plans, races and coaches into one app, so your running doesn't feel scattered across five tools.' Keep layout clean with text over the calming abstract background.";

const Task = z.object({
  id: z.number().optional(),
  description: z.string(),
  type: z.enum(['feature', 'bug']),
  passes: z.boolean(),
});

const WebsiteUpdateInput = z.object({
  tasks: z.array(Task),
  assets: z.array(z.string()).optional(),
  website_path: z.string(),
});

const expectedInput: z.infer<typeof WebsiteUpdateInput> = {
  website_path: '/home/user/pace-landing',
  tasks: [
    {
      description:
        "Create a premium Nike-style landing page for Pace running app. Video clips are provided and must be integrated: clip_1 (hero brand intro), clip_2 (problem/chaos), clip_3 (adaptive plans), clip_4 (races), clip_5 (coaches), clip_6 (calm liquid-glass background). Build a fullscreen hero section with video background (clip_1 transitioning to clip_2) featuring headline 'Improve your Pace', subheadline 'We know this chaos: Strava screenshots, Excel plans, race sites everywhere.', body text 'Everything for running in one app.', and prominent CTA 'Join waitlist' linking to form section. Use primary color #007AFF, secondary #4B6FFF, bg #F6F8FF. Fonts: Montserrat Semibold for headlines, Inter for body. Design should feel cinematic, premium, minimal, Nike-inspired with high contrast and cool tones.",
      type: 'feature',
      passes: false,
    },
    {
      description: quotedDescription,
      type: 'feature',
      passes: false,
    },
    {
      description:
        "Create solution section with 2-column layout featuring three features with corresponding video backgrounds. Headline 'Improve your Pace. And your pace.' Feature 1: 'Adaptive Plans' with video clip_3, text 'Missed a week? Classic plans ignore it. Pace rebuilds your week around real life.' Feature 2: 'Race Calendar' with video clip_4, text 'One place for all races. No more searching on random websites.' Feature 3: 'Coach Platform' with video clip_5, text 'Coach sees everything in Pace. No screenshots needed. Coach sets training week directly in app.' Include CTA 'See how it works' linking to form.",
      type: 'feature',
      passes: false,
    },
    {
      description:
        "Create MVP section with centered card layout and video background (clip_3). Headline 'We start simple' with body text 'Pace is early in development. The vision is one home for plans, races and coaches in a single app. The first step: adaptive plans that understand when life happens.' Add note 'Early testers shape the full running home.' Design as a premium card overlay on the video.",
      type: 'feature',
      passes: false,
    },
    {
      description:
        "Create final CTA section with fullscreen card and waitlist form, video background (clip_5). Headline 'Start your Pace journey', body text 'Join waitlist to test adaptive plans v0.1. Help build the running app you want. Team builders welcome.' Form fields: Email (required), WhatsApp (optional), consent checkbox 'Early access updates about Pace.' CTA button 'Join waitlist' that submits the form. Make form feel premium and minimal.",
      type: 'feature',
      passes: false,
    },
  ],
  assets: [
    '/home/user/Videos/4m8wxuq0li.mp4',
    '/home/user/Videos/h46y3g4zo3.mp4',
    '/home/user/Videos/2nqkbf2npz.mp4',
    '/home/user/Videos/5ek2ofn3m5.mp4',
    '/home/user/Videos/nolgvg0yag.mp4',
    '/home/user/Videos/qs44lu51b6.mp4',
  ],
};

const prompt = [
  'Call website_update exactly once.',
  'Copy every value from this JSON object verbatim into the tool input; do not summarize or rewrite strings:',
  JSON.stringify(expectedInput, null, 2),
].join('\n');

function assertExecutedInput(
  mode: 'generateText' | 'streamText',
  executedInputs: Array<z.infer<typeof WebsiteUpdateInput>>,
) {
  if (executedInputs.length !== 1) {
    throw new Error(
      `${mode}: expected one successful tool execution, received ${executedInputs.length}`,
    );
  }

  const actualDescription = executedInputs[0].tasks[1]?.description;

  if (actualDescription !== quotedDescription) {
    throw new Error(
      `${mode}: quoted description was not preserved: ${JSON.stringify(actualDescription)}`,
    );
  }
}

async function runGenerateText() {
  const executedInputs: Array<z.infer<typeof WebsiteUpdateInput>> = [];

  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    temperature: 0,
    maxOutputTokens: 5000,
    toolChoice: { type: 'tool', toolName: 'website_update' },
    tools: {
      website_update: tool({
        description: 'Update a website by completing the supplied tasks.',
        inputSchema: WebsiteUpdateInput,
        execute: async input => {
          executedInputs.push(input);
          return { ok: true };
        },
      }),
    },
    prompt,
  });

  assertExecutedInput('generateText', executedInputs);

  return result.response.modelId;
}

async function runStreamText() {
  const executedInputs: Array<z.infer<typeof WebsiteUpdateInput>> = [];

  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    temperature: 0,
    maxOutputTokens: 5000,
    toolChoice: { type: 'tool', toolName: 'website_update' },
    tools: {
      website_update: tool({
        description: 'Update a website by completing the supplied tasks.',
        inputSchema: WebsiteUpdateInput,
        execute: async input => {
          executedInputs.push(input);
          return { ok: true };
        },
      }),
    },
    prompt,
  });

  await Promise.all([result.toolCalls, result.toolResults]);

  assertExecutedInput('streamText', executedInputs);
}

async function main() {
  const issueSnippet = `{"name": "hi \"hello world\""}`;
  let issueSnippetError: unknown;

  try {
    JSON.parse(issueSnippet);
  } catch (error) {
    issueSnippetError = error;
  }

  if (!(issueSnippetError instanceof SyntaxError)) {
    throw new Error(
      'Expected the issue template-literal control to be invalid JSON',
    );
  }

  const modelId = await runGenerateText();
  await runStreamText();

  console.log(
    `CONTROL: the issue template-literal example is invalid at runtime: ${issueSnippetError.message}`,
  );
  console.log(
    `PASS: generateText and streamText executed website_update with the quoted question using ${modelId}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
