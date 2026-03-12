export const state = {
  canvas: document.getElementById('mapCanvas'),
  mapSelect: document.getElementById('map-select'),
  resetViewButton: document.getElementById('reset-view-button'),
  mapImage: new Image(),
  ctx: null,
  selectionRect: null,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  isDragging: false,
  lastX: 0,
  lastY: 0,
  currentTool: null,
  currentColor: '#ff0000',
  placedObjects: [],
  selectedObjectIndices: [],
  penPath: [],
  penPaths: [],
  isDrawing: false,
  isLiveDrawing: false,
  pings: [],
  activeUsers: [],
  draggedSymbol: null,
  activePointers: new Map(),
  isPinching: false,
  initialPinchDistance: 0,
  initialScale: 1,
  initialWorldCenter: { x: 0, y: 0 },
  activeTextInput: null,
  editingObjectIndex: null,
  lastTapTime: 0,
  replay: {
    frames: [],
    rounds: [],
    tickRate: 64,
    currentFrameIndex: 0,
    isPlaying: false,
    mapName: '',
    mapAutoDetected: false
  }
};

state.ctx = state.canvas.getContext('2d');

export function resetState() {
  state.selectionRect = null;
  state.scale = 1;
  state.offsetX = 0;
  state.offsetY = 0;
  state.isDragging = false;
  state.lastX = 0;
  state.lastY = 0;
  state.currentTool = 'pen';
  state.currentColor = '#ff0000';
  state.placedObjects.length = 0;
  state.selectedObjectIndices = [];
  state.penPath = [];
  state.penPaths.length = 0;
  state.isDrawing = false;
  state.isLiveDrawing = false;
  state.pings.length = 0;
  state.activeUsers.length = 0;
  state.draggedSymbol = null;
  state.activePointers.clear();
  state.isPinching = false;
  state.initialPinchDistance = 0;
  state.initialScale = 1;
  state.initialWorldCenter = { x: 0, y: 0 };
  state.activeTextInput = null;
  state.editingObjectIndex = null;
  state.lastTapTime = 0;
  state.replay.frames = [];
  state.replay.rounds = [];
  state.replay.tickRate = 64;
  state.replay.currentFrameIndex = 0;
  state.replay.isPlaying = false;
  state.replay.mapName = '';
  state.replay.mapAutoDetected = false;
}

export function clearBoardState() {
  state.selectionRect = null;
  state.placedObjects.length = 0;
  state.selectedObjectIndices = [];
  state.penPath = [];
  state.penPaths.length = 0;
  state.isDrawing = false;
  state.isLiveDrawing = false;
  state.pings.length = 0;
  state.draggedSymbol = null;
  state.activeTextInput = null;
  state.editingObjectIndex = null;
  state.lastTapTime = 0;
}
