const overviewColumns = [
  ['Image Input', 'inputs.image'],
  ['Object Generation', 'objectGeneration'],
  ['Tool Usage', 'tools.usage'],
  ['Tool Streaming', 'tools.streaming'],
];

export function renderCapabilityTable(entries, { capability, columns }) {
  return renderTable(
    ['Model', ...columns.map(([heading]) => heading)],
    renderCapabilityRows(entries, capability, columns),
  );
}

export function replaceGeneratedTable(source, id, table) {
  const start = `{/* model-capabilities:${id}:start */}`;
  const end = `{/* model-capabilities:${id}:end */}`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (
    startIndex < 0 ||
    endIndex < startIndex ||
    source.indexOf(start, startIndex + start.length) !== -1 ||
    source.indexOf(end, endIndex + end.length) !== -1
  ) {
    throw new Error(`Missing or duplicate generated table markers: ${id}`);
  }
  return (
    source.slice(0, startIndex + start.length) +
    `\n\n${table}\n\n` +
    source.slice(endIndex)
  );
}

export function replaceOverviewRows(source, provider, entries) {
  const lines = source.split('\n');
  const indices = lines.flatMap((line, index) =>
    line.startsWith('|') && line.split('|')[1]?.trim() === provider
      ? [index]
      : [],
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
  while (headerIndex > 0 && lines[headerIndex - 1].startsWith('|'))
    headerIndex--;
  const expectedHeaders = [
    'Provider',
    'Model',
    ...overviewColumns.map(([heading]) => heading),
  ];
  const headers = lines[headerIndex]
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim());
  if (headers.join('|') !== expectedHeaders.join('|')) {
    throw new Error('Unexpected provider overview capability columns.');
  }
  const widths = lines[headerIndex + 1]
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim().length);
  const rows = renderCapabilityRows(entries, 'language', overviewColumns).map(
    row => renderRow([provider, ...row], widths),
  );
  lines.splice(indices[0], indices.length, ...rows);
  return lines.join('\n');
}

export function formatSupport(value) {
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

function renderCapabilityRows(entries, capability, columns) {
  return entries
    .filter(([, { capabilities }]) => capabilities[capability] != null)
    .map(([modelId, { capabilities }]) => [
      `\`${modelId}\``,
      ...columns.map(([, path, format = formatSupport]) =>
        format(readPath(capabilities[capability], path)),
      ),
    ]);
}

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function formatCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderRow(row, widths) {
  return `| ${row.map((cell, index) => formatCell(cell).padEnd(widths[index])).join(' | ')} |`;
}

function renderTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(
      3,
      header.length,
      ...rows.map(row => formatCell(row[index]).length),
    ),
  );
  return [
    renderRow(headers, widths),
    renderRow(
      widths.map(width => '-'.repeat(width)),
      widths,
    ),
    ...rows.map(row => renderRow(row, widths)),
  ].join('\n');
}
