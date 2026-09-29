import { describe, expect, it, jest } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';

import { describeError } from '@/ai/client';
import { OpenAIError } from '@/ai/openai';

// client.ts reaches the SQLite-backed settings and photo storage, which need native modules
jest.mock('@/settings/settings', () => ({ loadSettings: jest.fn() }));
jest.mock('@/photos/storage', () => ({}));

describe('describeError', () => {
  it('passes provider errors through unchanged', () => {
    const e = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }, undefined, new Headers());
    expect(describeError(e)).toBe(e.message);
    expect(describeError(new OpenAIError(401, 'Invalid API key'))).toBe('Invalid API key');
    expect(describeError('boom')).toBe('boom');
  });
});
