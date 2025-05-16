
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
    const result = await generateText({
        model: google('gemini-2.5-flash-preview-04-17'),
        providerOptions: {
            google: {
                useCodeExecution: true,
            }
        },
        maxOutputTokens: 2048,
        prompt:
            'Calculate 20th fibonacci number. Then find the nearest palindrome to it.',
    });

    const parts = (result.response?.body as any)?.candidates?.[0]?.content?.parts;

    if (parts && Array.isArray(parts)) {
        parts.forEach((part, index) => {
            if ('text' in part) {
                console.log('\nType: Text');
                console.log('Content:', part.text);
            } else if ('executableCode' in part && part.executableCode) {
                console.log('\nType: Executable Code');
                console.log('Language:', part.executableCode.language);
                console.log('Code:\n', part.executableCode.code);
            } else if ('codeExecutionResult' in part && part.codeExecutionResult) {
                console.log('\nType: Code Execution Result');
                console.log('Outcome:', part.codeExecutionResult.outcome);
                console.log('Output:\n', part.codeExecutionResult.output);
            } else {
                console.log('\nType: Unknown');
                console.log(JSON.stringify(part, null, 2));
            }
        });
    } else {
        console.warn('Could not find parts');
    }
}

main().catch(console.error);