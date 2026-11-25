/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders the dashboard without presenting unavailable data as real', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('AXS Diagnostic Lab');
  expect(text).toContain('Not Available');
  expect(text).toContain('Firmware recovery not yet supported');
});
