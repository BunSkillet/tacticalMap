# CS2 Tactical Board

A collaborative tactical planning board for Counter-Strike 2.

## Goals

- Give teams a fast shared whiteboard for live strat planning.
- Keep collaboration real-time across multiple users in private rooms.
- Support both freeform planning (drawing, pings, notes, draggable symbols) and replay-assisted review.
- Keep deployment simple (single Node.js server with static client assets).

## What the App Does

### Core board features

- **Room-based collaboration** with 4-digit room codes from `POST /host`.
- **Map selection** for stock CS2 maps (Train, Mirage, Nuke, Ancient, Anubis, Inferno, Dust2).
- **Pen drawing**, **pings**, **text notes**, and **draggable tactical symbols**.
- **Select/move/delete** placed objects.
- **Pan + zoom** and a quick context menu.
- **Per-user color assignment** with collision prevention.
- **Undo/redo** (per-user recent action history).
- **Clear map** / **center map** / **save image** controls.

### Replay overlay features

- **Sidebar replay upload** (`.json` or `.dem`) via drag/drop or file picker.
- **Map auto-detection** for `.dem` when map text can be extracted.
- **Timeline playback bar** (play/pause, previous/next round, scrub slider) shown when a playable replay is loaded.
- **2D token overlays** for players (orange T / blue CT) with visible name labels.
- **Event overlays** for shots, deaths, grenade events, bomb drop/plant.
- **Kill feed overlay** styled like in-game feed.
- **Pop-out player panel** with team compositions and frame-level player details (weapon, ammo, loadout, health/armor, money, bomb carrier).

## Current Project Structure

```text
tacticalMap/
├── public/
│   ├── board.html
│   ├── landing.html
│   ├── css/
│   │   ├── style.css
│   │   └── landing.css
│   ├── js/
│   │   ├── main.js
│   │   ├── state.js
│   │   ├── canvas.js
│   │   ├── events.js
│   │   ├── socketHandlers.js
│   │   ├── replay.js
│   │   └── landing.js
│   └── maps/
│       ├── ancient.jpg
│       ├── anubis.jpg
│       ├── dust2.jpg
│       ├── inferno.jpg
│       ├── mirage.jpg
│       ├── nuke.jpg
│       ├── train.jpg
│       └── icons.png
├── server/
│   ├── app.js
│   └── userManager.js
├── test/
│   └── userManager.test.js
├── ecosystem.config.js
├── webhook.js
├── package.json
└── README.md
```

## Current Features
- **Map Selection** – Choose between several stock CS2 maps.
- **Drawing Tools** – Freehand pen drawing with colour selection.
 - **Ping and Draggable Objects** – Double click or use the ping tool to highlight points. Drag icons (e.g. grenade, AWP, anchor, CT, T) onto the map. On touch screens press and hold an icon to drag it, or tap the icon then tap the map to place it.
- **Text Boxes** – Use the text tool to drop editable notes directly onto the canvas. Double click (or double tap on mobile) any text to edit it again.
- **Object Selection** – Select placed objects to move or delete them. A Delete button allows removal on mobile devices.
- **Pan and Zoom** – Scroll to zoom and drag to pan the map.
- **Context Menu** – Right click the canvas to quickly switch tools.
- **Undo/Redo** – Each user can revert or reapply their last ten changes using toolbar buttons or keyboard shortcuts.
- **Real‑Time Collaboration** – All drawings, pings and objects are synced between connected clients.
- **User Colour Management** – The server assigns each user a unique colour and prevents conflicts.
- **Multi-Room Support** – Each board has an isolated state identified by a unique 4‑digit code returned from the `/host` endpoint.
- **Request Validation and Rate Limiting** – Basic checks guard against malformed or abusive client data.
- **Security Hardening** – Optional authentication token and CORS origin control via environment variables.
- **Automated Tests** – `npm test` runs simple unit tests for user management.
- **Replay Overlay (Upload)** – Drag-and-drop or browse for replay files (`.dem` or `.json`) from the sidebar. Loaded timelines show player tokens, usernames, event markers, kill feed, and optional player detail panel with team loadouts and ammo. `.dem` uploads auto-detect map when possible from header text and can auto-switch the board map.

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Run tests

```bash
npm test
```

### 3) Start the app

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

### 4) Open the app

- Landing page: `http://localhost:3000/`
- Create a room: send `POST /host`
- Join a room: `board.html?room=<code>&username=<name>`

> The app must be served by the Node server (do not open HTML files directly from disk).

## Environment Variables

Set in `.env` (or your process environment):

- `ALLOWED_ORIGIN` — CORS origin (default in code: `http://tacmap.xyz`).
- `AUTH_TOKEN` — optional Socket.IO auth token.
- `SSL_KEY_PATH` — optional HTTPS private key path.
- `SSL_CERT_PATH` — optional HTTPS certificate path.

If SSL files are missing, run without `SSL_KEY_PATH` / `SSL_CERT_PATH` so the server starts on HTTP.

To set auth token in browser localStorage:

```js
localStorage.setItem('authToken', '<token>');
```

## Deployment Notes

### PM2

```bash
pm2 start ecosystem.config.js
pm2 status
pm2 restart ecosystem.config.js
pm2 stop ecosystem.config.js
pm2 logs
```

### Webhook helper

`webhook.js` can be used for simple deploy hooks (customize or remove if unused).

## Known Limitations

- Native `.dem` timeline parsing is not fully implemented in-browser; `.dem` support is currently aimed at map detection unless preprocessed into timeline JSON.
- Replay quality depends on input frame/event data shape and coordinate normalization metadata.

## Contributing

Issues and pull requests are welcome.
