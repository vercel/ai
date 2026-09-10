'use server';

import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

// ⚠️ TEMPORARY: Hardcode the key to prove it works.
// Replace the text below with your real key starting with 'gsk_'
const groq = createGroq({
  apiKey: '', 
});

// Define types
type DataPoint = {
  name: string;
  value: number;
};

type ActionResponse = {
  success: boolean;
  data: DataPoint[];
  type: string;
  errorMessage?: string;
};

export async function submitUserMessage(input: string): Promise<ActionResponse> {
  console.log("🚀 STARTING REQUEST for:", input); // Look for this in your terminal

  try {
    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system: `You are a data visualization expert.
      Instructions:
      1. Generate a valid JSON dataset.
      2. The JSON must be an array of objects with 'name' (string) and 'value' (number).
      3. Return ONLY the JSON array.`,
      prompt: input,
    });

    console.log("✅ AI REPLIED:", text); // Check if AI replied

    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("AI did not return a valid array.");
    }

    const cleanJson = text.substring(jsonStart, jsonEnd + 1);
    const data = JSON.parse(cleanJson) as DataPoint[];
    const type = input.toLowerCase().includes('bar') ? 'bar' : 'area';

    return { success: true, data: data, type: type };

  } catch (error: unknown) {
    // PRINT THE REAL ERROR IN TERMINAL
    console.error("❌ CRITICAL ERROR:", error);
    
    let message = "Unknown error";
    if (error instanceof Error) message = error.message;
    else if (typeof error === "string") message = error;

    return { 
      success: false, 
      data: [], 
      type: 'error', 
      errorMessage: message
    };
  }
}