import { ToolInvocation } from './types';

export function extractMaxToolInvocationStep(
  toolInvocations: ToolInvocation[] | undefined,
): number | undefined {
  return toolInvocations?.reduce((max, toolInvocation) => {
    return Math.max(max, toolInvocation.step ?? 0);
  }, 0);
}
