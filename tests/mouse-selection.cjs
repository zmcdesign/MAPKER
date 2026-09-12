const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const testBatchStyles = require('./batch-style.cjs');
const testSidebarLayout = require('./sidebar-layout.cjs');
const testZoomPrecision = require('./zoom-precision.cjs');
const testSharedInspector = require('./shared-inspector.cjs');
const testBasemapLoading = require('./basemap-loading.cjs');

async function main() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../mapker.html'), 'utf8'), {
    url: 'https://mapker-2026.zmcdesign.workers.dev/',
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      window.fetch = globalThis.fetch;
      window.HTMLCanvasElement.prototype.getContext = () => null;
      window.SVGSVGElement.prototype.createSVGRect = () => ({});
      Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() { return this.id === 'map' ? 980 : 0; } });
      Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get() { return this.id === 'map' ? 720 : 0; } });
      window.HTMLElement.prototype.getBoundingClientRect = function () {
        return this.id === 'map' ? { left: 300, top: 0, right: 1280, bottom: 720, width: 980, height: 720 }
          : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      };
    },
  });
  const w = dom.window;
  let deadline;
  try {
    await Promise.race([
      new Promise(resolve => w.addEventListener('load', resolve, { once: true })),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Map dependencies did not load within 30 seconds')), 30000); }),
    ]);
    clearTimeout(deadline);
    assert.deepEqual(errors, [], 'Application startup must succeed');
    const editor = w.eval(`({ map, layers, layerVisible, bindFeatureInteractions, addIconMarker, addTextMarker,
      clearMultiSelect, setMode, performUndo, performRedo, startBoxSelect, cleanupBoxSelect,
      startExportCropDrawing, stopExportCropDrawing, setMapLocked,
      selected: () => [...multiSelected.keys()], session: () => objectMarqueeSession,
      detail: () => activeObjectDetailLayer, directMove: () => directMoveActive, icons: ICON_TYPES })`);
    const map = editor.map, mapEl = map.getContainer();
    const point = (x, y) => map.containerPointToLatLng([x, y]);
    function polygon(name, group, kind, left, top, right, bottom) {
      const layer = w.L.polygon([point(left, top), point(right, top), point(right, bottom), point(left, bottom)]);
      layer.feature = { type: 'Feature', properties: { name, kind }, geometry: null };
      editor.bindFeatureInteractions(layer, kind);
      editor.layers[group].addLayer(layer);
      return layer;
    }
    function pointer(type, x, y, options = {}, target = mapEl) {
      const event = new w.MouseEvent(type, { bubbles: true, cancelable: true,
        clientX: x + 300, clientY: y, button: options.button || 0,
        buttons: type === 'pointerup' ? 0 : 1, shiftKey: !!options.shiftKey });
      Object.defineProperties(event, { pointerType: { value: options.pointerType || 'mouse' },
        pointerId: { value: 1 }, isPrimary: { value: true } });
      target.dispatchEvent(event);
      return event;
    }
    function click(layer, x = 60, y = 60, options = {}) {
      pointer('pointerdown', x, y, options, layer.getElement());
      pointer('pointerup', x, y, options, layer.getElement());
      const event = new w.MouseEvent('click', { bubbles: true, cancelable: true,
        clientX: 300 + x, clientY: y, shiftKey: !!options.shiftKey });
      layer.getElement().dispatchEvent(event);
      return event;
    }
    function marquee(a, b, options = {}, target = mapEl) {
      pointer('pointerdown', ...a, options, target);
      pointer('pointermove', ...b, options, w);
      pointer('pointerup', ...b, options, w);
      const ghost = new w.MouseEvent('click', { bubbles: true, cancelable: true });
      mapEl.dispatchEvent(ghost);
      assert.ok(ghost.defaultPrevented, 'Drag release must not become a click');
    }
    function selected() { return Array.from(editor.selected()); }
    function setMarkerRect(marker, x, y) {
      marker.getElement().getBoundingClientRect = () => ({ left: 300 + x - 14, right: 300 + x + 14,
        top: y - 14, bottom: y + 14, width: 28, height: 28 });
    }

    const campus = polygon('campus', 'campus', 'campus', 0, 0, 700, 650);
    const a = polygon('A', 'buildings', 'building', 40, 40, 90, 100);
    const b = polygon('B', 'buildings', 'building', 160, 120, 210, 170);
    const partial = polygon('partial', 'buildings', 'building', 220, 180, 330, 280);
    const green = polygon('hidden', 'greens', 'green', 60, 60, 80, 80);
    editor.layerVisible.greens = false;
    const helper = polygon('helper', 'campus', 'campus', 30, 30, 45, 45);
    helper._isHelper = true;
    const label = polygon('label', 'buildings', 'building', 30, 30, 45, 45);
    label._isLabel = true;
    const icon = editor.addIconMarker(point(110, 70), editor.icons[0], '');
    const title = editor.addTextMarker(point(170, 70), 'Title');
    setMarkerRect(icon, 110, 70); setMarkerRect(title, 170, 70);
    const originalCenter = map.getCenter();

    marquee([20, 20], [250, 200], {}, campus.getElement());
    assert.deepEqual(new Set(selected()), new Set([a, b, icon, title]));
    assert.equal(editor.detail(), null);
    assert.ok(!w.document.getElementById('objectDetailPanel').classList.contains('hidden'));
    assert.ok(w.document.getElementById('objectDetailContent').contains(w.document.getElementById('multiSelectPanel')));
    assert.equal(w.document.getElementById('pf-name'), null, 'Multi-selection uses shared styling, not an individual name');
    assert.equal(w.document.querySelector('.object-selection-marquee'), null);
    assert.ok(map.getCenter().equals(originalCenter), 'Marquee must not pan the map');
    assert.ok(map.dragging.enabled());
    assert.ok(!selected().some(layer => [campus, partial, green, helper, label].includes(layer)));

    marquee([350, 300], [215, 175], { shiftKey: true });
    assert.equal(selected().length, 5);
    assert.ok(selected().includes(partial));
    marquee([215, 175], [350, 300], { shiftKey: true });
    assert.equal(selected().length, 5, 'Additive selection must not toggle existing members off');

    pointer('pointerdown', 400, 300);
    pointer('pointermove', 500, 400, {}, w);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(editor.session(), null);
    assert.equal(selected().length, 5, 'Cancelled marquee preserves selection');
    assert.ok(map.dragging.enabled());

    click(a);
    assert.equal(editor.detail(), a, 'A single click opens details');
    assert.equal(selected().length, 0);
    click(icon, 110, 70, { shiftKey: true });
    assert.deepEqual(selected(), [a, icon], 'Shift-click retains the single selection and supports markers');
    assert.equal(editor.detail(), null);
    marquee([500, 500], [550, 550]);
    assert.equal(selected().length, 0, 'An empty non-additive marquee clears selection');
    click(a);
    marquee([150, 110], [215, 175], { shiftKey: true });
    assert.deepEqual(selected(), [a, b], 'Shift-marquee retains the previously single-selected object');
    editor.clearMultiSelect();

    pointer('pointerdown', 20, 20);
    pointer('pointermove', 22, 22, {}, w);
    pointer('pointerup', 22, 22, {}, w);
    assert.equal(w.document.querySelector('.object-selection-marquee'), null, 'Small jitter stays a click');
    assert.ok(map.dragging.enabled());
    pointer('pointerdown', 20, 20, { pointerType: 'touch' });
    assert.equal(editor.session(), null, 'Touch retains native map gestures');

    editor.setMode('building'); pointer('pointerdown', 20, 20);
    assert.equal(editor.session(), null, 'Drawing tools must not start object selection');
    editor.setMode('select');
    editor.startExportCropDrawing(); pointer('pointerdown', 20, 20);
    assert.equal(editor.session(), null, 'Export crop owns its gesture');
    pointer('pointerup', 100, 100, {}, w); editor.stopExportCropDrawing();
    map.setZoom(16); editor.startBoxSelect(); pointer('pointerdown', 20, 20);
    assert.equal(editor.session(), null, 'OSM range selection owns its gesture');
    editor.cleanupBoxSelect(); map.setView(originalCenter, 7);

    const beforePan = map.getCenter();
    marquee([400, 400], [450, 430], { button: 1 });
    assert.ok(!map.getCenter().equals(beforePan), 'Middle mouse pans');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    const beforeSpacePan = map.getCenter();
    marquee([400, 400], [420, 410]);
    assert.ok(!map.getCenter().equals(beforeSpacePan), 'Space and left mouse pans');
    w.document.dispatchEvent(new w.KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    editor.setMapLocked(true);
    pointer('pointerdown', 400, 400, { button: 1 });
    assert.equal(editor.session(), null, 'Map lock prevents panning');
    marquee([20, 20], [250, 200]);
    assert.equal(map.dragging.enabled(), false, 'Selection preserves map lock');
    editor.setMapLocked(false); map.setView(originalCenter, 7);

    editor.clearMultiSelect(); click(a);
    pointer('pointerdown', 60, 60, {}, a.getElement());
    assert.equal(editor.session(), null, 'Selected vector retains direct dragging');
    a.fire('mousedown', { latlng: point(60, 60), originalEvent: new w.MouseEvent('mousedown', { button: 0 }) });
    assert.equal(editor.directMove(), true);
    const previous = a.getBounds().getCenter();
    map.fire('mousemove', { latlng: point(80, 70) }); map.fire('mouseup');
    const moved = a.getBounds().getCenter();
    assert.ok(!moved.equals(previous));
    editor.performUndo();
    const findA = () => editor.layers.buildings.getLayers().find(layer => layer.feature?.properties?.name === 'A');
    assert.ok(findA().getBounds().getCenter().equals(previous), 'Direct move can be undone');
    editor.performRedo();
    assert.ok(findA().getBounds().getCenter().equals(moved), 'Direct move can be redone');
    await testBatchStyles(w);
    testSharedInspector(w);
    testSidebarLayout(w);
    await testZoomPrecision(w);
    testBasemapLoading(dom);
    assert.deepEqual(errors, [], 'No runtime errors during interaction tests');
    console.log('PASS: marquee containment, visible layers, markers, Shift-add, Escape, clicks, jitter, touch, tool isolation, middle/space pan, map lock, direct move, undo/redo.');
  } finally {
    clearTimeout(deadline);
    dom.window.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
