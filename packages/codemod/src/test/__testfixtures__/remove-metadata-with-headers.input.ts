// @ts-nocheck
import { generateObject, LanguageModelResponseMetadataWithHeaders } from 'ai';
import { LanguageModelResponseMetadataWithHeaders as MetadataWithHeaders } from 'other-pkg';

// Direct type usage
interface Config {
  metadata: LanguageModelResponseMetadataWithHeaders;
}

// Usage with generateObject result
async function processResult() {
  const result = await generateObject({
    model,
    schema: schema,
    prompt: 'test'
  });

  // Save response metadata to variable
  const metadata: LanguageModelResponseMetadataWithHeaders = result.response;

  // Destructured access
  const { headers, timestamp }: LanguageModelResponseMetadataWithHeaders = result.response;

  // Direct property access
  const responseData: LanguageModelResponseMetadataWithHeaders = {
    id: result.response.id,
    timestamp: result.response.timestamp,
    headers: result.response.headers
  };

  return { metadata, headers, responseData };
}

// Should NOT rename - different package
type OtherMetadata = MetadataWithHeaders;

// Should rename
const data: LanguageModelResponseMetadataWithHeaders = {
  id: 'test',
  timestamp: new Date(),
  headers: {}
};
