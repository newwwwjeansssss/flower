export function addLevelForEditing(store) {
  store.addLevel();
  return "edit";
}

export function activateInspectorTab(name, tabs, panels) {
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.tab === name));
  panels.forEach(panel => panel.classList.toggle("active", panel.dataset.panel === name));
}

export function openLevelInspector(store, levelId, tabs, panels) {
  store.selectLevel(levelId);
  activateInspectorTab("level", tabs, panels);
}
