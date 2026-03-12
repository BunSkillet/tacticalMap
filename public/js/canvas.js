import { state } from './state.js';
import { getReplayHotspots, getReplayRenderData } from './replay.js';

export function resizeCanvas() {
  state.canvas.width = state.canvas.clientWidth;
  state.canvas.height = state.canvas.clientHeight;
  centerMap();
}

export function centerMap() {
  if (state.mapImage.complete && state.mapImage.naturalWidth !== 0) {
    const scaleX = state.canvas.width / state.mapImage.width;
    const scaleY = state.canvas.height / state.mapImage.height;
    state.scale = Math.min(scaleX, scaleY) * 0.9;
    state.offsetX = (state.canvas.width - state.mapImage.width * state.scale) / 2;
    state.offsetY = (state.canvas.height - state.mapImage.height * state.scale) / 2;
    draw();
  }
}

export function loadMap(name) {
  state.mapImage.onload = () => {
    centerMap();
    draw();
  };
  state.mapImage.src = `maps/${name}.jpg`;
}

function toMapPoint(normalized) {
  return {
    x: normalized.x * state.mapImage.width,
    y: normalized.y * state.mapImage.height
  };
}

function drawReplayLabel(ctx, x, y, text) {
  const fontSize = 12 / state.scale;
  const paddingX = 6 / state.scale;
  const paddingY = 3 / state.scale;
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width;
  const labelX = x - ((width / 2) + paddingX);
  const labelY = y - (10 / state.scale) - (fontSize + paddingY * 2);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, width + paddingX * 2, fontSize + paddingY * 2, 3 / state.scale);
  ctx.fill();

  ctx.fillStyle = '#f8f8f8';
  ctx.fillText(text, x, labelY + (fontSize / 2) + paddingY);
}


function drawReplayHotspots(ctx) {
  const hotspots = getReplayHotspots();
  if (!hotspots) return;

  hotspots.frequent.forEach((spot) => {
    const pt = toMapPoint(spot);
    const radius = (14 + Math.min(spot.weight, 25)) / state.scale;
    const alpha = Math.min(0.35, 0.1 + (spot.weight / 80));
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 196, 0, ${alpha})`;
    ctx.fill();
  });

  hotspots.lethal.forEach((spot) => {
    const pt = toMapPoint(spot);
    const radius = (12 + Math.min(spot.weight, 25)) / state.scale;
    const alpha = Math.min(0.42, 0.12 + (spot.weight / 70));
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 64, 64, ${alpha})`;
    ctx.fill();
    ctx.lineWidth = 1 / state.scale;
    ctx.strokeStyle = `rgba(255, 190, 190, ${Math.min(0.7, alpha + 0.2)})`;
    ctx.stroke();
  });
}

