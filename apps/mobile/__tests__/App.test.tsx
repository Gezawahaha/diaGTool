/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders the dashboard without presenting unavailable data as real', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  // Async act flushes the BLE bootstrap's startup promises.
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('AXS Diagnostic Lab');
  expect(text).toContain('None recorded');
  expect(text).toContain('Firmware recovery not yet supported');
  expect(text).toContain('Scan for devices');

  await ReactTestRenderer.act(async () => renderer.unmount());
});
