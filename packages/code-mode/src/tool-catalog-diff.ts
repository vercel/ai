import type { ModelMessage, UserModelMessage } from 'ai';
import {
  renderCodeModeToolCatalog,
  renderCodeModeToolEntry,
} from './tool-prompt.js';
import type { CodeModeToolSet } from './types.js';

const providerOptionsKey = 'ai-sdk';
const catalogStateKey = 'codeModeCatalog';

export function buildCodeModeToolCatalogUpdate({
  tools,
  callerName,
  messages,
}: {
  tools: CodeModeToolSet;
  callerName: string;
  messages: ModelMessage[];
}): UserModelMessage | undefined {
  const previousEntries = readCatalogEntries({ callerName, messages });
  const currentEntries = Object.fromEntries(
    Object.entries(tools).map(toolEntry => [
      toolEntry[0],
      renderCodeModeToolEntry(toolEntry),
    ]),
  );

  if (previousEntries == null) {
    return createCatalogMessage({
      callerName,
      entries: currentEntries,
      content: buildCompleteCatalogMessage(tools),
    });
  }

  const addedOrUpdatedNames = Object.keys(currentEntries).filter(
    toolName => currentEntries[toolName] !== previousEntries[toolName],
  );
  const removedNames = Object.keys(previousEntries).filter(
    toolName => !Object.hasOwn(currentEntries, toolName),
  );

  if (addedOrUpdatedNames.length === 0 && removedNames.length === 0) {
    return undefined;
  }

  return createCatalogMessage({
    callerName,
    entries: currentEntries,
    content: buildCatalogChangesMessage({
      addedOrUpdatedTools: Object.fromEntries(
        addedOrUpdatedNames.map(toolName => [toolName, tools[toolName]!]),
      ),
      removedNames,
    }),
  });
}

function readCatalogEntries({
  callerName,
  messages,
}: {
  callerName: string;
  messages: ModelMessage[];
}): Record<string, string> | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== 'user') {
      continue;
    }

    const state =
      message.providerOptions?.[providerOptionsKey]?.[catalogStateKey];
    if (
      !isRecord(state) ||
      state.callerName !== callerName ||
      !isStringRecord(state.entries)
    ) {
      continue;
    }

    return state.entries;
  }

  return undefined;
}

function createCatalogMessage({
  callerName,
  entries,
  content,
}: {
  callerName: string;
  entries: Record<string, string>;
  content: string;
}): UserModelMessage {
  return {
    role: 'user',
    content,
    providerOptions: {
      [providerOptionsKey]: {
        [catalogStateKey]: {
          callerName,
          entries,
        },
      },
    },
  };
}

function buildCompleteCatalogMessage(tools: CodeModeToolSet): string {
  return [
    'Code mode capability update.',
    '',
    'This is the complete code mode capability catalog. Only the tools listed below are currently available through `tools`.',
    '',
    'Tools:',
    renderCodeModeToolCatalog(tools),
  ].join('\n');
}

function buildCatalogChangesMessage({
  addedOrUpdatedTools,
  removedNames,
}: {
  addedOrUpdatedTools: CodeModeToolSet;
  removedNames: string[];
}): string {
  const sections = [
    'Code mode capability update.',
    '',
    'Apply only these changes to the previous code mode capability catalog.',
  ];

  if (Object.keys(addedOrUpdatedTools).length > 0) {
    sections.push(
      '',
      'Added or updated tools:',
      renderCodeModeToolCatalog(addedOrUpdatedTools),
    );
  }

  if (removedNames.length > 0) {
    sections.push(
      '',
      'Removed tools:',
      ...removedNames.map(toolName => `- \`${toolName}\``),
    );
  }

  return sections.join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every(entry => typeof entry === 'string')
  );
}