function drawReplayOverlay(ctx) {
  drawReplayHotspots(ctx);
  const replayFrame = getReplayRenderData();
  if (!replayFrame) return;

  replayFrame.players.forEach((player) => {
    const pt = toMapPoint(player);
    const radius = 14 / state.scale;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = player.team === 'CT' ? '#2d7ef7' : '#f39c12';
    ctx.fill();
    ctx.lineWidth = 2 / state.scale;
    ctx.strokeStyle = '#101010';
    ctx.stroke();

    drawReplayLabel(ctx, pt.x, pt.y, player.name || 'Player');

    if (player.hasBomb) {
      ctx.fillStyle = '#111';
      ctx.font = `${16 / state.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('💣', pt.x, pt.y - (14 / state.scale));
    }
  });

  replayFrame.events.forEach((event) => {
    const pt = toMapPoint(event);
    let color = '#ffffff';
    let symbol = '•';
    if (event.type === 'shot') {
      color = '#ffeb3b';
      symbol = '🔫';
    } else if (event.type === 'death' || event.type === 'kill') {
      color = '#ff4d4f';
      symbol = '☠️';
    } else if (event.type === 'grenadeThrow') {
      color = '#9c27b0';
      symbol = '🧨';
    } else if (event.type === 'grenadeDrop') {
      color = '#7e57c2';
      symbol = '📦';
    } else if (event.type === 'bombDrop') {
      color = '#111111';
      symbol = '👜';
    } else if (event.type === 'bombPlant') {
      color = '#00e676';
      symbol = '💣';
    }

    ctx.fillStyle = color;
    ctx.font = `${17 / state.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, pt.x, pt.y);
  });
}

export function draw() {
  const ctx = state.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  ctx.setTransform(state.scale, 0, 0, state.scale, state.offsetX, state.offsetY);

  if (state.mapImage.complete && state.mapImage.naturalWidth !== 0) {
    ctx.drawImage(state.mapImage, 0, 0);
    state.penPaths.forEach(({ path, color }) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / state.scale;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      path.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });
  }

  drawReplayOverlay(ctx);

  state.placedObjects.forEach(obj => {
    ctx.font = `${48 / state.scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (state.selectedObjectIndices.includes(state.placedObjects.indexOf(obj))) {
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, 28 / state.scale, 0, 2 * Math.PI);
      ctx.fillStyle = '#00ffff';
      ctx.fill();
    }
    ctx.fillStyle = 'black';
    ctx.fillText(obj.symbol, obj.x, obj.y);
  });

  const now = Date.now();
  state.pings.forEach(ping => {
    const elapsed = now - ping.start;
    if (elapsed <= 5000) {
      if (elapsed <= 3000) {
        for (let i = 0; i < ping.ripples; i++) {
          const rippleTime = 3000 / ping.ripples;
          const rippleAge = elapsed - i * rippleTime;
          if (rippleAge >= 0 && rippleAge <= rippleTime) {
            const progress = rippleAge / rippleTime;
            const radius = 20 + progress * 60;
            const alpha = 1 - progress;
            ctx.beginPath();
            ctx.arc(ping.x, ping.y, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = `${ping.color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
            ctx.lineWidth = 2 / state.scale;
            ctx.stroke();
          }
        }
      }
      const fadeProgress = Math.min((5000 - elapsed) / 1000, 1);
      const alpha = Math.max(fadeProgress, 0);
      ctx.beginPath();
      ctx.arc(ping.x, ping.y, 6 / state.scale, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.fill();
    }
  });

  if (state.isDrawing && state.penPath.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = state.currentColor;
    ctx.lineWidth = 2 / state.scale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    state.penPath.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  }

  if (state.currentTool === 'select' && state.selectionRect) {
    const x = Math.min(state.selectionRect.startX, state.selectionRect.endX);
    const y = Math.min(state.selectionRect.startY, state.selectionRect.endY);
    const w = Math.abs(state.selectionRect.endX - state.selectionRect.startX);
    const h = Math.abs(state.selectionRect.endY - state.selectionRect.startY);
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1 / state.scale;
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

export function updateCursor() {
  let cursor = 'default';
  if (state.draggedSymbol) {
    const svgCursor = `data:image/svg+xml;base64,${btoa(
      `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'>` +
      `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='24'>${state.draggedSymbol}</text>` +
      `</svg>`
    )}`;
    cursor = `url('${svgCursor}') 16 16, auto`;
  } else if (state.currentTool === 'pan') {
    cursor = 'grab';
  } else if (state.currentTool === 'select') {
    cursor = 'default';
  } else if (state.currentTool === 'text') {
    cursor = 'text';
  } else if (state.currentTool && state.currentColor) {
    const svgCursor = `data:image/svg+xml;base64,${btoa(
      `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='6' fill='${state.currentColor}'/></svg>`
    )}`;
    cursor = `url('${svgCursor}') 12 12, auto`;
  }
  // Apply the calculated cursor only to the canvas. The sidebar and the rest
  // of the page should keep the default cursor so that elements such as the
  // draggable buttons can define their own cursor behaviour.
  state.canvas.style.cursor = cursor;
  document.body.style.cursor = 'default';
}

export function animate() {
  const now = Date.now();
  state.pings.forEach(p => (p.age = now - p.start));
  for (let i = state.pings.length - 1; i >= 0; i--) {
    if (state.pings[i].age > 5000) state.pings.splice(i, 1);
  }
  for (let i = state.penPaths.length - 1; i >= 0; i--) {
    const p = state.penPaths[i];
    if (p.color === '#ff0000' && p.timestamp && now - p.timestamp > 3000) {
      state.penPaths.splice(i, 1);
    }
  }
  draw();
  requestAnimationFrame(animate);
}
