const assert = require('node:assert/strict');

module.exports = async function testColorSchemes(w) {
  const app = w.eval(`({ map, layers, COLOR_SCHEMES, clearDrawableLayersForRestore,
    restoreFeatureFromSnapshot, captureMapSnapshot, restoreMapSnapshot, layerToFeature,
    performUndo, performRedo, drawExportVectorLayer })`);
  const original = app.captureMapSnapshot();
  const expected = [
    { id: 'balanced', name: '柔和自然', colors: ['#FCF8EF', '#78C6A3', '#2782B8'] },
    { id: 'blueOrange', name: '對比鮮明', colors: ['#EEEEEE', '#EE8866', '#77AADD'] },
    { id: 'print', name: '低彩沉穩', colors: ['#F5F7F8', '#A5BDAB', '#79909E'] },
  ];
  const groups = { building: 'buildings', green: 'greens', pitch: 'pitches', campus: 'campus', route: 'routes' };
  const find = kind => app.layers[groups[kind]].getLayers().find(layer => layer.feature?.properties?.name === `palette-${kind}`);
  const feature = kind => ({
    type: 'Feature',
    properties: { name: `palette-${kind}`, kind, note: 'keep note', colorFill: '#ABCDEF',
      colorStroke: '#123456', strokeWidth: 3, fillOpacity: 0.37, dashStyle: 'short', dashArray: '6,4' },
    geometry: kind === 'route'
      ? { type: 'LineString', coordinates: [[121, 25], [121.001, 25.001]] }
      : { type: 'Polygon', coordinates: [[[121, 25], [121.001, 25], [121.001, 25.001], [121, 25]]] },
  });
  try {
    const buttons = [...w.document.querySelectorAll('[data-color-scheme]')];
    assert.equal(buttons.length, 3);
    expected.forEach((scheme, i) => {
      assert.equal(app.COLOR_SCHEMES[i].id, scheme.id, 'Keep saved palette IDs compatible');
      assert.equal(app.COLOR_SCHEMES[i].name, scheme.name);
      assert.equal('score' in app.COLOR_SCHEMES[i], false);
      assert.equal(buttons[i].querySelector('.color-scheme-title').textContent, scheme.name);
      assert.deepEqual([...buttons[i].querySelectorAll('.color-scheme-swatch')]
        .map(el => el.style.getPropertyValue('--scheme-fill')), scheme.colors);
      assert.ok(!buttons[i].textContent.includes('%') && !buttons[i].title.includes('%'));
    });
    assert.equal(w.document.querySelector('.color-scheme-score'), null);
    app.clearDrawableLayersForRestore();
    Object.keys(groups).forEach(kind => assert.equal(app.restoreFeatureFromSnapshot(feature(kind), kind), true));
    await new Promise(resolve => setTimeout(resolve, 20));
    const originalGeometry = Object.fromEntries(Object.keys(groups).map(kind => [kind, JSON.stringify(app.layerToFeature(find(kind)).geometry)]));
    let beforeLast;
    for (const scheme of expected) {
      beforeLast = app.captureMapSnapshot();
      w.document.querySelector(`[data-color-scheme="${scheme.id}"]`).click();
      assert.equal(w.document.querySelectorAll('[data-color-scheme][aria-pressed="true"]').length, 1);
      assert.equal(w.document.querySelector('[data-color-scheme][aria-pressed="true"]').dataset.colorScheme, scheme.id);
      for (const [kind, index] of [['building', 0], ['green', 1], ['pitch', 2], ['campus', 0]]) {
        const layer = find(kind);
        assert.equal(layer.options.fillColor, scheme.colors[index]);
        assert.equal(layer.feature.properties.colorFill, scheme.colors[index]);
        assert.equal(layer.options.color, '#2c2c2a');
        assert.equal(layer.options.weight, 3);
        assert.equal(layer.options.fillOpacity, 0.37, 'Preserve the user opacity');
        assert.equal(layer.options.dashArray, '6,4');
        assert.equal(layer.feature.properties.note, 'keep note');
        assert.equal(JSON.stringify(app.layerToFeature(layer).geometry), originalGeometry[kind]);
        const output = [];
        const ctx = new Proxy({ fill() { output.push(this.fillStyle); } }, {
          get: (target, key) => key in target ? target[key] : () => {},
        });
        app.drawExportVectorLayer(ctx, layer, groups[kind], { point: latlng => app.map.latLngToContainerPoint(latlng) });
        assert.deepEqual(output, [scheme.colors[index]], 'Image export uses the selected fill');
      }
      assert.equal(find('route').options.color, scheme.id === 'print' ? '#000000' : '#111111');
      assert.equal(find('route').options.dashArray, '6,4', 'Routes retain their dash style');
    }
    const after = app.captureMapSnapshot();
    app.performUndo();
    assert.equal(JSON.stringify(app.captureMapSnapshot().features), JSON.stringify(beforeLast.features));
    app.performRedo();
    assert.equal(JSON.stringify(app.captureMapSnapshot().features), JSON.stringify(after.features));
    assert.equal(app.captureMapSnapshot().settings.activeColorSchemeId, 'print');
    console.log('PASS: reference palette hex values/names, three swatches, no unverified scores, saved IDs, map fills, outline contrast, geometry/opacity preservation, image export and undo/redo.');
  } finally {
    app.restoreMapSnapshot(original);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
