/**
File: src/ui/selection-persist.js
Purpose: Preserve user text selections across live UI updates when DOM anchors remain attached.
Role in system:
- Shared UI helper used by render paths that must stay non-blocking during SSE and timer-driven refreshes.
Constraints:
- Never focuses or blurs elements; only restores existing selections when nodes are still valid.
- Frontend remains display-only and must not mutate backend-authoritative state.
Security notes:
- Uses browser Selection/Range APIs only; no HTML parsing or unsafe DOM writes.
*/

function isConnectedNode(node) {
  if (!node) return false;
  if (typeof node.isConnected === 'boolean') return node.isConnected;
  const ownerDocument = node.ownerDocument || document;
  const parentCandidate =
    node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  return Boolean(parentCandidate && ownerDocument.contains(parentCandidate));
}

function isWithinRoot(node, root) {
  if (!root || !node) return true;
  const parentCandidate =
    node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  return Boolean(parentCandidate && root.contains(parentCandidate));
}

function normalizeRangeBoundary(
  anchorNode,
  anchorOffset,
  focusNode,
  focusOffset
) {
  if (anchorNode === focusNode) {
    if (anchorOffset <= focusOffset) {
      return {
        startNode: anchorNode,
        startOffset: anchorOffset,
        endNode: focusNode,
        endOffset: focusOffset,
      };
    }
    return {
      startNode: focusNode,
      startOffset: focusOffset,
      endNode: anchorNode,
      endOffset: anchorOffset,
    };
  }

  const position = anchorNode.compareDocumentPosition(focusNode);
  const anchorPrecedes = Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING);
  if (anchorPrecedes) {
    return {
      startNode: anchorNode,
      startOffset: anchorOffset,
      endNode: focusNode,
      endOffset: focusOffset,
    };
  }

  return {
    startNode: focusNode,
    startOffset: focusOffset,
    endNode: anchorNode,
    endOffset: anchorOffset,
  };
}

export function snapSelection(root = document.body) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!isConnectedNode(anchorNode) || !isConnectedNode(focusNode)) {
    return null;
  }
  if (!isWithinRoot(anchorNode, root) && !isWithinRoot(focusNode, root)) {
    return null;
  }

  return {
    anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode,
    focusOffset: selection.focusOffset,
  };
}

export function restoreSelectionIfValid(snapshot) {
  if (!snapshot) return false;

  const { anchorNode, anchorOffset, focusNode, focusOffset } = snapshot;
  if (!isConnectedNode(anchorNode) || !isConnectedNode(focusNode)) {
    return false;
  }

  const selection = window.getSelection?.();
  if (!selection) return false;

  try {
    selection.removeAllRanges();
    if (typeof selection.setBaseAndExtent === 'function') {
      selection.setBaseAndExtent(
        anchorNode,
        anchorOffset,
        focusNode,
        focusOffset
      );
      return true;
    }

    const normalized = normalizeRangeBoundary(
      anchorNode,
      anchorOffset,
      focusNode,
      focusOffset
    );
    const range = document.createRange();
    range.setStart(normalized.startNode, normalized.startOffset);
    range.setEnd(normalized.endNode, normalized.endOffset);
    selection.addRange(range);
    return true;
  } catch {
    return false;
  }
}
