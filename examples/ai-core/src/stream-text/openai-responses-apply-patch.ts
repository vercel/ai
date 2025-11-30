import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { streamText } from 'ai';
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
    const result1 = await streamText({
      model: openai.responses('gpt-5.1'),
      prompt: `Create a markdown file with a shopping checklist of 5 entries.`,
      tools: {
        apply_patch: openai.tools.applyPatch(),
      },
    });

    process.stdout.write('\n=== Model Response (Streaming) ===\n');
    for await (const part of result1.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          process.stdout.write(part.text);
          break;
        }

        case 'tool-call': {
          process.stdout.write(
            `\n\nTool call: '${part.toolName}'\nInput: ${JSON.stringify(part.input, null, 2)}\n`,
          );
          break;
        }

        case 'tool-result': {
          process.stdout.write(
            `\nTool result: '${part.toolName}'\nOutput: ${JSON.stringify(part.output, null, 2)}\n`,
          );
          break;
        }

        case 'error': {
          console.error('\n\nCode execution error:', part.error);
          break;
        }
      }
    }
    process.stdout.write('\n\n');

    // Get tool calls and provider metadata (these automatically consume the stream)
    const toolCalls1 = await result1.toolCalls;
    const providerMetadata1 = await result1.providerMetadata;

    // Extract and apply patch operations
    const patchResults: Array<{
      toolCallId: string;
      result: { status: 'completed' | 'failed'; output?: string };
    }> = [];
    let createdFilePath: string | null = null;

    for (const toolCall of toolCalls1) {
      if (toolCall.toolName === 'apply_patch') {
        const input = toolCall.input as {
          callId: string;
          operation: ApplyPatchOperation;
        };

        let result: { status: 'completed' | 'failed'; output?: string };
        switch (input.operation.type) {
          case 'create_file':
            result = await editor.createFile(input.operation);
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
      console.log(`\nCurrent ${createdFilePath} content:`);
      console.log(fileContent);

      console.log('\n=== Step 2: Reading file and updating it ===\n');

      const result2 = streamText({
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
            previousResponseId: providerMetadata1?.openai.responseId as string,
          } satisfies OpenAIResponsesProviderOptions,
        },
      });

      // Stream the text response
      process.stdout.write('=== Model Response (Streaming) ===\n');
      for await (const textPart of result2.textStream) {
        process.stdout.write(textPart);
      }
      process.stdout.write('\n\n');

      // Get tool calls (automatically consumes the stream)
      const toolCalls2 = await result2.toolCalls;

      // Apply new patch operations
      const patchResults2: Array<{
        toolCallId: string;
        result: { status: 'completed' | 'failed'; output?: string };
      }> = [];

      for (const toolCall of toolCalls2) {
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
