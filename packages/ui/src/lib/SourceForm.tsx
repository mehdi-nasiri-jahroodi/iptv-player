import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod/v3';
import type { Source, SourceValidationResult } from 'core';
import { Button } from './Button';
import { FormField } from './FormField';
import { Tabs, type TabItem } from './Tabs';
import { TextArea } from './TextArea';
import { TextField } from './TextField';

// ---------------------------------------------------------------------------
// Internal draft schema — the shape of the form state.
//
// `Source` (in `packages/core`) is the persisted shape and is too tight for
// a form draft (e.g. xtream credentials are required only when the tab is
// selected). We model the draft as a discriminated union on `mode` so RHF +
// zodResolver narrows fields per tab.
// ---------------------------------------------------------------------------

const labelField = z.string().min(1, 'Label is required.');
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^https?:\/\//i.test(v), {
    message: 'Must start with http:// or https://',
  });

const optionalUserAgent = z.string().optional();

const m3uUrlDraftSchema = z.object({
  mode: z.literal('m3u_url'),
  label: labelField,
  url: z.string().url('Enter a valid URL (https://...).'),
  userAgent: optionalUserAgent,
  epgUrl: optionalUrl,
  useRawText: z.boolean(),
  rawText: z.string(),
});

const m3uFileDraftSchema = z
  .object({
    mode: z.literal('m3u_file'),
    label: labelField,
    userAgent: optionalUserAgent,
    epgUrl: optionalUrl,
    rawText: z.string().min(1, 'Pick a file or paste M3U content.'),
  });

const xtreamDraftSchema = z.object({
  mode: z.literal('xtream'),
  label: labelField,
  host: z.string().url('Server URL must include scheme (https://...).'),
  username: z.string().min(1, 'Username is required.'),
  password: z.string().min(1, 'Password is required.'),
  userAgent: optionalUserAgent,
  epgUrl: optionalUrl,
});

export const sourceFormDraftSchema = z.discriminatedUnion('mode', [
  m3uUrlDraftSchema,
  m3uFileDraftSchema,
  xtreamDraftSchema,
]);
export type SourceFormDraft = z.infer<typeof sourceFormDraftSchema>;
export type SourceFormMode = SourceFormDraft['mode'];

// ---------------------------------------------------------------------------
// Public component types
// ---------------------------------------------------------------------------

/**
 * Shape passed to the caller's `onSubmit`. It mirrors `Source` (without `id`
 * — the page generates one) plus `rawText` for the M3U-file path and the
 * URL paste-fallback path.
 */
export type SourceFormSubmission = {
  source: Omit<Source, 'id'>;
  rawText?: string;
};

export type SourceFormProps = {
  /** Initial tab; defaults to `m3u_url`. */
  initialMode?: SourceFormMode;
  /**
   * Async submit handler. Caller is responsible for calling
   * `validateSource(...)` from `packages/core` and returning its result.
   */
  onSubmit: (submission: SourceFormSubmission) => Promise<SourceValidationResult>;
  /** Called with the validated `Source` shape after `onSubmit` resolves ok. */
  onSuccess?: (source: Omit<Source, 'id'>) => void;
  /** Optional cancel handler — if provided, a Cancel button is rendered. */
  onCancel?: () => void;
};

// ---------------------------------------------------------------------------
// Error code → human message mapping. Mirrors `SourceValidationErrorCode`
// from `packages/core/src/lib/source-validator.ts`.
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  invalid_url: 'The source data is incomplete or invalid.',
  cors_blocked:
    'The browser blocked this request (CORS). Use the "paste raw text" option below or import a file.',
  unreachable: 'Could not reach the source. Check the URL and your connection.',
  parse_error: 'The content could not be parsed as M3U.',
  empty_content: 'The source returned no content.',
  auth_failed: 'The Xtream panel rejected these credentials.',
  unexpected_payload:
    'The Xtream panel returned an unexpected response. The server may be down or behind a captive portal.',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TAB_ITEMS: readonly TabItem<SourceFormMode>[] = [
  { value: 'xtream', label: 'Xtream Codes' },
  { value: 'm3u_url', label: 'M3U URL' },
  { value: 'm3u_file', label: 'M3U file' },
];

function defaultDraftFor(mode: SourceFormMode): SourceFormDraft {
  switch (mode) {
    case 'm3u_url':
      return {
        mode,
        label: '',
        url: '',
        userAgent: '',
        epgUrl: '',
        useRawText: false,
        rawText: '',
      };
    case 'm3u_file':
      return { mode, label: '', userAgent: '', rawText: '', epgUrl: '' };
    case 'xtream':
      return {
        mode,
        label: '',
        host: '',
        username: '',
        password: '',
        userAgent: '',
        epgUrl: '',
      };
  }
}

