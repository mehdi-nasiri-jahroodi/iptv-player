import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ChannelList, type ChannelListItem } from './ChannelList';

const ITEMS: ChannelListItem[] = [
  { id: 'c1', focusKey: 'C1', name: 'News One', groupTitle: 'News' },
  { id: 'c2', focusKey: 'C2', name: 'Sports One', groupTitle: 'Sports' },
];

describe('ChannelList', () => {
  test('renders an empty placeholder when no items are provided', () => {
    render(<ChannelList items={[]} empty="Nothing here" />);
    expect(screen.getByTestId('channel-list-empty').textContent).toBe(
      'Nothing here'
    );
  });

  test('renders one row per item with name + group', () => {
    render(<ChannelList items={ITEMS} />);
    const list = screen.getByTestId('channel-list');
    expect(list).toBeTruthy();
    expect(screen.getByText('News One')).toBeTruthy();
    expect(screen.getByText('Sports One')).toBeTruthy();
  });

  test('marks the selected item with aria-pressed and forwards onSelect', () => {
    const onSelect = vi.fn();
    render(<ChannelList items={ITEMS} selectedId="c2" onSelect={onSelect} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith('c1');
  });
});
