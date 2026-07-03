import * as zlib from 'zlib';
import { PlaudAuth, PlaudConfig, BASE_URLS, fetchRequester } from '@plaud/core';
import type { PlaudRecording } from '@plaud/core';

export class PlaudApiError extends Error {
  constructor(message: string, public readonly code?: number) {
    super(message);
    this.name = 'PlaudApiError';
  }
}

export class RecordingNotFoundError extends PlaudApiError {
  constructor(id: string) {
    super(`Recording not found: ${id}`);
    this.name = 'RecordingNotFoundError';
  }
}

export class RateLimitedError extends PlaudApiError {
  constructor() {
    super('Rate limited by the Plaud API. Please wait a moment and try again.');
    this.name = 'RateLimitedError';
  }
}

export interface TranscriptSegment {
  start_time: number;
  end_time: number;
  content: string;
  speaker: string;
}

export interface RecordingDetail {
  id: string;
  title: string;
  duration_ms: number;
  start_time: number;
  end_time: number;
  serial_number: string;
  language?: string;
  has_transcript: boolean;
  has_summary: boolean;
}

interface ContentListItem {
  data_id: string;
  data_type: string;
  data_link: string;
}

interface RawDetail {
  file_id: string;
  file_name: string;
  duration: number;
  start_time: number;
  serial_number: string;
  content_list: ContentListItem[];
  pre_download_content_list?: { data_id: string; data_content: string }[];
  extra_data?: { tranConfig?: { language?: string } };
}

// The API always answers HTTP 200 for most application-level errors, encoding
// the real result in a JSON `status` field (0 = success, -1 = not found,
// -302 = region mismatch, negative = other errors). But some auth failures
// (e.g. a missing Authorization header) come back as a real non-2xx HTTP
// status with a different {detail} shape (FastAPI's default). Both are
// handled here so callers only ever see typed errors or successful data.
export class PlaudReadOnlyClient {
  private auth: PlaudAuth;
  private region: string;

  constructor(config: PlaudConfig, region: string) {
    this.auth = new PlaudAuth(config);
    this.region = region;
  }

  private get baseUrl(): string {
    return BASE_URLS[this.region] ?? BASE_URLS['us'];
  }

  private async request(path: string): Promise<any> {
    const token = await this.auth.getToken();
    const res = await fetchRequester({
      url: `${this.baseUrl}${path}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    if (res.status === 429) {
      throw new RateLimitedError();
    }

    const data = await res.json();

    if (!res.ok) {
      throw new PlaudApiError(data?.detail || data?.msg || `Plaud API request failed (HTTP ${res.status}).`, res.status);
    }

    if (data?.status === -302 && data?.data?.domains?.api) {
      this.region = String(data.data.domains.api).includes('euc1') ? 'eu' : 'us';
      return this.request(path);
    }

    if (data?.status === -1) {
      return null; // "file not found" — caller decides how to report this
    }

    if (data?.status !== 0) {
      throw new PlaudApiError(data?.msg || `Plaud API returned status ${data?.status}.`, data?.status);
    }

    return data;
  }

  async listRecordings(): Promise<PlaudRecording[]> {
    const data = await this.request('/file/simple/web');
    const list: PlaudRecording[] = data?.data_file_list ?? [];
    return list.filter(r => !r.is_trash);
  }

  private async getRawDetail(id: string): Promise<RawDetail> {
    const data = await this.request(`/file/detail/${id}`);
    if (!data?.data) {
      throw new RecordingNotFoundError(id);
    }
    return data.data as RawDetail;
  }

  async getRecording(id: string): Promise<RecordingDetail> {
    const raw = await this.getRawDetail(id);
    return {
      id: raw.file_id,
      title: raw.file_name,
      duration_ms: raw.duration,
      start_time: raw.start_time,
      end_time: raw.start_time + raw.duration,
      serial_number: raw.serial_number,
      language: raw.extra_data?.tranConfig?.language,
      has_transcript: !!findContentItem(raw.content_list, 'transaction_polish') || !!findContentItem(raw.content_list, 'transaction'),
      has_summary: !!findContentItem(raw.content_list, 'auto_sum_note'),
    };
  }

  async getTranscript(id: string): Promise<string> {
    const raw = await this.getRawDetail(id);
    const item = findContentItem(raw.content_list, 'transaction_polish') ?? findContentItem(raw.content_list, 'transaction');
    if (!item) return 'No transcript available for this recording.';

    const text = await this.resolveContent(raw, item);
    if (!text) return 'No transcript available for this recording.';

    let segments: TranscriptSegment[];
    try {
      segments = JSON.parse(text);
    } catch {
      return 'No transcript available for this recording.';
    }
    if (!Array.isArray(segments) || segments.length === 0) {
      return 'No transcript available for this recording.';
    }

    return segments.map(s => `[${s.speaker}] ${s.content}`).join('\n');
  }

  async getSummary(id: string): Promise<string> {
    const raw = await this.getRawDetail(id);
    const item = findContentItem(raw.content_list, 'auto_sum_note');
    if (!item) return 'No summary available for this recording.';

    const text = await this.resolveContent(raw, item);
    return text || 'No summary available for this recording.';
  }

  // pre_download_content_list sometimes already contains the decompressed
  // text for a content item (observed reliably for auto_sum_note, but not
  // for transcript types) — use it when present to skip an extra fetch
  // against the short-lived (5 min) signed S3 link.
  private async resolveContent(raw: RawDetail, item: ContentListItem): Promise<string | null> {
    const inlined = raw.pre_download_content_list?.find(c => c.data_id === item.data_id);
    if (inlined?.data_content) return inlined.data_content;
    try {
      return await fetchContentLink(item.data_link);
    } catch {
      return null;
    }
  }
}

function findContentItem(contentList: ContentListItem[] | undefined, dataType: string): ContentListItem | undefined {
  return (contentList ?? []).find(c => c.data_type === dataType);
}

async function fetchContentLink(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new PlaudApiError(`Failed to fetch recording content (HTTP ${res.status}).`, res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
  return isGzip ? zlib.gunzipSync(buf).toString('utf-8') : buf.toString('utf-8');
}
