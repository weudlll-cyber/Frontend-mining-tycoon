/**
File: src/ui/micro-tooltip.js
Purpose: Lightweight non-blocking tooltip system (hover / focus / tap).
Role in system:
- Consumed by player-view, season-cards, and upgrade-panel-inline; each component
  calls initMicroTooltips(containerEl) once and holds the returned dispose fn.
- event-display uses a scoped instance for the event banner only; it does NOT scan
  document.body on every SSE tick (would dispose other instances and close open tips).
Constraints:
- LOCKED_DECISIONS.md §C: no backdrop, no modal behavior, no interaction-blocking.
- Tooltips close only on mouseleave/Escape/blur — never via auto-hide timeout on hover.
- Tooltip bubbles live in #tooltip-layer (fixed, above all content) so they are never
  clipped by overflow:hidden on season cards or the upgrade table.
- Anchor elements must not be re-mounted during SSE updates while a tooltip is open.
  (See season-cards.js ensureSeasonMetaStructure for the stable-anchor pattern.)
Security notes:
- All tooltip text is set via textContent — no innerHTML, no XSS vectors.
*/

export function initMicroTooltips(containerEl) {
  if (!containerEl) {
    return () => {};
  }

  const triggers = Array.from(containerEl.querySelectorAll('.ps-tip-trigger'));
  if (!triggers.length) {
    return () => {};
  }

  const tooltipLayer = document.getElementById('tooltip-layer');
  if (!tooltipLayer) {
    console.warn('tooltip-layer not found');
    return () => {};
  }

  const openTips = new Set();
  const closeTimers = new Map();
  const hoverWatchers = new Map();

  const cancelScheduledClose = (bubble) => {
    const timerId = closeTimers.get(bubble);
    if (timerId) {
      clearTimeout(timerId);
      closeTimers.delete(bubble);
    }
  };

  // scheduleClose is kept only for keyboard/blur cases (not mouseleave)
  const scheduleClose = (bubble, trigger, delayMs = 450) => {
    cancelScheduledClose(bubble);
    const timerId = setTimeout(() => {
      closeTimers.delete(bubble);
      if (
        trigger.matches(':hover') ||
        bubble.matches(':hover') ||
        document.activeElement === trigger
      ) {
        return;
      }
      if (openTips.has(bubble)) {
        closeTip(bubble);
      }
    }, delayMs);
    closeTimers.set(bubble, timerId);
  };

  const stopHoverWatch = (bubble) => {
    const rafId = hoverWatchers.get(bubble);
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      hoverWatchers.delete(bubble);
    }
  };

  // RAF loop: stay alive as long as pointer hovers trigger or bubble.
  // Uses requestAnimationFrame poll instead of mouseleave because SSE countdown
  // updates cause DOM reflows every ~1 s, which fire spurious mouseleave events
  // on elements whose geometry shifts — even when the pointer never actually moved.
  // Polling :hover is reflow-immune; closes after ~350 ms of no :hover.
  const startHoverWatch = (bubble, trigger) => {
    stopHoverWatch(bubble);
    let lastHoveredAt = Date.now();

    const tick = () => {
      if (!openTips.has(bubble)) {
        hoverWatchers.delete(bubble);
        return;
      }
      const hovering = trigger.matches(':hover') || bubble.matches(':hover');
      if (hovering) {
        lastHoveredAt = Date.now();
        hoverWatchers.set(bubble, requestAnimationFrame(tick));
        return;
      }
      if (Date.now() - lastHoveredAt < 350) {
        hoverWatchers.set(bubble, requestAnimationFrame(tick));
        return;
      }
      hoverWatchers.delete(bubble);
      closeTip(bubble);
    };
    hoverWatchers.set(bubble, requestAnimationFrame(tick));
  };

  // Position a tooltip bubble relative to its trigger button
  const positionTooltip = (bubble, trigger) => {
    const rect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();

    // Position above the trigger, centered horizontally
    const top = rect.top - bubbleRect.height - 8; // 8px gap
    const left = rect.left + rect.width / 2 - bubbleRect.width / 2;

    // Adjust if tooltip goes off-screen (right)
    const adjustedLeft = Math.min(
      left,
      window.innerWidth - bubbleRect.width - 4
    );
    // Adjust if tooltip goes off-screen (left)
    const finalLeft = Math.max(4, adjustedLeft);

    bubble.style.top = `${Math.max(4, top)}px`;
    bubble.style.left = `${finalLeft}px`;
  };

  const closeTip = (bubble) => {
    cancelScheduledClose(bubble);
    stopHoverWatch(bubble);
    bubble.classList.remove('is-open');
    const triggerId = bubble.id.replace('ps-tip-', '');
    const trigger = containerEl.querySelector(
      `.ps-tip-trigger[data-tooltip-id="ps-tip-${triggerId}"]`
    );
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    openTips.delete(bubble);
  };

  const openTip = (bubble, trigger) => {
    cancelScheduledClose(bubble);
    stopHoverWatch(bubble);
    // Close all other tips
    Array.from(openTips).forEach((openBubble) => {
      if (openBubble !== bubble) {
        closeTip(openBubble);
      }
    });

    bubble.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    openTips.add(bubble);

    // Position the tooltip
    setTimeout(() => {
      positionTooltip(bubble, trigger);
    }, 0);

    // Start RAF hover-watch to auto-close when pointer leaves
    startHoverWatch(bubble, trigger);
  };

  const closeAllTips = () => {
    Array.from(openTips).forEach((bubble) => {
      closeTip(bubble);
    });
  };

  // Handle click outside
  const onDocumentPointerDown = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    // Check if click is on a trigger button
    const clickedTrigger = target.closest('.ps-tip-trigger');
    if (clickedTrigger) {
      return; // Let the trigger's click handler deal with it
    }

    // Check if click is on an open tooltip
    const clickedTooltip = target.closest('.ps-tip-bubble');
    if (clickedTooltip && openTips.has(clickedTooltip)) {
      return; // Allow interaction with tooltip
    }

    // Otherwise, close all tips
    closeAllTips();
  };

  const onDocumentKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeAllTips();
    }
  };

  triggers.forEach((trigger) => {
    const tooltipId = trigger.getAttribute('aria-describedby');
    const bubble = document.querySelector(`#${tooltipId}`);

    if (!bubble) {
      console.warn(`Tooltip bubble #${tooltipId} not found for trigger`);
      return;
    }

    // Click to toggle
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (openTips.has(bubble)) {
        closeTip(bubble);
      } else {
        openTip(bubble, trigger);
      }
    });

    // Hover to show (desktop) — mouseenter opens; RAF loop handles close
    trigger.addEventListener('mouseenter', () => {
      cancelScheduledClose(bubble);
      if (!openTips.has(bubble)) {
        openTip(bubble, trigger);
      } else {
        // Already open: reset the hover watcher so it doesn't close
        startHoverWatch(bubble, trigger);
      }
    });

    // Keep tooltip visible while the pointer is over the bubble itself
    bubble.addEventListener('mouseenter', () => {
      cancelScheduledClose(bubble);
      if (!openTips.has(bubble)) {
        bubble.classList.add('is-open');
        openTips.add(bubble);
        trigger.setAttribute('aria-expanded', 'true');
      }
      // Bubble hover: reset watcher so it won't close during pointer dwell
      startHoverWatch(bubble, trigger);
    });

    // Focus to show (keyboard)
    trigger.addEventListener('focus', () => {
      if (!openTips.has(bubble)) {
        openTip(bubble, trigger);
      }
    });

    // Blur to hide
    trigger.addEventListener('blur', () => {
      if (openTips.has(bubble)) {
        scheduleClose(bubble, trigger, 0);
      }
    });

    // Keyboard: Escape to close
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTip(bubble);
        trigger.focus();
      }
    });
  });

  // Global event listeners
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeyDown);

  // Handle window resize to reposition open tooltips
  const onWindowResize = () => {
    Array.from(openTips).forEach((bubble) => {
      const triggerId = bubble.id.replace('ps-tip-', '');
      const trigger = containerEl.querySelector(
        `.ps-tip-trigger[data-tooltip-id="ps-tip-${triggerId}"]`
      );
      if (trigger) {
        positionTooltip(bubble, trigger);
      }
    });
  };

  window.addEventListener('resize', onWindowResize);

  // Cleanup function
  return () => {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onDocumentKeyDown);
    window.removeEventListener('resize', onWindowResize);
    closeTimers.forEach((timerId) => clearTimeout(timerId));
    closeTimers.clear();
    hoverWatchers.forEach((rafId) => cancelAnimationFrame(rafId));
    hoverWatchers.clear();
    triggers.forEach((trigger) => {
      const tooltipId = trigger.getAttribute('aria-describedby');
      const bubble = document.querySelector(`#${tooltipId}`);
      if (bubble && tooltipLayer.contains(bubble)) {
        // Never force-close a tooltip the user is actively hovering —
        // another instance's RAF watcher will close it naturally when
        // the pointer leaves. This prevents refreshTooltips() (called
        // every SSE tick by event-display) from killing open tooltips.
        if (trigger.matches(':hover') || bubble.matches(':hover')) {
          openTips.delete(bubble);
          return;
        }
        closeTip(bubble);
      }
    });
  };
}
