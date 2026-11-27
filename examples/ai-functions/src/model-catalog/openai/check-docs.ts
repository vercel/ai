import { display, type Entry, type Reporter } from './audit';

function section(markdown: string, heading: string) {
  return (
    markdown.match(
      new RegExp(
        `^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`,
        'm',
      ),
    )?.[1] ?? ''
  );
}

function declarations(markdown: string, kind: 'features' | 'tools') {
  const entries = new Map<string, boolean>();
  for (const [prefix, supported] of [
    ['Supported', true],
    ['Unsupported', false],
  ] as const) {
    for (const match of section(markdown, `${prefix} ${kind}`).matchAll(
      /^- `?([\w_]+)`?\s*$/gm,
    )) {
      if (entries.has(match[1]) && entries.get(match[1]) !== supported)
        throw new Error(`Conflicting ${kind}: ${match[1]}`);
      entries.set(match[1], supported);
    }
  }
  return entries;
}

export function parseModelPage(modelId: string, markdown: string) {
  const documentedId = markdown.match(/^Model ID: `([^`]+)`/m)?.[1];
  if (documentedId !== modelId)
    throw new Error(
      `Expected Model ID ${modelId}; found ${documentedId ?? 'no model metadata'}`,
    );
  return {
    features: declarations(markdown, 'features'),
    tools: declarations(markdown, 'tools'),
    inputs: markdown
      .match(/^- Input modalities: (.+)$/m)?.[1]
      .split(',')
      .map(value => value.trim()),
    reasoning: /^- Reasoning token support\s*$/m.test(
      section(markdown, 'Model details'),
    )
      ? true
      : undefined,
    endpoints: new Map(
      [
        ...section(markdown, 'Endpoints').matchAll(
          /^\|[^|]+\|\s*`(v1\/[^`]+)`\s*\|\s*(Supported|Not supported)\s*\|/gm,
        ),
      ].map(match => [match[1], match[2] === 'Supported']),
    ),
    efforts: markdown
      .match(/^- Reasoning efforts: (.+)$/m)?.[1]
      .replaceAll('`', '')
      .split(',')
      .map(value => value.trim()),
    rejectsNone: /rejects requests that set reasoning effort to `none`/i.test(
      markdown,
    ),
  };
}

const features: Record<string, string> = {
  structured_outputs: 'language.objectGeneration',
  function_calling: 'language.tools.usage',
  image_input: 'language.inputs.image',
  audio_input: 'language.inputs.audio',
  reasoning: 'language.reasoning.support',
  async_tools: 'language.tools.async',
  // These paths deliberately remain missing until the catalog declares them.
  streaming: 'language.streaming',
  predicted_outputs: 'language.prediction',
  fine_tuning: 'language.fineTuning',
  prompt_caching: 'language.promptCache.support',
  file_uploads: 'language.fileUploads',
};
const tools: Record<string, string> = {
  function_calling: 'language.tools.usage',
  web_search: 'language.tools.webSearch',
  file_search: 'language.tools.fileSearch',
  image_generation: 'language.tools.imageGeneration',
  code_interpreter: 'language.tools.codeInterpreter',
  hosted_shell: 'language.tools.hostedShell',
  apply_patch: 'language.tools.applyPatch',
  skills: 'language.tools.skills',
  computer_use: 'language.tools.computerUse',
  mcp: 'language.tools.mcp',
  tool_search: 'language.tools.toolSearch',
};

