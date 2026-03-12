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
  return Math.max(16, Math.floor(1000 / tickRate));
}

function setStatus(message) {
  const status = document.getElementById('replay-status');
  if (status) status.textContent = message;
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

async function parseUpload(file) {
  const text = await file.text();
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    return sanitizeReplay(JSON.parse(text));
  }

  if (ext === 'dem') {
    const mapName = extractMapFromDemText(text);
    return {
      mapName,
      tickRate: 64,
      rounds: [],
      frames: [],
      source: 'dem-header',
      mapAutoDetected: Boolean(mapName)
    };
  }

  throw new Error('Unsupported file format. Upload a .dem or .json replay file.');
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
          <div class="player-meta-line">Weapon: ${player.currentWeapon} · Ammo: ${ammo}</div>
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

  content.innerHTML = `
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
  const killer = event.attacker || event.player || 'Unknown';
  const victim = event.victim || 'Unknown';
  const weapon = event.weapon || 'weapon';
  return `${killer} [${weapon}] ${victim}`;
}

function updateKillFeed(frame) {
  const killFeed = document.getElementById('kill-feed');
  if (!killFeed) return;

  if (!frame || !Array.isArray(frame.events)) {
    killFeed.classList.add('hidden');
    killFeed.innerHTML = '';
    return;
  }

  const killEvents = frame.events.filter((event) => event.type === 'death' || event.type === 'kill');
  if (!killEvents.length) {
    killFeed.classList.add('hidden');
    killFeed.innerHTML = '';
    return;
  }

  const entries = killEvents.slice(-KILL_FEED_LIMIT).map((event) => `<div class="kill-feed-item">${formatKillEntry(event)}</div>`);
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

  browseButton.addEventListener('click', () => uploadInput.click());

  dropzone.addEventListener('click', () => uploadInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      uploadInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('drag-active');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove('drag-active');
    });
  });

  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFileSelection(file);
  });

  uploadInput.addEventListener('change', () => {
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
    return;
  }

  slider.min = 0;
  slider.max = Math.max(0, state.replay.frames.length - 1);
  slider.value = state.replay.currentFrameIndex;

  const currentFrame = state.replay.frames[state.replay.currentFrameIndex];
  tickLabel.textContent = `Tick: ${currentFrame.tick}`;

  const currentRound = state.replay.rounds.find((round) => (
    currentFrame.tick >= round.startTick && currentFrame.tick <= round.endTick
  ));
  roundLabel.textContent = currentRound ? currentRound.label : 'Round: -';

  handleFrameSideEffects();
}

export function getReplayRenderData() {
  if (!state.replay.frames.length) return { players: [], events: [] };
  return state.replay.frames[state.replay.currentFrameIndex] || { players: [], events: [] };
}

export function setupReplayControls() {
  const slider = document.getElementById('replay-slider');
  const playToggle = document.getElementById('replay-play-toggle');
  const prevRound = document.getElementById('replay-prev-round');
  const nextRound = document.getElementById('replay-next-round');
  const togglePanelButton = document.getElementById('toggle-player-panel');

  if (!slider || !playToggle || !prevRound || !nextRound) return;

  const handleFileSelection = async (file) => {
    stopPlayback();
    setStatus('Parsing replay...');

    try {
      const replay = await parseUpload(file);
      state.replay.frames = replay.frames || [];
      state.replay.rounds = replay.rounds || [];
      state.replay.tickRate = replay.tickRate || 64;
      state.replay.currentFrameIndex = 0;
      state.replay.mapAutoDetected = Boolean(replay.mapAutoDetected || replay.mapName);
      state.replay.mapName = replay.mapName || '';

      if (replay.mapName) {
        applyReplayMap(replay.mapName);
      }

      if (state.replay.frames.length > 0) {
        setStatus(`Replay loaded: ${file.name} (${state.replay.frames.length} frames)`);
      } else if (state.replay.mapName) {
        setStatus(`Map detected (${state.replay.mapName}), but this .dem has no timeline frames yet.`);
      } else {
        setStatus('Replay uploaded, but no usable timeline data found.');
      }

      updateControls();
    } catch (error) {
      state.replay.frames = [];
      state.replay.rounds = [];
      state.replay.currentFrameIndex = 0;
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

  updateControls();
}
