import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: alibaba('qwen4-max'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe what happens in this video.' },
          {
            type: 'file',
            mediaType: 'video/mp4',
            data: new URL(
              'https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/en-US/20250415/nvwkcj/test.mp4',
            ),
          },
        ],
      },
    ],
  });

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Token usage:', result.usage);
});
