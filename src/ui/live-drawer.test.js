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

  it('supports the Top 5 leaderboard tab', () => {
    const root = document.createElement('section');
    const names = ['trade', 'farm', 'chat', 'leaderboard'];
    const tabs = names.map(makeButton);
    const panels = names.map(makePanel);
    const openButton = makeButton('leaderboard');

    initLiveDrawer({
      rootEl: root,
      tabButtons: tabs,
      panels,
      openButtons: [openButton],
    });

    openButton.click();
    expect(isLiveDrawerOpen()).toBe(true);
    expect(getLiveDrawerTab()).toBe('leaderboard');
    expect(panels[3].hidden).toBe(false);
    expect(panels[0].hidden).toBe(true);
    expect(tabs[3].getAttribute('aria-selected')).toBe('true');
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

  describe('keyboard accessibility', () => {
    function setupKeyboardDrawer() {
      const root = document.createElement('section');
      const names = ['trade', 'farm', 'chat', 'leaderboard'];
      const tabs = names.map(makeButton);
      const panels = names.map(makePanel);
      tabs.forEach((tab) => root.appendChild(tab));
      panels.forEach((panel) => root.appendChild(panel));
      document.body.appendChild(root);
      const openButton = makeButton('farm');
      document.body.appendChild(openButton);
      initLiveDrawer({
        rootEl: root,
        tabButtons: tabs,
        panels,
        openButtons: [openButton],
      });
      return { root, tabs, panels, openButton };
    }

    function pressKey(target, key) {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    }

    it('uses a roving tabindex so only the active tab is in the Tab order', () => {
      const { tabs } = setupKeyboardDrawer();

      expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
      setLiveDrawerTab('chat');
      expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0, -1]);
    });

    it('moves and activates tabs with arrow, Home and End keys', () => {
      const { tabs, panels } = setupKeyboardDrawer();
      openLiveDrawer('trade');
      tabs[0].focus();

      const right = pressKey(tabs[0], 'ArrowRight');
      expect(right.defaultPrevented).toBe(true);
      expect(getLiveDrawerTab()).toBe('farm');
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
      expect(panels[1].hidden).toBe(false);

      pressKey(tabs[1], 'End');
      expect(getLiveDrawerTab()).toBe('leaderboard');
      expect(document.activeElement).toBe(tabs[3]);

      // ArrowRight wraps from the last tab to the first.
      pressKey(tabs[3], 'ArrowRight');
      expect(getLiveDrawerTab()).toBe('trade');

      // ArrowLeft wraps from the first tab to the last.
      pressKey(tabs[0], 'ArrowLeft');
      expect(getLiveDrawerTab()).toBe('leaderboard');

      pressKey(tabs[3], 'Home');
      expect(getLiveDrawerTab()).toBe('trade');
      expect(document.activeElement).toBe(tabs[0]);
    });

    it('ignores unrelated keys on tabs', () => {
      const { tabs } = setupKeyboardDrawer();
      openLiveDrawer('trade');

      const event = pressKey(tabs[0], 'a');
      expect(event.defaultPrevented).toBe(false);
      expect(getLiveDrawerTab()).toBe('trade');
    });

    it('focuses the active tab on open and returns focus to the opener on Escape', () => {
      const { tabs, openButton } = setupKeyboardDrawer();

      openButton.focus();
      openButton.click();
      expect(isLiveDrawerOpen()).toBe(true);
      expect(document.activeElement).toBe(tabs[1]);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
      expect(isLiveDrawerOpen()).toBe(false);
      expect(document.activeElement).toBe(openButton);
    });

    it('does not steal focus on close when focus is outside the window', () => {
      const { openButton } = setupKeyboardDrawer();
      const other = document.createElement('button');
      document.body.appendChild(other);

      openButton.click();
      other.focus();
      closeLiveDrawer();
      expect(document.activeElement).toBe(other);
    });
  });

  it('clamps dragging so the header stays inside the viewport', () => {
    const root = document.createElement('section');
    const header = document.createElement('div');
    header.className = 'live-drawer-header';
    root.appendChild(header);
    document.body.appendChild(root);
    Object.defineProperty(root, 'offsetWidth', { value: 300 });
    root.getBoundingClientRect = () => ({ left: 100, top: 100 });

    initLiveDrawer({
      rootEl: root,
      tabButtons: ['trade'].map(makeButton),
      panels: ['trade'].map(makePanel),
    });
    openLiveDrawer('trade');

    header.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 })
    );
    // Far beyond the bottom-right corner.
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX: window.innerWidth + 5000,
        clientY: window.innerHeight + 5000,
      })
    );
    expect(root.style.left).toBe(`${window.innerWidth - 48}px`);
    expect(root.style.top).toBe(`${window.innerHeight - 48}px`);

    // Far beyond the top-left corner.
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX: -5000,
        clientY: -5000,
      })
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(root.style.left).toBe(`${48 - 300}px`);
    expect(root.style.top).toBe('0px');
  });
});
