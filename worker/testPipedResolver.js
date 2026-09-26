/**
 * Test script for Multi-Provider Resolver (Piped + Invidious)
 * Usage: node worker/testPipedResolver.js <videoId>
 * Example: node worker/testPipedResolver.js KSOxkhWs2Ic
 */
import { resolveStream } from './pipedResolver.js';

async function main() {
  const args = process.argv.slice(2);
  const videoId = args[0] || 'KSOxkhWs2Ic';

  console.log(`[testPipedResolver] Testing multi-provider stream resolution for video ID: ${videoId}...`);

  try {
    const result = await resolveStream(videoId);
    console.log('\n================ RESOLUTION SUCCESS ================');
    console.log('Provider:       ', result.provider);
    console.log('Video ID:       ', result.sourceVideoId);
    console.log('Title:          ', result.title);
    console.log('Instance Used:  ', result.instanceUsed);
    console.log('Duration (s):   ', result.durationSeconds);
    console.log('Thumbnail URL:  ', result.thumbnailUrl);
    console.log('Combined Stream:', result.combinedUrl ? 'YES' : 'NO');
    console.log('Video Stream:   ', result.videoStreamUrl ? 'YES' : 'NO');
    console.log('Audio Stream:   ', result.audioStreamUrl ? 'YES' : 'NO');
    console.log('Latency (ms):   ', result.latencyMs);
    console.log('===================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n================ RESOLUTION FAILED ================');
    console.error(err.message);
    console.error('===================================================\n');

    process.exit(1);
  }
}

main();
