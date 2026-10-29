#!/usr/bin/env node

// Generate capability tables from the catalogs used by providers.
// --check verifies the checked-in docs without writing files or building packages.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
const unexpectedArguments = process.argv
  .slice(2)
  .filter(arg => arg !== '--check');
if (unexpectedArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unexpectedArguments.join(', ')}`);
}

const [{ openaiModelCatalog }, { anthropicModelCatalog }] = await Promise.all([
  loadCatalog('packages/openai/src/openai-model-catalog.ts'),
  loadCatalog('packages/anthropic/src/anthropic-model-catalog.ts'),
]);
const openaiEntries = Object.entries(openaiModelCatalog);
const anthropicEntries = Object.entries(anthropicModelCatalog);
const openaiLanguageRows = openaiEntries.filter(([, { capabilities }]) =>
  capabilities.language != null,
);
const tables = [
  {
    id: 'openai-language',
    capability: 'language',
    columns: [
      ['Image Input', 'inputs.image'],
      ['Audio Input', 'inputs.audio'],
      ['Object Generation', 'objectGeneration'],
      ['Tool Usage', 'tools.usage'],
    ],
  },
  {
    id: 'openai-language-request',
    capability: 'language',
    columns: [
      ['Reasoning', 'reasoning.support'],
      [
        'Reasoning Efforts',
        'reasoning.efforts',
        values => values == null
          ? 'Not declared'
          : values.map(value => `\`${value}\``).join(', '),
      ],
      ['Temperature', 'sampling.temperature', value => formatSupport(value ?? 'unknown')],
      ['Top P', 'sampling.topP', value => formatSupport(value ?? 'unknown')],
    ],
  },
  {
    id: 'openai-realtime',
    capability: 'realtime',
    columns: [
      ['Conversation', 'conversation', String],
      ['Transports', 'transports', values => values.join(', ')],
    ],
  },
  {
    id: 'openai-embedding',
    capability: 'embedding',
    columns: [
      ['Default Dimensions', 'defaultDimensions', String],
      ['Custom Dimensions', 'customDimensions'],
    ],
  },
  {
    id: 'openai-image',
    capability: 'image',
    columns: [
      [
        'Sizes',
        'sizes',
        value => Array.isArray(value) ? value.join(', ') : value.description,
      ],
    ],
  },
  {
    id: 'openai-transcription',
    capability: 'transcription',
    columns: [
      ['Transcription', 'transcription'],
      ['Streaming', 'streaming'],
      ['Duration', 'duration'],
      ['Segments', 'segments'],
      ['Language', 'language'],
    ],
  },
  {
    id: 'openai-speech-translation',
    capability: 'speechTranslation',
    columns: [
      ['Translated Audio', 'translatedAudio'],
      ['Translated Text', 'translatedText'],
      ['Source Transcript', 'sourceTranscript'],
    ],
  },
  {
    id: 'openai-speech',
    capability: 'speech',
    columns: [['Instructions', 'instructions']],
  },
];

const openaiProviderPath =
  'content/providers/01-ai-sdk-providers/03-openai.mdx';
const anthropicProviderPath =
  'content/providers/01-ai-sdk-providers/05-anthropic.mdx';
const overviewPath = 'content/docs/02-foundations/02-providers-and-models.mdx';
const [openaiProviderSource, anthropicProviderSource, overviewSource] =
  await Promise.all([
  readFile(new URL(openaiProviderPath, repoRoot), 'utf8'),
  readFile(new URL(anthropicProviderPath, repoRoot), 'utf8'),
  readFile(new URL(overviewPath, repoRoot), 'utf8'),
]);

let openaiProviderContent = openaiProviderSource;
for (const { id, capability, columns } of tables) {
  const rows = openaiEntries
    .filter(([, { capabilities }]) => capabilities[capability] != null)
    .map(([modelId, { capabilities }]) => [
      `\`${modelId}\``,
      ...columns.map(([, field, format = formatSupport]) =>
        format(readPath(capabilities[capability], field)),
      ),
    ]);
  openaiProviderContent = replaceGeneratedTable(
    openaiProviderContent,
    id,
    renderTable(['Model', ...columns.map(([heading]) => heading)], rows),
  );
}

