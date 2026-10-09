import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { generateText, isStepCount } from 'ai';
import { weatherTool } from '../../tools/weather-tool';
import { run } from '../../lib/run';

run(async () => {
  const googleVertex = createGoogleVertex({
    apiKey: process.env.GOOGLE_VERTEX_API_KEY,
  });

  const result = await generateText({
    model: googleVertex('gemini-3.5-flash'),
    prompt:
      'Use the weather tool to get the weather for London, then answer with the result.',
    tools: { weather: weatherTool },
    toolChoice: 'required',
    stopWhen: isStepCount(2),
  });

  console.log(result.text);
});
