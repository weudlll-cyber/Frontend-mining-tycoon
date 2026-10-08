/**
File: src/ui/toast.test.js
Purpose: Verify toasts are non-blocking and announced through live regions.
Role in system: Guards the polite (status) / assertive (error) announcement split.
Security notes: Messages must be rendered as text, never markup.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureToastRegions, showToast } from './toast.js';

describe('toast notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates polite and assertive live regions once', () => {
    const regions = ensureToastRegions();
    expect(regions.polite.getAttribute('role')).toBe('status');
    expect(regions.polite.getAttribute('aria-live')).toBe('polite');
    expect(regions.assertive.getAttribute('role')).toBe('alert');
    expect(regions.assertive.getAttribute('aria-live')).toBe('assertive');
    expect(ensureToastRegions()).toBe(regions);
    expect(document.querySelectorAll('.toast-region')).toHaveLength(2);
  });

  it('re-creates the regions after the DOM was replaced', () => {
    const first = ensureToastRegions();
    document.body.innerHTML = '';
    const second = ensureToastRegions();
    expect(second).not.toBe(first);
    expect(second.polite.isConnected).toBe(true);
  });

  it('routes info toasts to the polite region and errors to the assertive one', () => {
    const info = showToast('Session started.');
    const error = showToast('<b>Join failed</b>', 'error');
    const regions = ensureToastRegions();

    expect(info.parentElement).toBe(regions.polite);
    expect(info.className).toBe('toast toast-info');
    expect(error.parentElement).toBe(regions.assertive);
    expect(error.querySelector('b')).toBeNull();
    expect(error.textContent).toBe('<b>Join failed</b>');
  });

  it('shows, hides and removes a toast on its timers', () => {
    const toast = showToast('Saved', 'success');
    expect(toast.classList.contains('show')).toBe(false);
    vi.advanceTimersByTime(10);
    expect(toast.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(toast.classList.contains('show')).toBe(false);
    expect(toast.isConnected).toBe(true);
    vi.advanceTimersByTime(300);
    expect(toast.isConnected).toBe(false);
  });
});
