/**
File: src/ui/upgrade-section-builder.js
Purpose: Build and update reusable upgrade panel sections with stable DOM nodes.
*/

import { setTextNodeValue } from '../utils/dom-utils.js';

export function createUpgradeStat(labelText, extraClass = '') {
  const row = document.createElement('div');
  row.className = 'state-stat';

  const label = document.createElement('span');
  label.className = 'state-stat-label';
  const labelNode = document.createTextNode(labelText);
  label.appendChild(labelNode);

  const value = document.createElement('span');
  value.className = extraClass
    ? `state-stat-value selectable ${extraClass}`
    : 'state-stat-value selectable';
  const valueNode = document.createTextNode('-');
  value.appendChild(valueNode);

  row.appendChild(label);
  row.appendChild(value);
  return { row, labelNode, valueNode, value };
}

export function setStatRowContent(statRefs, labelText, valueText, hidden = false) {
  if (!statRefs) return;
  statRefs.row.style.display = hidden ? 'none' : '';
  if (hidden) return;
  setTextNodeValue(statRefs.labelNode, labelText);
  setTextNodeValue(statRefs.valueNode, valueText);
}

export function ensureCurrentOutputRow(refs) {
  if (refs.currentOutput) {
    return refs.currentOutput;
  }

  const statRefs = createUpgradeStat('Current Output', 'highlight');
  refs.dynamicContent.appendChild(statRefs.row);
  refs.currentOutput = statRefs;
  return statRefs;
}

export function ensureUpgradeSection(refs, type, onUpgrade) {
  if (refs.upgradeSections.has(type)) {
    return refs.upgradeSections.get(type);
  }

  const title = type.charAt(0).toUpperCase() + type.slice(1);
  const section = document.createElement('div');
  section.className = 'upgrade-section';
  section.style.display = 'none';

  const heading = document.createElement('h3');
  const headingPrefixNode = document.createTextNode(`${title} Upgrade `);
  heading.appendChild(headingPrefixNode);

  const levelSpan = document.createElement('span');
  levelSpan.className = 'upgrade-level selectable';
  const levelNode = document.createTextNode('Level 0');
  levelSpan.appendChild(levelNode);
  heading.appendChild(levelSpan);
  section.appendChild(heading);

  const costStat = createUpgradeStat('Cost:', 'upgrade-cost');
  const previewStat = createUpgradeStat('Preview:', 'upgrade-current');
  const outputIncreaseStat = createUpgradeStat('Output Increase:', 'upgrade-benefit');
  const outputAfterStat = createUpgradeStat('Output After:', 'upgrade-current');
  const breakevenStat = createUpgradeStat('Breakeven:', 'upgrade-roi');

  [
    costStat,
    previewStat,
    outputIncreaseStat,
    outputAfterStat,
    breakevenStat,
  ].forEach((stat) => {
    stat.row.style.display = 'none';
    section.appendChild(stat.row);
  });

  const button = document.createElement('button');
  button.className = 'btn-upgrade';
  button.dataset.upgrade = type;
  button.dataset.level = '0';
  button.type = 'button';
  button.addEventListener('click', () => {
    const nextLevel = parseInt(button.dataset.level, 10) + 1;
    onUpgrade?.(type, nextLevel);
  });
  section.appendChild(button);

  refs.dynamicContent.appendChild(section);

  const sectionRefs = {
    type,
    section,
    levelNode,
    costStat,
    previewStat,
    outputIncreaseStat,
    outputAfterStat,
    breakevenStat,
    button,
  };
  refs.upgradeSections.set(type, sectionRefs);
  return sectionRefs;
}

export function hideUpgradeSection(sectionRefs) {
  if (!sectionRefs) return;
  sectionRefs.section.style.display = 'none';
  [
    sectionRefs.costStat,
    sectionRefs.previewStat,
    sectionRefs.outputIncreaseStat,
    sectionRefs.outputAfterStat,
    sectionRefs.breakevenStat,
  ].forEach((stat) => {
    stat.row.style.display = 'none';
  });
}
