/**
File: src/config/backend-url.test.js
Purpose: Verify default backend URL resolution from VITE_API_BASE_URL with safe fallback.
*/

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BACKEND_URL,
  FALLBACK_BACKEND_URL,
  resolveDefaultBackendUrl,
} from './backend-url.js';

describe('resolveDefaultBackendUrl', () => {
  it('falls back to the local backend when the variable is missing or blank', () => {
    expect(resolveDefaultBackendUrl(undefined)).toBe(FALLBACK_BACKEND_URL);
    expect(resolveDefaultBackendUrl({})).toBe(FALLBACK_BACKEND_URL);
    expect(resolveDefaultBackendUrl({ VITE_API_BASE_URL: '   ' })).toBe(
      FALLBACK_BACKEND_URL
    );
  });

  it('uses a configured http(s) URL and strips trailing slashes', () => {
    expect(
      resolveDefaultBackendUrl({
        VITE_API_BASE_URL: ' https://api.example.test/ ',
      })
    ).toBe('https://api.example.test');
    expect(
      resolveDefaultBackendUrl({
        VITE_API_BASE_URL: 'http://10.0.0.5:9000/api/',
      })
    ).toBe('http://10.0.0.5:9000/api');
  });

  it('rejects malformed or non-http values', () => {
    expect(resolveDefaultBackendUrl({ VITE_API_BASE_URL: 'not a url' })).toBe(
      FALLBACK_BACKEND_URL
    );
    expect(
      resolveDefaultBackendUrl({ VITE_API_BASE_URL: 'javascript:alert(1)' })
    ).toBe(FALLBACK_BACKEND_URL);
  });

  it('exports a resolved default for the current build', () => {
    expect(DEFAULT_BACKEND_URL).toMatch(/^https?:\/\//);
  });
});
