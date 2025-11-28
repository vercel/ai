Allow users to review and modify tool inputs before execution

Current State (v6 Beta):
Tools can have needsApproval: true → user approves/denies with binary choice

LLM fills everything → User edits freely → Executes
Provide empty input schema → User fills from scratch → Executes
Some fields LLM-filled & locked, some editable, some empty

Current: run-tools-transformation.ts:271
toolResultsStreamController!.enqueue({
    type: 'tool-approval-request',
    approvalId: generateId(),
    toolCall, 
});

Current: process-ui-message-stream.ts:537-542
case 'tool-approval-request': {
    const toolInvocation = getToolInvocation(chunk.toolCallId);
    toolInvocation.state = 'approval-requested';
    toolInvocation.approval = { id: chunk.approvalId };
    write();
}

Current: chat.ts:432-450
addToolApprovalResponse({ id, approved, reason }) => {
    const updatePart = (part) => ({
        ...part,
        state: 'approval-responded',
        approval: { id, approved, reason },
    });
}

Current: convert-to-model-messages.ts:260-266
if (toolPart.approval?.approved != null) {
outputs.push({
    type: 'tool-approval-response',
    approvalId: toolPart.approval.id,
    approved: toolPart.approval.approved,
    reason: toolPart.approval.reason,
});
}

Current: collect-tool-approvals.ts:75-96
const approvalResponses = lastMessage.content.filter(
part => part.type === 'tool-approval-response'
);
return { approvedToolApprovals, deniedToolApprovals };

Current: generate-text.ts:351-352
const toolOutputs = await executeTools({
    toolCalls: approvedToolApprovals.map(a => a.toolCall),
});

Current: Model has no awareness that the user confirmed the tool

inputSchema: FlexibleSchema<INPUT>
addToolApprovalResponse({ approved: true, modifiedInput: {} })

Validate against input schema (Non-breaking response for client)
Validate again in backend then modify tool input part
    Critical: Must be able to track both the LLM input and the user updated input (No rewriting history)
    LLM should be able to understand user modifications (current limitation)
    Auditability
    Introduce 'user' type tool input and versioning system (parent tool id)

Deny llm tool call, create new input and execute 
'user' vs 'assistant' tool input parts


1. Error response for LLM's original call with reason = 'user edited…'
2. Create new tool input using the modified input that will be executed in streamText
Or:
1. Add modifiedInput to tool-approval-response
2. Remove the filter in convert-to-language-model-prompt.ts:21 (ai sdk) so LLM can see modification (Risk of context size, maybe determine a diff)
3.Execute with modified inout


v1:
type ToolApprovalResponse = {
    approvalId: string;
    approved: boolean;
    reason?: string;
    modifiedInput?: unknown;  // Added
};

addToolApprovalResponse({
    id,
    approved,
    reason,
    modifiedInput
});
Way to access tool schema for client side validation 


const inputToExecute = approval.modifiedInput ?? toolCall.input;
+ Re-validate before execution (security boundary) (If we do this for LLM generated tools in the first place)

Include metadata in tool results so the model knows the user modified the input:
{
    type: 'tool-result',
    output: result,
    metadata: { userModifiedInput: true, ... } // Rather than denying first to avoid using context
}
Must be opt in on tool config

Expose tool schemas so developers can validate modifiedInput on the client before sending


Outputs: Some tools have no execute function → user must provide via addToolOutput
Inputs: LLM always generates inputs → user can optionally modify via addToolApprovalResponse({ modifiedInput })

All UI framework chat hooks (via AbstractChat)

overrideInput instead of modifiedInput?

lg tool approval PR:
'''
Background
Tool execution approval (e.g. for human-in-the-loop) requires complex logic for checking and tool execution.

Summary
introduce needsApproval flag on Tool
introduce ToolApprovalRequest part on assistant model message
introduce ToolApprovalResponse part on tool model message
introduce ToolApprovalRequestOutput
add execution-denied tool output to language model v3 prompt specification
add tool approval logic to generateText and streamText
extract executeToolCall function
add UIMessage and UI message chunk support for tool approvals
add addToolApprovalResponse function to Chat
add ChatAddToolApproveResponseFunction type
update conversion and validation function for UI messages, model messages, and language model emssages
Missing tool approvals are not handled in any special way, because some models may support tool calls without results. If the used model requires tool results for tool calls, the corresponding API will throw errors.
'''

