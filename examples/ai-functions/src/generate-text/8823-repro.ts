import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { LangfuseExporter } from 'langfuse-vercel';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';
import * as fs from 'fs';
import * as path from 'path';

// Create output file
const outputFile = path.join(__dirname, '../../output/8823-repro-output.txt');
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
const logStream = fs.createWriteStream(outputFile, { flags: 'w' });

// Helper to log to both console and file
function log(...args: unknown[]) {
  const msg = args
    .map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
    .join(' ');
  console.log(...args);
  logStream.write(msg + '\n');
}

function write(text: string) {
  process.stdout.write(text);
  logStream.write(text);
}

const sdk = new NodeSDK({
  traceExporter: new LangfuseExporter({ debug: true }),
  instrumentations: [getNodeAutoInstrumentations()],
  spanLimits: {
    attributeValueLengthLimit: 10000,
  },
});

sdk.start();

const searchTool = tool({
  description: 'Search for medical information',
  inputSchema: z.object({
    query: z.string().describe('The medical query to search for'),
  }),
  execute: async ({ query }) => {
    log(`\n🔍 Searching for: ${query}\n`);
    return {
      query,
      results: [
        {
          title: 'Hypertension Overview',
          content:
            'Hypertension, also known as high blood pressure, is a chronic condition where blood pressure in the arteries is persistently elevated. It is defined as having a systolic BP ≥130 mmHg or diastolic BP ≥80 mmHg.',
        },
        {
          title: 'Risk Factors',
          content:
            'Risk factors include obesity, sedentary lifestyle, high sodium diet, excessive alcohol consumption, smoking, stress, and genetic factors.',
        },
        {
          title: 'Treatment',
          content:
            'Treatment includes lifestyle modifications (diet, exercise, weight loss) and medications such as ACE inhibitors, ARBs, calcium channel blockers, and diuretics.',
        },
      ],
    };
  },
});

run(async () => {
  log(`Output file: ${outputFile}`);
  log('Starting streamText with reasoning model and tool call...\n');
  log('='.repeat(60));

  const result = streamText({
    model: openai('gpt-5'),
    prompt:
      'Search for the latest hypertension treatment guidelines and summarize them. Use tools to get the information.',
    tools: { search: searchTool },
    stopWhen: stepCountIs(5),
    experimental_telemetry: { isEnabled: true },
    providerOptions: {
      openai: {
        reasoningEffort: 'high',
        reasoningSummary: 'detailed',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  // Process the stream and display reasoning steps
  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'start':
        log('\n📝 START');
        break;

      case 'start-step':
        log('\n--- STEP START ---');
        break;

      case 'reasoning-start':
        write('\n🧠 Reasoning: ');
        break;

      case 'reasoning-delta':
        write(chunk.text);
        break;

      case 'reasoning-end':
        write('\n');
        break;

      case 'tool-input-start':
        write('\n🔧 Tool call: ');
        log(chunk.toolName);
        write('   Args: ');
        break;

      case 'tool-input-delta':
        write(chunk.delta);
        break;

      case 'tool-input-end':
        log('');
        break;

      case 'tool-result':
        log('   Result:', JSON.stringify(chunk.output, null, 2));
        break;

      case 'text-start':
        write('\n💬 Response: ');
        break;

      case 'text-delta':
        write(chunk.text);
        break;

      case 'text-end':
        log('\n');
        break;

      case 'finish-step':
        log('   Finish reason:', chunk.finishReason);
        log('   Usage:', chunk.usage);
        log('--- STEP FINISH ---');
        break;

      case 'finish':
        log('\n📊 FINISH');
        log('   Total usage:', chunk.totalUsage);
        break;

      case 'error':
        log('❌ Error:', chunk.error);
        break;
    }
  }

  // Log the final response object to compare with telemetry
  log('\n' + '='.repeat(60));
  log('📋 FINAL RESPONSE OBJECT (for comparison with telemetry):');
  log('='.repeat(60));

  const steps = await result.steps;
  for (const [i, step] of steps.entries()) {
    log(`\n--- Step ${i + 1} ---`);
    log('Finish reason:', step.finishReason);
    log('Usage:', step.usage);

    if (step.reasoning) {
      log('\n🧠 Reasoning in final response:');
      log(JSON.stringify(step.reasoning, null, 2));
    }

    if (step.toolCalls && step.toolCalls.length > 0) {
      log('\n🔧 Tool calls:', JSON.stringify(step.toolCalls, null, 2));
    }

    if (step.toolResults && step.toolResults.length > 0) {
      log('\n🔧 Tool results:', JSON.stringify(step.toolResults, null, 2));
    }

    if (step.text) {
      log('\n💬 Text:', step.text);
    }

    // Log the full step response messages for debugging
    log('\n📨 Step response messages:');
    log(JSON.stringify(step.response?.messages, null, 2));
  }

  log('\n' + '='.repeat(60));
  log('⚠️  Compare the reasoning steps above with what appears in Langfuse.');
  log('   The issue is that post-tool reasoning may only appear in the final');
  log('   response object but not in the telemetry trace.');
  log('='.repeat(60));

  // Flush traces to Langfuse
  await sdk.shutdown();
  log('\n✅ Traces flushed to Langfuse. Check your dashboard!');
  log(`\n📄 Full output saved to: ${outputFile}`);

  logStream.end();
});
