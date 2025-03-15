import { createOpenAI, openai } from '@ai-sdk/openai';
import { Sandbox } from '@e2b/desktop';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const desktop = await Sandbox.create({
    resolution: [1200, 800],
    timeoutMs: 1000 * 60 * 1, // 1 minute
  });

  try {
    await desktop.stream.start();

    console.log(desktop.stream.getUrl());

    const result = await generateText({
      model: openai.responses('computer-use-preview-2025-02-04'),
      // prompt: 'Describe the current screen content.',
      prompt: 'open a browser and go to https://www.google.com',
      tools: {
        computer_use_preview: openai.tools.computerUsePreview({
          displayWidth: 1200,
          displayHeight: 800,
          environment: 'linux',
          execute: async ({ action, pendingSafetyChecks }) => {
            console.log(action);

            switch (action.type) {
              case 'move': {
                await desktop.moveMouse(action.x, action.y);
                break;
              }
              case 'click': {
                await desktop.moveMouse(action.x, action.y);
                switch (action.button) {
                  case 'left':
                    await desktop.leftClick();
                    break;
                  case 'right':
                    await desktop.rightClick();
                    break;
                  default: {
                    throw new Error(`Unsupported button: ${action.button}`);
                  }
                }
                break;
              }
              case 'double_click': {
                await desktop.moveMouse(action.x, action.y);
                await desktop.doubleClick();
                break;
              }
              case 'scroll': {
                // TODO implement
                break;
              }
              case 'drag': {
                // TODO implement
                break;
              }
              case 'type': {
                await desktop.write(action.text);
                break;
              }
              case 'keypress': {
                for (const key of action.keys) {
                  await desktop.press(key);
                }
                break;
              }
              case 'wait': {
                // TODO move delay to provider utils
                // 3s wait (per definition of the tool)
                await new Promise(resolve => setTimeout(resolve, 3000));
                break;
              }
              case 'screenshot': {
                break; // screenshot is always taken
              }
              default: {
                const exhaustiveCheck: never = action;
                throw new Error(`Unsupported action: ${exhaustiveCheck}`);
              }
            }

            return {
              screenshot: await desktop.screenshot(),
              acknowledgedSafetyChecks: pendingSafetyChecks,
            };
          },
        }),
      },
      maxSteps: 5,
      onStepFinish({ response }) {
        console.log('Response:', JSON.stringify(response.body, null, 2));
      },
    });

    console.log('DONE');

    // console.log(result.text);
    // console.log();
    // console.log('Finish reason:', result.finishReason);
    // console.log('Usage:', result.usage);

    // console.log(JSON.stringify(result.steps, null, 2));

    console.log('Request:', JSON.stringify(result.request.body, null, 2));
    console.log('Response:', JSON.stringify(result.response.body, null, 2));
  } finally {
    await desktop.stream.stop();
  }
}

main().catch(console.error);
