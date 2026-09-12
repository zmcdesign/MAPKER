const assert = require('node:assert/strict');

module.exports = function testBasemapLoading(dom) {
  const w = dom.window;
  const app = w.eval(`({ map, baseStreet, baseSatellite, baseLabels, setBasemap, applyBasemapVisibility,
    syncActiveBasemapLayers, captureMapSnapshot, performUndo, performRedo,
    visible: () => basemapVisible, undoCount: () => undoStack.length })`);
  const notice = w.document.getElementById('basemapNotice');
  const link = w.document.getElementById('basemapNoticeLink');
  const message = w.document.getElementById('basemapNoticeMessage');
  const originalUrl = w.location.href;
  const originalFeatures = JSON.stringify(app.captureMapSnapshot().features);
  const originalCenter = app.map.getCenter();
  const originalZoom = app.map.getZoom();
  const tile = () => w.document.createElement('img');
  try {
    assert.equal(w.document.querySelector('meta[name="referrer"]').content, 'strict-origin-when-cross-origin');
    assert.equal(app.baseStreet._url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    assert.equal(app.baseStreet.options.referrerPolicy, 'strict-origin-when-cross-origin');
    assert.equal(app.baseStreet.options.updateWhenIdle, true);
    assert.equal(app.baseStreet.options.updateWhenZooming, false);
    app.setBasemap('street');
    app.applyBasemapVisibility(true, { silent: true });
    const renderedTile = app.baseStreet.getContainer().querySelector('img.leaflet-tile');
    assert.ok(renderedTile, 'HTTP page adds the OSM tile layer');
    assert.equal(renderedTile.referrerPolicy, 'strict-origin-when-cross-origin', 'Leaflet puts the policy on each tile image');
    assert.ok(renderedTile.src.startsWith('https://tile.openstreetmap.org/'));
    assert.ok(w.document.querySelector('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'));
    assert.equal(notice.hidden, true);

    // Synthetic Leaflet events exercise failures without downloading OSM tiles.
    const a = tile(), b = tile();
    app.baseStreet.fire('tileerror', { tile: a });
    app.baseStreet.fire('tileerror', { tile: b });
    assert.equal(notice.hidden, false);
    assert.ok(message.textContent.includes('403 / Access blocked'));
    assert.equal(link.href, 'https://wiki.openstreetmap.org/wiki/Blocked');
    app.baseStreet.fire('tileload', { tile: tile() });
    assert.equal(notice.hidden, false, 'An unrelated success must not conceal failed tiles');
    app.baseStreet.fire('tileload', { tile: a });
    assert.equal(notice.hidden, false, 'Keep the notice while another tile is still failed');
    app.baseStreet.fire('tileunload', { tile: b });
    assert.equal(notice.hidden, true, 'Clear the notice once no visible tiles are failed');

    const historyCount = app.undoCount();
    app.baseStreet.fire('tileerror', { tile: a });
    assert.equal(app.undoCount(), historyCount, 'Network errors are not editing operations');
    w.document.getElementById('basemapNoticeHide').click();
    assert.equal(app.visible(), false);
    assert.equal(notice.hidden, true);
    assert.equal(app.map.hasLayer(app.baseStreet), false);
    assert.equal(app.map.options.zoomDelta, 0.1, 'The existing fine-zoom setting still applies');
    assert.equal(app.undoCount(), historyCount + 1);
    app.performUndo();
    assert.equal(app.visible(), true);
    assert.equal(app.map.hasLayer(app.baseStreet), true);
    app.performRedo();
    assert.equal(app.visible(), false);
    app.applyBasemapVisibility(true, { silent: true });

    app.baseStreet.fire('tileerror', { tile: a });
    app.setBasemap('hybrid');
    assert.equal(notice.hidden, true, 'Switching away clears the old layer error');
    app.baseStreet.fire('tileerror', { tile: a });
    assert.equal(notice.hidden, true, 'Ignore late errors from an inactive layer');
    app.baseSatellite.fire('tileerror', { tile: a });
    assert.equal(link.hidden, true, 'An Esri error must not be blamed on OSM');
    app.baseLabels.fire('tileerror', { tile: b });
    app.baseSatellite.fire('tileload', { tile: a });
    assert.equal(notice.hidden, false, 'Hybrid notice includes the label layer');
    app.baseLabels.fire('tileunload', { tile: b });
    assert.equal(notice.hidden, true);

    dom.reconfigure({ url: 'file:///tmp/mapker-test.html' });
    app.setBasemap('street');
    assert.equal(app.map.hasLayer(app.baseStreet), false, 'Local files must not make unauthenticated OSM requests');
    assert.equal(notice.hidden, false);
    assert.ok(message.textContent.includes('本機'));
    assert.equal(link.hidden, false);
    assert.equal(link.href, 'https://mapker-2026.zmcdesign.workers.dev/');
    app.applyBasemapVisibility(false, { silent: true });
    assert.equal(notice.hidden, true);
    app.applyBasemapVisibility(true, { silent: true });
    assert.equal(app.map.hasLayer(app.baseStreet), false, 'Re-enabling a local basemap keeps the guard');
    assert.equal(notice.hidden, false);
    app.setBasemap('satellite');
    assert.equal(app.map.hasLayer(app.baseSatellite), true, 'Other existing providers retain their normal behavior');
    assert.equal(notice.hidden, true);
    app.setBasemap('street');
    dom.reconfigure({ url: 'http://127.0.0.1:8765/' });
    app.syncActiveBasemapLayers();
    assert.equal(app.map.hasLayer(app.baseStreet), true, 'A genuine local HTTP origin is supported');
    assert.equal(notice.hidden, true);
    assert.equal(JSON.stringify(app.captureMapSnapshot().features), originalFeatures, 'Basemap recovery preserves drawings');
    assert.ok(app.map.getCenter().equals(originalCenter));
    assert.equal(app.map.getZoom(), originalZoom);
    console.log('PASS: OSM endpoint/referrer/attribution, local-file guard, tile failures and recovery, hybrid failures, hide/undo/redo, no feature or camera changes.');
  } finally {
    dom.reconfigure({ url: originalUrl });
    app.setBasemap('street');
    app.applyBasemapVisibility(true, { silent: true });
  }
};
