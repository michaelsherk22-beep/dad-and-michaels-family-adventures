/* Dad and Michael's Family Adventures
   - 5 rainbow levels (easy -> hard)
   - Simple top-down "obby + chase" in canvas
   - Glue Glue Head chases slowly; touching a hazard resets to checkpoint
*/

const canvas = document.getElementById("game");
if (!canvas) alert("No canvas with id='game' found");

const ctx = canvas?.getContext("2d");
if (!ctx) alert("Canvas context failed");

const hudLevel = document.getElementById("hud-level");
const hudGoal = document.getElementById("hud-goal");
const hudRescued = document.getElementById("hud-rescued");
const messageEl = document.getElementById("message");

const btnStart = document.getElementById("btn-start");
const btnRetry = document.getElementById("btn-retry");
const btnNext = document.getElementById("btn-next");

const W = canvas.width;
const H = canvas.height;

// --- Shared art assets (same for everyone) ---
const BASE = "assets/";
const ART = {
  michael: BASE + "michael.png",
  dad: BASE + "dad.png",
  mom: BASE + "mom.png",
  catalina: BASE + "catalina.png",
  tinsley: BASE + "tinsley.png",
  flashlight: BASE + "flashlight.png",
  home: BASE + "home.png",
  monster: BASE + "gluegluehead.png",
};


const sprites = {};     // loaded Image objects end up here
let spritesReady = false;

function loadSprite(key, url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ key, img, ok: true });
    img.onerror = () => resolve({ key, img: null, ok: false });
    img.src = url;
  });
}

async function preloadSprites() {
  const results = await Promise.all(
    Object.entries(ART).map(([key, url]) => loadSprite(key, url))
  );

  for (const r of results) sprites[r.key] = r.img;

  spritesReady = true;

   console.log("Sprite load check:",
  Object.fromEntries(Object.entries(sprites).map(([k,v]) => [k, !!v]))
);

  const failed = results.filter(r => !r.ok).map(r => `${r.key}: ${ART[r.key]}`);
  if (failed.length) {
    setMessage(
      "Some images did not load:\n" +
      failed.join("\n") +
      "\n\nFix filenames in /assets (case sensitive)."
    );
  }
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function centerOf(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }

const keys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(k)) e.preventDefault();
  keys.add(k);
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// Mobile D-pad (touch + mouse)
const heldDirs = new Set();
document.querySelectorAll(".pad").forEach(btn => {
  const dir = btn.dataset.dir;
  const down = () => heldDirs.add(dir);
  const up = () => heldDirs.delete(dir);

  btn.addEventListener("mousedown", down);
  btn.addEventListener("mouseup", up);
  btn.addEventListener("mouseleave", up);

  btn.addEventListener("touchstart", (e) => { e.preventDefault(); down(); }, { passive: false });
  btn.addEventListener("touchend", (e) => { e.preventDefault(); up(); }, { passive: false });
});

// --- Story objects ---
const family = {
  mom: { name: "Mom", rescued: false },
  catalina: { name: "Catalina", rescued: false },
  tinsley: { name: "Tinsley", rescued: false }
};

const THEMES = [
  { name: "Red",    bg: "#2a0c0c", accent: "#ff2a2a" },
  { name: "Orange", bg: "#2a1606", accent: "#ff8c1a" },
  { name: "Yellow", bg: "#2a2507", accent: "#ffe600" },
  { name: "Green",  bg: "#0c2a14", accent: "#1aff6b" },
  { name: "Blue/Purple", bg: "#0b0f2a", accent: "#7f5cff" },
];

// Game state
let running = false;
let levelIndex = 0;
let lastTime = 0;
// Click/touch-to-move target
let pointerMoveActive = false;
let pointerTarget = { x: 0, y: 0 };

const player = {
  x: 70, y: 420, w: 28, h: 28,
  speed: 220,
  checkpoint: { x: 70, y: 420 }
};

const dad = { // draws as a "buddy" following the player slightly
  x: 40, y: 420, w: 28, h: 28
};

