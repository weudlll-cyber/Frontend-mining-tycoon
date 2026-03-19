/*
File: src/ui/micro-tooltip.js
Purpose: Lightweight non-blocking tooltip interactions for hover/focus/tap.
Tooltips are positioned in a fixed tooltip-layer above all content.
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

    // Hover to show (desktop)
    trigger.addEventListener('mouseenter', () => {
      if (!openTips.has(bubble)) {
        openTip(bubble, trigger);
      }
    });

    trigger.addEventListener('mouseleave', () => {
      // Keep open if focused, close if not
      if (document.activeElement !== trigger && openTips.has(bubble)) {
        closeTip(bubble);
      }
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
        closeTip(bubble);
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
    triggers.forEach((trigger) => {
      const tooltipId = trigger.getAttribute('aria-describedby');
      const bubble = document.querySelector(`#${tooltipId}`);
      if (bubble && tooltipLayer.contains(bubble)) {
        closeTip(bubble);
      }
    });
  };
}
