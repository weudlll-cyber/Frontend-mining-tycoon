/**
File: src/counter.js
Purpose: Minimal sample counter utility used by smoke-level frontend tests.
Role in system: Non-gameplay demo helper; does not participate in authoritative game/session flows.
Invariants/Security: Uses textContent for rendering and keeps logic isolated from core dashboard state.
*/

export function setupCounter(element) {
  let counter = 0;
  const setCounter = (count) => {
    counter = count;
    element.textContent = `count is ${counter}`;
  };
  element.addEventListener('click', () => setCounter(counter + 1));
  setCounter(0);
}
