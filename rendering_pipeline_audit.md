# ClipFlow Rendering Pipeline & Architectural Audit Report

## 1. Trace of the Real Execution Path (End-to-End)

```
DISCOVERED SOURCE (YouTube / Direct URL)
  ↓
SOURCE VIDEO (Supabase `source_videos` table)
  ↓
CANDIDATE (Supabase `clip_candidates` table)
  ↓
MEDIA ACQUISITION (CompliantMediaProvider.acquire() / yt-dlp / ytdl-core)
  ↓
MEDIA VALIDATION (inspectVideoFile() & validateRealVideo() frame analysis)
  ↓
TIMESTAMP VALIDATION (ClipTrimmer.ts bound-checking against source duration)
  ↓
RENDER (FFmpegVideoRenderer.renderClip() via FFmpeg crop, caption burn, audio normalization)
  ↓
OUTPUT VALIDATION (validateRealVideo() + validateVisualMatch() RGB correlation)
  ↓
STORAGE (Supabase Storage `clips` bucket upload & SHA-256 integrity validation)
  ↓
DATABASE (Supabase `clips` insert & `clip_candidates` update)
  ↓
CLIP (Supabase `clips` table row with public URL)
  ↓
FRONTEND (src/pages/ClipsPage.tsx modal video viewer)
  ↓
HTML5 VIDEO (Native browser playback)
```

---

## 2. Complete Phase-by-Phase Component Audit & Mapping

### Phase 1: Discovery
* **File:** `/src/server/discovery/handler.ts` (and relevant api routes in `/server.ts`).
* **Input:** A YouTube URL or search query entered by the user.
* **Output:** A newly inserted or fetched record in the `source_videos` database table.
* **Failure Behavior:** Logs discovery failure, returns an error response, and halts the flow before creating database records.
* **Fallback Behavior:** None.
* **Code Type:** Production server-side code.

### Phase 2: Source Video
* **File:** Represented as records in the `source_videos` database table.
* **Input:** Metadata returned from the Discovery service (title, description, duration, URL).
* **Output:** A confirmed row in the database with status `available` or `processing`.
* **Database Writes:** Single row insert or update in `source_videos`.
* **Code Type:** Production database entity.

### Phase 3: Candidate
* **File:** `/src/pages/CandidatesPage.tsx` (frontend) and backend generation handlers.
* **Input:** The `source_videos` record.
* **Output:** Candidate moment records containing start/end times, AI-generated kinetic hook headlines, summaries, and transcripts.
* **Database Writes:** Multiple row insertions/updates in `clip_candidates`.
* **Code Type:** Production code.

### Phase 4: Media Acquisition
* **File:** `/src/server/rendering/MediaProvider.ts`.
* **Class:** `CompliantMediaProvider`.
* **Method:** `acquire(sourceVideo: SourceVideoMediaRecord)`.
* **Input:** A `SourceVideoMediaRecord` with YouTube URL or direct URL.
* **Output:** `MediaProviderAcquireResult` containing local file path, mime type, origin, and stream details.
* **Failure Behavior:** If the source download fails or is blocked by bot detection (e.g. yt-dlp code 1), it fails cleanly and returns `MEDIA_ACQUISITION_FAILED` with `success: false`.
* **Fallback Behavior:** None allowed for production. Development testing fallback is restricted to explicit `/api/render-dev-test` calls and blocked for normal candidates.
* **Code Type:** Production & development orchestrator.

### Phase 5: Media Validation
* **File:** `/src/server/rendering/inspectVideo.ts`.
* **Function:** `validateRealVideo(filePath: string)`.
* **Input:** A local absolute path to the acquired media file.
* **Output:** Validation status (boolean), reason, and technical file inspection specs (fps, streams, dimensions).
* **Validation Algorithm:** Runs `ffprobe` to confirm presence of valid video and audio codecs. Extracts frames at 6 representative timestamps and performs RGB pixel brightness analysis (rejects black/blank frames), solid color checks, and pairwise frame correlation. Rejects any static zoompan loops or blank placeholders.
* **Code Type:** Production server-side verification code.

### Phase 6: Timestamp Validation
* **File:** `/src/server/rendering/ClipTrimmer.ts`.
* **Class:** `ClipTrimmer`.
* **Method:** `trimClip(startTime, endTime, maxSec, sourceDuration)`.
* **Input:** Human-entered timestamp strings, duration boundaries, and inspected source duration.
* **Output:** Exact start and duration floating-point seconds.
* **Failure Behavior:** Throws `SOURCE_TIMESTAMP_OUT_OF_RANGE` if bounds or intervals violate source limits.
* **Code Type:** Production server-side validation.

### Phase 7: Render
* **File:** `/src/server/rendering/VideoRenderer.ts`.
* **Class:** `FFmpegVideoRenderer`.
* **Method:** `renderClip(options: RenderPipelineOptions)`.
* **Input:** Local absolute path to media, reframe/crop filters, burnt captions subtitle ASS file, audio loudness filter parameters.
* **Output:** Vertical 9:16 MP4 file with burned captions and normalized stereo audio.
* **Codec & Profile Configuration:** Uses `libx264` H.264 with Profile **`high`** and Level **`4.1`**, standard pixel format `yuv420p`, and Faststart headers.
* **Code Type:** Production rendering code.

