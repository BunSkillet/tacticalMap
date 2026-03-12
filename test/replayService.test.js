const assert = require('assert');
const { createReplayService, parseReplayBuffer } = require('../server/replayService');

function testParseJsonReplay() {
  const payload = {
    map: 'de_mirage',
    tickRate: 128,
    rounds: [{ startTick: 0, endTick: 100 }],
    frames: [{ tick: 0, players: [], events: [] }]
  };
  const replay = parseReplayBuffer(Buffer.from(JSON.stringify(payload), 'utf8'), 'sample.json');
  assert.strictEqual(replay.mapName, 'mirage');
  assert.strictEqual(replay.tickRate, 128);
  assert.strictEqual(replay.frames.length, 1);
}

function testParseDemReplayHeader() {
  const replay = parseReplayBuffer(Buffer.from('random_header_de_inferno_bytes', 'latin1'), 'match.dem');
  assert.strictEqual(replay.mapName, 'inferno');
  assert.strictEqual(replay.source, 'dem-header');
}

async function testJobCache() {
  const service = createReplayService();
  const buffer = Buffer.from(JSON.stringify({ map: 'de_nuke', frames: [] }), 'utf8');

  const first = service.uploadReplay({ buffer, fileName: 'a.json' });
  assert.ok(first.jobId);

  let done = null;
  for (let i = 0; i < 20; i += 1) {
    const job = service.getJob(first.jobId);
    if (job && job.status === 'completed') {
      done = job;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.ok(done);
  const second = service.uploadReplay({ buffer, fileName: 'b.json' });
  const cachedJob = service.getJob(second.jobId);
  assert.strictEqual(cachedJob.status, 'completed');
}

async function run() {
  testParseJsonReplay();
  testParseDemReplayHeader();
  await testJobCache();
  console.log('Replay service tests passed');
}

run();
