#!/usr/bin/env npx tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PlaudConfig } from '@plaud/core';
import { PlaudReadOnlyClient, PlaudApiError } from './client.js';

function errorContent(err: unknown) {
  const message = err instanceof PlaudApiError
    ? err.message
    : err instanceof Error
      ? `Unexpected error: ${err.message}`
      : 'Unexpected error.';
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

async function main() {
  const config = new PlaudConfig();
  const creds = config.getCredentials();

  if (!creds) {
    console.error('No Plaud credentials found in ~/.plaud/config.json.');
    console.error('Run: npx tsx packages/cli/bin/plaud.ts login');
    process.exit(1);
  }

  const client = new PlaudReadOnlyClient(config, creds.region);

  const server = new McpServer({
    name: 'plaud-mcp',
    version: '0.1.0',
  });

  server.tool(
    'list_recordings',
    'List Plaud voice recordings (id, title, date, duration). Supports filtering by date range and title search, and limiting the number of results.',
    {
      limit: z.number().int().positive().optional().describe('Maximum number of recordings to return, most recent first.'),
      date_from: z.string().optional().describe('ISO 8601 date/datetime; only include recordings starting at or after this time.'),
      date_to: z.string().optional().describe('ISO 8601 date/datetime; only include recordings starting at or before this time.'),
      query: z.string().optional().describe('Case-insensitive substring match against the recording title.'),
    },
    async ({ limit, date_from, date_to, query }) => {
      try {
        let recs = await client.listRecordings();

        if (date_from) {
          const fromMs = Date.parse(date_from);
          if (!Number.isNaN(fromMs)) recs = recs.filter(r => r.start_time >= fromMs);
        }
        if (date_to) {
          const toMs = Date.parse(date_to);
          if (!Number.isNaN(toMs)) recs = recs.filter(r => r.start_time <= toMs);
        }
        if (query) {
          const q = query.toLowerCase();
          recs = recs.filter(r => r.filename.toLowerCase().includes(q));
        }

        recs.sort((a, b) => b.start_time - a.start_time);
        if (limit) recs = recs.slice(0, limit);

        const result = recs.map(r => ({
          id: r.id,
          title: r.filename,
          date: new Date(r.start_time).toISOString(),
          duration_ms: r.duration,
        }));

        return jsonContent(result);
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  const recordingIdSchema = { recording_id: z.string().describe('The Plaud recording ID, as returned by list_recordings.') };

  server.tool(
    'get_transcript',
    'Get the speaker-labeled transcript text of a Plaud recording by ID.',
    recordingIdSchema,
    async ({ recording_id }) => {
      try {
        const transcript = await client.getTranscript(recording_id);
        return { content: [{ type: 'text' as const, text: transcript }] };
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    'get_summary',
    "Get the Plaud AI-generated summary/notes for a recording by ID.",
    recordingIdSchema,
    async ({ recording_id }) => {
      try {
        const summary = await client.getSummary(recording_id);
        return { content: [{ type: 'text' as const, text: summary }] };
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    'get_recording',
    'Get full metadata for a single Plaud recording by ID (title, dates, duration, device, language, content availability).',
    recordingIdSchema,
    async ({ recording_id }) => {
      try {
        const detail = await client.getRecording(recording_id);
        return jsonContent(detail);
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('Failed to start plaud-mcp server:', err);
  process.exit(1);
});
