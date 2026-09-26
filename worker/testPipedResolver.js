/**
 * Focused Resolver & Media Accessibility Test
 * Usage: node worker/testPipedResolver.js [videoId]
 * Example: node worker/testPipedResolver.js ZHH3sr234zY
 */
import { resolveStream } from './pipedResolver.js';

async function main() {
  const args = process.argv.slice(2);
  const videoId = args[0] || 'ZHH3sr234zY';

  console.log(`[testResolver] Running multi-provider stream resolution & Range probe test for video ID: ${videoId}...`);

  try {
    const result = await resolveStream(videoId);

    console.log('\n================ RESOLUTION & PROBE SUCCESS ================');
    console.log('Provider:          ', result.provider);
    console.log('Video ID:          ', result.sourceVideoId);
    console.log('Title:             ', result.title);
    console.log('Instance Used:     ', result.instanceUsed);
    console.log('Duration (s):      ', result.durationSeconds);
    console.log('Thumbnail URL:     ', result.thumbnailUrl);
    console.log('Combined Stream:   ', result.combinedUrl ? 'YES' : 'NO');
    console.log('Video Stream:      ', result.videoStreamUrl ? 'YES' : 'NO');
    console.log('Audio Stream:      ', result.audioStreamUrl ? 'YES' : 'NO');
    console.log('Latency (ms):      ', result.latencyMs);
    if (result.combinedUrl) {
      console.log('Selected Stream URL:', result.combinedUrl.slice(0, 100) + '...');
    } else if (result.videoStreamUrl) {
      console.log('Selected Video URL: ', result.videoStreamUrl.slice(0, 100) + '...');
      console.log('Selected Audio URL: ', result.audioStreamUrl?.slice(0, 100) + '...');
    }
    console.log('===========================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n================ RESOLUTION FAILED ================');
    console.error(err.message);
    console.error('===================================================\n');

    process.exit(1);
  }
}

main();