### Phase 8: Output Validation
* **File:** `/src/server/rendering/inspectVideo.ts`.
* **Function:** `validateVisualMatch(sourcePath, startSec, renderedPath)`.
* **Input:** Source media file, start offset, and the rendered output file.
* **Output:** Alignment validation status (boolean) and cross-correlation coefficient.
* **Algorithm:** Compares cropped center frames from both source and rendered output. High visual similarity (coefficient >= 0.5) must be achieved to pass; otherwise, throws `OUTPUT_VISUAL_MISMATCH`.
* **Code Type:** Production security verification code.

### Phase 9: Storage
* **File:** `/src/server/rendering/RenderService.ts` (lines 474-576).
* **Input:** Rendered MP4 output.
* **Output:** Public URL of the uploaded object in the Supabase Storage `clips` bucket.
* **Byte-by-Byte Validation:** Generates a SHA-256 hash of the local rendered file, downloads the uploaded object from Supabase, generates its SHA-256 hash, and performs a strict equality check. Any mismatch aborts with `OUTPUT_UPLOAD_MISMATCH`.
* **Code Type:** Production storage utility.

### Phase 10: Database Persistence
* **File:** `/src/server/rendering/RenderService.ts` (lines 577-634).
* **Input:** Public video/thumbnail URLs, titles, duration, and inspected stream details.
* **Output:** Newly inserted row in `clips` table and status update to `rendered` on `clip_candidates`.
* **Failure Behavior:** If the database inserts or updates fail, the error is caught and propagated as `DATABASE_PERSISTENCE_FAILED`, failing the pipeline honestly and setting candidate status to `failed` rather than swallowing the error or reverting it to `new`.
* **Code Type:** Production persistence code.

### Phase 11: Clip Row
* **File:** Represented as records in the `clips` database table.
* **Code Type:** Production database entity.

### Phase 12: Frontend View
* **File:** `/src/pages/ClipsPage.tsx`.
* **Component:** `ClipsPage`.
* **Features:** A grid layout showing vertical 9:16 video cards and a dedicated modal preview screen with fully-featured controls and diagnostics overlay.
* **Code Type:** Production frontend code.

### Phase 13: HTML5 Video Playback
* **File:** `/src/pages/ClipsPage.tsx` (using standard `<video>` tag).
* **Fix Applied:** Removed `crossOrigin="anonymous"` from the modal player to prevent unnecessary CORS loading/handshake blocks. Modified H.264 rendering to profile `high` & level `4.1`, resolving the previous `PIPELINE_ERROR_DECODE` (Code 3) browser rendering error by maintaining full spec compliance with 1080x1920 30fps stream macroblocks.
* **Code Type:** Production client-side video playback.

---

## 3. Technical Discoveries & Fixes Implemented

1. **Resolution of Browser decode error (`Code 3 / PIPELINE_ERROR_DECODE`):**
   * *Issue:* The renderer was previously hardcoded to use H.264 `-profile:v main -level 3.1` for vertical videos with 1080x1920 dimensions. However, Level 3.1 has a maximum macroblock limit of 1,620 macroblocks per frame. A 1080x1920 frame contains 8,160 macroblocks. This spec violation caused hardware and browser decoders (Chrome, Safari) to fail with a decode error.
   * *Fix:* Updated `VideoRenderer.ts` to output with `-profile:v high -level 4.1` which officially supports up to 8,192 macroblocks per frame, ensuring perfect HTML5 video compliance.

2. **CORS Streaming Fix:**
   * *Issue:* The `<video>` element on the `ClipsPage.tsx` preview was configured with `crossOrigin="anonymous"`. This forced strict CORS checks on simple video streams, leading to unnecessary playback blockages in standard browsers when CORS headers from the Supabase storage proxy differed.
   * *Fix:* Removed `crossOrigin="anonymous"` since we are not doing custom canvas rendering on this player.

3. **Complete Elimination of Implicit Mock Fallbacks:**
   * *Issue:* Implicit environment fallback logic and hardcoded detection for test video `"carD3hvum64"` previously allowed rendering jobs to silently fall back to `DevelopmentMediaProvider` (generating synthetic test patterns and sine tones).
   * *Fix:* Completely removed all hardcoded checking of `"carD3hvum64"` across the server, router, and providers. Set `isDevTest: false` on normal render requests so that any media acquisition failure fails honestly with `MEDIA_ACQUISITION_FAILED` without any mock/placeholder replacements.

4. **Strict Error Propagation on Database Persistence:**
   * *Issue:* Errors during the database insertion of a clip row or the status update of a candidate were being swallowed with a console warning, returning a "successful" render response to the user despite data missing from the dashboard.
   * *Fix:* Added robust error throwing and propagation for database inserts and candidate updates, failing the pipeline honestly with `DATABASE_PERSISTENCE_FAILED` on SQL failures. Updated the candidate model's error state status to `'failed'` rather than reverting it to `'new'` so that the user is notified of the exact issue.
