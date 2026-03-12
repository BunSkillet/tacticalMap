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

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO
- **Frontend:** Vanilla HTML/CSS/JS + `<canvas>` rendering
- **Security middleware:** Helmet, CORS
- **Config:** dotenv
- **Dev tooling:** nodemon

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
