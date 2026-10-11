import {
  experimental_getToolCaller,
  type ToolSet,
  type InferToolSetContext,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import {
  DIRECT_TOOL_CALL,
  type ResolvedToolCallers,
} from '../generate-text/tool-caller-configuration';
import { resolveToolDescription } from '../prompt/prepare-tools';
import { getOwn } from '../util/get-own';
import {
  getToolSearchFunction,
  getToolSearchMaxResults,
  isToolSearch,
} from './tool-search';

/** Create discovery state for one generation, never for a shared tool instance. */
export function createToolSearchState({
  tools,
  toolCallers,
}: {
  tools: ToolSet | undefined;
  toolCallers: ResolvedToolCallers | undefined;
}): (
  activeTools: ToolSet | undefined,
  options?: {
    toolsContext?: InferToolSetContext<ToolSet>;
    experimental_sandbox?: SandboxSession;
  },
) => ToolSet | undefined {
  const searchTools = Object.entries(tools ?? {}).filter(
    ([, tool]) => tool.deferLoading || isToolSearch(tool),
  );
  if (searchTools.length === 0) {
    return activeTools => activeTools;
  }

  const discovered = new Set<string>();
  // An omitted entry permits direct calls; an explicit empty list permits none.
  const getCallers = (name: string) =>
    getOwn(toolCallers, name) ?? [DIRECT_TOOL_CALL];

  for (const [name, tool] of searchTools) {
    const callers = getCallers(name);
    if (
      callers.some(name => {
        if (name === DIRECT_TOOL_CALL) {
          return false;
        }
        const caller = experimental_getToolCaller(tools?.[name]);
        return caller?.type !== 'local' || caller.prepareModelMessage == null;
      }) ||
      (isToolSearch(tool) && tool.deferLoading)
    ) {
      throw new InvalidArgumentError({
        parameter: 'tools',
        value: name,
        message: `tool "${name}" must be callable directly or through code mode with toolDiscovery: 'conversation'. The search tool itself must not defer loading.`,
      });
    }
  }

  return (activeTools, { toolsContext = {}, experimental_sandbox } = {}) => {
    if (activeTools == null) {
      return undefined;
    }

    // Snapshot eligibility before binding callers. Newly discovered tools are
    // intentionally absent from this step's execution bindings and catalog.
    const entries = Object.entries(activeTools);
    return Object.fromEntries(
      entries
        .filter(([name, tool]) => !tool.deferLoading || discovered.has(name))
        .map(([searchName, tool]) => {
          if (!isToolSearch(tool)) {
            return [searchName, tool];
          }

          const callers = getCallers(searchName).filter(
            name =>
              name === DIRECT_TOOL_CALL || Object.hasOwn(activeTools, name),
          );
          const candidates = entries.filter(
            ([name, candidate]) =>
              candidate.deferLoading &&
              !isToolSearch(candidate) &&
              callers.some(caller => getCallers(name).includes(caller)),
          );

          return [
            searchName,
            {
              ...tool,
              execute: async ({ query }: { query: string }) => {
                const availableTools = candidates.map(([name, candidate]) => {
                  const description = resolveToolDescription({
                    tool: candidate,
                    toolName: name,
                    toolsContext,
                    experimental_sandbox,
                  });
                  return {
                    name,
                    ...(description == null ? {} : { description }),
                  };
                });
                const toolsByName = new Map(
                  availableTools.map(tool => [tool.name, tool]),
                );
                const customSearch = getToolSearchFunction(tool);
                const terms = [...new Set(tokenize(query))];
                const rankedNames = customSearch
                  ? await customSearch({
                      query,
                      tools: availableTools.map(tool => ({ ...tool })),
                    })
                  : availableTools
                      .map(({ name, description }) => {
                        const nameTerms = tokenize(name);
                        const descriptionTerms = tokenize(description ?? '');
                        const score = terms.reduce(
                          (score, term) =>
                            score +
                            (nameTerms.includes(term) ? 2 : 0) +
                            (descriptionTerms.includes(term) ? 1 : 0),
                          0,
                        );
                        return { name, score };
                      })
                      .filter(match => match.score > 0)
                      .sort((a, b) => b.score - a.score)
                      .map(match => match.name);
                const matches = [...new Set(rankedNames)]
                  .flatMap(name => {
                    const match = toolsByName.get(name);
                    return match == null ? [] : [match];
                  })
                  .slice(0, getToolSearchMaxResults(tool));

                for (const { name } of matches) {
                  discovered.add(name);
                }

                return { tools: matches };
              },
            },
          ];
        }),
    );
  };
}

function tokenize(text: string): string[] {
  return (
    text
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}
