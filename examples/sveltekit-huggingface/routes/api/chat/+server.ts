import { HfInference } from '@huggingface/inference';
import { HuggingFaceStream, StreamingTextResponse } from 'ai';

// Create a new Hugging Face Inference instance
const Hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// IMPORTANT! Set the runtime to edge
// export const runtime = 'edge';

// Build a prompt from the messages
// Note: this is specific to the OpenAssistant model we're using
// @see https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5#prompting
function buildOpenAssistantPrompt(
	messages: { content: string; role: 'system' | 'user' | 'assistant' }[]
) {
	return (
		messages
			.map(({ content, role }) => {
				if (role === 'user') {
					return `<|prompter|>${content}<|endoftext|>`;
				} else {
					return `<|assistant|>${content}<|endoftext|>`;
				}
			})
			.join('') + '<|assistant|>'
	);
}

export const POST = (async ({ request }) => {
	// Extract the `prompt` from the body of the request
	const { messages } = await request.json();

	const response = Hf.textGenerationStream({
		model: 'OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5',
		inputs: buildOpenAssistantPrompt(messages),
		parameters: {
			max_new_tokens: 200,
			// @ts-ignore (this is a valid parameter specifically in OpenAssistant models)
			typical_p: 0.2,
			repetition_penalty: 1,
			truncate: 1000,
			return_full_text: false
		}
	});

	// Convert the response into a friendly text-stream
	const stream = HuggingFaceStream(response);

	// Respond with the stream
	return new StreamingTextResponse(stream);
}) satisfies RequestHandler;
