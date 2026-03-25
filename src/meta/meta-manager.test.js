/**
File: src/meta/meta-manager.test.js
Purpose: Validate meta fetch and caching behavior, contract support gates, and toast signaling.
Role in system:
- Regression coverage for metadata lifecycle behavior consumed by UI orchestration.
Invariants:
- Unsupported contract versions stay blocked and user-facing notices are not spammed.
Security notes:
- Tests assert metadata handling paths without introducing unsafe render patterns.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEYS,
  getGameMetaHashStorageKey,
} from '../utils/storage-utils.js';

async function loadMetaModule() {
  return import('./meta-manager.js');
}

describe('meta-manager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('honors configured contract version range', async () => {
    const meta = await loadMetaModule();
    meta.initMetaManager({
      onMetaChanged: vi.fn(),
      showToast: vi.fn(),
      supportedMin: 2,
      supportedMax: 3,
    });

    expect(meta.isContractVersionSupported(1)).toBe(false);
    expect(meta.isContractVersionSupported(2)).toBe(true);
    expect(meta.isContractVersionSupported(3)).toBe(true);
    expect(meta.isContractVersionSupported(4)).toBe(false);
  });

  it('returns shortened meta hash and fallback dash', async () => {
    const meta = await loadMetaModule();

    expect(meta.shortMetaHash('1234567890abcdef')).toBe('12345678');
    expect(meta.shortMetaHash('')).toBe('-');
    expect(meta.shortMetaHash(null)).toBe('-');
  });

  it('shows unsupported contract toast only once', async () => {
    const meta = await loadMetaModule();
    const toastSpy = vi.fn();
    const changeSpy = vi.fn();

    meta.initMetaManager({ onMetaChanged: changeSpy, showToast: toastSpy });

    meta.setActiveMeta({
      meta_hash: 'hash-a',
      api_contract_version: 99,
      upgrade_definitions: {},
    });
    meta.setActiveMeta({
      meta_hash: 'hash-b',
      api_contract_version: 99,
      upgrade_definitions: {},
    });

    expect(meta.isActiveContractSupported()).toBe(false);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).toHaveBeenCalledTimes(2);
  });

  it('handles global 304 by fetching full meta fallback', async () => {
    const meta = await loadMetaModule();
    const changeSpy = vi.fn();
    meta.initMetaManager({ onMetaChanged: changeSpy, showToast: vi.fn() });

    setTimeout(() => {}, 0);
    localStorage.setItem(STORAGE_KEYS.globalMetaHash, 'etag-old');

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 304,
        ok: false,
        statusText: 'Not Modified',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          meta_hash: 'global-hash-1',
          api_contract_version: 2,
          upgrade_definitions: { hashrate: { base_cost: 10 } },
        }),
      });

    const result = await meta.fetchMetaSnapshot('http://127.0.0.1:8000');

    expect(result.meta_hash).toBe('global-hash-1');
    expect(meta.getActiveMetaHash()).toBe('global-hash-1');
    expect(meta.getActiveContractVersion()).toBe(2);
    expect(changeSpy).toHaveBeenCalled();
  });

  it('detects per-game hash change and emits update toast once', async () => {
    const meta = await loadMetaModule();
    const toastSpy = vi.fn();
    const changeSpy = vi.fn();
    meta.initMetaManager({ onMetaChanged: changeSpy, showToast: toastSpy });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ meta_hash: 'g-meta-1', api_contract_version: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          meta_hash: 'game-hash-a',
          api_contract_version: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ meta_hash: 'g-meta-1', api_contract_version: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          meta_hash: 'game-hash-b',
          api_contract_version: 2,
        }),
      });

    await meta.fetchMetaSnapshot('http://127.0.0.1:8000', '42');
    await meta.fetchMetaSnapshot('http://127.0.0.1:8000', '42', {
      force: true,
    });

    expect(meta.getGameMeta('42')?.meta_hash).toBe('game-hash-b');
    expect(localStorage.getItem(getGameMetaHashStorageKey('42'))).toBe(
      'game-hash-b'
    );
    expect(toastSpy).toHaveBeenCalledWith(
      'Game rules updated - refreshing upgrades...',
      'info'
    );
    expect(changeSpy).toHaveBeenCalled();
  });
});
