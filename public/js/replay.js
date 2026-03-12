import { state } from './state.js';
import { socket } from './socketHandlers.js';

const MAP_ALIASES = {
  de_ancient: 'ancient',
  de_anubis: 'anubis',
  de_dust2: 'dust2',
  de_inferno: 'inferno',
  de_mirage: 'mirage',
  de_nuke: 'nuke',
  de_train: 'train'
};

const KILL_FEED_LIMIT = 8;
const pageParams = new URLSearchParams(window.location.search);
let playbackTimer = null;

function normalizeMapName(name) {
  if (!name) return '';
  const key = String(name).trim().toLowerCase();
  return MAP_ALIASES[key] || MAP_ALIASES[`de_${key}`] || key.replace(/^de_/, '');
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toNormalizedPoint(point, mapMeta = {}) {
  if (!point) return { x: 0, y: 0 };
  if (
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
  ) {
    return { x: point.x, y: point.y };
  }

  const minX = Number.isFinite(mapMeta.minX) ? mapMeta.minX : 0;
  const maxX = Number.isFinite(mapMeta.maxX) ? mapMeta.maxX : 1;
  const minY = Number.isFinite(mapMeta.minY) ? mapMeta.minY : 0;
  const maxY = Number.isFinite(mapMeta.maxY) ? mapMeta.maxY : 1;
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  return {
    x: clamp01((point.x - minX) / width),
    y: clamp01((point.y - minY) / height)
  };
}

function detectSecondaryWeapon(player = {}) {
  if (player.secondaryWeapon) return player.secondaryWeapon;
  if (!Array.isArray(player.loadout)) return '-';
  const loadoutLower = player.loadout.map((item) => String(item).toLowerCase());
  const pistol = player.loadout.find((item, idx) => {
    const value = loadoutLower[idx];
    return value.includes('glock') || value.includes('usp') || value.includes('p2000') ||
      value.includes('p250') || value.includes('deagle') || value.includes('revolver') ||
      value.includes('five-seven') || value.includes('five seven') || value.includes('tec-9') ||
      value.includes('tec9') || value.includes('cz75') || value.includes('dual');
  });
  return pistol || '-';
}

function replayEventEmoji(eventType) {
  if (eventType === 'death' || eventType === 'kill') return '☠️';
  if (eventType === 'shot') return '🔫';
  if (eventType === 'grenadeThrow') return '🧨';
  if (eventType === 'grenadeDrop') return '📦';
  if (eventType === 'bombPlant') return '💣';
  if (eventType === 'bombDrop') return '👜';
  return '•';
}

function normalizePlayer(player = {}, index = 0, mapMeta = {}) {
  const position = toNormalizedPoint(player, mapMeta);
  const team = String(player.team || '').toUpperCase() === 'CT' ? 'CT' : 'T';

  return {
    id: player.id ?? `${team}-${index}`,
    name: player.name || `Player ${index + 1}`,
    team,
    x: position.x,
    y: position.y,
    health: Number.isFinite(player.health) ? player.health : null,
    armor: Number.isFinite(player.armor) ? player.armor : null,
    money: Number.isFinite(player.money) ? player.money : null,
    hasBomb: Boolean(player.hasBomb),
    currentWeapon: player.currentWeapon || player.weapon || '-',
    secondaryWeapon: detectSecondaryWeapon(player),
    ammoClip: Number.isFinite(player.ammoClip) ? player.ammoClip : null,
    ammoReserve: Number.isFinite(player.ammoReserve) ? player.ammoReserve : null,
    loadout: Array.isArray(player.loadout) ? player.loadout : []
  };
}

function normalizeEvent(event = {}, mapMeta = {}) {
  const position = toNormalizedPoint(event, mapMeta);
  return {
    type: event.type || 'shot',
    x: position.x,
    y: position.y,
    tick: Number.isFinite(event.tick) ? event.tick : null,
    player: event.player || event.attacker || '',
    attacker: event.attacker || event.player || '',
    victim: event.victim || '',
    weapon: event.weapon || event.grenadeType || '',
    grenadeType: event.grenadeType || ''
  };
}

function buildRoundRanges(frames, rounds) {
  if (Array.isArray(rounds) && rounds.length > 0) {
    return rounds.map((round, index) => ({
      index,
      startTick: Number.isFinite(round.startTick) ? round.startTick : frames[0]?.tick || 0,
      endTick: Number.isFinite(round.endTick) ? round.endTick : frames[frames.length - 1]?.tick || 0,
      label: round.label || `Round ${index + 1}`
    }));
  }

  if (!frames.length) return [];
  return [{ index: 0, startTick: frames[0].tick, endTick: frames[frames.length - 1].tick, label: 'Round 1' }];
}

function sanitizeReplay(raw) {
  const mapMeta = raw?.mapMeta || {};
  const mapName = normalizeMapName(raw?.map || raw?.mapName);
  const frames = Array.isArray(raw?.frames)
    ? raw.frames.map((frame, index) => ({
      tick: Number.isFinite(frame.tick) ? frame.tick : index,
      players: Array.isArray(frame.players)
        ? frame.players.map((player, playerIndex) => normalizePlayer(player, playerIndex, mapMeta))
        : [],
      events: Array.isArray(frame.events)
        ? frame.events.map((event) => normalizeEvent(event, mapMeta))
        : []
    }))
    : [];

  frames.sort((a, b) => a.tick - b.tick);

  return {
    mapName,
    tickRate: Number.isFinite(raw?.tickRate) && raw.tickRate > 0 ? raw.tickRate : 64,
    rounds: buildRoundRanges(frames, raw?.rounds),
    frames,
    source: raw?.source || 'upload'
  };
}

function stopPlayback() {
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
  state.replay.isPlaying = false;
  const playToggle = document.getElementById('replay-play-toggle');
  if (playToggle) playToggle.textContent = '▶️';
}

function frameIntervalMs() {
  const tickRate = state.replay.tickRate || 64;
  const speed = state.replay.playbackSpeed || 1;
  return Math.max(16, Math.floor(1000 / (tickRate * speed)));
}

function setStatus(message) {
  const status = document.getElementById('replay-status');
  if (status) status.textContent = message;
}

function currentRoundIndex() {
  if (!state.replay.frames.length || !state.replay.rounds.length) return -1;
  const tick = state.replay.frames[state.replay.currentFrameIndex]?.tick || 0;
  return state.replay.rounds.findIndex((round) => tick >= round.startTick && tick <= round.endTick);
}

function syncAnnotationInput() {
  const input = document.getElementById('round-annotation-input');
  if (!input) return;
  const roundIndex = currentRoundIndex();
  if (roundIndex < 0) {
    input.value = '';
    return;
  }
  input.value = state.replay.annotationsByRound[roundIndex] || '';
}

function applyViewParamsFromUrl() {
  const frame = Number(pageParams.get('rf'));
  const speed = Number(pageParams.get('rs'));
  const tm = pageParams.get('rtm');
  const filters = (pageParams.get('rfilt') || '').split(',').filter(Boolean);
  const rhs = pageParams.get('rhs');
  const hscope = pageParams.get('rhscope');

  if (Number.isFinite(speed) && speed > 0) state.replay.playbackSpeed = speed;
  if (tm === 'seconds' || tm === 'tick') state.replay.timeMode = tm;
  if (filters.length) {
    state.replay.eventFilter.shot = filters.includes('shot');
    state.replay.eventFilter.death = filters.includes('death');
    state.replay.eventFilter.grenade = filters.includes('grenade');
    state.replay.eventFilter.bomb = filters.includes('bomb');
  }
  if (rhs === '0' || rhs === '1') state.replay.hotspotsEnabled = rhs === '1';
  if (hscope === 'round' || hscope === 'match') state.replay.hotspotScope = hscope;
  if (Number.isFinite(frame) && frame >= 0 && state.replay.frames.length) {
    state.replay.currentFrameIndex = Math.min(state.replay.frames.length - 1, Math.floor(frame));
  }
}

function buildShareLink() {
  const params = new URLSearchParams(window.location.search);
  params.set('rf', String(state.replay.currentFrameIndex));
  params.set('rs', String(state.replay.playbackSpeed || 1));
  params.set('rtm', state.replay.timeMode || 'tick');
  const enabled = Object.entries(state.replay.eventFilter).filter(([, v]) => v).map(([k]) => k).join(',');
  params.set('rfilt', enabled);
  params.set('rhs', state.replay.hotspotsEnabled ? '1' : '0');
  params.set('rhscope', state.replay.hotspotScope || 'round');
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function emitViewSync() {
  socket.emit('replayViewSync', {
    frameIndex: state.replay.currentFrameIndex,
    speed: state.replay.playbackSpeed,
    timeMode: state.replay.timeMode,
    eventFilter: state.replay.eventFilter,
    hotspotsEnabled: state.replay.hotspotsEnabled,
    hotspotScope: state.replay.hotspotScope
  });
}

function setCurrentFrameIndex(index) {
  const total = state.replay.frames.length;
  if (!total) {
    state.replay.currentFrameIndex = 0;
    updateControls();
    return;
  }
  state.replay.currentFrameIndex = Math.max(0, Math.min(total - 1, index));
  updateControls();
  syncAnnotationInput();
  emitViewSync();
}

function startPlayback() {
  if (!state.replay.frames.length) return;

  stopPlayback();
  state.replay.isPlaying = true;
  const playToggle = document.getElementById('replay-play-toggle');
  if (playToggle) playToggle.textContent = '⏸️';

  playbackTimer = setInterval(() => {
    if (state.replay.currentFrameIndex >= state.replay.frames.length - 1) {
      stopPlayback();
      return;
    }
    setCurrentFrameIndex(state.replay.currentFrameIndex + 1);
  }, frameIntervalMs());
}

function moveRound(direction) {
  if (!state.replay.frames.length || !state.replay.rounds.length) return;

  const currentTick = state.replay.frames[state.replay.currentFrameIndex]?.tick || 0;
  let roundIndex = state.replay.rounds.findIndex(
    (round) => currentTick >= round.startTick && currentTick <= round.endTick
  );
  if (roundIndex < 0) roundIndex = 0;

  roundIndex += direction;
  roundIndex = Math.max(0, Math.min(state.replay.rounds.length - 1, roundIndex));

  const targetTick = state.replay.rounds[roundIndex].startTick;
  const targetIndex = state.replay.frames.findIndex((frame) => frame.tick >= targetTick);
  if (targetIndex >= 0) setCurrentFrameIndex(targetIndex);
}

function applyReplayMap(mapName) {
  const normalized = normalizeMapName(mapName);
  if (!normalized) return;

  const mapSelect = document.getElementById('map-select');
  if (!mapSelect) return;

  const mapExists = Array.from(mapSelect.options).some((option) => option.value === normalized);
  if (!mapExists) return;

  state.replay.mapName = normalized;
  state.mapSelect.value = normalized;
  socket.emit('changeMap', normalized);
}

function extractMapFromDemText(content) {
  const mapMatch = content.match(/de_(ancient|anubis|dust2|inferno|mirage|nuke|train)/i);
  return mapMatch ? normalizeMapName(mapMatch[0]) : '';
}

async function pollReplayJob(jobId, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    const response = await fetch(`/api/replays/${encodeURIComponent(jobId)}`);
    const data = await response.json();

    if (data.status === 'completed') return data.replay;
    if (data.status === 'failed') {
      throw new Error(data.error || 'Replay parsing failed.');
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Replay parsing timed out.');
}

async function parseUpload(file) {
  const uploadResponse = await fetch(`/api/replays/upload?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-file-name': file.name
    },
    body: await file.arrayBuffer()
  });

  const uploadData = await uploadResponse.json();
  if (!uploadResponse.ok) {
    throw new Error(uploadData.error || 'Replay upload failed.');
  }

  const replay = await pollReplayJob(uploadData.jobId);
  return sanitizeReplay(replay);
}


function eventTypeGroup(eventType) {
  if (eventType === 'shot') return 'shot';
  if (eventType === 'death' || eventType === 'kill') return 'death';
  if (eventType === 'grenadeThrow' || eventType === 'grenadeDrop') return 'grenade';
  if (eventType === 'bombDrop' || eventType === 'bombPlant') return 'bomb';
  return null;
}

function filterEvents(events = []) {
  return events.filter((event) => {
    const group = eventTypeGroup(event.type);
    if (!group) return false;
    return Boolean(state.replay.eventFilter[group]);
  });
}


function currentRoundFrames() {
  if (!state.replay.frames.length) return [];
  const roundIndex = currentRoundIndex();
  if (roundIndex < 0 || !state.replay.rounds[roundIndex]) return state.replay.frames;
  const round = state.replay.rounds[roundIndex];
  return state.replay.frames.filter((frame) => frame.tick >= round.startTick && frame.tick <= round.endTick);
}

function quantize(point, bins = 24) {
  const x = Math.max(0, Math.min(bins - 1, Math.floor((point.x || 0) * bins)));
  const y = Math.max(0, Math.min(bins - 1, Math.floor((point.y || 0) * bins)));
  return `${x}:${y}`;
}

function keyToPoint(key, bins = 24) {
  const [sx, sy] = key.split(':').map((v) => Number(v));
  return {
    x: (sx + 0.5) / bins,
    y: (sy + 0.5) / bins
  };
}

function topClusters(counter, limit = 8) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, weight]) => ({ ...keyToPoint(key), weight }));
}

export function getReplayHotspots() {
  if (!state.replay.hotspotsEnabled || !state.replay.frames.length) {
    return { frequent: [], lethal: [] };
  }

  const roundIndex = currentRoundIndex();
  if (state.replay.hotspotScope === 'match') {
    if (state.replay.hotspotsWholeMatch) return state.replay.hotspotsWholeMatch;
  }

  const cacheKey = String(roundIndex);
  if (state.replay.hotspotScope === 'round') {
    const cached = state.replay.hotspotsByRound[cacheKey];
    if (cached) return cached;
  }

  const frames = state.replay.hotspotScope === 'match' ? state.replay.frames : currentRoundFrames();
  const freqCounter = new Map();
  const lethalCounter = new Map();

  frames.forEach((frame) => {
    (frame.players || []).forEach((player) => {
      const key = quantize(player);
      freqCounter.set(key, (freqCounter.get(key) || 0) + 1);
    });

    (frame.events || []).forEach((event) => {
      const group = eventTypeGroup(event.type);
      if (!group) return;
      const key = quantize(event);
      const add = group === 'death' ? 3 : group === 'shot' ? 1 : 2;
      lethalCounter.set(key, (lethalCounter.get(key) || 0) + add);
    });
  });

  const result = {
    frequent: topClusters(freqCounter, 10),
    lethal: topClusters(lethalCounter, 10)
  };

  if (state.replay.hotspotScope === 'match') {
    state.replay.hotspotsWholeMatch = result;
  } else {
    state.replay.hotspotsByRound[cacheKey] = result;
  }
  return result;
}

function buildFrameAnalytics(frame) {
  const players = frame?.players || [];
  const events = frame?.events || [];
  const aliveT = players.filter((player) => player.team === 'T' && (player.health === null || player.health > 0)).length;
  const aliveCT = players.filter((player) => player.team === 'CT' && (player.health === null || player.health > 0)).length;
  const kills = events.filter((event) => event.type === 'death' || event.type === 'kill').length;
  const shots = events.filter((event) => event.type === 'shot').length;
  const grenades = events.filter((event) => event.type === 'grenadeThrow' || event.type === 'grenadeDrop').length;
  const bombEvents = events.filter((event) => event.type === 'bombDrop' || event.type === 'bombPlant').length;
  return { aliveT, aliveCT, kills, shots, grenades, bombEvents };
}

function summarizeTeam(players, team) {
  return players
    .filter((player) => player.team === team)
    .map((player) => {
      const ammo = player.ammoClip === null ? '-' : `${player.ammoClip}/${player.ammoReserve ?? '-'}`;
      const loadout = player.loadout.length > 0 ? player.loadout.join(', ') : '-';
      const hpArmor = `${player.health ?? '-'} HP / ${player.armor ?? '-'} ARM`;
      const money = player.money === null ? '-' : `$${player.money}`;
      return `
        <li>
          <div class="player-meta-top">
            <strong>${player.name}</strong>
            <span>${hpArmor}</span>
          </div>
          <div class="player-meta-line">Primary: ${player.currentWeapon} · Ammo: ${ammo}</div>
          <div class="player-meta-line">Secondary: ${player.secondaryWeapon || '-'}</div>
          <div class="player-meta-line">Loadout: ${loadout}</div>
          <div class="player-meta-line">Money: ${money}${player.hasBomb ? ' · Carrying Bomb' : ''}</div>
        </li>
      `;
    })
    .join('');
}

function renderPlayerPanel(frame) {
  const content = document.getElementById('player-panel-content');
  if (!content) return;

  const players = frame?.players || [];
  if (!players.length) {
    content.innerHTML = 'No player details available for this frame.';
    return;
  }

  const ts = summarizeTeam(players, 'T') || '<li>No Terrorist players in frame.</li>';
  const cts = summarizeTeam(players, 'CT') || '<li>No Counter-Terrorist players in frame.</li>';
  const analytics = buildFrameAnalytics(frame);

  content.innerHTML = `
    <div class="panel-team-block replay-analytics">
      <h4>Frame Analytics</h4>
      <div class="analytics-grid">
        <span>T Alive: <strong>${analytics.aliveT}</strong></span>
        <span>CT Alive: <strong>${analytics.aliveCT}</strong></span>
        <span>Kills: <strong>${analytics.kills}</strong></span>
        <span>Shots: <strong>${analytics.shots}</strong></span>
        <span>Grenades: <strong>${analytics.grenades}</strong></span>
        <span>Bomb Events: <strong>${analytics.bombEvents}</strong></span>
      </div>
    </div>
    <div class="panel-team-block t-team">
      <h4>Terrorists</h4>
      <ul>${ts}</ul>
    </div>
    <div class="panel-team-block ct-team">
      <h4>Counter-Terrorists</h4>
      <ul>${cts}</ul>
    </div>
  `;
}

function formatKillEntry(event) {
  const emoji = replayEventEmoji(event.type);
  const actor = event.attacker || event.player || 'Unknown';
  const victim = event.victim || '';
  const weapon = event.weapon || event.grenadeType || '';

  if (event.type === 'death' || event.type === 'kill') {
    return `${emoji} ${actor} [${weapon || 'weapon'}] ${victim || 'Unknown'}`;
  }
  if (event.type === 'grenadeThrow') {
    return `${emoji} ${actor} threw ${weapon || 'grenade'}`;
  }
  if (event.type === 'grenadeDrop') {
    return `${emoji} ${actor} dropped ${weapon || 'grenade'}`;
  }
  if (event.type === 'bombPlant') {
    return `${emoji} ${actor} planted the bomb`;
  }
  if (event.type === 'bombDrop') {
    return `${emoji} ${actor} dropped the bomb`;
  }
  if (event.type === 'shot') {
    return `${emoji} ${actor} fired`;
  }
  return `${emoji} ${actor}`;
}

function updateKillFeed(frame) {
  const killFeed = document.getElementById('kill-feed');
  if (!killFeed) return;

  if (!frame || !Array.isArray(frame.events)) {
    killFeed.classList.add('hidden');
    killFeed.innerHTML = '';
    return;
  }

  const feedEvents = filterEvents(frame.events).filter((event) => ['death', 'kill', 'grenadeThrow', 'grenadeDrop', 'bombPlant', 'bombDrop'].includes(event.type));
  if (!feedEvents.length) {
    killFeed.classList.add('hidden');
    killFeed.innerHTML = '';
    return;
  }

  const entries = feedEvents.slice(-KILL_FEED_LIMIT).map((event) => `<div class="kill-feed-item">${formatKillEntry(event)}</div>`);
  killFeed.innerHTML = entries.join('');
  killFeed.classList.remove('hidden');
}

function togglePlayerPanel() {
  const panel = document.getElementById('player-panel');
  const toggle = document.getElementById('toggle-player-panel');
  if (!panel || !toggle) return;

  const shouldShow = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !shouldShow);
  toggle.textContent = shouldShow ? 'Hide Player Panel' : 'Show Player Panel';
}

function bindUploadControls(handleFileSelection) {
  const dropzone = document.getElementById('replay-dropzone');
  const browseButton = document.getElementById('replay-browse-button');
  const uploadInput = document.getElementById('replay-upload');

  if (!dropzone || !browseButton || !uploadInput) return;

  browseButton.addEventListener('click', () => { if (!uploadInput.disabled) uploadInput.click(); });

  dropzone.addEventListener('click', () => { if (!uploadInput.disabled) uploadInput.click(); });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!uploadInput.disabled) uploadInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      if (!uploadInput.disabled) dropzone.classList.add('drag-active');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove('drag-active');
      if (uploadInput.disabled) return;
    });
  });

  dropzone.addEventListener('drop', (event) => {
    if (uploadInput.disabled) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFileSelection(file);
  });

  uploadInput.addEventListener('change', () => {
    if (uploadInput.disabled) return;
    const file = uploadInput.files?.[0];
    if (file) handleFileSelection(file);
  });
}

function handleFrameSideEffects() {
  const frame = state.replay.frames[state.replay.currentFrameIndex];
  renderPlayerPanel(frame);
  updateKillFeed(frame);
}

export function updateControls() {
  const controls = document.getElementById('replay-controls');
  const slider = document.getElementById('replay-slider');
  const tickLabel = document.getElementById('replay-tick');
  const roundLabel = document.getElementById('replay-round');

  if (!controls || !slider || !tickLabel || !roundLabel) return;

  const ready = state.replay.frames.length > 0;
  controls.classList.toggle('hidden', !ready);

  if (!ready) {
    slider.min = 0;
    slider.max = 0;
    slider.value = 0;
    tickLabel.textContent = 'Tick: -';
    roundLabel.textContent = 'Round: -';
    updateKillFeed(null);
    renderPlayerPanel(null);
    syncAnnotationInput();
    return;
  }

  slider.min = 0;
  slider.max = Math.max(0, state.replay.frames.length - 1);
  slider.value = state.replay.currentFrameIndex;

  const currentFrame = state.replay.frames[state.replay.currentFrameIndex];
  if (state.replay.timeMode === 'seconds') {
    const seconds = (currentFrame.tick / (state.replay.tickRate || 64)).toFixed(2);
    tickLabel.textContent = `Time: ${seconds}s`;
  } else {
    tickLabel.textContent = `Tick: ${currentFrame.tick}`;
  }

  const currentRound = state.replay.rounds.find((round) => (
    currentFrame.tick >= round.startTick && currentFrame.tick <= round.endTick
  ));
  roundLabel.textContent = currentRound ? currentRound.label : 'Round: -';

  handleFrameSideEffects();
  syncAnnotationInput();
}

export function getReplayRenderData() {
  if (!state.replay.frames.length) return { players: [], events: [] };
  const frame = state.replay.frames[state.replay.currentFrameIndex] || { players: [], events: [] };
  return {
    ...frame,
    events: filterEvents(frame.events || [])
  };
}

function applyReplayPayload(replay, fileName = 'replay') {
  state.replay.frames = replay.frames || [];
  state.replay.rounds = replay.rounds || [];
  state.replay.tickRate = replay.tickRate || 64;
  state.replay.currentFrameIndex = 0;
  state.replay.mapAutoDetected = Boolean(replay.mapAutoDetected || replay.mapName);
  state.replay.mapName = replay.mapName || '';
  state.replay.hotspotsByRound = {};
  state.replay.hotspotsWholeMatch = null;

  if (replay.mapName) {
    applyReplayMap(replay.mapName);
  }

  if (state.replay.frames.length > 0) {
    applyViewParamsFromUrl();
    setStatus(`Replay loaded: ${fileName} (${state.replay.frames.length} frames)`);
  } else if (state.replay.mapName) {
    setStatus(`Map detected (${state.replay.mapName}), but this .dem has no timeline frames yet.`);
  } else {
    setStatus('Replay uploaded, but no usable timeline data found.');
  }

  updateControls();
}

export function setupReplayControls() {
  const slider = document.getElementById('replay-slider');
  const playToggle = document.getElementById('replay-play-toggle');
  const prevRound = document.getElementById('replay-prev-round');
  const nextRound = document.getElementById('replay-next-round');
  const togglePanelButton = document.getElementById('toggle-player-panel');
  const speedSelect = document.getElementById('replay-speed');
  const timeModeSelect = document.getElementById('replay-time-mode');
  const filterShot = document.getElementById('filter-shot');
  const filterDeath = document.getElementById('filter-death');
  const filterGrenade = document.getElementById('filter-grenade');
  const filterBomb = document.getElementById('filter-bomb');
  const toggleHotspots = document.getElementById('toggle-hotspots');
  const hotspotScopeSelect = document.getElementById('hotspot-scope');
  const annotationInput = document.getElementById('round-annotation-input');
  const saveAnnotationButton = document.getElementById('save-round-annotation');
  const shareViewButton = document.getElementById('share-replay-view');

  if (!slider || !playToggle || !prevRound || !nextRound) return;

  state.replay.canEdit = pageParams.get('host') === '1';
  const dropzone = document.getElementById('replay-dropzone');
  const browseButton = document.getElementById('replay-browse-button');
  const uploadInput = document.getElementById('replay-upload');

  if (!state.replay.canEdit) {
    if (dropzone) dropzone.classList.add('disabled');
    if (browseButton) browseButton.disabled = true;
    if (uploadInput) uploadInput.disabled = true;
  }

  const handleFileSelection = async (file) => {
    stopPlayback();
    setStatus('Parsing replay...');

    try {
      const replay = await parseUpload(file);
      applyReplayPayload(replay, file.name);
      socket.emit('replayDataUpdate', { replay });
      emitViewSync();
    } catch (error) {
      state.replay.frames = [];
      state.replay.rounds = [];
      state.replay.currentFrameIndex = 0;
      state.replay.hotspotsByRound = {};
      state.replay.hotspotsWholeMatch = null;
      setStatus(`Replay load failed: ${error.message}`);
      updateControls();
    }
  };

  bindUploadControls(handleFileSelection);

  playToggle.addEventListener('click', () => {
    if (state.replay.isPlaying) stopPlayback();
    else startPlayback();
  });

  prevRound.addEventListener('click', () => {
    stopPlayback();
    moveRound(-1);
  });

  nextRound.addEventListener('click', () => {
    stopPlayback();
    moveRound(1);
  });

  slider.addEventListener('input', () => {
    stopPlayback();
    setCurrentFrameIndex(Number(slider.value));
  });

  if (togglePanelButton) {
    togglePanelButton.addEventListener('click', togglePlayerPanel);
  }

  if (speedSelect) {
    speedSelect.value = String(state.replay.playbackSpeed || 1);
    speedSelect.addEventListener('change', () => {
      state.replay.playbackSpeed = Number(speedSelect.value) || 1;
      if (state.replay.isPlaying) startPlayback();
      emitViewSync();
    });
  }

  if (timeModeSelect) {
    timeModeSelect.value = state.replay.timeMode || 'tick';
    timeModeSelect.addEventListener('change', () => {
      state.replay.timeMode = timeModeSelect.value === 'seconds' ? 'seconds' : 'tick';
      updateControls();
      emitViewSync();
    });
  }

  const bindFilter = (el, key) => {
    if (!el) return;
    el.checked = Boolean(state.replay.eventFilter[key]);
    el.addEventListener('change', () => {
      state.replay.eventFilter[key] = el.checked;
      updateControls();
      emitViewSync();
    });
  };

  bindFilter(filterShot, 'shot');
  bindFilter(filterDeath, 'death');
  bindFilter(filterGrenade, 'grenade');
  bindFilter(filterBomb, 'bomb');

  if (toggleHotspots) {
    toggleHotspots.checked = Boolean(state.replay.hotspotsEnabled);
    toggleHotspots.addEventListener('change', () => {
      state.replay.hotspotsEnabled = toggleHotspots.checked;
      updateControls();
      emitViewSync();
    });
  }

  if (hotspotScopeSelect) {
    hotspotScopeSelect.value = state.replay.hotspotScope || 'round';
    hotspotScopeSelect.addEventListener('change', () => {
      state.replay.hotspotScope = hotspotScopeSelect.value === 'match' ? 'match' : 'round';
      updateControls();
      emitViewSync();
    });
  }



  socket.on('replayDataUpdated', (replay) => {
    if (!replay || !Array.isArray(replay.frames)) return;
    applyReplayPayload(replay, 'shared replay');
  });

  socket.on('replayCollabSnapshot', (snapshot) => {
    state.replay.annotationsByRound = snapshot?.annotationsByRound || {};
    if (snapshot?.currentReplay && Array.isArray(snapshot.currentReplay.frames)) {
      applyReplayPayload(snapshot.currentReplay, 'shared replay');
    }
    syncAnnotationInput();
  });

  socket.on('replayAnnotationUpdated', ({ roundIndex, text }) => {
    if (!Number.isFinite(roundIndex)) return;
    state.replay.annotationsByRound[roundIndex] = text || '';
    syncAnnotationInput();
  });

  socket.on('replayViewSynced', (payload) => {
    if (!payload || payload.sourceId === socket.id) return;
    state.replay.playbackSpeed = Number(payload.speed) || state.replay.playbackSpeed;
    state.replay.timeMode = payload.timeMode === 'seconds' ? 'seconds' : 'tick';
    if (typeof payload.hotspotsEnabled === 'boolean') state.replay.hotspotsEnabled = payload.hotspotsEnabled;
    if (payload.hotspotScope === 'round' || payload.hotspotScope === 'match') state.replay.hotspotScope = payload.hotspotScope;
    if (payload.eventFilter && typeof payload.eventFilter === 'object') {
      state.replay.eventFilter = {
        shot: payload.eventFilter.shot !== false,
        death: payload.eventFilter.death !== false,
        grenade: payload.eventFilter.grenade !== false,
        bomb: payload.eventFilter.bomb !== false
      };
    }
    if (Number.isFinite(payload.frameIndex)) {
      state.replay.currentFrameIndex = Math.max(0, Math.min(state.replay.frames.length - 1, payload.frameIndex));
    }
    if (speedSelect) speedSelect.value = String(state.replay.playbackSpeed || 1);
    if (timeModeSelect) timeModeSelect.value = state.replay.timeMode || 'tick';
    if (toggleHotspots) toggleHotspots.checked = Boolean(state.replay.hotspotsEnabled);
    if (hotspotScopeSelect) hotspotScopeSelect.value = state.replay.hotspotScope || 'round';
    updateControls();
  });

  if (annotationInput && saveAnnotationButton) {
    annotationInput.disabled = !state.replay.canEdit;
    saveAnnotationButton.disabled = !state.replay.canEdit;
    saveAnnotationButton.addEventListener('click', () => {
      if (!state.replay.canEdit) return;
      const roundIndex = currentRoundIndex();
      if (roundIndex < 0) return;
      const text = annotationInput.value || '';
      state.replay.annotationsByRound[roundIndex] = text;
      socket.emit('replayAnnotationUpdate', { roundIndex, text });
      setStatus(`Saved note for round ${roundIndex + 1}`);
    });
  }

  if (shareViewButton) {
    shareViewButton.addEventListener('click', async () => {
      const link = buildShareLink();
      try {
        await navigator.clipboard.writeText(link);
        setStatus('Replay view link copied to clipboard.');
      } catch (err) {
        window.prompt('Copy replay view link:', link);
      }
    });
  }

  updateControls();
}
