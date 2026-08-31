import { z } from 'zod';

/**
 * Runtime request schemas.
 *
 * The routes previously cast `await c.req.json()` straight to a TypeScript interface. A cast is a
 * compile-time assertion over data that arrives at runtime from an untrusted caller, so it proves
 * nothing. These schemas are the actual boundary.
 */

export const qualityIdSchema = z.union([
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(27),
]);

export const serviceTypeSchema = z.enum(['qobuz', 'spotify']);

/** A filesystem path supplied by the caller. Containment is enforced separately by util/paths. */
const filePathSchema = z.string().min(1).max(4096);

export const scanDirectorySchema = z.object({
  directory: filePathSchema.optional(),
});

export const filePathQuerySchema = z.object({
  path: filePathSchema,
});

export const analyzeTracksSchema = z.object({
  filePaths: z.array(filePathSchema).max(20000),
  writeTags: z.boolean().optional().default(false),
});

export const createDjSetSchema = z.object({
  sessionName: z.string().trim().min(1).max(200),
  sourceDirectory: filePathSchema.optional(),
  targetDirectory: filePathSchema.optional(),
  trackPaths: z.array(filePathSchema).max(20000).optional().default([]),
  copyMode: z.boolean().optional().default(false),
  cleanEmptyFolders: z.boolean().optional(),
});

export const deleteTracksSchema = z.object({
  filePaths: z.array(filePathSchema).min(1).max(20000),
  sourceDirectory: filePathSchema.optional(),
});

export const appSettingsSchema = z
  .object({
    defaultDownloadDir: filePathSchema,
    defaultLibraryDir: filePathSchema,
    defaultQuality: qualityIdSchema,
    embedArtwork: z.boolean(),
    createM3u: z.boolean(),
    folderFormat: z.string().max(500),
    trackFormat: z.string().max(500),
    djMode: z.boolean(),
  })
  .partial();

export const browseFolderSchema = z.object({
  currentPath: filePathSchema.optional(),
  title: z.string().max(200).optional(),
});

export const qobuzCredentialsSchema = z.object({
  email: z.string().max(320).optional(),
  password: z.string().max(500).optional(),
  appId: z.string().max(100).optional(),
  userAuthToken: z.string().max(2000).optional(),
  secret: z.string().max(200).optional(),
});

export const spotifyCredentialsSchema = z.object({
  clientId: z.string().max(200).optional(),
  clientSecret: z.string().max(200).optional(),
  accessToken: z.string().max(5000).optional(),
  refreshToken: z.string().max(5000).optional(),
  expiresAt: z.number().optional(),
});

export const saveAccountSchema = z.object({
  id: z.string().max(100).optional(),
  service: serviceTypeSchema,
  label: z.string().trim().min(1).max(200),
  email: z.string().max(320).optional(),
  username: z.string().max(200).optional(),
  avatarUrl: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  credentials: z
    .object({
      qobuz: qobuzCredentialsSchema.optional(),
      spotify: spotifyCredentialsSchema.optional(),
    })
    .optional(),
});

export const testAccountSchema = z.object({
  service: serviceTypeSchema,
  /**
   * Either inline credentials (adding a new account, before it is saved) or `{ accountId }` to
   * test the credentials already stored server-side. The latter is what the account list uses,
   * since the client no longer receives secret values at all.
   */
  credentials: z.union([
    z.object({ accountId: z.string().max(100) }),
    qobuzCredentialsSchema,
    spotifyCredentialsSchema,
    z.record(z.string(), z.unknown()),
  ]),
});

export const importCookieSchema = z.object({
  input: z.string().trim().min(1).max(100000),
  label: z.string().max(200).optional(),
  id: z.string().max(100).optional(),
});

export const trackItemSchema = z.object({
  id: z.string(),
  service: serviceTypeSchema,
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  durationMs: z.number(),
  isrc: z.string().optional(),
  year: z.string().optional(),
  trackNumber: z.number().optional(),
  coverUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  quality: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const enqueueDownloadSchema = z.object({
  tracks: z.array(trackItemSchema).min(1).max(5000),
  quality: qualityIdSchema.optional(),
  downloadDir: filePathSchema.optional(),
  playlistTitle: z.string().max(300).optional(),
  createM3u: z.boolean().optional(),
});

export const urlBodySchema = z.object({
  url: z.string().trim().min(1).max(4000),
});

export const convertSchema = z.object({
  sourceUrl: z.string().trim().min(1).max(4000),
  targetService: serviceTypeSchema,
  targetAccountId: z.string().max(100).optional(),
  targetPlaylistId: z.string().max(200).optional(),
  targetPlaylistName: z.string().max(300).optional(),
  matchOptions: z
    .object({
      durationToleranceSec: z.number().min(0).max(120).optional(),
      strictIsrcOnly: z.boolean().optional(),
      minConfidenceScore: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export type ScanDirectoryInput = z.infer<typeof scanDirectorySchema>;
export type AnalyzeTracksInput = z.infer<typeof analyzeTracksSchema>;
export type CreateDjSetInput = z.infer<typeof createDjSetSchema>;
export type DeleteTracksInput = z.infer<typeof deleteTracksSchema>;
export type BrowseFolderInput = z.infer<typeof browseFolderSchema>;
export type SaveAccountInput = z.infer<typeof saveAccountSchema>;
export type EnqueueDownloadInput = z.infer<typeof enqueueDownloadSchema>;