const anthropicProviderContent = replaceGeneratedTable(
  anthropicProviderSource,
  'anthropic-language',
  renderCapabilityTable(anthropicEntries, 'language', [
    ['Image Input', 'inputs.image'],
    ['Object Generation', 'objectGeneration'],
    ['Tool Usage', 'tools.usage'],
    ['Computer Use', 'tools.computerUse'],
    ['Web Search', 'tools.webSearch'],
    ['Tool Search', 'tools.toolSearch'],
    ['Compaction', 'compaction'],
  ]),
);

const overviewContent = replaceOverviewRows(
  replaceOverviewRows(
    overviewSource,
    '[OpenAI](/providers/ai-sdk-providers/openai)',
    openaiLanguageRows,
  ),
  '[Anthropic](/providers/ai-sdk-providers/anthropic)',
  anthropicEntries,
);
let changedFiles = 0;
for (const [path, source, content] of [
  [openaiProviderPath, openaiProviderSource, openaiProviderContent],
  [anthropicProviderPath, anthropicProviderSource, anthropicProviderContent],
  [overviewPath, overviewSource, overviewContent],
]) {
  if (source === content) continue;
  changedFiles++;
  if (check) {
    console.error(`Outdated model capabilities: ${path}`);
  } else {
    await writeFile(new URL(path, repoRoot), content);
    console.log(`Updated ${path}`);
  }
}

if (check && changedFiles > 0) {
  console.error(
    'Run pnpm generate:model-capabilities-docs to update these tables.',
  );
  process.exitCode = 1;
} else {
  console.log('Model capability documentation is up to date.');
}

async function loadCatalog(path) {
  const compiled = new Map();
  const entryUrl = new URL(path, repoRoot);
  const sourceRoot = new URL('./', entryUrl);

  // Load the local TypeScript graph in memory. This works before package builds
  // and on the repository's minimum Node.js version without a custom TS loader.
  async function compile(url, ancestors = []) {
    if (ancestors.includes(url.href)) {
      throw new Error(`Circular catalog dependency: ${fileURLToPath(url)}`);
    }
    if (compiled.has(url.href)) return compiled.get(url.href);
    const source = await readFile(url, 'utf8');
    const { outputText, diagnostics } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    const errors = diagnostics?.filter(
      diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
    ) ?? [];
    if (errors.length > 0) {
      const messages = errors.map(error =>
        ts.flattenDiagnosticMessageText(error.messageText, '\n'),
      );
      throw new Error(`Cannot load ${fileURLToPath(url)}: ${messages.join('\n')}`);
    }

    const module = ts.createSourceFile(
      fileURLToPath(url), outputText, ts.ScriptTarget.Latest, true,
    );
    const replacements = [];
    for (const statement of module.statements) {
      if (
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      ) continue;
      const specifier = statement.moduleSpecifier;
      if (specifier == null) continue;
      const name = specifier.text;
      if (!name.startsWith('./') && !name.startsWith('../')) {
        throw new Error(`Catalog runtime imports must be local: ${name}`);
      }
      const dependency = new URL(name, url);
      if (!dependency.pathname.endsWith('.ts')) {
        dependency.pathname = dependency.pathname.endsWith('.js')
          ? dependency.pathname.slice(0, -3) + '.ts'
          : dependency.pathname + '.ts';
      }
      if (!dependency.href.startsWith(sourceRoot.href)) {
        throw new Error(`Catalog dependency is outside provider sources: ${name}`);
      }
      const dependencyUrl = await compile(dependency, [...ancestors, url.href]);
      replacements.push({
        start: specifier.getStart(module),
        end: specifier.getEnd(),
        value: JSON.stringify(dependencyUrl),
      });
    }
    rejectDynamicImports(module);
    let output = outputText;
    for (const { start, end, value } of replacements.reverse()) {
      output = output.slice(0, start) + value + output.slice(end);
    }
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
    compiled.set(url.href, moduleUrl);
    return moduleUrl;
  }

  return import(await compile(entryUrl));
}

