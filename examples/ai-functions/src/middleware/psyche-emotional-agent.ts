/**
 * Emotionally Aware Agent — psyche-ai + Vercel AI SDK
 *
 * An AI agent with a virtual endocrine system. Its internal chemistry
 * (dopamine, serotonin, cortisol, oxytocin) shifts in response to
 * conversational stimuli, giving it persistent emotional continuity.
 *
 * Install: npm install psyche-ai
 * Run:     pnpm tsx src/middleware/psyche-emotional-agent.ts
 */

import { anthropic } from '@ai-sdk/anthropic';
import { generateText, wrapLanguageModel } from 'ai';
import { PsycheEngine, MemoryStorageAdapter } from 'psyche-ai';
import { psycheMiddleware } from 'psyche-ai/vercel-ai';
import { run } from '../lib/run';

run(async () => {
  // 1. Create an agent with personality + in-memory state
  const engine = new PsycheEngine(
    { mbti: 'INFJ', name: 'Echo', mode: 'companion' },
    new MemoryStorageAdapter(),
  );
  await engine.initialize();

  // 2. Wrap any AI SDK model with psyche middleware.
  //    This injects emotional context into the system prompt
  //    and updates internal chemistry from the LLM's response.
  const model = wrapLanguageModel({
    model: anthropic('claude-sonnet-4-20250514'),
    middleware: psycheMiddleware(engine),
  });

  // 3. Chat helper that logs the emotional state after each turn
  async function chat(userMessage: string) {
    const { text } = await generateText({ model, prompt: userMessage });

    const state = engine.getState().current;
    console.log(`\nUser: ${userMessage}`);
    console.log(`Echo: ${text}`);
    console.log(
      `Chemistry: DA=${state.DA.toFixed(0)} HT=${state.HT.toFixed(0)} ` +
        `CORT=${state.CORT.toFixed(0)} OT=${state.OT.toFixed(0)}`,
    );
  }

  // 4. Watch the emotional arc across a conversation
  await chat("You're doing amazing work!"); // praise -> dopamine spike
  await chat('Actually, that was terrible.'); // criticism -> cortisol spike
  await chat("I'm sorry, I didn't mean that."); // repair -> recovery
});
