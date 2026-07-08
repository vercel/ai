import type { AcpRpcHandlerRegistration } from "@ai-sdk/harness-acp";

export type CursorAcpExtensionSettings = {
  /**
   * Called when Cursor sends `cursor/ask_question` over ACP.
   * Return a user answer string, or throw to cancel the question flow.
   */
  readonly onAskQuestion?: (question: string) => Promise<string>;
};

export function createCursorAcpExtensions(
  settings: CursorAcpExtensionSettings = {},
): AcpRpcHandlerRegistration {
  return (rpc) => {
    const offAskQuestion = rpc.onRequest("cursor/ask_question", async (params) => {
      const request = params as {
        questions?: Array<{ id?: string; prompt?: string; options?: Array<{ label?: string }> }>;
      };
      const firstQuestion = request.questions?.[0];
      const questionText =
        firstQuestion?.prompt ??
        firstQuestion?.options?.map((option) => option.label).join(", ") ??
        "Need user input";

      if (settings.onAskQuestion) {
        await settings.onAskQuestion(questionText);
      }

      return { outcome: { outcome: "cancelled" } };
    });

    const offCreatePlan = rpc.onRequest("cursor/create_plan", async () => ({
      outcome: { outcome: "accepted" },
    }));

    return () => {
      offAskQuestion();
      offCreatePlan();
    };
  };
}