const NS = "http://www.w3.org/2000/svg";
const BASELINE = 200;           // baseline of the "2" and "9"
const DIGIT_CENTERS = [140, 260]; // x-centers of the "2" and the "9"
const DEPTH = 12;               // thickness of the island edge, in px
const BRUSH = 7;                // brush width in canvas pixels
const SHEEP_SIZE = 56;          // size of each drawing on the island, in px
const COOLDOWN_MS = 15000;      // minimum time between submissions (per browser)
const MAX_IMAGE_BYTES = 500 * 1024;
const BUCKET = "drawings";

// White, light grey, dark grey, black, light brown, dark brown, orange
const COLORS = [
  { name: "white", hex: "#ffffff" },
  { name: "light grey", hex: "#d3d3d3" },
  { name: "dark grey", hex: "#555555" },
  { name: "black", hex: "#111111" },
  { name: "light brown", hex: "#c8a27a" },
  { name: "dark brown", hex: "#6b4423" },
  { name: "orange", hex: "#ff8c1a" },
];
const DEFAULT_COLOR_INDEX = 3;

// Grass greens for the sketch look
const GRASS = ["#5d9a3a", "#6fae45", "#4c7d2f", "#8fc15a", "#3f6b2c", "#a3cf6a"];

const $ = (id) => document.getElementById(id);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Seeded random so the greenery looks the same on every visit
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ---------- Island ----------
// One group holding both the "2" and the "9", filled with `fill`
function digitsGroup(fill) {
  const g = svgEl("g");
  DIGIT_CENTERS.forEach((cx, i) => {
    const t = svgEl("text", {
      x: cx,
      y: BASELINE,
      "text-anchor": "middle",
      class: "shape-text",
      fill,
    });
    t.textContent = i === 0 ? "2" : "9";
    g.append(t);
  });
  return g;
}

function buildGreenery(parent) {
  // Clipped to the 2 and the 9 so grass never leaves the shape
  const grass = svgEl("g", { "clip-path": "url(#shape)" });

  // Grass blades, grouped by color
  const blades = {};
  GRASS.forEach((c) => (blades[c] = ""));
  for (let i = 0; i < 900; i++) {
    const c = GRASS[Math.floor(rand() * GRASS.length)];
    const x = 60 + rand() * 290;
    const y = 55 + rand() * 165;
    const h = 8 + rand() * 16;
    const lean = (rand() - 0.5) * 10;
    const bend = (rand() - 0.5) * 8;
    blades[c] += `M${x.toFixed(1)} ${y.toFixed(1)}q${bend.toFixed(1)} ${(-h / 2).toFixed(1)} ${lean.toFixed(1)} ${(-h).toFixed(1)}`;
  }
  GRASS.forEach((c) => {
    grass.append(
      svgEl("path", {
        d: blades[c],
        stroke: c,
        "stroke-width": 1.6,
        "stroke-linecap": "round",
        fill: "none",
      })
    );
  });

  // Dark hatch strokes for shading, like pencil marks
  let hatch = "";
  for (let i = 0; i < 220; i++) {
    const x = 60 + rand() * 290;
    const y = 60 + rand() * 150;
    hatch += `M${x.toFixed(1)} ${y.toFixed(1)}l${(2 + rand() * 3).toFixed(1)} ${(-4 - rand() * 4).toFixed(1)}`;
  }
  grass.append(svgEl("path", { d: hatch, stroke: "#3f6b2c", "stroke-width": 1, "stroke-linecap": "round", opacity: 0.5, fill: "none" }));

  // Small clover-like dots
  for (let i = 0; i < 160; i++) {
    grass.append(
      svgEl("circle", {
        cx: (60 + rand() * 290).toFixed(1),
        cy: (60 + rand() * 150).toFixed(1),
        r: (1.4 + rand() * 0.8).toFixed(1),
        fill: "#b8e08a",
        opacity: 0.8,
      })
    );
  }

  parent.append(grass);
}

function buildIsland() {
  const body = $("island-body");

  // Dark stacked layers under the top give the island its thickness
  for (let i = DEPTH; i >= 1; i--) {
    const layer = digitsGroup("#2f4a22");
    layer.setAttribute("transform", `translate(0 ${i})`);
    body.append(layer);
  }

  // Top surface, then sketched grass on top
  body.append(digitsGroup("#7fb24c"));
  buildGreenery(body);
}

// Random spot for a new sheep or cat: on the "2" or the "9", chosen at random
function randomSpot() {
  const digit = Math.floor(Math.random() * DIGIT_CENTERS.length);
  return {
    x: Math.round(DIGIT_CENTERS[digit] + (Math.random() - 0.5) * 70),
    y: Math.round(95 + Math.random() * 85),
  };
}

