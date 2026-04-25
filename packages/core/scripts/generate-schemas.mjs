import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  appSettingsSchema,
  channelGroupSchema,
  channelSchema,
  epgGuideSchema,
  epgProgramSchema,
  playlistSchema,
  sourceSchema,
  userProfileSchema,
} from '../dist/lib/contracts.js';

const schemaMap = {
  Source: sourceSchema,
  Channel: channelSchema,
  ChannelGroup: channelGroupSchema,
  Playlist: playlistSchema,
  EpgProgram: epgProgramSchema,
  EpgGuide: epgGuideSchema,
  AppSettings: appSettingsSchema,
  UserProfile: userProfileSchema,
};

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(packageRoot, 'schemas');
await mkdir(outputDir, { recursive: true });

for (const [name, schema] of Object.entries(schemaMap)) {
  const jsonSchema = zodToJsonSchema(schema, { name });
  const outputPath = path.join(outputDir, `${name}.schema.json`);
  await writeFile(outputPath, `${JSON.stringify(jsonSchema, null, 2)}\n`, 'utf8');
}

