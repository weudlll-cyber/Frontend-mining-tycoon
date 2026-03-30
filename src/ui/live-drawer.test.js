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
});
