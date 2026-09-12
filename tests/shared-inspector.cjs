const assert = require('node:assert/strict');

module.exports = function testSharedInspector(w) {
  const app = w.eval(`({ map, layers, clearDrawableLayersForRestore, bindFeatureInteractions,
    toggleMultiSelect, clearMultiSelect, addIconMarker, addTextMarker, addTextElementMarker,
    performUndo, performRedo, setMode, undoStack, redoStack, layerToFeature, openLayerPopup,
    panel: multiSelectPanelElement, icons: ICON_TYPES, selected: () => [...multiSelected.keys()] })`);
  app.clearDrawableLayersForRestore();
  app.undoStack.length = 0;
  app.redoStack.length = 0;
  const point = (x, y) => app.map.containerPointToLatLng([x, y]);
  const json = value => JSON.parse(JSON.stringify(value));
  function polygon(name, x, labelSize, labelBgColor) {
    const layer = w.L.polygon([point(x, 150), point(x + 50, 150), point(x + 50, 200)],
      { fillColor: '#cccccc', color: '#222222', weight: 2 });
    const label = point(x + 20, 190);
    layer.feature = { type: 'Feature', properties: { kind: 'building', name, note: `${name} notes`,
      colorFill: '#cccccc', colorStroke: '#222222', strokeWidth: 2,
      labelSize, labelBgColor, labelLat: label.lat, labelLng: label.lng }, geometry: null };
    app.bindFeatureInteractions(layer, 'building');
    app.layers.buildings.addLayer(layer);
    return layer;
  }
  const a = polygon('Inspector A', 100, 'sm', 'transparent');
  const b = polygon('Inspector B', 200, 'xl', '#ffffff');
  const route = w.L.polyline([point(300, 150), point(330, 170)], { color: '#222222', weight: 2 });
  route.feature = { type: 'Feature', properties: { kind: 'route', name: 'Route', note: 'Route notes' }, geometry: null };
  app.bindFeatureInteractions(route, 'route');
  app.layers.routes.addLayer(route);
  const icons = [app.addIconMarker(point(100, 250), app.icons[0], 'icon A'), app.addIconMarker(point(150, 250), app.icons[1], 'icon B')];
  const titles = [app.addTextMarker(point(100, 300), 'First title'), app.addTextMarker(point(150, 300), 'Second title')];
  const compass = app.addTextElementMarker(point(200, 300), 'compass');
  const legend = app.addTextElementMarker(point(250, 300), 'legend');
  const content = w.document.getElementById('objectDetailContent');
  const detail = w.document.getElementById('objectDetailPanel');
  const choose = layers => {
    app.clearMultiSelect();
    layers.forEach(layer => app.toggleMultiSelect(layer, layer.feature.properties.kind));
    assert.equal(app.panel.parentElement, content, 'Shared controls belong to the existing right inspector');
    assert.equal(detail.classList.contains('hidden'), false);
    assert.equal(w.document.querySelector('#map > #multiSelectPanel'), null, 'No separate map overlay remains');
    for (const id of ['pf-name', 'pf-note', 'pf-text', 'pf-rotation', 'pf-rotate-fine', 'pf-edit-shape']) {
      assert.equal(content.querySelector(`#${id}`), null, `${id} is not batch-editable`);
    }
  };
  const field = name => app.panel.querySelector(`[data-multi-field="${name}"]`);
  const press = (name, value) => field(name).querySelector(`button[value="${value}"]`).click();
  function hex(name, value) {
    const input = field(name).querySelector('input[type="text"]');
    input.value = value;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  function identity(layer) {
    const feature = app.layerToFeature(layer);
    return json({ geometry: feature.geometry, name: feature.properties.name, note: feature.properties.note,
      text: feature.properties.text, iconId: feature.properties.iconId, labelLat: feature.properties.labelLat, labelLng: feature.properties.labelLng });
  }
  const originals = [a, b, route, ...icons, ...titles, compass, legend].map(identity);
  choose([a, b, route]);
  assert.equal(field('labelSize').dataset.mixed, 'true');
  assert.equal(field('labelSize').querySelector('[aria-pressed="true"]'), null);
  assert.equal(field('labelSize').querySelector('.multi-style-status').textContent, '多種 · 2 個物件');
  assert.equal(field('iconSize').hidden, true);
  assert.equal(field('textSize').hidden, true);
  assert.equal(field('arrow').hidden, false);
  const historyCount = app.undoStack.length;
  press('labelSize', 'lg');
  assert.equal(app.undoStack.length, historyCount + 1);
  press('labelBg', 'transparent');
  hex('labelColor', '334455');
  [a, b].forEach(layer => {
    assert.equal(layer.feature.properties.labelSize, 'lg');
    assert.equal(layer.feature.properties.labelBgColor, 'transparent');
    assert.equal(layer.feature.properties.labelTextColor, '#334455');
    assert.ok(layer._labelMarker.getElement().querySelector('.map-label').classList.contains('size-lg'));
    assert.equal(layer._labelMarker.getElement().querySelector('.map-label').style.background, 'transparent');
    assert.ok(layer._labelMarker.getLatLng().equals([layer.feature.properties.labelLat, layer.feature.properties.labelLng]));
    assert.ok(layer._labelMarker.getElement().classList.contains('multi-select-target-glow'), 'Recreated labels keep selection glow');
  });
  assert.equal(route.feature.properties.labelTextColor, undefined);
  assert.equal(field('labelBg').querySelector('button[value="transparent"]').getAttribute('aria-pressed'), 'true');
  press('width', '4');
  [a, b, route].forEach(layer => assert.equal(layer.options.weight, 4));
  hex('fill', '#aabbcc');
  [a, b].forEach(layer => assert.equal(layer.options.fillColor, '#aabbcc'));
  press('arrow', 'both');
  assert.equal(route.feature.properties.arrowMode, 'both');
  assert.equal(a.feature.properties.arrowMode, undefined);
  assert.equal(app.selected().length, 3, 'Editing in the inspector never clears selection');
  choose([route]);
  assert.equal(field('width').querySelectorAll('button')[2].value, '4.5', 'Route presets match the individual inspector');
  press('width', '4.5');
  assert.equal(route.feature.properties.strokeWidth, 4.5);

  choose(icons);
  assert.equal(field('fill').hidden, true);
  assert.equal(field('labelSize').hidden, true);
  assert.equal(field('iconSize').hidden, false);
  press('iconSize', 'xl');
  icons.forEach(marker => {
    assert.equal(marker.feature.properties.iconSize, 'xl');
    assert.equal(marker.options.icon.options.iconSize[0], 56);
    assert.ok(marker.getElement().classList.contains('multi-select-target-glow'));
  });
  assert.equal(app.panel.querySelector('#multiSelectUnion').disabled, true);

  choose([...titles, compass, legend]);
  press('textSize', 'sm');
  hex('textColor', '#112233');
  press('textBg', 'rgba(255,255,255,0.85)');
  hex('textBg', '#ddeeff');
  titles.forEach(marker => {
    assert.equal(marker.feature.properties.textSize, 'sm');
    assert.equal(marker.feature.properties.textColor, '#112233');
    assert.equal(marker.feature.properties.bgColor, '#ddeeff');
  });
  press('elementSize', 'lg');
  assert.equal(compass.feature.properties.elementSize, 'lg');
  assert.equal(legend.feature.properties.elementSize, 'lg');
  assert.equal(compass.feature.properties.textColor, undefined, 'Compass artwork must not be recolored as text');
  press('legendLayout', 'horizontal');
  assert.equal(legend.feature.properties.legendLayout, 'horizontal');
  assert.equal(compass.feature.properties.legendLayout, undefined);
  [a, b, route, ...icons, ...titles, compass, legend].forEach((layer, index) => assert.deepEqual(identity(layer), originals[index], 'Batch styling preserves individual content, geometry and label anchors'));

  choose([a, b]);
  hex('labelBg', '#abcdef');
  const find = name => app.layers.buildings.getLayers().find(layer => !layer._isLabel && layer.feature?.properties?.name === name);
  app.performUndo();
  assert.equal(find('Inspector A').feature.properties.labelBgColor, 'transparent');
  assert.equal(find('Inspector B').feature.properties.labelBgColor, 'transparent');
  app.performRedo();
  assert.equal(find('Inspector A').feature.properties.labelBgColor, '#abcdef');
  assert.equal(find('Inspector B').feature.properties.labelBgColor, '#abcdef');
  choose([find('Inspector A'), find('Inspector B')]);
  w.document.getElementById('objectDetailClose').click();
  assert.equal(app.selected().length, 0);
  assert.ok(detail.classList.contains('hidden'));
  choose([find('Inspector A'), find('Inspector B')]);
  app.panel.querySelector('#multiSelectClear').click();
  assert.equal(app.selected().length, 0);
  assert.ok(detail.classList.contains('hidden'));
  app.openLayerPopup(find('Inspector A'), 'building');
  assert.equal(w.document.getElementById('pf-name').value, 'Inspector A', 'Single selection still allows individual names');
  choose([find('Inspector A'), find('Inspector B')]);
  app.setMode('building');
  assert.equal(app.selected().length, 0, 'Changing tools ends shared editing');
  assert.ok(detail.classList.contains('hidden'));
  app.setMode('select');
  console.log('PASS: one right-hand inspector, name/note protection, label styles and positions, color hex, presets, icons, titles, compass/legend, mixed applicability, batch undo, close/clear and single-selection transitions.');
};
