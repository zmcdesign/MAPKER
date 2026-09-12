const assert = require('node:assert/strict');

module.exports = async function testBatchStyles(w) {
  const app = w.eval(`({ map, layers, layerVisible, clearDrawableLayersForRestore,
    bindFeatureInteractions, toggleMultiSelect, clearMultiSelect, addIconMarker, addTextMarker,
    performUndo, performRedo, undoStack, redoStack, captureMapSnapshot, layerToFeature,
    drawExportVectorLayer, applyRouteArrows, runBooleanOperation, applyColorScheme,
    selectedCount: () => multiSelected.size, panel: multiSelectPanelElement, icons: ICON_TYPES, schemes: COLOR_SCHEMES })`);
  app.clearDrawableLayersForRestore();
  app.undoStack.length = 0;
  app.redoStack.length = 0;
  app.layerVisible.greens = true;
  const point = (x, y) => app.map.containerPointToLatLng([x, y]);
  const json = value => JSON.parse(JSON.stringify(value));
  function vector(name, kind, x, line = false, custom = {}) {
    const coordinates = [point(x, 120), point(x + 50, 120), point(x + 50, 180)];
    const style = { colorFill: '#aabbcc', colorStroke: '#123456', strokeWidth: 2,
      fillOpacity: 0.35, opacity: 0.65, dashStyle: 'short', dashArray: '6,4', ...custom };
    const layer = line ? w.L.polyline(coordinates) : w.L.polygon(coordinates);
    layer.feature = { type: 'Feature', properties: { name, kind, ...style }, geometry: null };
    layer.setStyle({ fillColor: style.colorFill, color: style.colorStroke, weight: style.strokeWidth,
      fillOpacity: style.fillOpacity, opacity: style.opacity, dashArray: style.dashArray });
    app.bindFeatureInteractions(layer, kind);
    app.layers[{ building: 'buildings', campus: 'campus', green: 'greens', pitch: 'pitches', route: 'routes' }[kind]].addLayer(layer);
    return layer;
  }
  const building = vector('batch-building', 'building', 100);
  const campus = vector('batch-campus', 'campus', 200, false, { colorFill: '#fedcba', strokeWidth: 4 });
  const green = vector('batch-green', 'green', 300);
  const pitch = vector('batch-pitch', 'pitch', 400);
  const route = vector('batch-route', 'route', 500, true, { dashArray: '14,6', dashStyle: 'long' });
  const road = vector('batch-road', 'campus', 600, true);
  app.applyRouteArrows(route, 'end');
  const untouched = vector('unselected', 'building', 700);
  const icon = app.addIconMarker(point(150, 250), app.icons[0], 'untouched icon');
  const text = app.addTextMarker(point(200, 250), 'Untouched title');
  const polygons = [building, campus, green, pitch];
  const vectors = [...polygons, route, road];
  const targets = [...vectors, icon, text];
  const originals = vectors.map(layer => json(layer.options));
  const untargeted = [untouched, icon, text].map(layer => json(app.layerToFeature(layer)));
  function select(layers) {
    app.clearMultiSelect();
    layers.forEach(layer => app.toggleMultiSelect(layer, layer.feature.properties.kind));
  }
  const controls = Object.fromEntries(['Fill', 'Stroke', 'Width'].map(name =>
    [name.toLowerCase(), app.panel.querySelector(`#multiStyle${name}`)]));
  const dashField = app.panel.querySelector('[data-multi-field="dash"]');
  const selectedDash = () => dashField.querySelector('[aria-pressed="true"]')?.value || '';
  function edit(field, value, type = 'change') {
    if (field === 'dash') {
      dashField.querySelector(`[value="${value}"]`).click();
      return;
    }
    controls[field].value = value;
    controls[field].dispatchEvent(new w.Event(type, { bubbles: true }));
  }
  function find(name) {
    return Object.values(app.layers).flatMap(group => group.getLayers())
      .find(layer => !layer._isLabel && layer.feature?.properties?.name === name);
  }
  select(targets);
  vectors.forEach((layer, index) => assert.deepEqual(json(layer.options), originals[index], 'Selecting preserves real styles'));
  assert.equal(controls.fill.dataset.mixed, 'true');
  assert.equal(w.document.getElementById('multiStyleFillStatus').textContent, '多種 · 4 個物件');
  assert.equal(w.document.getElementById('multiStyleStrokeStatus').textContent, '6 個物件');
  assert.equal(controls.width.value, '');
  assert.equal(controls.width.placeholder, '多種');
  assert.equal(selectedDash(), '');
  assert.equal(controls.stroke.dataset.mixed, 'false');
  assert.equal(controls.stroke.value, '#123456');
  const originalConfirm = w.confirm;
  let confirmationCount = 0;
  w.confirm = () => { confirmationCount++; return false; };
  controls.width.focus();
  for (const key of ['Delete', 'Backspace']) controls.width.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));
  controls.width.blur();
  w.confirm = originalConfirm;
  assert.equal(confirmationCount, 0, 'Editing a style menu must not trigger object deletion');

  edit('fill', '#bbccdd', 'input');
  edit('fill', '#ddeeff', 'input');
  assert.equal(app.undoStack.length, 0, 'Live previews share a pending transaction');
  polygons.forEach(layer => {
    assert.equal(layer.options.fillColor, '#ddeeff');
    assert.equal(layer.options.fillOpacity, 0.35);
    assert.equal(layer.options.color, '#123456');
  });
  assert.equal(route.options.fillColor, '#aabbcc', 'Lines do not receive polygon fill');
  edit('fill', '#ddeeff');
  assert.equal(app.undoStack.length, 1, 'The entire color edit is a single undo step');
  edit('fill', '#ddeeff');
  assert.equal(app.undoStack.length, 1, 'No-op edits must not add history');
  assert.equal(controls.fill.dataset.mixed, 'false');
  assert.equal(w.document.getElementById('multiStyleFillStatus').textContent, '4 個物件');

  edit('stroke', '#224466');
  edit('width', '5');
  edit('dash', 'solid');
  assert.equal(app.undoStack.length, 4);
  vectors.forEach(layer => {
    assert.equal(layer.options.color, '#224466');
    assert.equal(layer.options.weight, 5);
    assert.equal(layer.options.opacity, 0.65, 'Width does not reset custom opacity');
    assert.equal(layer.options.dashArray, null);
    assert.equal(layer.feature.properties.dashStyle, 'solid');
    assert.equal(layer.feature.properties.strokeWidth, 5);
  });
  assert.ok(route._path.getAttribute('marker-end'), 'Styling preserves route arrows');
  [untouched, icon, text].forEach((layer, index) => assert.deepEqual(json(app.layerToFeature(layer)), untargeted[index], 'Unselected and unsupported objects remain untouched'));
  const savedStyles = vectors.map(layer => json(layer.options));
  app.clearMultiSelect();
  vectors.forEach((layer, index) => assert.deepEqual(json(layer.options), savedStyles[index], 'Deselecting never reverts batch styles'));

  app.performUndo();
  assert.equal(find('batch-route').options.dashArray, '14,6');
  assert.equal(find('batch-campus').options.color, '#224466');
  app.performRedo();
  const names = vectors.map(layer => layer.feature.properties.name);
  names.forEach(name => assert.equal(find(name).options.dashArray, null, 'Redo preserves explicit solid lines instead of palette defaults'));
  app.performUndo(); app.performUndo(); app.performUndo(); app.performUndo();
  assert.equal(find('batch-campus').options.fillColor, '#fedcba');
  assert.equal(find('batch-building').options.fillColor, '#aabbcc');
  assert.equal(find('batch-campus').options.weight, 4);
  app.performRedo(); app.performRedo(); app.performRedo(); app.performRedo();
  const restoredVectors = names.map(find);
  select(restoredVectors);
  const historyCount = app.undoStack.length;
  for (const value of ['-1', '21', '2.3', '']) edit('width', value);
  assert.equal(app.undoStack.length, historyCount, 'Invalid widths must not edit the selection');
  assert.equal(find('batch-campus').options.weight, 5);
  edit('width', '0');
  assert.equal(find('batch-campus').feature.properties.strokeWidth, 0);
  assert.equal(find('batch-route').options.opacity, 0);
  app.clearMultiSelect();

  // Exercise the real file-import handler, including palette fallback paths.
  const saved = json(app.captureMapSnapshot());
  app.clearDrawableLayersForRestore();
  const importInput = w.document.getElementById('importFile');
  Object.defineProperty(importInput, 'files', { configurable: true,
    value: [{ text: async () => JSON.stringify({ type: 'FeatureCollection', features: saved.features }) }] });
  importInput.dispatchEvent(new w.Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 30));
  names.forEach(name => {
    const layer = find(name);
    assert.ok(layer, `Imported ${name}`);
    assert.equal(layer.options.weight, 0, 'Import preserves hidden outlines');
    assert.equal(layer.options.dashArray, null, 'Import preserves solid style');
    assert.equal(layer.options.color, '#224466');
  });
  const exported = { fills: [], strokes: [], dash: null };
  const ctx = new Proxy({
    fill() { exported.fills.push(this.fillStyle); },
    stroke() { exported.strokes.push(this.strokeStyle); },
    setLineDash(value) { exported.dash = Array.from(value); },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const projector = { point: latlng => app.map.latLngToContainerPoint(latlng) };
  app.drawExportVectorLayer(ctx, find('batch-route'), 'routes', projector);
  assert.equal(exported.fills.length, 0, 'Hidden routes must not leave arrows in exports');
  select([find('batch-building'), find('batch-route')]);
  edit('width', '3');
  app.drawExportVectorLayer(ctx, find('batch-building'), 'buildings', projector);
  assert.deepEqual(exported.fills, ['#ddeeff']);
  assert.deepEqual(exported.strokes, ['#224466']);
  assert.deepEqual(exported.dash, []);

  select([find('batch-route'), find('batch-road')]);
  assert.equal(controls.fill.disabled, true);
  assert.equal(controls.stroke.disabled, false);
  const noFillHistory = app.undoStack.length;
  edit('fill', '#ff0000');
  assert.equal(app.undoStack.length, noFillHistory);
  select([find('batch-route')]);
  const pendingHistory = app.undoStack.length;
  edit('stroke', '#993344', 'input');
  app.toggleMultiSelect(find('batch-building'), 'building');
  assert.equal(app.undoStack.length, pendingHistory + 1, 'Selection changes commit pending previews');
  assert.equal(controls.stroke.dataset.mixed, 'true');
  edit('stroke', '#665544');
  app.performUndo();
  assert.equal(find('batch-route').options.color, '#993344');
  assert.equal(find('batch-building').options.color, '#224466');
  const importedIcon = app.layers.icons.getLayers().find(layer => !layer._isLabel);
  const importedText = app.layers.texts.getLayers().find(layer => !layer._isLabel);
  select([importedIcon, importedText]);
  Object.values(controls).forEach(control => assert.equal(control.disabled, true));

  select([find('batch-building'), find('batch-campus')]);
  edit('fill', '#abcdef');
  edit('dash', 'long');
  app.runBooleanOperation('union');
  assert.equal(app.selectedCount(), 0, 'Successful boolean operation clears selection');
  const union = app.layers.buildings.getLayers().find(layer => layer.feature?.properties?.colorFill === '#abcdef');
  assert.ok(union, 'Boolean operations still work after style edits');
  assert.equal(union.options.fillColor, '#abcdef');
  assert.equal(union.options.dashArray, '14,6');
  select([find('batch-route')]);
  edit('dash', 'solid');
  app.applyColorScheme(app.schemes[1].id);
  assert.equal(find('batch-route').options.dashArray, null, 'Changing palette does not replace explicit solid style');
  assert.equal(selectedDash(), 'solid');
  assert.equal(controls.stroke.value, find('batch-route').options.color.toLowerCase(), 'The batch panel follows palette changes');
  app.clearMultiSelect();
  console.log('PASS: batch styles, mixed states, target filtering, live preview, no-op and invalid edits, deselection, grouped undo/redo, import, export, arrows, boolean styles.');
};
