import { render, screen } from '@testing-library/react';
import App from './App';

test('renders School Radio heading', () => {
  render(<App />);
  const headingElement = screen.getByText(/School Radio/i);
  expect(headingElement).toBeInTheDocument();
});