export function SourceForm({
  initialMode = 'xtream',
  onSubmit,
  onSuccess,
  onCancel,
}: SourceFormProps) {
  const [submitState, setSubmitState] = useState<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'error'; code: string; message: string }
  >({ status: 'idle' });

  const form = useForm<SourceFormDraft>({
    resolver: zodResolver(sourceFormDraftSchema),
    mode: 'onSubmit',
    defaultValues: defaultDraftFor(initialMode),
  });

  const mode = form.watch('mode');
  // `useRawText` only exists in the m3u_url draft variant; fall through
  // `unknown` because RHF's `watch` typing doesn't narrow on a discriminator.
  const watchedUseRawText = form.watch('useRawText' as never) as unknown as boolean | undefined;
  const useRawText = mode === 'm3u_url' && Boolean(watchedUseRawText);

  const switchMode = (next: SourceFormMode) => {
    // Reset to mode-appropriate defaults so RHF doesn't carry hidden field
    // errors across tabs and Zod's discriminated union narrows correctly.
    if (next === 'm3u_url') {
      form.reset({
        mode: 'm3u_url',
        label: form.getValues('label'),
        url: '',
        userAgent: (form.getValues('userAgent' as never) as unknown as string) ?? '',
        epgUrl: form.getValues('epgUrl') ?? '',
        useRawText: false,
        rawText: '',
      });
    } else if (next === 'm3u_file') {
      form.reset({
        mode: 'm3u_file',
        label: form.getValues('label'),
        userAgent: (form.getValues('userAgent' as never) as unknown as string) ?? '',
        epgUrl: form.getValues('epgUrl') ?? '',
        rawText: '',
      });
    } else {
      form.reset({
        mode: 'xtream',
        label: form.getValues('label'),
        host: '',
        username: '',
        password: '',
        userAgent: (form.getValues('userAgent' as never) as unknown as string) ?? '',
        epgUrl: form.getValues('epgUrl') ?? '',
      });
    }
    setSubmitState({ status: 'idle' });
  };

  const handleFormSubmit = form.handleSubmit(async (draft) => {
    setSubmitState({ status: 'submitting' });
    const submission = draftToSubmission(draft);
    try {
      const result = await onSubmit(submission);
      if (result.ok) {
        setSubmitState({ status: 'idle' });
        onSuccess?.(submission.source);
      } else {
        setSubmitState({
          status: 'error',
          code: result.code,
          message: ERROR_MESSAGES[result.code] ?? result.message,
        });
      }
    } catch (error) {
      setSubmitState({
        status: 'error',
        code: 'unexpected',
        message: error instanceof Error ? error.message : 'Unknown error.',
      });
    }
  });

  const onFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void handleFormSubmit();
  };

  return (
    <form
      onSubmit={onFormSubmit}
      noValidate
      aria-label="Add source"
      className="flex flex-col gap-5"
    >
      <Tabs
        items={TAB_ITEMS}
        value={mode}
        onChange={switchMode}
        focusKeyPrefix="source-form-tab"
        ariaLabel="Source type"
      />

      <FormField
        label="Label"
        required
        error={form.formState.errors.label?.message}
        hint="Shown in the sources list — pick something memorable."
      >
        {({ inputId, describedBy }) => (
          <TextField
            id={inputId}
            aria-describedby={describedBy}
            placeholder="My provider"
            invalid={Boolean(form.formState.errors.label)}
            focusKey="source-form-label"
            {...form.register('label')}
          />
        )}
      </FormField>

      {mode === 'm3u_url' ? (
        <>
          <FormField
            label="Playlist URL"
            required
            error={(form.formState.errors as Record<string, { message?: string }>).url?.message}
            hint="Direct link to an .m3u or .m3u8 playlist."
          >
            {({ inputId, describedBy }) => (
              <TextField
                id={inputId}
                aria-describedby={describedBy}
                type="url"
                placeholder="https://provider.example/list.m3u"
                invalid={Boolean((form.formState.errors as Record<string, unknown>).url)}
                focusKey="source-form-url"
                {...form.register('url' as never)}
              />
            )}
          </FormField>

          <Controller
            control={form.control}
            name={'useRawText' as never}
            render={({ field }) => (
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={Boolean(field.value)}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
                My host blocks CORS — let me paste the playlist instead.
              </label>
            )}
          />

          {useRawText ? (
            <FormField
              label="Pasted playlist content"
              error={
                (form.formState.errors as Record<string, { message?: string }>).rawText?.message
              }
              hint="Open the playlist in your browser, copy all, paste here."
            >
              {({ inputId, describedBy }) => (
                <TextArea
                  id={inputId}
                  aria-describedby={describedBy}
                  placeholder={'#EXTM3U\n#EXTINF:-1, Channel 1\nhttps://...'}
                  invalid={Boolean((form.formState.errors as Record<string, unknown>).rawText)}
                  focusKey="source-form-rawtext"
                  {...form.register('rawText' as never)}
                />
              )}
            </FormField>
          ) : null}
        </>
      ) : null}

      {mode === 'm3u_file' ? (
        <FormField
          label="Playlist file"
          required
          error={(form.formState.errors as Record<string, { message?: string }>).rawText?.message}
          hint="Pick a local .m3u file — content is read in your browser."
        >
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              aria-describedby={describedBy}
              type="file"
              accept=".m3u,.m3u8,text/plain"
              className="text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-foreground"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                form.setValue('rawText' as never, text as never, { shouldValidate: true });
                if (!form.getValues('label')) {
                  form.setValue('label', file.name.replace(/\.m3u8?$/i, ''));
                }
              }}
            />
          )}
        </FormField>
      ) : null}

      {mode === 'xtream' ? (
        <>
          <FormField
            label="Server URL"
            required
            error={(form.formState.errors as Record<string, { message?: string }>).host?.message}
            hint="Include scheme and port, e.g. https://provider.example:8080"
          >
            {({ inputId, describedBy }) => (
              <TextField
                id={inputId}
                aria-describedby={describedBy}
                type="url"
                placeholder="https://provider.example:8080"
                autoComplete="url"
                invalid={Boolean((form.formState.errors as Record<string, unknown>).host)}
                focusKey="source-form-host"
                {...form.register('host' as never)}
              />
            )}
          </FormField>

          <FormField
            label="Username"
            required
            error={
              (form.formState.errors as Record<string, { message?: string }>).username?.message
            }
          >
            {({ inputId, describedBy }) => (
              <TextField
                id={inputId}
                aria-describedby={describedBy}
                autoComplete="username"
                invalid={Boolean((form.formState.errors as Record<string, unknown>).username)}
                focusKey="source-form-username"
                {...form.register('username' as never)}
              />
            )}
          </FormField>

          <FormField
            label="Password"
            required
            error={
              (form.formState.errors as Record<string, { message?: string }>).password?.message
            }
          >
            {({ inputId, describedBy }) => (
              <TextField
                id={inputId}
                aria-describedby={describedBy}
                type="password"
                autoComplete="current-password"
                invalid={Boolean((form.formState.errors as Record<string, unknown>).password)}
                focusKey="source-form-password"
                {...form.register('password' as never)}
              />
            )}
          </FormField>
        </>
      ) : null}

      <FormField
        label="User-Agent for stream proxy (optional)"
        error={(form.formState.errors as Record<string, { message?: string }>).userAgent?.message}
        hint="When you use the stream proxy in Settings, this value is sent for this source only. Leave blank to use the global proxy User-Agent."
      >
        {({ inputId, describedBy }) => (
          <TextField
            id={inputId}
            aria-describedby={describedBy}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="IPTVSmartersPlayer 3.1"
            invalid={Boolean((form.formState.errors as Record<string, unknown>).userAgent)}
            focusKey="source-form-user-agent"
            {...form.register('userAgent' as never)}
          />
        )}
      </FormField>

      <FormField
        label="EPG URL (optional)"
        error={form.formState.errors.epgUrl?.message}
        hint="XMLTV guide URL. Can be added later in settings."
      >
        {({ inputId, describedBy }) => (
          <TextField
            id={inputId}
            aria-describedby={describedBy}
            type="url"
            placeholder="https://example.com/epg.xml"
            invalid={Boolean(form.formState.errors.epgUrl)}
            focusKey="source-form-epg"
            {...form.register('epgUrl')}
          />
        )}
      </FormField>

      {submitState.status === 'error' ? (
        <p
          role="alert"
          data-error-code={submitState.code}
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {submitState.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} focusKey="source-form-cancel">
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          loading={submitState.status === 'submitting'}
          focusKey="source-form-submit"
        >
          Validate &amp; save
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function draftToSubmission(draft: SourceFormDraft): SourceFormSubmission {
  // Trim every user-supplied string. The Xtream URL builder also sanitizes
  // host/username/password defensively (see `sanitizeCredentials` in
  // `packages/core/src/lib/xtream.ts`), but doing it here as well prevents
  // bad data from being persisted in the first place — a stray leading
  // space or zero-width char in `host` survives `z.string().url()` and
  // makes Shaka reject the stream with `UNSUPPORTED_SCHEME`.
  const trim = (v: string | undefined) => (v ?? '').trim();
  const epgUrl = trim(draft.epgUrl) || undefined;
  const label = trim(draft.label);
  const userAgent = trim(draft.userAgent) || undefined;

  if (draft.mode === 'm3u_url') {
    return {
      source: {
        label,
        type: 'm3u_url',
        url: trim(draft.url),
        epgUrl,
        ...(userAgent ? { userAgent } : {}),
      },
      rawText: draft.useRawText && draft.rawText.trim() ? draft.rawText : undefined,
    };
  }
  if (draft.mode === 'm3u_file') {
    return {
      source: {
        label,
        type: 'm3u_file',
        epgUrl,
        ...(userAgent ? { userAgent } : {}),
      },
      rawText: draft.rawText,
    };
  }
  return {
    source: {
      label,
      type: 'xtream',
      credentials: {
        host: trim(draft.host),
        username: trim(draft.username),
        password: trim(draft.password),
      },
      epgUrl,
      ...(userAgent ? { userAgent } : {}),
    },
  };
}
