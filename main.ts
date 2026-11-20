import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------------------------------------------------------------------
// CRC32 (PNG chunks)
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE.push(c >>> 0);
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(w: number, h: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font. Each glyph: 7 rows of 5 chars, "#" = on, "." = off.
// ---------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
};

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 234];
const INK: RGB = [17, 17, 17];
const RED: RGB = [185, 28, 28];
const BLUE: RGB = [29, 78, 216];
const GREY: RGB = [90, 90, 90];
const LIGHT: RGB = [203, 213, 225];
const TAN: RGB = [226, 214, 188];

class Canvas {
  w = 1024;
  h = 1024;
  buf: Buffer;
  constructor() {
    this.buf = Buffer.alloc(this.w * this.h * 3);
    for (let i = 0; i < this.w * this.h; i++) {
      this.buf[i * 3] = PAPER[0];
      this.buf[i * 3 + 1] = PAPER[1];
      this.buf[i * 3 + 2] = PAPER[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  fill(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) this.px(i, j, c);
  }
  hline(x: number, y: number, w: number, c: RGB): void {
    for (let i = x; i < x + w; i++) this.px(i, y, c);
  }
  vline(x: number, y: number, h: number, c: RGB): void {
    for (let j = y; j < y + h; j++) this.px(x, j, c);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    this.hline(x, y, w, c);
    this.hline(x, y + h - 1, w, c);
    this.vline(x, y, h, c);
    this.vline(x + w - 1, y, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB, filled: boolean): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (filled ? d <= r * r : d <= r * r && d >= (r - 1) * (r - 1)) this.px(cx + x, cy + y, c);
      }
    }
  }
  // Scanline polygon fill.
  poly(pts: Array<[number, number]>, c: RGB): void {
    let minY = 1e9;
    let maxY = -1e9;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(Math.round(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = xs[k]; x <= xs[k + 1]; x++) this.px(x, y, c);
      }
    }
  }
  text(s: string, x: number, y: number, scale: number, c: RGB): number {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = FONT[ch] || FONT["?"];
      for (let r = 0; r < 7; r++) {
        for (let col = 0; col < 5; col++) {
          if (g[r][col] === "1") this.fill(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
      cx += 6 * scale;
    }
    return cx - x;
  }
  textWidth(s: string, scale: number): number {
    return s.length * 6 * scale - scale;
  }
  center(s: string, cx: number, y: number, scale: number, c: RGB): void {
    this.text(s, cx - Math.floor(this.textWidth(s, scale) / 2), y, scale, c);
  }
  // Wrap text into lines of at most maxChars characters; returns line count.
  wrap(s: string, x: number, y: number, maxChars: number, scale: number, c: RGB, lh: number): number {
    const words = s.split(" ");
    let line = "";
    let n = 0;
    for (const w of words) {
      const next = line ? line + " " + w : w;
      if (next.length > maxChars && line) {
        this.text(line, x, y + n * lh, scale, c);
        n++;
        line = w;
      } else {
        line = next;
      }
    }
    if (line) {
      this.text(line, x, y + n * lh, scale, c);
      n++;
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// Story data — ONLY facts from news-image-20261120-news.md
// ---------------------------------------------------------------------------
interface Lead {
  kicker: string;
  head: string[];
  body: string;
  icon: string;
}
const LEADS: Lead[] = [
  {
    kicker: "GAMES + BUSINESS",
    head: ["GTA VI SMASHES", "ALL RECORDS"],
    body: "$2.36BN IN ONE DAY. 24.6M COPIES SOLD. 125.47M HOURS WATCHED. METACRITIC 99.",
    icon: "controller",
  },
  {
    kicker: "DIPLOMACY",
    head: ["TRUMP, XI AND", "PUTIN MEET IN", "SHENZHEN"],
    body: "FIRST-EVER SUMMIT. 90 MINUTES AT KYLIN VILLA. NUCLEAR DIALOGUE VOWED.",
    icon: "flags",
  },
  {
    kicker: "JUSTICE",
    head: ["WORLD COURT:", "MYANMAR", "COMMITTED", "GENOCIDE"],
    body: "ICJ RULES 9-6: MYANMAR COMMITTED GENOCIDE. FIRST SUCH FINDING VS A STATE.",
    icon: "scales",
  },
];

interface Figure {
  v: string;
  label: string;
}
const FIGURES: Figure[] = [
  { v: "$2.36B", label: "GTA VI DAY-ONE SALES" },
  { v: "24.6M", label: "COPIES SOLD DAY ONE" },
  { v: "99", label: "GTA VI METACRITIC" },
  { v: "9-6", label: "ICJ GENOCIDE VOTE" },
  { v: "17%", label: "ANTHROPIC DAY-ONE GAIN" },
  { v: "4.8%", label: "NIKKEI DROP" },
  { v: "8", label: "KILLED IN KYIV STRIKES" },
  { v: "1.5M", label: "TRAVELLERS STRANDED" },
  { v: "62-33", label: "SENATE ENERGY VOTE" },
  { v: "25+", label: "COUNTRIES IN YOUTH STRIKES" },
];

interface Story {
  h: string;
  s: string;
}
const STORIES: Story[] = [
  { h: "ANTHROPIC DEBUT +17%", s: "Shares close near $97, above $83 IPO price." },
  { h: "US STOCKS FALL 5TH DAY", s: "S&P 500 loses about 2% on Thursday." },
  { h: "NIKKEI DROPS 4.8%", s: "Asian markets slide after Anthropic debut." },
  { h: "HOUTHI MISSILE HITS RIYADH", s: "Tallest tower damaged in financial district." },
  { h: "SAUDI INTERCEPTS MISSILE", s: "Plus five drones shot down on Friday." },
  { h: "RUSSIA STRIKES KYIV, 8 DEAD", s: "28 hurt across nine regions; bridges hit." },
  { h: "EMBASSIES DAMAGED IN KYIV", s: "Austrian, Dutch windows shattered; staff safe." },
  { h: "RUSSIA VIOLATES POLISH AIR", s: "Three objects overnight, says defence chief." },
  { h: "ESTONIA SHUTS RUSSIA BORDER", s: "Closed for at least six months." },
  { h: "UK SENDS 1,000+ DRONES", s: "260M pound package for Ukraine." },
  { h: "KENYA BEATS EBOLA", s: "Last patient discharged; outbreak over." },
  { h: "IMF: DEBT NEARS 100% OF GDP", s: "Global public debt warning." },
  { h: "ITALY FINES META 805M", s: "Over Android photo access." },
  { h: "FAA STOP STRANDS 1.5M", s: "Travellers stuck by ground stop." },
  { h: "SENATE PASSES ENERGY BILL", s: "62-33 vote; faster permits for plants." },
  { h: "TRUMP PARDONS PETE ROSE", s: "Posthumous pardon for baseball star." },
  { h: "YOUTH STRIKE, 25+ NATIONS", s: "Protests over living costs, militarisation." },
  { h: "ITALY GENERAL STRIKE", s: "Workers, students march in dozens of cities." },
  { h: "ELLA LANGLEY SWEEPS CMAS", s: "Entertainer, Female Vocalist, Song of Year." },
  { h: "VATICAN TREE GOES UP", s: "25-metre Christmas tree in St Peter's Square." },
  { h: "TRUMP DELAYS IRAN DECISION", s: "No next step until the new year." },
  { h: "SENATE BLOCKS WAR POWERS", s: "Republicans stop resolution 51-48." },
  { h: "IRAQ MOVES ON MILITIA BASE", s: "Forces deploy in Jurf al-Sakhar." },
  { h: "GHANA JET PURCHASE ROW", s: "60M dollar presidential jet criticised." },
  { h: "ARGENTINA DISABILITY LAW", s: "Senate approves framework 71-0." },
  { h: "GTA VI: 125.47M HRS", s: "Streams across Twitch, YouTube, Kick." },
  { h: "GTA VI PEAK: 7.91M VIEWERS", s: "Twitch peak 3.31M; 52.3M hours there." },
  { h: "GTA VI SCORES 99", s: "Metacritic score from 150+ reviews." },
  { h: "SUMMIT LASTED 90 MINUTES", s: "Three leaders met at Kylin Villa." },
  { h: "NUCLEAR WAR 'CANNOT BE WON'", s: "Joint vow to open nuclear-risk dialogue." },
  { h: "ICJ VOTE WAS 9-6", s: "First genocide finding against a state." },
  { h: "PUTIN BACK AT APEC", s: "First appearance in nine years." },
  { h: "TRUMP FACES PRESS FRIDAY", s: "White House briefing after summit." },
];

// Map markers: [label, x, y, label dx, label dy]
const MARKERS: Array<[string, number, number, number, number]> = [
  ["WASHINGTON", 208, 508, -58, -16],
  ["LONDON", 478, 488, -66, -14],
  ["ROME", 522, 504, 8, 2],
  ["KYIV", 566, 488, 10, -14],
  ["WARSAW", 548, 480, -78, -14],
  ["TALLINN", 566, 472, 10, -8],
  ["RIYADH", 622, 518, 8, 4],
  ["NAIROBI", 562, 544, 8, 2],
  ["SHENZHEN", 822, 512, -80, 4],
  ["BUENOS AIRES", 332, 562, 8, -4],
];

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function drawMasthead(cv: Canvas): void {
  cv.fill(0, 0, 1024, 10, INK);
  cv.center("THE WORLD IN ONE DAY", 512, 22, 7, INK);
  cv.center("FRIDAY, 20 NOVEMBER 2026", 512, 78, 3, RED);
  cv.hline(24, 104, 976, INK);
  cv.hline(24, 107, 976, INK);
}

function drawController(cv: Canvas, x: number, y: number): void {
  // Simple game controller icon.
  cv.fill(x, y + 6, 120, 26, INK);
  cv.fill(x + 4, y, 112, 38, INK);
  cv.circle(x + 30, y + 21, 8, PAPER, false);
  cv.circle(x + 30, y + 21, 3, PAPER, true);
  cv.circle(x + 88, y + 21, 8, PAPER, false);
  cv.circle(x + 88, y + 21, 3, PAPER, true);
  cv.fill(x + 52, y + 11, 6, 16, PAPER);
  cv.fill(x + 45, y + 16, 20, 6, PAPER);
  cv.circle(x + 96, y + 11, 3, RED, true);
  cv.circle(x + 106, y + 18, 3, RED, true);
}

function drawFlags(cv: Canvas, x: number, y: number): void {
  // Three flag panels: US stripes, China red, Russia tricolor.
  for (let i = 0; i < 7; i++) cv.fill(x, y + i * 6, 36, 3, i % 2 === 0 ? RED : PAPER);
  cv.rect(x, y, 36, 42, INK);
  cv.fill(x + 48, y, 36, 42, RED);
  cv.fill(x + 60, y + 12, 12, 12, [255, 215, 0]);
  cv.rect(x + 48, y, 36, 42, INK);
  cv.fill(x + 96, y, 36, 14, PAPER);
  cv.fill(x + 96, y + 14, 36, 14, BLUE);
  cv.fill(x + 96, y + 28, 36, 14, RED);
  cv.rect(x + 96, y, 36, 42, INK);
}

function drawScales(cv: Canvas, x: number, y: number): void {
  cv.fill(x + 58, y, 4, 40, INK);
  cv.hline(x + 18, y + 8, 84, INK);
  cv.line(x + 20, y + 8, x + 8, y + 28, INK);
  cv.line(x + 20, y + 8, x + 32, y + 28, INK);
  cv.line(x + 100, y + 8, x + 88, y + 28, INK);
  cv.line(x + 100, y + 8, x + 112, y + 28, INK);
  cv.fill(x + 4, y + 28, 32, 4, INK);
  cv.fill(x + 84, y + 28, 32, 4, INK);
  cv.fill(x + 48, y + 40, 24, 4, INK);
}

function drawLeads(cv: Canvas): void {
  const cols = [
    { x: 24, w: 330 },
    { x: 374, w: 300 },
    { x: 694, w: 306 },
  ];
  const top = 118;
  for (let i = 0; i < 3; i++) {
    const c = cols[i];
    const L = LEADS[i];
    let y = top;
    cv.text(L.kicker, c.x, y, 2, RED);
    y += 22;
    for (const ln of L.head) {
      cv.text(ln, c.x, y, 3, INK);
      y += 24;
    }
    y += 6;
    cv.hline(c.x, y, c.w, INK);
    y += 8;
    const lines = cv.wrap(L.body, c.x, y, Math.floor(c.w / 12), 2, INK, 18);
    y += lines * 18 + 10;
    const iy = 314;
    if (L.icon === "controller") drawController(cv, c.x + 90, iy);
    if (L.icon === "flags") drawFlags(cv, c.x + 80, iy);
    if (L.icon === "scales") drawScales(cv, c.x + 90, iy);
    if (i < 2) cv.vline(c.x + c.w + 10, top, 232, GREY);
  }
  cv.hline(24, 358, 976, INK);
}

function drawFigures(cv: Canvas): void {
  const top = 366;
  cv.text("THE DAY IN FIGURES", 24, top, 2, RED);
  const cellW = 195;
  for (let i = 0; i < FIGURES.length; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 24 + col * cellW;
    const y = top + 22 + row * 38;
    cv.text(FIGURES[i].v, x, y, 3, INK);
    cv.text(FIGURES[i].label, x, y + 24, 1, GREY);
  }
  cv.hline(24, 458, 976, INK);
}

function drawMap(cv: Canvas): void {
  const top = 468;
  cv.text("AROUND THE WORLD", 24, top, 2, RED);
  const my = top + 26;
  // Rough continent shapes (sketch map).
  cv.poly(
    [[70, my + 8], [150, my], [260, my + 4], [330, my + 18], [300, my + 44], [220, my + 62], [120, my + 58], [66, my + 34]],
    LIGHT
  ); // North America
  cv.poly(
    [[300, my + 66], [350, my + 62], [382, my + 84], [360, my + 108], [322, my + 104], [296, my + 82]],
    LIGHT
  ); // South America
  cv.poly(
    [[470, my + 6], [520, my], [566, my + 8], [560, my + 26], [520, my + 30], [486, my + 24], [462, my + 14]],
    LIGHT
  ); // Europe
  cv.poly(
    [[478, my + 34], [540, my + 30], [586, my + 44], [580, my + 84], [540, my + 104], [500, my + 82], [472, my + 56]],
    LIGHT
  ); // Africa
  cv.poly(
    [[580, my + 4], [700, my], [830, my + 6], [920, my + 18], [900, my + 46], [800, my + 58], [680, my + 52], [600, my + 40], [572, my + 20]],
    LIGHT
  ); // Asia
  cv.poly(
    [[830, my + 66], [900, my + 62], [930, my + 78], [900, my + 92], [846, my + 90], [826, my + 78]],
    LIGHT
  ); // Australia
  for (const m of MARKERS) {
    cv.circle(m[1], m[2], 4, RED, true);
    cv.circle(m[1], m[2], 4, INK, false);
    cv.text(m[0], m[1] + m[3], m[2] + m[4], 1, INK);
  }
  cv.hline(24, 606, 976, INK);
}

function drawGrid(cv: Canvas): void {
  const top = 616;
  cv.text("MORE STORIES", 24, top, 2, RED);
  const gy = top + 24;
  const rowH = 34;
  const colW = 325;
  for (let i = 0; i < STORIES.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 24 + col * (colW + 1);
    const y = gy + row * rowH;
    cv.text(STORIES[i].h, x, y, 2, INK);
    cv.text(STORIES[i].s, x, y + 16, 1, GREY);
    if (row < 10) cv.hline(x, y + 29, colW, LIGHT);
    if (col < 2) cv.vline(x + colW + 1, y, 29, LIGHT);
  }
}

function main(): void {
  const cv = new Canvas();
  drawMasthead(cv);
  drawLeads(cv);
  drawFigures(cv);
  drawMap(cv);
  drawGrid(cv);
  const png = encodePNG(cv.w, cv.h, cv.buf);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