function renderSheep(row) {
  const g = svgEl("g", { class: "pop", transform: `translate(${row.x} ${row.y})` });
  g.append(
    svgEl("image", {
      href: row.image_url,
      x: -SHEEP_SIZE / 2,
      y: -SHEEP_SIZE / 2,
      width: SHEEP_SIZE,
      height: SHEEP_SIZE,
    })
  );
  $("sheep").append(g);

  if (row.note) {
    const label = svgEl("text", {
      class: "note-text",
      x: row.x,
      y: row.y + SHEEP_SIZE / 2 + 16,
      "text-anchor": "middle",
    });
    // Long notes are shortened on the island; the full note shows on hover
    const short = row.note.length > 30 ? row.note.slice(0, 29) + "…" : row.note;
    label.textContent = short; // textContent keeps notes safe from HTML injection
    const title = svgEl("title");
    title.textContent = row.note;
    label.append(title);
    $("labels").append(label);
  }
}

// ---------- Drawing pad ----------
const pad = $("pad");
const ctx = pad.getContext("2d");
ctx.lineCap = "round";
ctx.lineJoin = "round";

let drawing = false;
let hasInk = false;
let last = null;
let currentColor = COLORS[DEFAULT_COLOR_INDEX].hex;

function clearPad() {
  ctx.clearRect(0, 0, pad.width, pad.height);
  hasInk = false;
}

function canvasPos(e) {
  const r = pad.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * pad.width) / r.width,
    y: ((e.clientY - r.top) * pad.height) / r.height,
  };
}

pad.addEventListener("pointerdown", (e) => {
  drawing = true;
  hasInk = true;
  pad.setPointerCapture(e.pointerId);
  last = canvasPos(e);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = BRUSH;
  // Dot for a single tap
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(last.x + 0.01, last.y + 0.01);
  ctx.stroke();
});

pad.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = canvasPos(e);
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
});

["pointerup", "pointercancel"].forEach((type) =>
  pad.addEventListener(type, () => {
    drawing = false;
  })
);

$("clear").addEventListener("click", clearPad);

// ---------- Color palette ----------
const palette = $("palette");
const swatches = COLORS.map((c, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "swatch";
  b.style.background = c.hex;
  b.setAttribute("role", "radio");
  b.setAttribute("aria-label", c.name);
  b.setAttribute("aria-checked", "false");
  b.addEventListener("click", () => selectColor(i));
  palette.append(b);
  return b;
});

function selectColor(i) {
  currentColor = COLORS[i].hex;
  swatches.forEach((b, j) => b.setAttribute("aria-checked", String(i === j)));
}
selectColor(DEFAULT_COLOR_INDEX);

// ---------- Status ----------
function setStatus(message) {
  $("status").textContent = message;
}

// ---------- Loading and live updates ----------
const seen = new Set();

async function loadGarden() {
  const { data, error } = await sb
    .from("sheep")
    .select("id, image_url, note, x, y")
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error(error);
    setStatus("Couldn't load the garden. Check your Supabase settings.");
    return;
  }
  data.forEach((row) => {
    seen.add(row.id);
    renderSheep(row);
  });
}

function listenForNewSheep() {
  sb.channel("public-sheep")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "sheep" },
      (payload) => {
        if (seen.has(payload.new.id)) return; // already shown (our own submission)
        seen.add(payload.new.id);
        renderSheep(payload.new);
      }
    )
    .subscribe();
}

// ---------- Enter: upload drawing and save the row ----------
const enterBtn = $("enter");
const noteInput = $("note");
let lastSent = 0;

function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function submit() {
  if (!hasInk) {
    setStatus("Draw a sheep or cat first 🐑");
    return;
  }
  const wait = COOLDOWN_MS - (Date.now() - lastSent);
  if (wait > 0) {
    setStatus("Give it a few seconds before adding another 🐑");
    return;
  }

  enterBtn.disabled = true;
  setStatus("Adding your sheep…");

  try {
    const blob = await new Promise((resolve) => pad.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not read the drawing.");
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error("Drawing is too big. Try a simpler one.");
    }

    const path = `${newId()}.png`;
    const upload = await sb.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: "image/png", cacheControl: "31536000" });
    if (upload.error) throw upload.error;

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    const spot = randomSpot();
    const note = noteInput.value.trim().slice(0, 140);

    const insert = await sb
      .from("sheep")
      .insert({ image_url: pub.publicUrl, note, x: spot.x, y: spot.y })
      .select("id, image_url, note, x, y")
      .single();
    if (insert.error) throw insert.error;

    seen.add(insert.data.id);
    renderSheep(insert.data);

    lastSent = Date.now();
    clearPad();
    noteInput.value = "";
    setStatus("Your sheep is in the garden! 🐑");
  } catch (err) {
    console.error(err);
    setStatus(err.message && err.message.length < 80 ? err.message : "Something went wrong. Please try again.");
  } finally {
    enterBtn.disabled = false;
  }
}

enterBtn.addEventListener("click", submit);
noteInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submit();
});

// ---------- Start ----------
buildIsland();
loadGarden();
listenForNewSheep();