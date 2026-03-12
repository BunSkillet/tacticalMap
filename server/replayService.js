const crypto = require('crypto');

const MAP_REGEX = /de_(ancient|anubis|dust2|inferno|mirage|nuke|train)/i;
const MAP_ALIASES = {
  de_ancient: 'ancient',
  de_anubis: 'anubis',
  de_dust2: 'dust2',
  de_inferno: 'inferno',
  de_mirage: 'mirage',
  de_nuke: 'nuke',
  de_train: 'train'
};

function normalizeMapName(name) {
  if (!name) return '';
  const key = String(name).trim().toLowerCase();
  return MAP_ALIASES[key] || MAP_ALIASES[`de_${key}`] || key.replace(/^de_/, '');
}

function buildDemReplayPayload(buffer) {
  const text = buffer.toString('latin1');
  const match = text.match(MAP_REGEX);
  const mapName = match ? normalizeMapName(match[0]) : '';

  return {
    mapName,
    tickRate: 64,
    rounds: [],
    frames: [],
    source: 'dem-header',
    mapAutoDetected: Boolean(mapName)
  };
}

function buildJsonReplayPayload(buffer) {
  const parsed = JSON.parse(buffer.toString('utf8'));
  return {
    mapName: normalizeMapName(parsed.mapName || parsed.map || ''),
    tickRate: Number.isFinite(parsed.tickRate) ? parsed.tickRate : 64,
    rounds: Array.isArray(parsed.rounds) ? parsed.rounds : [],
    frames: Array.isArray(parsed.frames) ? parsed.frames : [],
    source: 'json-upload'
  };
}

function parseReplayBuffer(buffer, fileName = '') {
  const ext = String(fileName).split('.').pop()?.toLowerCase();
  if (ext === 'json') return buildJsonReplayPayload(buffer);
  if (ext === 'dem') return buildDemReplayPayload(buffer);
  throw new Error('Unsupported file format. Expected .json or .dem');
}

function createReplayService() {
  const jobs = new Map();
  const cacheByHash = new Map();

  function createJobId() {
    return crypto.randomUUID();
  }

  function uploadReplay({ buffer, fileName }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('Replay upload body is empty.');
    }

    const contentHash = crypto.createHash('sha1').update(buffer).digest('hex');
    const cachedResult = cacheByHash.get(contentHash);
    if (cachedResult) {
      const cachedJobId = createJobId();
      jobs.set(cachedJobId, {
        status: 'completed',
        fileName,
        createdAt: Date.now(),
        contentHash,
        result: cachedResult
      });
      return { jobId: cachedJobId, cached: true };
    }

    const jobId = createJobId();
    jobs.set(jobId, {
      status: 'processing',
      fileName,
      createdAt: Date.now(),
      contentHash
    });

    setTimeout(() => {
      const job = jobs.get(jobId);
      if (!job || job.status !== 'processing') return;
      try {
        const result = parseReplayBuffer(buffer, fileName);
        jobs.set(jobId, { ...job, status: 'completed', result });
        cacheByHash.set(contentHash, result);
      } catch (error) {
        jobs.set(jobId, { ...job, status: 'failed', error: error.message });
      }
    }, 20);

    return { jobId, cached: false };
  }

  function getJob(jobId) {
    return jobs.get(jobId) || null;
  }

  return {
    uploadReplay,
    getJob,
    parseReplayBuffer
  };
}

module.exports = {
  createReplayService,
  parseReplayBuffer,
  normalizeMapName
};