const monster = {
  x: 70, y: 120, w: 34, h: 34,
  speed: 85,
  active: false,
  angry: false
};

let goalZone = null;        // where "home" is
let item = null;            // flashlight, key, rescue token, etc.
let npc = null;             // rescue character drawn on map
let levelRescueKey = null;  // which rescue is required this level
let obstacles = [];         // walls / blockers
let hazards = [];           // goo puddles (touch = reset)
let checkpoints = [];       // checkpoint pads

const LEVELS = [
  {
    title: "Level 1 (Red): Find the Flashlight",
    goalText: "Goal: Find the Flashlight",
    setup() {
      // easiest: wide open lane
      resetPositions();
      monster.active = false;

      checkpoints = [
        { x: 80, y: 430, w: 80, h: 18 },
        { x: 320, y: 430, w: 80, h: 18 },
        { x: 560, y: 430, w: 80, h: 18 },
      ];

      obstacles = [
        // soft "fences" to guide, not block too much
        { x: 0, y: 360, w: 760, h: 10 },
        { x: 0, y: 490, w: 760, h: 10 },
      ];

      hazards = []; // none in level 1

      item = { kind: "flashlight", label: "Flashlight", x: 700, y: 410, w: 32, h: 32 };
      - rescueTarget = null;

      goalZone = { x: 860, y: 400, w: 70, h: 90, label: "Home" };
      setMessage(
        "Welcome!\n" +
        "You are Michael (5) and Dad is with you.\n" +
        "Find the Flashlight so you can see the way home!"
      );
    }
  },
  {
    title: "Level 2 (Orange): Rescue Tinsley",
    goalText: "Goal: Rescue Tinsley",
    setup() {
      resetPositions();
      monster.active = false;

      checkpoints = [
        { x: 90, y: 430, w: 80, h: 18 },
        { x: 360, y: 360, w: 80, h: 18 },
        { x: 640, y: 300, w: 80, h: 18 },
      ];

      // big "toy platforms" (walls to guide the player around)
      obstacles = [
        { x: 200, y: 120, w: 20, h: 320 },
        { x: 420, y: 0, w: 20, h: 320 },
        { x: 200, y: 420, w: 520, h: 20 },
      ];

      hazards = [
        { x: 260, y: 470, w: 120, h: 22 },
        { x: 470, y: 470, w: 120, h: 22 },
      ];

      item = null; // no rescue item anymore
rescueTarget = "tinsley";
npc = { x: 740, y: 260, w: 40, h: 40, key: rescueTarget };

goalZone = { x: 860, y: 240, w: 80, h: 120, label: "HOME" };
setMessage("Level 2!\nFind Tinsley and rescue her, then go HOME!");
    }
  },
  {
    title: "Level 3 (Yellow): Catalina’s Maze",
    goalText: "Goal: Rescue Catalina",
    setup() {
      resetPositions();
      monster.active = true;
      monster.angry = false;

      checkpoints = [
        { x: 90, y: 430, w: 80, h: 18 },
        { x: 420, y: 430, w: 80, h: 18 },
        { x: 720, y: 430, w: 80, h: 18 },
      ];

      // a simple maze: thick walls, wide hallways
      obstacles = [
        // outer guides
        { x: 140, y: 80, w: 10, h: 420 },
        { x: 140, y: 80, w: 720, h: 10 },
        { x: 850, y: 80, w: 10, h: 420 },

        // inside walls
        { x: 220, y: 160, w: 500, h: 10 },
        { x: 220, y: 160, w: 10, h: 250 },
        { x: 300, y: 240, w: 420, h: 10 },
        { x: 710, y: 240, w: 10, h: 210 },
        { x: 380, y: 320, w: 250, h: 10 },
      ];

      hazards = [
        { x: 260, y: 480, w: 140, h: 20 },
        { x: 520, y: 480, w: 140, h: 20 },
      ];

     item = null;
rescueTarget = "catalina";
npc = { x: 760, y: 110, w: 40, h: 40, key: rescueTarget };

goalZone = { x: 860, y: 90, w: 80, h: 120, label: "HOME" };
setMessage("Level 3!\nFind Catalina, rescue her, then go HOME!");
    }
  },
  {
    title: "Level 4 (Green): Elevator Escape (Rescue Mom)",
    goalText: "Goal: Rescue Mom",
    setup() {
      resetPositions();
      monster.active = true;
      monster.angry = true;

      checkpoints = [
        { x: 90, y: 430, w: 80, h: 18 },
        { x: 420, y: 300, w: 80, h: 18 },
        { x: 700, y: 160, w: 80, h: 18 },
      ];

      // timed-ish paths using narrow gates
      obstacles = [
        { x: 190, y: 90, w: 20, h: 420 },
        { x: 420, y: 0, w: 20, h: 260 },
        { x: 420, y: 320, w: 20, h: 220 },
        { x: 650, y: 90, w: 20, h: 360 },
        { x: 740, y: 180, w: 120, h: 20 },
      ];

      hazards = [
        { x: 260, y: 470, w: 120, h: 22 },
        { x: 520, y: 470, w: 120, h: 22 },
        { x: 780, y: 470, w: 120, h: 22 },
      ];

      item = null;
rescueTarget = "mom";
npc = { x: 800, y: 120, w: 40, h: 40, key: rescueTarget };

goalZone = { x: 860, y: 90, w: 80, h: 140, label: "HOME" };
setMessage("Level 4!\nFind Mom, rescue her, then go HOME!");
    }
  },
  {
    title: "Level 5 (Blue/Purple): Run Home!",
    goalText: "Goal: Get Home",
    setup() {
      resetPositions();
      monster.active = true;
      monster.angry = true;

      checkpoints = [
        { x: 90, y: 430, w: 80, h: 18 },
        { x: 380, y: 430, w: 80, h: 18 },
        { x: 660, y: 430, w: 80, h: 18 },
        { x: 820, y: 260, w: 80, h: 18 },
      ];

      obstacles = [
        // a fun zig-zag course
        { x: 200, y: 120, w: 20, h: 380 },
        { x: 340, y: 0, w: 20, h: 300 },
        { x: 480, y: 240, w: 20, h: 300 },
        { x: 620, y: 0, w: 20, h: 320 },
        { x: 760, y: 220, w: 20, h: 320 },
        // Wall top (leaves a gap in the middle)
         { x: 860, y: 0, w: 10, h: 160 },
      // Wall bottom
      { x: 860, y: 260, w: 10, h: 280 },
      ];

      hazards = [
        { x: 260, y: 470, w: 120, h: 22 },
        { x: 520, y: 470, w: 120, h: 22 },
        { x: 780, y: 470, w: 120, h: 22 },
      ];

      item = null;
      rescueTarget = null;

      goalZone = { x: 880, y: 40, w: 70, h: 150, label: "HOME" };

      setMessage(
        "Final Level!\nRun home!\n" +
        "If Glue Glue Head catches you, you pop back to the last checkpoint.\n" +
        "You’ve got this!"
      );
    }
  }
];

