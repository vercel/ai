require('dotenv').config();
import { createSambaNova } from './sambanova-provider';

describe('SambaNova E2E Tests', () => {
  it('should generate text using the SambaNova API', async () => {
    console.log('SAMBANOVA_API_KEY', process.env.SAMBANOVA_API_KEY);
    // Ensure the SAMBANOVA_API_KEY is set in your environment variables
    const sambanova = createSambaNova({
      apiKey: process.env.SAMBANOVA_API_KEY,
    });

    // Replace 'Meta-Llama-3.3-70B-Instruct' with the model you wish to test
    const model = sambanova('Meta-Llama-3.3-70B-Instruct');

    const prompt = [
      { role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] },
    ];

    try {
      const response = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: prompt,
      });

      console.log('Generated text:', response.text);

      // Basic assertion to check if some text was generated
      expect(response.text).toBeDefined();
      expect(response.text.length).toBeGreaterThan(0);
    } catch (error) {
      console.error('Error generating text:', error);
      // Fail the test if an error occurs
      console.error('Failed to generate text due to an error.');
      throw error;
    }
  });
}); 