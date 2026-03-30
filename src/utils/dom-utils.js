/**
File: src/utils/dom-utils.js
Purpose: Shared DOM and formatting helpers for frontend rendering code.
Role in system: Utility layer consumed by all UI modules; no upstream data-flow dependencies.
Key responsibilities:
- Safe text-node updates that preserve selection anchors during live SSE refreshes.
- clearElementChildren / clearNode for subtree teardown without innerHTML.
- formatCost for the legacy upgrade panel cost display.
Entry points / public functions:
- clearElementChildren, clearNode, setTextNodeValue, setElementTextValue, formatCost.
Dependencies: Browser DOM APIs only.
Security notes: textContent / createTextNode only — never innerHTML with untrusted input.
*/

export function clearElementChildren(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export function clearNode(node) {
  if (!node) return;
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function setTextNodeValue(textNode, value) {
  if (!textNode) return;
  const nextValue = String(value);
  if (textNode.nodeValue !== nextValue) {
    textNode.nodeValue = nextValue;
  }
}

export function setElementTextValue(element, value) {
  if (!element) return;
  const nextValue = String(value);

  // Keep a stable text node when possible so live updates do not detach selection anchors.
  if (
    element.childNodes.length === 1 &&
    element.firstChild?.nodeType === Node.TEXT_NODE
  ) {
    setTextNodeValue(element.firstChild, nextValue);
    return;
  }

  if (element.textContent === nextValue) {
    return;
  }

  clearNode(element);
  element.appendChild(document.createTextNode(nextValue));
}

export function formatCost(cost) {
  if (cost == null) return '-';
  if (typeof cost === 'object') {
    const parts = [];
    for (const [k, v] of Object.entries(cost)) {
      parts.push(`${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`);
    }
    return parts.join(', ');
  }
  if (typeof cost === 'number') {
    return cost.toString();
  }
  return String(cost);
}