export function compareModelPage(
  modelId: string,
  entry: Entry,
  markdown: string,
  report: Reporter,
): Set<string> {
  const page = parseModelPage(modelId, markdown);
  const covered = new Set<string>();
  const get = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (value, key) =>
          value != null && typeof value === 'object'
            ? (value as Record<string, unknown>)[key]
            : undefined,
        entry.capabilities,
      );
  const compare = (path: string, actual: unknown, name = path) => {
    const expected = get(path);
    covered.add(path);
    report(
      expected === undefined
        ? 'MISSING'
        : actual === undefined ||
            expected === 'unknown' ||
            (typeof expected === 'object' &&
              expected != null &&
              !Array.isArray(expected))
          ? 'UNVERIFIED'
          : JSON.stringify(expected) === JSON.stringify(actual)
            ? 'MATCH'
            : 'MISMATCH',
      modelId,
      `docs/${name}`,
      `catalog=${display(expected)}, OpenAI docs=${display(actual)}`,
    );
  };
  for (const [name, actual] of page.features) {
    const path = features[name] ?? tools[name];
    if (path && (entry.capabilities.language || !path.startsWith('language.')))
      compare(path, actual, `feature/${name}`);
    else
      report(
        'MISSING',
        modelId,
        `docs/feature/${name}`,
        `catalog=not declared, OpenAI docs=${display(actual)}`,
      );
  }
  for (const [name, actual] of page.tools) {
    const path = tools[name];
    if (path && entry.capabilities.language)
      compare(path, actual, `tool/${name}`);
    else
      report(
        'MISSING',
        modelId,
        `docs/tool/${name}`,
        `catalog=not declared, OpenAI docs=${display(actual)}`,
      );
  }
  if (entry.capabilities.language) {
    for (const kind of ['image', 'audio'] as const)
      compare(`language.inputs.${kind}`, page.inputs?.includes(kind));
    compare(
      'language.reasoning.support',
      page.reasoning ?? page.features.get('reasoning'),
    );
    if (page.efforts) compare('language.reasoning.efforts', page.efforts);
    if (page.rejectsNone) {
      const expected =
        entry.capabilities.language.reasoning.efforts?.includes('none');
      report(
        expected == null
          ? 'UNVERIFIED'
          : expected === false
            ? 'MATCH'
            : 'MISMATCH',
        modelId,
        'docs/reasoningEfforts/none',
        `catalog=${display(expected)}, OpenAI docs=unsupported`,
      );
    }
  }
  for (const [operation, route] of Object.entries({
    language: 'v1/responses',
    embedding: 'v1/embeddings',
    image: 'v1/images/generations',
    speech: 'v1/audio/speech',
  })) {
    if (operation in entry.capabilities)
      report(
        page.endpoints.get(route) == null
          ? 'UNVERIFIED'
          : page.endpoints.get(route)
            ? 'MATCH'
            : 'MISMATCH',
        modelId,
        `docs/${operation} endpoint`,
        `catalog=supported, OpenAI docs=${display(page.endpoints.get(route))}`,
      );
  }
  if (entry.capabilities.image)
    compare('image.fileInput', page.endpoints.get('v1/images/edits'));
  if (entry.capabilities.transcription)
    compare(
      'transcription.transcription',
      page.endpoints.get('v1/audio/transcriptions'),
    );
  if (entry.capabilities.realtime || entry.capabilities.speechTranslation) {
    const route = entry.capabilities.speechTranslation
      ? 'v1/realtime/translations'
      : entry.requestConfig?.realtime?.api === 'live'
        ? 'v1/live/sessions'
        : 'v1/realtime';
    report(
      page.endpoints.get(route) == null
        ? 'UNVERIFIED'
        : page.endpoints.get(route)
          ? 'MATCH'
          : 'MISMATCH',
      modelId,
      `docs/${route}`,
      `catalog=supported, OpenAI docs=${display(page.endpoints.get(route))}`,
    );
  }
  return covered;
}

export async function checkDocs(
  modelId: string,
  entry: Entry,
  report: Reporter,
): Promise<Set<string>> {
  const url = `https://developers.openai.com/api/docs/models/${encodeURIComponent(modelId)}.md`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return compareModelPage(modelId, entry, await response.text(), report);
  } catch (error) {
    report('UNVERIFIED', modelId, 'docs', String(error));
    return new Set();
  }
}