function resetPositions() {
  player.x = 70; player.y = 420;
  player.checkpoint = { x: 70, y: 420 };
  dad.x = 40; dad.y = 420;

  monster.x = 70; monster.y = 120;
  monster.speed = (levelIndex <= 1) ? 0 : (levelIndex === 2 ? 75 : 95);
}

function setMessage(text) {
  messageEl.textContent = text;
}

function setButtons() {
  btnStart.disabled = running;
  btnRetry.disabled = !running;
  btnNext.disabled = running; // enabled only when level complete
}

function setHUD() {
  hudLevel.textContent = `Level: ${levelIndex + 1} (${THEMES[levelIndex].name})`;
  hudGoal.textContent = LEVELS[levelIndex].goalText;

  const rescuedCount = Object.values(family).filter(f => f.rescued).length;
  hudRescued.textContent = `Rescued: ${rescuedCount}/3`;
}

function startGame() {
  // reset rescues at the very beginning only
  if (!running && levelIndex === 0) {
    family.mom.rescued = false;
    family.catalina.rescued = false;
    family.tinsley.rescued = false;
  }
  running = true;
  btnNext.disabled = true;
  setButtons();
  loadLevel(levelIndex);
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function retryLevel() {
  running = true;
  btnNext.disabled = true;
  setButtons();
  loadLevel(levelIndex);

  // ✅ restart the loop
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function nextLevel() {
  if (levelIndex < LEVELS.length - 1) {
    levelIndex++;
    running = true;
    btnNext.disabled = true;
    setButtons();
    loadLevel(levelIndex);

    // ✅ restart the loop
    lastTime = performance.now();
    requestAnimationFrame(loop);
  } else {
    // end screen
    setMessage(
      "YOU DID IT!\n" +
      "Dad and Michael got everyone home!\n" +
      "Mom, Catalina, and Tinsley are safe.\n\n" +
      "Press Retry to play again!"
    );
  }
}

function loadLevel(i) {
  LEVELS[i].setup();
  setHUD();
}

function getCanvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

// --- Mouse: click/drag to move ---
canvas.addEventListener("mousedown", (e) => {
  const p = getCanvasPointFromEvent(e);
  setPointerTarget(p.x, p.y);
});

window.addEventListener("mouseup", () => {
  // optional: stop when mouse released
  // pointerMoveActive = false;
});

canvas.addEventListener("mousemove", (e) => {
  if (!pointerMoveActive) return;
  // If you want "click-and-drag follows mouse"
  const p = getCanvasPointFromEvent(e);
  setPointerTarget(p.x, p.y);
});

// --- Touch: tap/drag to move ---
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault(); // prevents page scrolling while playing
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  setPointerTarget((t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY);
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  setPointerTarget((t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY);
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  // optional: stop when finger lifts
  // pointerMoveActive = false;
}, { passive: false });

function setPointerTarget(x, y) {
  pointerTarget.x = clamp(x, 8, W - player.w - 8);
  pointerTarget.y = clamp(y, 8, H - player.h - 8);
  pointerMoveActive = true;
}

function movePlayer(dt) {
  const vx =
    (keys.has("arrowright") || keys.has("d") ? 1 : 0) -
    (keys.has("arrowleft") || keys.has("a") ? 1 : 0);

  const vy =
    (keys.has("arrowdown") || keys.has("s") ? 1 : 0) -
    (keys.has("arrowup") || keys.has("w") ? 1 : 0);

  const mx = (heldDirs.has("right") ? 1 : 0) - (heldDirs.has("left") ? 1 : 0);
  const my = (heldDirs.has("down") ? 1 : 0) - (heldDirs.has("up") ? 1 : 0);

  // IMPORTANT: let (not const) because pointer movement may change dx/dy
  let dx = vx + mx;
  let dy = vy + my;

  // If no keyboard/D-pad input, use click/touch-to-move
  if (dx === 0 && dy === 0 && pointerMoveActive) {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;

    const tx = pointerTarget.x + player.w / 2;
    const ty = pointerTarget.y + player.h / 2;

    const toX = tx - px;
    const toY = ty - py;

    const d = Math.hypot(toX, toY);

    // If close enough, stop moving
    if (d < 10) {
      pointerMoveActive = false;
      dx = 0;
      dy = 0;
    } else {
      dx = toX / d;
      dy = toY / d;
    }
  }

  // Normalize diagonal so it isn't faster (AFTER pointer movement)
  const mag = Math.hypot(dx, dy) || 1;
  const ux = dx / mag;
  const uy = dy / mag;

  const speed = player.speed;
  const newPos = {
    x: player.x + ux * speed * dt,
    y: player.y + uy * speed * dt,
    w: player.w,
    h: player.h
  };

  // Keep in bounds
  newPos.x = clamp(newPos.x, 8, W - player.w - 8);
  newPos.y = clamp(newPos.y, 8, H - player.h - 8);

  // Collide with obstacles: try x then y for smooth sliding
  const tryX = { ...newPos, y: player.y };
  if (!obstacles.some(o => rectsOverlap(tryX, o))) {
    player.x = tryX.x;
  }

  const tryY = { ...newPos, x: player.x };
  if (!obstacles.some(o => rectsOverlap(tryY, o))) {
    player.y = tryY.y;
  }
}

function updateDad(dt) {
  // dad follows behind slightly; very gentle
  const target = { x: player.x - 30, y: player.y + 10 };
  const dx = target.x - dad.x;
  const dy = target.y - dad.y;
  dad.x += dx * 4.0 * dt;
  dad.y += dy * 4.0 * dt;
}

function updateMonster(dt) {
  if (!monster.active) return;

  // Monster wakes up more in later levels but stays kid-friendly.
  const baseSpeed = monster.speed || 85;
  const speed = monster.angry ? baseSpeed + 20 : baseSpeed;

  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;
  const mx = monster.x + monster.w / 2;
  const my = monster.y + monster.h / 2;

  const dx = px - mx;
  const dy = py - my;
  const d = Math.hypot(dx, dy) || 1;

  // If very close, slow down (less frustrating)
  const nearFactor = d < 60 ? 0.45 : 1;

  monster.x += (dx / d) * speed * nearFactor * dt;
  monster.y += (dy / d) * speed * nearFactor * dt;

  // stay in bounds
  monster.x = clamp(monster.x, 8, W - monster.w - 8);
  monster.y = clamp(monster.y, 8, H - monster.h - 8);

  // monster doesn't pass through solid walls too much (simple)
  const mRect = { x: monster.x, y: monster.y, w: monster.w, h: monster.h };
  if (obstacles.some(o => rectsOverlap(mRect, o))) {
    // small bounce back
    monster.x -= (dx / d) * speed * nearFactor * dt * 1.2;
    monster.y -= (dy / d) * speed * nearFactor * dt * 1.2;
  }

  // If monster touches player, reset to checkpoint
  const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
  const mRect2 = { x: monster.x, y: monster.y, w: monster.w, h: monster.h };
  if (rectsOverlap(pRect, mRect2)) {
    setMessage("Glue Glue Head got you!\nPop! Back to your checkpoint 😄");
    resetToCheckpoint();
  }
}

function resetToCheckpoint() {
  player.x = player.checkpoint.x;
  player.y = player.checkpoint.y;
  // monster backs off a little so it doesn't instantly re-tag
  monster.x = 70;
  monster.y = 120;
}

function updateCheckpoints() {
  const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
  for (const cp of checkpoints) {
    if (rectsOverlap(pRect, cp)) {
      player.checkpoint = { x: cp.x + 8, y: cp.y - 30 };
    }
  }
}

function updateHazards() {
  const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
  for (const hz of hazards) {
    if (rectsOverlap(pRect, hz)) {
      setMessage("Uh oh — sticky goo!\nBack to the checkpoint!");
      resetToCheckpoint();
      break;
    }
  }
}

function updateItem() {
  if (!item) return;
  const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
  if (rectsOverlap(pRect, item)) {
    if (item.kind === "flashlight") {
      setMessage("You found the Flashlight!\nNow go rescue the family!");
    }
    item = null;
    setHUD();
  }
}

function updateNpcRescue() {
  if (!npc || !npc.key) return;

  const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
  if (rectsOverlap(pRect, npc)) {
    family[npc.key].rescued = true;
    setMessage(`You rescued ${family[npc.key].name}!\nNow go HOME!`);
    npc = null;
    setHUD();
  }
}

function updateGoal() {
  const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
  if (!goalZone) return;

  const isFinal = (levelIndex === 4);
  const rescuedCount = Object.values(family).filter(f => f.rescued).length;

  let canFinish = true;

  if (isFinal) {
    canFinish = (rescuedCount === 3);
  } else if (levelIndex === 0) {
    // Level 1: require flashlight (if you keep it)
    canFinish = (item === null);
  } else if (levelRescueKey) {
    canFinish = (family[levelRescueKey].rescued === true);
  }

  if (rectsOverlap(pRect, goalZone) && canFinish) {
    running = false;
    btnNext.disabled = false;
    setButtons();
    setMessage("Nice job!\nYou made it HOME!\nPress Next Level!");
  } else if (rectsOverlap(pRect, goalZone) && !canFinish) {
    if (isFinal && rescuedCount < 3) setMessage("Rescue Mom, Catalina, and Tinsley first!");
    else if (levelIndex === 0 && item) setMessage("Find the Flashlight first!");
    else if (levelRescueKey && !family[levelRescueKey].rescued) setMessage("Rescue them first!");
  }
}

// --- Rendering ---
function drawScene() {
  const theme = THEMES[levelIndex];

   function getNpcSpriteKey(name) {
  if (name === "mom") return "mom";
  if (name === "catalina") return "catalina";
  if (name === "tinsley") return "tinsley";
  return null;
}

  // background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // subtle stars
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 70; i++) {
    const x = (i * 137) % W;
    const y = (i * 71) % H;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // title stripe
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = theme.accent;
  ctx.font = "700 16px system-ui";
  ctx.fillText(LEVELS[levelIndex].title, 16, 28);

  // door/home goal
  // door/home goal

   if (goalZone) {
  const img = sprites.home || null;

  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(goalZone.x, goalZone.y, goalZone.w, goalZone.h, 12);
    ctx.clip();
    ctx.drawImage(img, goalZone.x, goalZone.y, goalZone.w, goalZone.h);
    ctx.restore();

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(goalZone.x, goalZone.y, goalZone.w, goalZone.h);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(goalZone.x, goalZone.y, goalZone.w, goalZone.h);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(goalZone.x, goalZone.y, goalZone.w, goalZone.h);

    ctx.fillStyle = "#fff";
    ctx.font = "700 14px system-ui";
    ctx.fillText(goalZone.label, goalZone.x + 10, goalZone.y + 22);
  }
}

  // checkpoints
  for (const cp of checkpoints) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(cp.x, cp.y, cp.w, cp.h);
  }

  // obstacles
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (const o of obstacles) {
    ctx.fillRect(o.x, o.y, o.w, o.h);
  }

  // hazards (goo)
  ctx.fillStyle = "rgba(170, 255, 170, 0.35)";
  for (const hz of hazards) {
    ctx.fillRect(hz.x, hz.y, hz.w, hz.h);
    ctx.strokeStyle = "rgba(60, 255, 120, 0.55)";
    ctx.strokeRect(hz.x, hz.y, hz.w, hz.h);
  }

// item (flashlight)
if (item) {
  const img = (item.kind === "flashlight") ? sprites.flashlight : null;

  // fallback body
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.roundRect(item.x, item.y, item.w, item.h, 8);
  ctx.fill();

  // sprite image (if loaded)
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, item.w, item.h, 8);
    ctx.clip();
    ctx.drawImage(img, item.x, item.y, item.w, item.h);
    ctx.restore();
  }

  // label
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.font = "700 12px system-ui";
  ctx.fillText(item.label, item.x - 6, item.y - 8);
}

   // Rescue NPC (mom/catalina/tinsley)
