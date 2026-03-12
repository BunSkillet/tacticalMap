# CS2 Tactical Board

## Overview
The CS2 Tactical Board is a real-time collaborative whiteboard for Counter-Strike 2 map planning. Multiple users can connect and draw on a shared map, drop objects such as grenades or player icons and ping locations. The board synchronises actions through WebSockets so everyone sees updates instantly.

## Project Structure
```
tacticalMap
├── public                # Static client files served by Express
│   ├── board.html        # Board interface
│   ├── landing.html      # Landing screen
│   ├── css
│   │   ├── style.css     # Board page styles
│   │   └── landing.css   # Landing page styles
│   ├── js
│   │   ├── main.js       # Client bootstrap
│   │   ├── canvas.js     # Canvas rendering and animation
│   │   ├── events.js     # DOM and input handlers
│   │   ├── landing.js    # Landing page behavior
│   │   ├── socketHandlers.js # Socket.IO client logic
│   │   └── state.js      # Client side state container
│   └── maps              # Map images used by the board
├── server                # Server side code
│   ├── app.js            # Express and Socket.IO server
│   └── userManager.js    # Assigns and tracks user colours
├── test                  # Minimal unit tests
│   └── userManager.test.js
├── ecosystem.config.js   # pm2 configuration
├── webhook.js            # Simple GitHub webhook for deployments
├── .env                 # Example environment variables
├── package.json          # npm configuration and scripts
└── README.md             # Project documentation
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
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the tests (optional but recommended):
   ```bash
   npm test
   ```
3. Start the server (use `npm run dev` for live reloads):
   ```bash
   npm start
   ```
4. Visit `http://localhost:3000/` in your browser. If you have deployed the server
   to a domain such as `https://tacmap.xyz`, open that URL instead. When SSL
   certificates are not configured the server falls back to HTTP on the same
   port. **Do not open `landing.html` directly from the file system** – the
   server enforces a Content Security Policy and must serve the pages so their
   scripts load correctly.

### Hosting Rooms
Create a new board by sending a `POST` request to `/host`. The response contains
a `code` that other clients can use to join. Open `board.html?room=<code>` to
connect to that room and share the board state.

### Environment Variables
Set the following variables in a `.env` file or your environment:
- `ALLOWED_ORIGIN` – Allowed CORS origin (`https://tacmap.xyz` by default or
  your own domain).
- `AUTH_TOKEN` – Require clients to provide this token when connecting.
- `SSL_KEY_PATH` and `SSL_CERT_PATH` – Enable HTTPS by providing paths to a certificate and key.

The server uses Helmet to set a strict Content Security Policy. Keep all client
scripts in separate files so they load correctly under this policy.

Store the auth token on the client with:
```javascript
localStorage.setItem('authToken', '<token>');
```

### PM2 Deployment
Use `pm2` with `ecosystem.config.js` to run the server in production:
```bash
pm2 start ecosystem.config.js
```
Additional commands:
```bash
pm2 status
pm2 restart ecosystem.config.js
pm2 stop ecosystem.config.js
pm2 logs
```

### GitHub Webhook
`webhook.js` listens on port `4000` and executes `/home/opc/deploy.sh` when triggered. Adjust the path as needed or remove the file if you do not use it.

## Contributing
Contributions and suggestions are welcome! Please open an issue or submit a pull request.
