/**
File: src/ui/live-drawer.test.js
Purpose: Validate drawer open/close/tab behavior for optional live tools.
Role in system: Prevent regressions in compact panel access flow (Trade/Farm/Chat).
Invariants: Drawer state must stay deterministic and tab mapping must remain stable.
Security notes: DOM-only state tests.
*/

import { beforeEach, describe, expect, it } from 'vitest';

import {
  closeLiveDrawer,
  getLiveDrawerTab,
  initLiveDrawer,
  isLiveDrawerOpen,
  openLiveDrawer,
  setLiveDrawerTab,
} from './live-drawer.js';

function makeButton(liveTab) {
  const button = document.createElement('button');
  button.dataset.liveTab = liveTab;
  return button;
}

function makePanel(tab) {
  const panel = document.createElement('section');
  panel.dataset.livePanel = tab;
  return panel;
}

describe('live-drawer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('starts closed with default tab', () => {
    const root = document.createElement('section');
    const tabs = ['trade', 'farm', 'chat'].map(makeButton);
    const panels = ['trade', 'farm', 'chat'].map(makePanel);

    initLiveDrawer({
      rootEl: root,
      tabButtons: tabs,
      panels,
      defaultTab: 'farm',
    });

    expect(isLiveDrawerOpen()).toBe(false);
    expect(root.hidden).toBe(true);
    expect(getLiveDrawerTab()).toBe('farm');
    expect(panels[1].hidden).toBe(false);
    expect(panels[0].hidden).toBe(true);
  });

  it('opens and closes through API calls', () => {
    const root = document.createElement('section');
    const tabs = ['trade', 'farm', 'chat'].map(makeButton);
    const panels = ['trade', 'farm', 'chat'].map(makePanel);

    initLiveDrawer({ rootEl: root, tabButtons: tabs, panels });

    openLiveDrawer('chat');
    expect(isLiveDrawerOpen()).toBe(true);
    expect(root.hidden).toBe(false);
    expect(getLiveDrawerTab()).toBe('chat');

    closeLiveDrawer();
    expect(isLiveDrawerOpen()).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it('switches tabs via setLiveDrawerTab without forcing open state', () => {
    const root = document.createElement('section');
    const tabs = ['trade', 'farm', 'chat'].map(makeButton);
    const panels = ['trade', 'farm', 'chat'].map(makePanel);

    initLiveDrawer({ rootEl: root, tabButtons: tabs, panels });

    setLiveDrawerTab('chat');
    expect(getLiveDrawerTab()).toBe('chat');
    expect(isLiveDrawerOpen()).toBe(false);
    expect(panels[2].hidden).toBe(false);
  });

  it('supports header drag with mouse and ignores button clicks in header', () => {
    const root = document.createElement('section');
    const header = document.createElement('div');
    header.className = 'live-drawer-header';
    const headerButton = document.createElement('button');
    header.appendChild(headerButton);
    root.appendChild(header);
    document.body.appendChild(root);

    root.getBoundingClientRect = () => ({ left: 10, top: 20 });

    initLiveDrawer({
      rootEl: root,
      tabButtons: ['trade', 'farm', 'chat'].map(makeButton),
      panels: ['trade', 'farm', 'chat'].map(makePanel),
    });
    openLiveDrawer('trade');

    // Header button interactions must not start drag behavior.
    headerButton.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 20 })
    );
    expect(root.style.transform).toBe('');

    header.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 30 })
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 45 })
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(root.style.transform).toBe('none');
    expect(root.style.left).toBe('20px');
    expect(root.style.top).toBe('35px');
  });

  it('supports header drag with touch interactions', () => {
    const root = document.createElement('section');
    const header = document.createElement('div');
    header.className = 'live-drawer-header';
    root.appendChild(header);
    document.body.appendChild(root);

    root.getBoundingClientRect = () => ({ left: 40, top: 50 });

    initLiveDrawer({
      rootEl: root,
      tabButtons: ['trade', 'farm', 'chat'].map(makeButton),
      panels: ['trade', 'farm', 'chat'].map(makePanel),
    });
    openLiveDrawer('trade');

    const touchStart = new Event('touchstart', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(touchStart, 'touches', {
      value: [{ clientX: 40, clientY: 50 }],
      configurable: true,
    });
    header.dispatchEvent(touchStart);

    const touchMove = new Event('touchmove', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(touchMove, 'touches', {
      value: [{ clientX: 60, clientY: 80 }],
      configurable: true,
    });
    header.dispatchEvent(touchMove);
    header.dispatchEvent(new Event('touchend', { bubbles: true }));

    expect(root.style.transform).toBe('none');
    expect(root.style.left).toBe('60px');
    expect(root.style.top).toBe('80px');
  });
});