if (npc && npc.key) {
  const spriteKey = getNpcSpriteKey(npc.key);
  const img = spriteKey ? sprites[spriteKey] : null;

  // fallback body
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.roundRect(npc.x, npc.y, npc.w, npc.h, 10);
  ctx.fill();

  // sprite image (if loaded)
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(npc.x, npc.y, npc.w, npc.h, 10);
    ctx.clip();
    ctx.drawImage(img, npc.x, npc.y, npc.w, npc.h);
    ctx.restore();
  }

  // label
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = "800 10px system-ui";
  ctx.fillText("RESCUE!", npc.x, npc.y - 6);
}

// Dad (buddy)
drawCharacter(dad.x, dad.y, dad.w, dad.h, "#4fd1ff", "Dad");

// Player (Michael)
drawCharacter(player.x, player.y, player.w, player.h, "#ffd24f", "Michael");

  // Monster
  if (monster.active) {
    drawMonster(monster.x, monster.y, monster.w, monster.h);
  }

  // Rescue status
  const rescuedCount = Object.values(family).filter(f => f.rescued).length;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 12px system-ui";
  ctx.fillText(`Rescued: ${rescuedCount}/3`, W - 110, 28);

  // final hint
  if (levelIndex === 4 && rescuedCount < 3) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Rescue everyone first!", W - 220, 28);
  }
}

