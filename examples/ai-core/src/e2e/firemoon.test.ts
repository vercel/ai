import { expect } from 'vitest';
import { createFiremoon, FiremoonErrorData } from '@ai-sdk/firemoon';
import { APICallError } from '@ai-sdk/provider';
import {
    createFeatureTestSuite,
    createImageModelWithCapabilities,
} from './feature-test-suite';
import 'dotenv/config';

createFeatureTestSuite({
    name: 'Firemoon',
    models: {
        invalidImageModel: createFiremoon({ apiKey: 'test' }).image(
            'no-such-model',
        ),
        imageModels: [
            createImageModelWithCapabilities(
                createFiremoon({
                    apiKey: process.env.FIREMOON_API_KEY || 'test-key',
                }).image('flux/dev'),
            ),
            createImageModelWithCapabilities(
                createFiremoon({
                    apiKey: process.env.FIREMOON_API_KEY || 'test-key',
                }).image('kling/kling-2-1-master'),
            ),
        ],
    },
    timeout: 60000, // Image generation can take longer
    customAssertions: {
        errorValidator: (error: APICallError) => {
            expect((error.data as FiremoonErrorData)?.message).toMatch(
                /error|invalid/i,
            );
        },
    },
})();