function rejectDynamicImports(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    throw new Error('Catalog modules must use static imports.');
  }
  ts.forEachChild(node, rejectDynamicImports);
}

function formatSupport(value) {
  if (value === true) return '<Check />';
  if (value === false) return '<Cross />';
  if (value === 'unknown') return 'Unknown';
  if (
    value != null &&
    typeof value === 'object' &&
    typeof value.condition === 'string'
  ) {
    return `Conditional: ${value.condition}`;
  }
  throw new Error(`Invalid capability value: ${String(value)}`);
}

function formatCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderRow(row, widths) {
  return `| ${row.map((cell, index) => formatCell(cell).padEnd(widths[index])).join(' | ')} |`;
}

function renderTable(headers, rows) {
  const widths = headers.map((header, index) => Math.max(
    3,
    header.length,
    ...rows.map(row => formatCell(row[index]).length),
  ));
  return [
    renderRow(headers, widths),
    renderRow(widths.map(width => '-'.repeat(width)), widths),
    ...rows.map(row => renderRow(row, widths)),
  ].join('\n');
}

function renderCapabilityTable(entries, capability, columns) {
  const rows = entries
    .filter(([, { capabilities }]) => capabilities[capability] != null)
    .map(([modelId, { capabilities }]) => [
      `\`${modelId}\``,
      ...columns.map(([, field, format = formatSupport]) =>
        format(readPath(capabilities[capability], field)),
      ),
    ]);
  return renderTable(['Model', ...columns.map(([heading]) => heading)], rows);
}

function replaceGeneratedTable(source, id, table) {
  const start = `{/* model-capabilities:${id}:start */}`;
  const end = `{/* model-capabilities:${id}:end */}`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (
    startIndex < 0 || endIndex < startIndex ||
    source.indexOf(start, startIndex + start.length) !== -1 ||
    source.indexOf(end, endIndex + end.length) !== -1
  ) {
    throw new Error(`Missing or duplicate generated table markers: ${id}`);
  }
  return source.slice(0, startIndex + start.length) +
    `\n\n${table}\n\n` + source.slice(endIndex);
}

function replaceOverviewRows(source, provider, entries) {
  const lines = source.split('\n');
  const indices = lines.flatMap((line, index) =>
    line.startsWith('|') && line.split('|')[1]?.trim() === provider ? [index] : [],
  );
  if (
    indices.length === 0 ||
    indices.some((index, position) => index !== indices[0] + position)
  ) {
    throw new Error(
      `The provider overview must contain one contiguous group of ${provider} rows.`,
    );
  }
  let headerIndex = indices[0];
  while (headerIndex > 0 && lines[headerIndex - 1].startsWith('|')) headerIndex--;
  const expectedHeaders = [
    'Provider', 'Model', 'Image Input', 'Object Generation',
    'Tool Usage', 'Tool Streaming',
  ];
  const headers = lines[headerIndex]
    .split('|').slice(1, -1).map(cell => cell.trim());
  if (headers.join('|') !== expectedHeaders.join('|')) {
    throw new Error('Unexpected provider overview capability columns.');
  }
  const widths = lines[headerIndex + 1]
    .split('|').slice(1, -1).map(cell => cell.trim().length);
  const rows = entries.map(([modelId, { capabilities }]) => [
    provider,
    `\`${modelId}\``,
    ...[
      'inputs.image',
      'objectGeneration',
      'tools.usage',
      'tools.streaming',
    ].map(
      field => formatSupport(readPath(capabilities.language, field)),
    ),
  ]);
  lines.splice(indices[0], indices.length, ...rows.map(row => renderRow(row, widths)));
  return lines.join('\n');
}

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}