function drawCharacter(x, y, w, h, color, label) {
  const img =
    label === "Michael" ? sprites.michael :
    label === "Dad" ? sprites.dad :
    null;

  // fallback body (shows even if image fails)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();

  // sprite image (if loaded)
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  // label
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = "800 10px system-ui";
  const tw = ctx.measureText(label).width;
  ctx.fillRect(x + w/2 - tw/2 - 6, y - 16, tw + 12, 14);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + w/2 - tw/2, y - 5);
}

function drawMonster(x, y, w, h) {
  const img = sprites.monster;

  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    return;
  }

  // fallback goo blob
  ctx.fillStyle = "rgba(140, 255, 180, 0.95)";
  ctx.beginPath();
  ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2);
  ctx.fill();
}

CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  this.moveTo(x + rr, y);
  this.arcTo(x + w, y, x + w, y + h, rr);
  this.arcTo(x + w, y + h, x, y + h, rr);
  this.arcTo(x, y + h, x, y, rr);
  this.arcTo(x, y, x + w, y, rr);
  this.closePath();
  return this;
};

// --- Main loop ---
function update(dt) {
  movePlayer(dt);
  updateDad(dt);
  updateCheckpoints();
  updateHazards();
  updateItem();
  updateNpcRescue();  // ✅ ADD THIS LINE
  updateMonster(dt);
  updateGoal();
}

