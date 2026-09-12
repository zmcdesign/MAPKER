const assert = require('node:assert/strict');

module.exports = function testSidebarLayout(w) {
  const app = w.eval(`({ map, layers, setSidebarCollapsed, restoreSidebarState,
    toggleMultiSelect, clearMultiSelect, captureMapSnapshot, getVisibleMapExportRect,
    getExportCaptureRect, clearExportCropRect, selected: () => [...multiSelected.keys()],
    undoCount: () => undoStack.length, session: () => objectMarqueeSession })`);
  const root = w.document.getElementById('app');
  const sidebar = w.document.getElementById('sidebar');
  const toggle = w.document.getElementById('sidebarToggle');
  const mapEl = app.map.getContainer();
  const input = w.document.getElementById('searchInput');
  const key = 'mapker.sidebarCollapsed';
  const json = value => JSON.parse(JSON.stringify(value));
  const layer = app.layers.routes.getLayers().find(layer => !layer._isLabel);
  app.toggleMultiSelect(layer, 'route');
  const originalMap = json(app.captureMapSnapshot());
  const originalPosition = app.map.latLngToContainerPoint(layer.getLatLngs()[0]);
  const originalUndoCount = app.undoCount();
  sidebar.scrollTop = 180;
  input.value = '未完成的搜尋';
  assert.equal(toggle.getAttribute('aria-controls'), 'sidebar');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  const pointer = new w.MouseEvent('pointerdown', { bubbles: true, button: 0 });
  Object.defineProperty(pointer, 'pointerType', { value: 'mouse' });
  toggle.dispatchEvent(pointer);
  assert.equal(app.session(), null, 'Toolbar toggle must not start marquee selection');
  toggle.click();
  assert.ok(root.classList.contains('sidebar-collapsed'));
  assert.ok(sidebar.hasAttribute('inert'), 'Hidden sidebar must not trap keyboard navigation');
  assert.equal(sidebar.getAttribute('aria-hidden'), 'true');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.title, '展開左側工具欄');
  assert.equal(toggle.getAttribute('aria-label'), toggle.title);
  assert.equal(w.localStorage.getItem(key), 'true');
  assert.equal(toggle.disabled, false, 'The reopen control stays available');
  assert.deepEqual(Array.from(app.selected()), [layer], 'Toggling preserves multi-selection');
  assert.deepEqual(json(app.captureMapSnapshot()), originalMap, 'Collapsing does not change map or feature state');
  assert.ok(app.map.latLngToContainerPoint(layer.getLatLngs()[0]).equals(originalPosition));
  assert.equal(app.undoCount(), originalUndoCount, 'Layout changes do not enter map history');
  toggle.click();
  assert.equal(sidebar.scrollTop, 180);
  assert.equal(input.value, '未完成的搜尋');
  assert.equal(sidebar.hasAttribute('inert'), false);
  assert.equal(sidebar.getAttribute('aria-hidden'), 'false');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(w.localStorage.getItem(key), 'false');
  input.focus();
  app.setSidebarCollapsed(true);
  assert.equal(w.document.activeElement, toggle, 'Focus leaves the sidebar before it becomes inert');
  app.setSidebarCollapsed(false, false);
  app.restoreSidebarState();
  assert.ok(root.classList.contains('sidebar-collapsed'), 'Stored preference is restored');

  const storageDescriptor = Object.getOwnPropertyDescriptor(w, 'localStorage');
  Object.defineProperty(w, 'localStorage', { configurable: true, get() { throw new Error('Storage unavailable'); } });
  try {
    app.restoreSidebarState();
    assert.equal(root.classList.contains('sidebar-collapsed'), false);
    assert.doesNotThrow(() => app.setSidebarCollapsed(true), 'Private/file browsing without storage still supports collapsing');
  } finally {
    Object.defineProperty(w, 'localStorage', storageDescriptor);
  }

  // Model the existing full-width map with a 300px sidebar overlay.
  const originalMapRect = mapEl.getBoundingClientRect;
  const originalSidebarRect = sidebar.getBoundingClientRect;
  mapEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 });
  sidebar.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 720, width: 300, height: 720 });
  try {
    app.setSidebarCollapsed(false);
    assert.equal(app.getVisibleMapExportRect(mapEl).width, 980);
    app.setSidebarCollapsed(true);
    assert.equal(app.getVisibleMapExportRect(mapEl).left, 0);
    assert.equal(app.getVisibleMapExportRect(mapEl).width, 1280, 'Collapsed export includes the newly visible map area');
    w.eval('exportCropRect = { left: 350, top: 100, width: 400, height: 300 }; renderExportCropBox();');
    const crop = json(app.getExportCaptureRect(mapEl));
    app.setSidebarCollapsed(false);
    assert.deepEqual(json(app.getExportCaptureRect(mapEl)), crop, 'An existing visible crop is unchanged');
    app.setSidebarCollapsed(true);
    assert.deepEqual(json(app.getExportCaptureRect(mapEl)), crop);
  } finally {
    mapEl.getBoundingClientRect = originalMapRect;
    sidebar.getBoundingClientRect = originalSidebarRect;
    app.clearExportCropRect();
    app.clearMultiSelect();
    app.setSidebarCollapsed(false);
    w.localStorage.removeItem(key);
    input.value = '';
    sidebar.scrollTop = 0;
  }
  assert.ok(toggle.closest('#historyControls'), 'The toggle uses the existing export-excluded toolbar');
  console.log('PASS: sidebar collapse/reopen, preference and storage fallback, focus, scroll/input preservation, map and selection stability, history isolation, export bounds/crop.');
};
