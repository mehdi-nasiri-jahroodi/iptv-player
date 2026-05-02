import type { Source } from 'core';
import { formatXtreamPanelDate } from './xtream-account-display';

export type SourceDetailRowOptions = {
  /** When false, omits the internal source id row (e.g. first-run success). */
  includeInternalId?: boolean;
};

/**
 * Human-readable rows for Settings “Details” and similar summaries.
 */
export function buildSourceDetailRows(
  source: Source,
  options: SourceDetailRowOptions = {}
): Array<{ label: string; value: string }> {
  const { includeInternalId = true } = options;
  const rows: Array<{ label: string; value: string }> = [];
  rows.push({
    label: 'Type',
    value: source.type === 'xtream' ? 'Xtream Codes' : source.type === 'm3u_url' ? 'M3U URL' : 'M3U file',
  });

  if (source.type === 'xtream' && source.credentials) {
    rows.push({ label: 'Server', value: source.credentials.host });
    const acc = source.xtreamAccount;
    const displayUsername = acc?.username?.trim() || source.credentials.username;
    rows.push({ label: 'Username', value: displayUsername });
    if (acc?.status) rows.push({ label: 'Account status', value: acc.status });
    const exp = acc?.expDate ? formatXtreamPanelDate(acc.expDate) : null;
    if (exp) rows.push({ label: 'Expire date', value: exp });
    if (acc?.activeConnections) rows.push({ label: 'Active connections', value: acc.activeConnections });
    const created = acc?.createdAt ? formatXtreamPanelDate(acc.createdAt) : null;
    if (created) rows.push({ label: 'Created at', value: created });
    if (acc?.maxConnections) rows.push({ label: 'Max connections', value: acc.maxConnections });
    if (acc?.isTrial) rows.push({ label: 'Trial', value: acc.isTrial === '1' ? 'Yes' : 'No' });
  }

  if (source.type === 'm3u_url' && source.url) rows.push({ label: 'URL', value: source.url });
  if (source.epgUrl) rows.push({ label: 'EPG URL', value: source.epgUrl });
  if (source.userAgent) rows.push({ label: 'User-Agent', value: source.userAgent });
  if (includeInternalId) rows.push({ label: 'Internal ID', value: source.id });
  return rows;
}