function loop(t) {
  if (!running) {
    drawScene();
    return;
  }
  const dt = clamp((t - lastTime) / 1000, 0, 0.033);
  lastTime = t;

  update(dt);
  drawScene();

  requestAnimationFrame(loop);
}

// Buttons
btnStart.addEventListener("click", () => {
  // start from level 1
  levelIndex = 0;
  startGame();
});
btnRetry.addEventListener("click", () => retryLevel());
btnNext.addEventListener("click", () => {
  // If you're already at the last level, show victory and stop.
  if (levelIndex >= LEVELS.length - 1) {
    running = false;
    setButtons();
    setMessage(
      "YOU DID IT!\n" +
      "Dad and Michael got everyone home!\n" +
      "Mom, Catalina, and Tinsley are safe.\n\n" +
      "Press Start to play again!"
    );
    drawScene(); // draw final state
    return;
  }

  // Move to next level
  levelIndex = levelIndex + 1;

  // IMPORTANT: restart the game loop + force a redraw
  running = true;
  btnNext.disabled = true;
  setButtons();

  loadLevel(levelIndex);
  drawScene();                 // ✅ force canvas to show new level immediately
  lastTime = performance.now();
  requestAnimationFrame(loop); // ✅ restart loop
});

// Initial screen
async function init() {
  setMessage("Loading game art...");
  setButtons();
  setHUD();

  await preloadSprites();  // ✅ load images from /assets
   console.log("Sprites loaded:", sprites);
  drawScene();

  setMessage(
    "Press Start!\n\n" +
    "Story: Monsters behind the elevator are chasing.\n" +
    "Dad and Michael must rescue Mom, Catalina, and Tinsley — then run home!\n\n" +
    "Tip: Touch checkpoint pads to save your spot."
  );
}
init();
