/**
File: src/utils/storage-utils.test.js
Purpose: Validate storage safety wrappers, URL normalization, and game metadata cache retention rules.
Role in system:
- Regression coverage for persistence and cache-retention behavior used by frontend setup and metadata flows.
Invariants:
- Storage helper operations fail safely and never crash UI flows.
Security notes:
- URL normalization rejects unsupported schemes and preserves strict backend-origin constraints.
*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEYS,
  cleanupGameMetaCache,
  getGameMetaHashStorageKey,
  getPlayerTokenStorageKey,
  getStorageItem,
  markGameMetaSeen,
  normalizeBaseUrl,
  setStorageItem,
} from './storage-utils.js';

describe('storage-utils', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('builds stable player token storage keys', () => {
    expect(getPlayerTokenStorageKey('g1', 'p2')).toBe(
      'mining-tycoon:playerToken:g1:p2'
    );
  });

  it('normalizes backend URL and strips trailing slashes', () => {
    expect(normalizeBaseUrl(' https://example.com:8080/path/// ')).toBe(
      'https://example.com:8080/path'
    );
  });

  it('rejects unsupported URL protocols', () => {
    expect(() => normalizeBaseUrl('ftp://example.com')).toThrow(
      'Backend URL must use http or https.'
    );
  });

  it('handles localStorage set/get failures without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const originalSetItem = Storage.prototype.setItem;
    const originalGetItem = Storage.prototype.getItem;

    Storage.prototype.setItem = vi.fn(() => {
      throw new Error('set failed');
    });
    Storage.prototype.getItem = vi.fn(() => {
      throw new Error('get failed');
    });

    expect(() => setStorageItem('k', 'v')).not.toThrow();
    expect(getStorageItem('k')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.getItem = originalGetItem;
  });

  it('marks seen meta timestamp and ignores empty game ids', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    markGameMetaSeen('g1');
    markGameMetaSeen('');
    markGameMetaSeen(null);

    const seenMap = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.gameMetaSeenAt)
    );
    expect(seenMap).toEqual({ g1: 1_700_000_000_000 });

    nowSpy.mockRestore();
  });

  it('cleans up stale TTL entries and metadata for missing keys', () => {
    const nowMs = 2_000_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    localStorage.setItem(getGameMetaHashStorageKey('old'), 'hash-old');
    localStorage.setItem(getGameMetaHashStorageKey('new'), 'hash-new');
    localStorage.setItem(
      STORAGE_KEYS.gameMetaSeenAt,
      JSON.stringify({
        old: nowMs - 8 * 24 * 60 * 60 * 1000,
        new: nowMs - 60_000,
        ghost: nowMs - 30_000,
      })
    );

    cleanupGameMetaCache();

    expect(localStorage.getItem(getGameMetaHashStorageKey('old'))).toBeNull();
    expect(localStorage.getItem(getGameMetaHashStorageKey('new'))).toBe(
      'hash-new'
    );

    const seenMap = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.gameMetaSeenAt)
    );
    expect(seenMap.old).toBeUndefined();
    expect(seenMap.ghost).toBeUndefined();
    expect(Number.isFinite(seenMap.new)).toBe(true);
  });

  it('enforces max retained game meta entries', () => {
    const nowMs = 2_100_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    const seenMap = {};
    for (let i = 1; i <= 35; i += 1) {
      const gameId = `g${i}`;
      localStorage.setItem(getGameMetaHashStorageKey(gameId), `hash-${i}`);
      seenMap[gameId] = nowMs - i * 1000;
    }
    localStorage.setItem(STORAGE_KEYS.gameMetaSeenAt, JSON.stringify(seenMap));

    cleanupGameMetaCache();

    const remainingMetaKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mining-tycoon:gameMetaHash:')) {
        remainingMetaKeys.push(key);
      }
    }

    const updatedSeenMap = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.gameMetaSeenAt)
    );
    expect(remainingMetaKeys.length).toBeLessThanOrEqual(30);
    expect(Object.keys(updatedSeenMap).length).toBeLessThanOrEqual(30);
  });
});
