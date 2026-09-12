const assert = require('node:assert/strict');

module.exports = async function testZoomPrecision(w) {
  const app = w.eval(`({ map, layers, applyBasemapVisibility, setBasemap, setMapLocked,
    performUndo, performRedo, captureMapSnapshot, restoreMapSnapshot,
    visible: () => basemapVisible, undoCount: () => undoStack.length })`);
  const map = app.map;
  const mapEl = map.getContainer();
  const originalSnapshot = app.captureMapSnapshot();
  const any3d = w.L.Browser.any3d;
  const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
  const zoomButton = direction => w.document.querySelector(`.leaflet-control-zoom-${direction}`).click();
  const keyZoom = key => {
    mapEl.focus();
    mapEl.dispatchEvent(new w.KeyboardEvent('keydown', { key, keyCode: key === '+' ? 187 : 189, bubbles: true }));
  };
  const checkbox = w.document.querySelector('.layer input[data-layer="basemap"]');
  const toggle = w.document.getElementById('basemapVisibilityToggle');
  const pause = () => new Promise(resolve => setTimeout(resolve, 80));
  async function wheel(deltaY) {
    mapEl.dispatchEvent(new w.WheelEvent('wheel', { deltaY, deltaMode: 0,
      clientX: 300 + 490, clientY: 360, bubbles: true, cancelable: true }));
    await pause();
  }
  try {
    // jsdom has no compositor; enable Leaflet's fractional-zoom capability flag.
    w.L.Browser.any3d = true;
    app.applyBasemapVisibility(true, { silent: true });
    map.setView([25.04, 121.53], 17, { animate: false });
    const originalCenter = map.getCenter();
    const originalFeatures = JSON.stringify(app.captureMapSnapshot().features);
    zoomButton('in'); close(map.getZoom(), 18, 'Visible basemap uses whole-level buttons');
    zoomButton('out'); close(map.getZoom(), 17, 'Visible basemap zoom out');
    keyZoom('+'); close(map.getZoom(), 18, 'Visible basemap keyboard step');
    keyZoom('-'); close(map.getZoom(), 17, 'Visible basemap keyboard zoom out');

    toggle.click();
    assert.equal(app.visible(), false);
    assert.equal(map.options.zoomSnap, 0.1);
    assert.equal(map.options.zoomDelta, 0.1);
    assert.equal(map.options.wheelPxPerZoomLevel, 600);
    close(map.getZoom(), 17, 'Hiding the basemap does not change zoom');
    assert.ok(map.getCenter().equals(originalCenter), 'Hiding the basemap does not pan');
    const historyCount = app.undoCount();
    zoomButton('in'); close(map.getZoom(), 17.1, 'Fine zoom button');
    zoomButton('out'); close(map.getZoom(), 17, 'Fine zoom out button');
    keyZoom('+'); close(map.getZoom(), 17.1, 'Keyboard picks up the new increment');
    keyZoom('-'); close(map.getZoom(), 17, 'Fine keyboard zoom out');
    await wheel(-60);
    close(map.getZoom(), 17.1, 'A small wheel movement uses a tenth-level step');
    await wheel(60);
    close(map.getZoom(), 17, 'Fine wheel zoom out');
    map.setZoom(17.3, { animate: false });
    close(map.getZoom(), 17.3, 'Fractional zoom survives snapping');
    assert.equal(JSON.stringify(app.captureMapSnapshot().features), originalFeatures, 'Zoom does not mutate feature coordinates or styles');
    assert.equal(app.undoCount(), historyCount, 'Zoom gestures do not fill map history');

    app.setBasemap('satellite');
    assert.equal(map.options.zoomDelta, 0.1, 'Switching a hidden basemap keeps fine zoom');
    checkbox.checked = true;
    checkbox.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(app.visible(), true);
    assert.equal(map.options.zoomSnap, 1);
    assert.equal(map.options.zoomDelta, 1);
    assert.equal(map.options.wheelPxPerZoomLevel, 60);
    close(map.getZoom(), 17.3, 'Showing tiles does not round the current camera');
    app.performUndo();
    assert.equal(app.visible(), false);
    assert.equal(map.options.zoomDelta, 0.1);
    close(map.getZoom(), 17.3, 'Undo restores the fractional view');
    app.performRedo();
    assert.equal(app.visible(), true);
    assert.equal(map.options.zoomDelta, 1);
    close(map.getZoom(), 17.3, 'Redo preserves a fractional view even with normal snapping');
    map.setZoom(17, { animate: false });
    keyZoom('+'); close(map.getZoom(), 18, 'Keyboard returns to normal increments');
    map.setZoom(17, { animate: false });
    await wheel(-60);
    assert.ok(map.getZoom() >= 18, 'Wheel returns to normal speed');

    app.setMapLocked(true);
    toggle.click();
    assert.equal(map.scrollWheelZoom.enabled(), false, 'Changing precision must not unlock wheel zoom');
    assert.equal(map.keyboard.enabled(), false, 'Changing precision must not unlock keyboard zoom');
    const lockedZoom = map.getZoom();
    await wheel(-60); keyZoom('+');
    close(map.getZoom(), lockedZoom, 'Locked map ignores zoom gestures');
    app.setMapLocked(false);
    assert.equal(map.keyboard.enabled(), true);
    keyZoom('+'); close(map.getZoom(), lockedZoom + 0.1, 'Fine zoom remains after unlocking');

    const hiddenSnapshot = app.captureMapSnapshot();
    app.applyBasemapVisibility(true, { silent: true });
    app.restoreMapSnapshot(hiddenSnapshot);
    assert.equal(map.options.zoomSnap, 0.1);
    close(map.getZoom(), hiddenSnapshot.view.zoom, 'Snapshot restoration sets precision before restoring the view');
  } finally {
    mapEl.blur();
    app.setMapLocked(false);
    app.restoreMapSnapshot(originalSnapshot);
    w.L.Browser.any3d = any3d;
  }
  console.log('PASS: fine zoom buttons, wheel, keyboard, fractional snapping, basemap toggles, hidden source switching, map lock, coordinate stability, history and exact camera restoration.');
};
