/**
File: src/ui/selection-persist.test.js
Purpose: Verify live-render selection snapshots only restore when anchor nodes remain attached.
Role in system: Regression coverage for non-blocking UI text selection during SSE refreshes.
Invariants/Security: Uses DOM Selection APIs only; no backend-authoritative behavior changes.
*/

import { beforeEach, describe, expect, it } from 'vitest';
import { snapSelection, restoreSelectionIfValid } from './selection-persist.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="root" class="selectable">abcdef</div>';
});

describe('selection persistence helper', () => {
  it('restores a selection when anchor nodes are still attached', () => {
    const root = document.getElementById('root');
    const textNode = root.firstChild;
    const selection = window.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.setEnd(textNode, 4);
    selection.addRange(range);

    const snapshot = snapSelection(root);

    selection.removeAllRanges();
    const restored = restoreSelectionIfValid(snapshot);

    expect(restored).toBe(true);
    expect(selection.toString()).toBe('bcd');
  });

  it('does not restore a selection when anchor nodes were detached', () => {
    const root = document.getElementById('root');
    const textNode = root.firstChild;
    const selection = window.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 2);
    selection.addRange(range);

    const snapshot = snapSelection(root);
    root.textContent = 'uvwxyz';

    const restored = restoreSelectionIfValid(snapshot);

    expect(restored).toBe(false);
  });
});
