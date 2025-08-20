#!/usr/bin/env node

/**
 * Test script to verify ElevenLabs integration is properly set up.
 * This doesn't make actual API calls but verifies the module structure.
 */

import { elevenlabs } from '@ai-sdk/elevenlabs';
import 'dotenv/config';

async function main() {
  try {
    // Test that the provider is correctly imported
    console.log('✅ ElevenLabs provider imported successfully');
    
    // Test that the speech method exists
    const speechModel = elevenlabs.speech('eleven_multilingual_v2');
    console.log('✅ Speech model created:', speechModel.constructor.name);
    
    // Test that the model has the correct specification version
    console.log('✅ Specification version:', speechModel.specificationVersion);
    
    // Test available models
    const models = [
      'eleven_v3',
      'eleven_multilingual_v2',
      'eleven_flash_v2_5',
      'eleven_flash_v2',
      'eleven_turbo_v2_5',
      'eleven_turbo_v2',
      'eleven_monolingual_v1',
      'eleven_multilingual_v1',
    ];
    
    console.log('\n📦 Available ElevenLabs speech models:');
    models.forEach(modelId => {
      try {
        const model = elevenlabs.speech(modelId);
        console.log(`  ✅ ${modelId}`);
      } catch (error) {
        console.log(`  ❌ ${modelId}: Failed to create`);
      }
    });
    
    console.log('\n✨ ElevenLabs speech integration is properly configured!');
    console.log('\n📝 To use it, you need to:');
    console.log('  1. Set ELEVENLABS_API_KEY in your .env file');
    console.log('  2. Set ELEVENLABS_VOICE_ID in your .env file (or pass it directly)');
    console.log('  3. Run one of the example scripts like elevenlabs.ts');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();