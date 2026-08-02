import { createBaseten } from '@ai-sdk/baseten';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Chat against a dedicated deployment. Requires a /sync/v1 endpoint, which
  // OpenAI-compatible servers (vLLM, SGLang, TensorRT-LLM) expose; a plain
  // Truss custom model only offers /predict and will 404 here.
  const CHAT_MODEL_ID = '<model-id>'; // e.g. 6wg17egw
  const CHAT_MODEL_URL = `https://model-${CHAT_MODEL_ID}.api.baseten.co/environments/production/sync/v1`;

  // Must match the name the server advertises — for vLLM that is
  // `--served-model-name`, which it validates. Omitting it sends
  // "placeholder", which servers that check the field reject with
  // `The model 'placeholder' does not exist`. Ask the deployment if unsure:
  //   curl -H "Authorization: Bearer $BASETEN_API_KEY" \
  //     https://model-<id>.api.baseten.co/environments/production/sync/v1/models
  const CHAT_MODEL_NAME = '<served-model-name>'; // e.g. Qwen/Qwen3.5-4B

  const baseten = createBaseten({
    modelURL: CHAT_MODEL_URL,
  });

  const result = streamText({
    model: baseten(CHAT_MODEL_NAME),
    prompt: 'Give me a poem about life',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log('Final Step:', JSON.stringify(await result.finalStep, null, 2));
});
