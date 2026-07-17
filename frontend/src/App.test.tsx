import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Ryver branding', () => {
  render(<App />);
  const titleElement = screen.getByText(/Ryver/i);
  expect(titleElement).toBeInTheDocument();
});
