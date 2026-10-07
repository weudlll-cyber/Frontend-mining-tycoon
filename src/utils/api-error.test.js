/**
File: src/utils/api-error.test.js
Purpose: Verify backend error payload normalization across FastAPI error shapes.
*/

import { describe, expect, it } from 'vitest';
import { createApiError, extractApiError, readApiError } from './api-error.js';

describe('extractApiError', () => {
  it('reads plain string detail', () => {
    expect(extractApiError({ detail: ' Round is not running. ' }, 'x')).toEqual(
      { message: 'Round is not running.', code: null }
    );
  });

  it('reads structured detail with code and message', () => {
    expect(
      extractApiError(
        {
          detail: {
            code: 'PASSWORD_RESET_DISABLED',
            message: 'Password reset is not available.',
          },
        },
        'fallback'
      )
    ).toEqual({
      message: 'Password reset is not available.',
      code: 'PASSWORD_RESET_DISABLED',
    });
  });

  it('reads top-level code/message envelopes', () => {
    expect(
      extractApiError({
        code: 'NO_ACTIVE_SESSION',
        message: 'Start a session.',
      })
    ).toEqual({ message: 'Start a session.', code: 'NO_ACTIVE_SESSION' });
  });

  it('joins 422 validation messages and strips pydantic prefixes', () => {
    expect(
      extractApiError(
        {
          detail: [
            {
              loc: ['body', 'name'],
              msg: 'Value error, Name may only contain letters, digits, spaces and _-.',
            },
            {
              loc: ['body', 'name'],
              msg: 'String should have at most 24 characters',
            },
            'raw',
          ],
        },
        'fallback'
      ).message
    ).toBe(
      'Name may only contain letters, digits, spaces and _-.; String should have at most 24 characters; raw'
    );
  });

  it('falls back when the payload has nothing readable', () => {
    expect(extractApiError(null, 'fallback')).toEqual({
      message: 'fallback',
      code: null,
    });
    expect(extractApiError({ detail: [] }, 'fallback').message).toBe(
      'fallback'
    );
    expect(extractApiError({ detail: 42 }, 'fallback').message).toBe(
      'fallback'
    );
  });
});

describe('readApiError / createApiError', () => {
  it('includes the HTTP status and tolerates non-JSON bodies', async () => {
    await expect(
      readApiError(
        { status: 409, json: async () => ({ detail: 'Not running' }) },
        'f'
      )
    ).resolves.toEqual({ message: 'Not running', code: null, status: 409 });

    await expect(
      readApiError(
        {
          status: 500,
          json: async () => {
            throw new Error('not json');
          },
        },
        'Server error'
      )
    ).resolves.toEqual({ message: 'Server error', code: null, status: 500 });
  });

  it('creates errors carrying status and code', () => {
    const error = createApiError({
      message: 'Nope',
      code: 'X',
      status: 403,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Nope');
    expect(error.status).toBe(403);
    expect(error.code).toBe('X');
  });
});
