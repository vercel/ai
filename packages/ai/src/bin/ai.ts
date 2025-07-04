import { streamText } from '../../core/generate-text/stream-text';

async function generateResponse(prompt: string, modelId: string) {
  try {
    // Use model ID directly - AI Gateway expects provider/model format
    const finalModelId = modelId.includes('/') ? modelId : `openai/${modelId}`;

    console.log(`🤖 Using ${finalModelId}\n`);

    // Stream the response - pass model ID string directly to AI Gateway
    const result = streamText({
      model: finalModelId,
      prompt,
    });

    for await (const textPart of result.textStream) {
      process.stdout.write(textPart);
    }

    console.log('\n');

    // Show usage information
    const usage = await result.usage;
    const finishReason = await result.finishReason;

    if (usage) {
      console.log(
        `\n📊 Token usage: ${usage.totalTokens} total (${usage.inputTokens} input, ${usage.outputTokens} output)`,
      );
    }

    if (finishReason) {
      console.log(`✅ Finished: ${finishReason}`);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`Usage: ai [options] <prompt>

AI CLI - Stream text generation from various AI models via AI Gateway

Arguments:
  prompt               The prompt to send to the AI model

Options:
  -m, --model <model>  Model to use. Format: provider/model or just model name.
                       Examples: openai/gpt-4o, anthropic/claude-3-5-sonnet-20241022, groq/llama-3.1-70b-versatile
                       (default: "openai/gpt-4")
  -h, --help           Display help for command
  -V, --version        Output the version number

Examples:
  npx ai "Hello, world!"
  npx ai "Write a poem" -m anthropic/claude-3-5-sonnet-20241022
  npx ai "Explain quantum physics" -m groq/llama-3.1-70b-versatile`);
}

function showVersion() {
  console.log('1.0.0');
}

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  // Handle commands
  if (args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-V') {
    showVersion();
    process.exit(0);
  }

  // Parse options and prompt
  let model = 'openai/gpt-4';
  let prompt = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-m' || arg === '--model') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --model option requires a value');
        process.exit(1);
      }
      model = args[i + 1];
      i++; // Skip the next argument as it's the model value
    } else if (arg.startsWith('-m=')) {
      model = arg.slice(3);
    } else if (arg.startsWith('--model=')) {
      model = arg.slice(8);
    } else if (!arg.startsWith('-')) {
      // This is the prompt
      prompt = arg;
    } else {
      console.error(`❌ Error: Unknown option: ${arg}`);
      console.error('Use --help for usage information');
      process.exit(1);
    }
  }

  if (!prompt) {
    console.error('❌ Error: Missing required argument: prompt');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  return { prompt, model };
}

// Main execution
async function main() {
  try {
    const { prompt, model } = parseArgs();
    await generateResponse(prompt, model);
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}
