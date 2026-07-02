#!/usr/bin/env node

/**
 * Reproduction for vercel/ai#15306.
 *
 * WorkflowAgent crosses a workflow step boundary before the first model call.
 * Provider models are serialized with WORKFLOW_SERIALIZE and reconstructed with
 * WORKFLOW_DESERIALIZE. OpenAI stores its request URL builder as a function in
 * config.url, and serializeModelOptions drops function-valued properties.
 *
 * This script performs that same model serialization round trip for an
 * OpenAI LanguageModel, then calls doStream(). In the broken implementation,
 * the deserialized model has no config.url function and doStream throws:
 *
 *   TypeError: this.config.url is not a function
 *
 * No live OpenAI credentials are required: the crash happens before any fetch.
 */

import { createOpenAI } from '../packages/openai/dist/index.js';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '../packages/provider-utils/dist/index.js';

const provider = createOpenAI({
  // A dummy key is enough. The reported failure occurs before request headers
  // are used for a network call.
  apiKey: 'issue-15306-dummy-key',
});

const originalModel = provider('gpt-4o-mini');
const ModelConstructor = originalModel.constructor;

if (typeof originalModel.config?.url !== 'function') {
  throw new Error('Setup failed: original OpenAI model has no config.url.');
}

const serialized = ModelConstructor[WORKFLOW_SERIALIZE](originalModel);
const serializedViaWorkflowBoundary = JSON.parse(JSON.stringify(serialized));
const deserializedModel = ModelConstructor[WORKFLOW_DESERIALIZE](
  serializedViaWorkflowBoundary,
);

console.log('Original provider:', originalModel.provider);
console.log('Serialized config keys:', Object.keys(serialized.config));
console.log(
  'Deserialized config.url type:',
  typeof deserializedModel.config?.url,
);

try {
  await deserializedModel.doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ],
  });
} catch (error) {
  if (error instanceof TypeError && /config\.url/.test(error.message)) {
    console.error('\nReproduced vercel/ai#15306:');
    console.error(error.stack ?? error);
    process.exit(1);
  }

  console.error('\nUnexpected error; the reported TypeError was not reached:');
  console.error(error);
  process.exit(2);
}

console.log(
  'The deserialized OpenAI model streamed without the reported config.url TypeError.',
);
