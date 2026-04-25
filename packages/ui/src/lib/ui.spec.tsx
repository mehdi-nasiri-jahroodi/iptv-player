import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Ui } from './ui';

vi.mock('@noriginmedia/norigin-spatial-navigation', () => ({
  useFocusable: () => ({
    ref: { current: null },
    focused: false,
    focusSelf: vi.fn(),
    hasFocusedChild: false,
    focusKey: 'mock',
  }),
}));

describe('Ui', () => {
  it('renders package title', () => {
    render(<Ui />);
    expect(screen.getByText('packages/ui')).toBeTruthy();
  });
});
