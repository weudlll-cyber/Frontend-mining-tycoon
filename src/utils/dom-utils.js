/*
File: src/utils/dom-utils.js
Purpose: Shared DOM and formatting helpers for frontend rendering code.
Key responsibilities:
- Provide small, reusable utilities for common DOM update patterns.
- Keep render paths concise and selection-safe via text-node updates.
Entry points / public functions:
- clearElementChildren, clearNode, createStaticValueRow, setTextNodeValue,
  setElementTextValue, formatCost, formatTokenAmount, escapeHtml.
Dependencies:
- Browser DOM APIs.
Last updated: 2026-03-12
Author/Owner: Frontend Team
*/

export function clearElementChildren(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function createStaticValueRow(
  labelText,
  valueClass = 'state-stat-value'
) {
  const row = document.createElement('div');
  row.className = 'state-stat';

  const label = document.createElement('span');
  label.className = 'state-stat-label';
  label.textContent = labelText;

  const value = document.createElement('span');
  value.className = valueClass;
  const valueTextNode = document.createTextNode('-');
  value.appendChild(valueTextNode);

  row.appendChild(label);
  row.appendChild(value);
  return { row, value, valueTextNode };
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

export function formatTokenAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '-';
  }
  return num.toFixed(2);
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
