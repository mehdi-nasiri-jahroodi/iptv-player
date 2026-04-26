import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Carousel } from './Carousel';

describe('Carousel', () => {
  test('renders region with label and navigation', () => {
    render(
      <Carousel ariaLabel="Test strip" prevFocusKey="CAR_P" nextFocusKey="CAR_N">
        <div style={{ width: 400 }}>A</div>
        <div style={{ width: 400 }}>B</div>
      </Carousel>
    );
    expect(screen.getByRole('region', { name: 'Test strip' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /previous/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /next/i })).toBeTruthy();
  });
});
