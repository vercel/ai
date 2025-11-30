import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ApplyPatchOperation,
  WorkspaceEditor,
} from '../lib/apply-patch-file-editor';
import { run } from '../lib/run';

run(async () => {
  const workspaceRoot = path.join(__dirname, '../output');
  await fs.mkdir(workspaceRoot, { recursive: true });

  const editor = new WorkspaceEditor(workspaceRoot);

  try {
    const result1 = await generateText({
      model: openai.responses('gpt-5.1'),
      prompt: `Create a markdown file with a shopping checklist of 5 entries.`,
      tools: {
        apply_patch: openai.tools.applyPatch(),
      },
    });

    console.log('\n=== Model Response ===');
    console.dir(result1, { depth: Infinity });

    // Extract and apply patch operations
    const patchResults: Array<{
      toolCallId: string;
      result: { status: 'completed' | 'failed'; output?: string };
    }> = [];
    let createdFilePath: string | null = null;

    for (const toolCall of result1.toolCalls) {
      if (toolCall.toolName === 'apply_patch') {
        const input = toolCall.input as {
          callId: string;
          operation: ApplyPatchOperation;
        };

        let result: { status: 'completed' | 'failed'; output?: string };
        switch (input.operation.type) {
          case 'create_file':
            result = await editor.createFile(input.operation);
            // Track the created file path
            if (result.status === 'completed') {
              createdFilePath = input.operation.path;
            }
            break;
          case 'update_file':
            result = await editor.updateFile(input.operation);
            break;
          case 'delete_file':
            result = await editor.deleteFile(input.operation);
            break;
        }

        patchResults.push({
          toolCallId: toolCall.toolCallId,
          result,
        });

        console.log(
          `Applied ${input.operation.type} to ${input.operation.path}: ${result.status}`,
        );
      }
    }

    // Step 2: Send results back and ask for an update
    if (patchResults.length > 0 && createdFilePath) {
      // Read the created file using the actual path from the patch operation
      const fileContent = await fs.readFile(
        path.join(workspaceRoot, createdFilePath),
        'utf8',
      );
      console.log(`Current ${createdFilePath} content:`);
      console.log(fileContent);

      console.log('\n=== Step 2: Reading file and updating it ===\n');
      // Send patch results back and ask for update
      // We use previousResponseId to pass previous message context and append the tool results object
      const result2 = await generateText({
        model: openai.responses('gpt-5.1'),
        messages: [
          {
            role: 'tool' as const,
            content: patchResults.map(pr => ({
              type: 'tool-result' as const,
              toolCallId: pr.toolCallId,
              toolName: 'apply_patch' as const,
              output: {
                type: 'json' as const,
                value: pr.result,
              },
            })),
          },
          {
            role: 'user' as const,
            content: `The user has the following file:\n\n<BEGIN_FILES>\n===== ${createdFilePath}\n${fileContent}\n<END_FILES>\n\nCheck off the last two items from the file.`,
          },
        ],
        tools: {
          apply_patch: openai.tools.applyPatch(),
        },
        providerOptions: {
          openai: {
            previousResponseId: result1.providerMetadata?.openai
              .responseId as string,
          } satisfies OpenAIResponsesProviderOptions,
        },
      });

      console.log('\n=== Model Response ===');
      console.dir(result2, { depth: Infinity });

      // Apply new patch operations
      const patchResults2: Array<{
        toolCallId: string;
        result: { status: 'completed' | 'failed'; output?: string };
      }> = [];

      for (const toolCall of result2.toolCalls) {
        if (toolCall.toolName === 'apply_patch') {
          const input = toolCall.input as {
            callId: string;
            operation: ApplyPatchOperation;
          };

          let result: { status: 'completed' | 'failed'; output?: string };
          switch (input.operation.type) {
            case 'create_file':
              result = await editor.createFile(input.operation);
              break;
            case 'update_file':
              result = await editor.updateFile(input.operation);
              break;
            case 'delete_file':
              result = await editor.deleteFile(input.operation);
              break;
          }

          patchResults2.push({
            toolCallId: toolCall.toolCallId,
            result,
          });

          console.log(
            `Applied ${input.operation.type} to ${input.operation.path}: ${result.status}`,
          );
        }
      }

      console.log(`\n=== Final ${createdFilePath} content ===\n`);
      const finalContent = await fs.readFile(
        path.join(workspaceRoot, createdFilePath),
        'utf8',
      );
      console.log(finalContent);
    }
  } catch (error) {
    console.error('Error:', error);
  }
  console.log(`\nFiles saved in: ${workspaceRoot}`);
});
