import { run } from '../../lib/run';

// Lists Fish Audio voice models, whose IDs are what you pass as `voice` (or
// `providerOptions.fishAudio.referenceId`) to `generateSpeech`.
//
// Voice listing is not part of the AI SDK speech model specification, so this
// calls the Fish Audio REST API directly rather than going through the provider.
// https://docs.fish.audio/api-reference/endpoint/openapi-v1/list-models

const PAGE_SIZE = 20;

// Set to true to list only your own uploaded models instead of the public
// library.
const SELF_ONLY = false;

// Optional filters. Set to undefined to disable.
const LANGUAGE: string | undefined = 'en';
const TAG: string | undefined = undefined;

type FishAudioModel = {
  _id: string;
  title: string;
  languages?: string[];
  tags?: string[];
  task_count?: number;
  state?: string;
  visibility?: string;
};

type FishAudioModelList = {
  total: number;
  items: FishAudioModel[];
  has_more: boolean;
};

run(async () => {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) {
    throw new Error('FISH_AUDIO_API_KEY is not set.');
  }

  const query = new URLSearchParams({
    page_size: String(PAGE_SIZE),
    // Most-used models first, which is a decent proxy for quality and
    // stability.
    sort_by: 'task_count',
  });
  if (SELF_ONLY) {
    query.set('self', 'true');
  }
  if (LANGUAGE != null) {
    query.set('language', LANGUAGE);
  }
  if (TAG != null) {
    query.set('tag', TAG);
  }

  const response = await fetch(`https://api.fish.audio/model?${query}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(
      `Fish Audio model list failed: ${response.status} ${await response.text()}`,
    );
  }

  const { total, items, has_more }: FishAudioModelList = await response.json();

  console.log(
    `Showing ${items.length} of ${total} models (has_more: ${has_more})\n`,
  );

  for (const model of items) {
    console.log(model.title);
    console.log(`  voice:     ${model._id}`);
    console.log(`  languages: ${model.languages?.join(', ') ?? 'unknown'}`);
    console.log(`  uses:      ${model.task_count?.toLocaleString() ?? 'n/a'}`);
    if (model.tags != null && model.tags.length > 0) {
      console.log(`  tags:      ${model.tags.slice(0, 6).join(', ')}`);
    }
    console.log();
  }

  console.log(
    'Pass one of the `voice` values above to generateSpeech, e.g.\n' +
      `  generateSpeech({ model: fishAudio.speech('s2.1-pro'), text: '...', voice: '${items[0]?._id ?? '<voice-id>'}' })`,
  );
});
