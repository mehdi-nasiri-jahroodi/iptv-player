import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SourceValidationResult } from 'core';
import { SourceForm, draftToSubmission, type SourceFormSubmission } from './SourceForm';

// Norigin needs a DOM but `useFocusable` calls into `init()` machinery we
// don't have during unit tests. Mock it to a no-op that still returns a ref
// so refs forwarded by Button/TextField/Tabs continue to work.
vi.mock('@noriginmedia/norigin-spatial-navigation', () => ({
  useFocusable: () => ({
    ref: { current: null },
    focused: false,
    focusSelf: vi.fn(),
    hasFocusedChild: false,
    focusKey: 'mock',
  }),
}));

const ok: SourceValidationResult = { ok: true, source: { id: 's', label: 'x', type: 'm3u_url', url: 'https://x' } };
const err = (code: string, message = 'oops'): SourceValidationResult => ({ ok: false, code: code as never, message });

function getSubmit() {
  return screen.getByRole('button', { name: /validate.*save/i });
}

describe('draftToSubmission', () => {
  it('maps m3u_url draft with paste-fallback', () => {
    expect(
      draftToSubmission({
        mode: 'm3u_url',
        label: 'P',
        url: 'https://e/x.m3u',
        epgUrl: '',
        useRawText: true,
        rawText: '#EXTM3U\n',
      })
    ).toEqual<SourceFormSubmission>({
      source: { label: 'P', type: 'm3u_url', url: 'https://e/x.m3u', epgUrl: undefined },
      rawText: '#EXTM3U\n',
    });
  });

  it('maps m3u_file draft (rawText is required, epgUrl trimmed)', () => {
    expect(
      draftToSubmission({
        mode: 'm3u_file',
        label: 'F',
        epgUrl: '  https://epg  ',
        rawText: '#EXTM3U',
      })
    ).toEqual<SourceFormSubmission>({
      source: { label: 'F', type: 'm3u_file', epgUrl: 'https://epg' },
      rawText: '#EXTM3U',
    });
  });

  it('maps xtream draft into credentials', () => {
    expect(
      draftToSubmission({
        mode: 'xtream',
        label: 'X',
        host: 'https://h:8080',
        username: 'u',
        password: 'p',
        epgUrl: '',
      })
    ).toEqual<SourceFormSubmission>({
      source: {
        label: 'X',
        type: 'xtream',
        credentials: { host: 'https://h:8080', username: 'u', password: 'p' },
        epgUrl: undefined,
      },
    });
  });
});

describe('SourceForm', () => {
  it('renders all three tabs and starts on xtream', () => {
    render(<SourceForm onSubmit={async () => ok} />);
    expect(screen.getByRole('tab', { name: 'Xtream Codes' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'M3U URL' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tab', { name: 'M3U file' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByLabelText(/server url/i)).toBeTruthy();
  });

  it('switches tabs and shows the matching fields', () => {
    render(<SourceForm onSubmit={async () => ok} />);
    fireEvent.click(screen.getByRole('tab', { name: 'M3U URL' }));
    expect(screen.getByRole('tab', { name: 'M3U URL' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText(/playlist url/i)).toBeTruthy();
  });

  it('shows Zod field errors and does not call onSubmit', async () => {
    const onSubmit = vi.fn(async () => ok);
    render(<SourceForm initialMode="m3u_url" onSubmit={onSubmit} />);
    fireEvent.click(getSubmit());
    expect(await screen.findByText(/label is required/i)).toBeTruthy();
    expect(await screen.findByText(/enter a valid url/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid m3u_url draft and fires onSuccess with the source', async () => {
    const onSubmit = vi.fn<(s: SourceFormSubmission) => Promise<SourceValidationResult>>(async () => ok);
    const onSuccess = vi.fn();
    render(<SourceForm initialMode="m3u_url" onSubmit={onSubmit} onSuccess={onSuccess} />);

    fireEvent.input(screen.getByLabelText(/label/i), { target: { value: 'My provider' } });
    fireEvent.input(screen.getByLabelText(/playlist url/i), {
      target: { value: 'https://provider.example/list.m3u' },
    });
    fireEvent.click(getSubmit());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual<SourceFormSubmission>({
      source: {
        label: 'My provider',
        type: 'm3u_url',
        url: 'https://provider.example/list.m3u',
        epgUrl: undefined,
      },
      rawText: undefined,
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('renders the inline error mapped from a validation error code', async () => {
    const onSubmit = vi.fn(async () => err('cors_blocked'));
    render(<SourceForm initialMode="m3u_url" onSubmit={onSubmit} />);
    fireEvent.input(screen.getByLabelText(/label/i), { target: { value: 'P' } });
    fireEvent.input(screen.getByLabelText(/playlist url/i), {
      target: { value: 'https://e/x.m3u' },
    });
    fireEvent.click(getSubmit());
    const alert = await screen.findByRole('alert');
    expect(alert.getAttribute('data-error-code')).toBe('cors_blocked');
    expect(alert.textContent).toMatch(/cors/i);
  });

  it('toggles the paste-raw-text textarea on the M3U URL tab', () => {
    render(<SourceForm initialMode="m3u_url" onSubmit={async () => ok} />);
    expect(screen.queryByLabelText(/pasted playlist content/i)).toBeNull();
    fireEvent.click(screen.getByLabelText(/host blocks cors/i));
    expect(screen.getByLabelText(/pasted playlist content/i)).toBeTruthy();
  });

  it('on the Xtream tab, submits credentials shape', async () => {
    const onSubmit = vi.fn<(s: SourceFormSubmission) => Promise<SourceValidationResult>>(async () => ok);
    render(<SourceForm onSubmit={onSubmit} />);
    // Xtream is the default tab; no click needed.
    fireEvent.input(screen.getByLabelText(/label/i), { target: { value: 'X' } });
    fireEvent.input(screen.getByLabelText(/server url/i), {
      target: { value: 'https://provider.example:8080' },
    });
    fireEvent.input(screen.getByLabelText(/username/i), { target: { value: 'u' } });
    fireEvent.input(screen.getByLabelText(/^password/i), { target: { value: 'p' } });
    fireEvent.click(getSubmit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submission = onSubmit.mock.calls[0][0];
    expect(submission.source.type).toBe('xtream');
    if (submission.source.type === 'xtream') {
      expect(submission.source.credentials).toEqual({
        host: 'https://provider.example:8080',
        username: 'u',
        password: 'p',
      });
    }
  });
});
