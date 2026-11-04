import type {
  HarnessV1,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import type { ToolSet } from '@ai-sdk/provider-utils';

/**
 * Fills in the AI Gateway model on `stream-start` parts that do not report a
 * model.
 */
export function withGitHubCopilotGatewayModel<TOOLS extends ToolSet>({
  harness,
  gatewayModel,
}: {
  harness: HarnessV1<TOOLS>;
  gatewayModel: string;
}): HarnessV1<TOOLS> {
  /*
   * An upstream GitHub Copilot CLI limitation prevents reading the model
   * through the general ACP layer when the CLI runs with a BYOK provider, which
   * is how AI Gateway authentication is configured. In that mode, the CLI's
   * ACP `session/new` response carries neither a `model` config option nor
   * `models.currentModelId`, and no session update reports the model either.
   * The CLI also refuses to start without the `COPILOT_MODEL` provider
   * environment variable, so the configured AI Gateway model is the model the
   * session runs with.
   *
   * With GitHub authentication the CLI reports its model over ACP, and an
   * explicitly requested model is reported by the ACP bridge, so a
   * `stream-start` part without a `modelId` only occurs for AI Gateway
   * sessions without an explicit model.
   */
  const wrapEmit =
    (emit: (part: HarnessV1StreamPart) => void) =>
    (part: HarnessV1StreamPart) => {
      emit(
        part.type === 'stream-start' && !part.modelId
          ? { ...part, modelId: gatewayModel }
          : part,
      );
    };

  const wrapSession = (session: HarnessV1Session): HarnessV1Session =>
    new Proxy(session, {
      get(target, property, receiver) {
        if (property === 'doPromptTurn') {
          return (options: Parameters<HarnessV1Session['doPromptTurn']>[0]) =>
            target.doPromptTurn({ ...options, emit: wrapEmit(options.emit) });
        }
        if (property === 'doContinueTurn') {
          return (options: Parameters<HarnessV1Session['doContinueTurn']>[0]) =>
            target.doContinueTurn({
              ...options,
              emit: wrapEmit(options.emit),
            });
        }
        return Reflect.get(target, property, receiver);
      },
    });

  return new Proxy(harness, {
    get(target, property, receiver) {
      if (property === 'doStart') {
        return async (options: Parameters<HarnessV1<TOOLS>['doStart']>[0]) =>
          wrapSession(await target.doStart(options));
      }
      return Reflect.get(target, property, receiver);
    },
  });
}
