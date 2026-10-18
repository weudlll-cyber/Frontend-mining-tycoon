/**
File: src/utils/dom-utils.js
Purpose: Shared DOM and formatting helpers for frontend rendering code.
Role in system: Utility layer consumed by all UI modules; no upstream data-flow dependencies.
Key responsibilities:
- Safe text-node updates that preserve selection anchors during live SSE refreshes.
- clearNode for subtree teardown without innerHTML.
- byId: document.getElementById shorthand for the admin modules.
Entry points / public functions:
- clearNode, byId, setTextNodeValue, setElementTextValue.
Dependencies: Browser DOM APIs only.
Security notes: textContent / createTextNode only — never innerHTML with untrusted input.
*/

/** Remove all children of a node (no innerHTML). */
export function clearNode(node) {
  if (!node) return;
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

/** Shorthand for document.getElementById. */
export function byId(id) {
  return document.getElementById(id);
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
