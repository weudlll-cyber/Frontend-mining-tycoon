/**
File: src/counter.test.js
Purpose: Validate the sample counter utility behavior.
Role in system: Guardrail test for safe text rendering in non-core demo code.
Invariants/Security: Confirms UI text updates via safe DOM APIs without gameplay coupling.
*/

import { describe, expect, it } from 'vitest';
import { setupCounter } from './counter.js';

describe('setupCounter', () => {
  it('initializes text and increments on click', () => {
    const button = document.createElement('button');

    setupCounter(button);
    expect(button.textContent).toBe('count is 0');

    button.click();
    expect(button.textContent).toBe('count is 1');

    button.click();
    expect(button.textContent).toBe('count is 2');
  });
});
