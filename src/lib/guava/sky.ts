// @ts-nocheck
/* Guava appearance engine (guava-sky.js), copied unchanged from the Guava theme. Do not edit the values. */
// ---------- color math (identical to the app) ----------
const hex2rgb = h => { h = String(h).replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgb2hex = r => "#" + r.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const lum = h => { const c = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
// Straight sRGB mix (not linear light, not OKLCH). This is what the app does; keep it for an exact match.
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
function toHsl(h) {
  const [r, g, b] = hex2rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s, l];
}
function fromHsl(H, S, L) {
  const k = n => (n + H / 30) % 12, a = S * Math.min(L, 1 - L);
  return rgb2hex([0, 8, 4].map(n => 255 * (L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
}
const hueShift = (h, deg) => { const [H, S, L] = toHsl(h); return fromHsl((H + deg + 360) % 360, S, L); };
// Moves a color's lightness (hue kept) in 1/60 steps until it reaches `ratio` contrast against `bg`.
function reach(h, bg, ratio) {
  if (contrast(h, bg) >= ratio) return h;
  const [H, S, L] = toHsl(h), up = lum(bg) < .18;
  for (let i = 1; i <= 60; i++) {
    const c = fromHsl(H, S, up ? L + (1 - L) * i / 60 : L * (1 - i / 60));
    if (contrast(c, bg) >= ratio) return c;
  }
  return up ? "#ffffff" : "#000000";
}
const ease = t => t * t * (3 - 2 * t); // smoothstep
const INK_DARK = "#17132a";
const onColor = bg => contrast("#ffffff", bg) >= contrast(INK_DARK, bg) ? "#ffffff" : INK_DARK;
function textFill(fill) { const on = onColor(fill); return {fill: reach(fill, on, 4.5), on}; }

// ---------- neutrals: [ground, panel, ink, inkSoft, inkFaint, rule], light and dark ----------
const NEUTRALS = {
  slate:    {light: ["#f3f5fa", "#ffffff", "#111733", "#4f5775", "#686f8c", "#dde1ee"], dark: ["#0a0f1e", "#121a30", "#e6e9f5", "#a3abc8", "#8a93b3", "#232d4a"]},
  lavender: {light: ["#f6f4fc", "#ffffff", "#1d1838", "#544c74", "#6a6389", "#e5e0f3"], dark: ["#100d1c", "#1a162c", "#eeeafb", "#b5aed2", "#9790b6", "#2d2746"]},
  plum:     {light: ["#fbf6f4", "#ffffff", "#2a1830", "#62506a", "#79667f", "#eee2e2"], dark: ["#150f24", "#211836", "#f6eef5", "#c7b6cd", "#a594ad", "#352a4e"]},
  graphite: {light: ["#f4f4f6", "#ffffff", "#16161a", "#52525c", "#686874", "#e3e3e8"], dark: ["#0b0b0e", "#17171c", "#f2f2f5", "#ababb6", "#8e8e9a", "#2a2a31"]},
  blush:    {light: ["#fff6f4", "#ffffff", "#2a1520", "#634753", "#785b67", "#f2e0e2"], dark: ["#170e14", "#23161f", "#f8eef2", "#c9b2bd", "#a8919e", "#3a2531"]},
  paper:    {light: ["#faf8f4", "#ffffff", "#1f1c17", "#5a5449", "#6f685c", "#ebe6dc"], dark: ["#14120f", "#1e1b17", "#f3efe7", "#b8b0a2", "#989081", "#302b25"]}
};

// ---------- the looks (Guava is the default) ----------
// accent fills buttons; accentDark is used when the sky is dark. gradient = hero card stops.
const LOOKS = [
  {id: "guava",           label: "Guava",           tag: "Pink, leaf, gold",       accent: "#d23a63", accentDark: "#ff8fa8", neutrals: "blush",    sky: "guava",      gradient: ["#ff92a8", "#9fdcb0", "#f6e48a"]},
  {id: "lavender-aurora", label: "Lavender Aurora", tag: "Lavender, blue, rose",   accent: "#a28ff2",                        neutrals: "lavender", sky: "lavender",   gradient: ["#c4b5fd", "#93c5fd", "#fda4af"]},
  {id: "ember-aurora",    label: "Ember Aurora",    tag: "Orange, red, blue",      accent: "#c2410c", accentDark: "#ff8a57", neutrals: "plum",     sky: "ember",      gradient: ["#ffab66", "#93b9ff", "#ff7b72"]},
  {id: "aurora",          label: "Aurora",          tag: "Mint, sky, peach",       accent: "#1c9a86",                        neutrals: "slate",    sky: "aurora",     gradient: ["#a7f3d0", "#bae6fd", "#fed7aa"]},
  {id: "nightshift",      label: "Night Shift",     tag: "Deep blue, always dark", accent: "#2f54eb", accentDark: "#7d95ff", neutrals: "slate",    sky: "nightshift", gradient: ["#2f54eb", "#7d95ff"]},
  {id: "rosewater",       label: "Rosewater",       tag: "Blush and cobalt",       accent: "#3a5bd9", accentDark: "#8ea6ff", neutrals: "lavender", sky: "rosewater",  gradient: ["#ff9fb2", "#7fa3ff", "#ffd0d8"]},
  {id: "marigold",        label: "Marigold",        tag: "Gold, apricot, coral",   accent: "#a64b00", accentDark: "#ffb547", neutrals: "paper",    sky: "marigold",   gradient: ["#ffc94d", "#ffa37a", "#ff8fa3"]}
];

// ---------- the skies: 7 keyframes on the STANDARD day; base = page ground, a/b/c = the three glows ----------
const K = rows => rows.map(([h, name, base, a, b, c]) => ({h, name, base, a, b, c}));
const SKY_KEYS = {
  guava: K([[0, "Night", "#1a0f17", "#6b1f3a", "#1f4a3a", "#5a4a1a"], [5.5, "Dawn", "#fff3f2", "#ffc2cc", "#cdeccf", "#fff0b8"], [9, "Morning", "#fff5f3", "#ffb0bf", "#b9e6c3", "#fbe7a6"],
    [13, "Midday", "#fff4f2", "#ff92a8", "#9fdcb0", "#f6e48a"], [17.5, "Golden hour", "#fff0e8", "#ff7a8f", "#c6e08a", "#ffb86b"], [20, "Dusk", "#2a1220", "#d94a6e", "#2f7a5a", "#c98a3a"], [24, "Night", "#1a0f17", "#6b1f3a", "#1f4a3a", "#5a4a1a"]]),
  lavender: K([[0, "Night", "#0f1130", "#3d2f86", "#1f3f99", "#5c2347"], [5.5, "Dawn", "#f4ecf8", "#d9b8ff", "#b9c8ff", "#ffb3c1"], [9, "Morning", "#f3f0ff", "#c9b6ff", "#9fd0ff", "#ffc4cf"],
    [13, "Midday", "#eff5ff", "#d6c8ff", "#86bfff", "#b9b0ff"], [17.5, "Golden hour", "#fff0f3", "#c4a6ff", "#8aa4ff", "#ff8e9e"], [20, "Dusk", "#1c1840", "#7d4fc4", "#3459d1", "#c2416d"], [24, "Night", "#0f1130", "#3d2f86", "#1f3f99", "#5c2347"]]),
  ember: K([[0, "Night", "#170f22", "#7a2f1c", "#29307a", "#80203a"], [5.5, "Dawn", "#fff0ea", "#ffb08a", "#cbb8ff", "#ff8f8f"], [9, "Morning", "#fff5ee", "#ffc184", "#a9c8ff", "#ff9f9a"],
    [13, "Midday", "#fff6ef", "#ffab66", "#93b9ff", "#ff7b72"], [17.5, "Golden hour", "#ffefe4", "#ff8f3d", "#b7a0ff", "#ff4f4f"], [20, "Dusk", "#2b1322", "#e2602a", "#4a3fc4", "#c9243f"], [24, "Night", "#170f22", "#7a2f1c", "#29307a", "#80203a"]]),
  aurora: K([[0, "Night", "#0c1824", "#1f5a4e", "#1f3d73", "#5c3a2c"], [5.5, "Dawn", "#f1f8f5", "#b8f0d8", "#bfe3ff", "#ffd3b0"], [9, "Morning", "#f2faf6", "#a7f3d0", "#bae6fd", "#fed7aa"],
    [13, "Midday", "#f0f8fb", "#99f6e4", "#93d5fd", "#fde68a"], [17.5, "Golden hour", "#fff6ee", "#a7f3d0", "#fbcfe8", "#fdba74"], [20, "Dusk", "#14212e", "#2f7a68", "#2b4f8f", "#b4643a"], [24, "Night", "#0c1824", "#1f5a4e", "#1f3d73", "#5c3a2c"]]),
  nightshift: K([[0, "Night", "#070b18", "#1b2a6b", "#0f1d45", "#2c1f5e"], [5.5, "Dawn", "#0d1430", "#2f54eb", "#3b2f7a", "#5a6fd6"], [9, "Morning", "#0e1633", "#2f54eb", "#5b74e8", "#3b4fb8"],
    [13, "Midday", "#101a3a", "#3a5cf0", "#7d95ff", "#3b4fb8"], [17.5, "Golden hour", "#0f1533", "#4b5cf0", "#6f86f5", "#8a4fb8"], [20, "Dusk", "#0b1029", "#4b3fbf", "#2f54eb", "#8a3f9c"], [24, "Night", "#070b18", "#1b2a6b", "#0f1d45", "#2c1f5e"]]),
  rosewater: K([[0, "Night", "#1a1020", "#5c1f3a", "#1d2c6b", "#3a1f5c"], [5.5, "Dawn", "#fdf1f3", "#ffc2cf", "#c3d3ff", "#f3d2ff"], [9, "Morning", "#fdf3f5", "#ffb3c3", "#a9c0ff", "#ffd6e0"],
    [13, "Midday", "#fdf4f6", "#ff9fb2", "#7fa3ff", "#ffd0d8"], [17.5, "Golden hour", "#fff1f1", "#ff8a9a", "#6f95f5", "#ffc2a8"], [20, "Dusk", "#2a1428", "#d64a6e", "#3550c8", "#8f3f9c"], [24, "Night", "#1a1020", "#5c1f3a", "#1d2c6b", "#3a1f5c"]]),
  marigold: K([[0, "Night", "#1a1210", "#6e4210", "#3d1f40", "#7a2a28"], [5.5, "Dawn", "#fff7e8", "#ffd98a", "#ffc9a8", "#f7b8c8"], [9, "Morning", "#fff8ea", "#ffd46b", "#ffc49c", "#ffb3a6"],
    [13, "Midday", "#fff7e4", "#ffc94d", "#ffa37a", "#ff8fa3"], [17.5, "Golden hour", "#fff0da", "#ffae1f", "#ff7a4d", "#ee6a96"], [20, "Dusk", "#2b1618", "#e08a1c", "#b0406a", "#d4522c"], [24, "Night", "#1a1210", "#6e4210", "#3d1f40", "#7a2a28"]])
};
// Every sky except Night Shift holds Night until standard hour 5, so the turn to light lands right at the real sunrise.
const holdNight = (keys, id) => id === "nightshift" ? keys : [keys[0], Object.assign({}, keys[0], {h: 5})].concat(keys.slice(1));

// ---------- category colors (charts, tiles): five sets named for times of day ----------
const PALETTES = {
  dawn:     {label: "Dawn",        c: ["#e8736a", "#f0a35e", "#9d84d4", "#5f9ee0", "#d9b24a", "#5fbfa6", "#e889b0", "#8490e8"]},
  midday:   {label: "Midday",      c: ["#2f6bff", "#ff4d4d", "#f2b705", "#19b36b", "#8b5cf6", "#00a7c7", "#ff7a1a", "#e83e8c"]},
  golden:   {label: "Golden hour", c: ["#e8833a", "#d9534f", "#c9a227", "#2a9d8f", "#9c6b4e", "#e76f51", "#6a994e", "#b5838d"]},
  dusk:     {label: "Dusk",        c: ["#d6336c", "#f76707", "#7048e8", "#364fc7", "#f06595", "#ae3ec9", "#fd7e14", "#4263eb"]},
  midnight: {label: "Midnight",    c: ["#4dabf7", "#9775fa", "#38d9a9", "#e64980", "#a5b4c8", "#748ffc", "#20c997", "#f783ac"]}
};
const PAL_AT = [["midnight", 0], ["dawn", 5.5], ["midday", 13], ["golden", 17.5], ["dusk", 20], ["midnight", 24]];

// ---------- fonts: six very different text styles (Clean is self-hosted in Guava; the rest load from Google Fonts) ----------
const FONTS = {
  clean:     {label: "Clean",     family: "Plus Jakarta Sans",   fallback: "ui-sans-serif, system-ui, sans-serif",                         google: "family=Plus+Jakarta+Sans:wght@200..800"},
  storybook: {label: "Storybook", family: "Fraunces",            fallback: "Georgia, ui-serif, serif",                                     google: "family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700"},
  rounded:   {label: "Rounded",   family: "Nunito",              fallback: "ui-rounded, system-ui, sans-serif",                            google: "family=Nunito:wght@400;500;600;700;800"},
  receipt:   {label: "Receipt",   family: "IBM Plex Mono",       fallback: "ui-monospace, Menlo, monospace",                               google: "family=IBM+Plex+Mono:wght@400;500;600;700"},
  poster:    {label: "Poster",    family: "Bricolage Grotesque", fallback: "\"Arial Narrow\", ui-sans-serif, sans-serif",                  google: "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800"},
  notebook:  {label: "Notebook",  family: "Shantell Sans",       fallback: "\"Chalkboard SE\", \"Comic Sans MS\", ui-rounded, sans-serif", google: "family=Shantell+Sans:wght@400;500;600;700;800"}
};
const MONO_NUMBERS = {family: "DM Mono", google: "family=DM+Mono:wght@400;500"};

// ---------- place and sun ----------
const CITIES = [
    ["New York", 40.71, -74.01, "America/New_York"], ["Boston", 42.36, -71.06, "America/New_York"], ["Washington", 38.9, -77.04, "America/New_York"], ["Atlanta", 33.75, -84.39, "America/New_York"],
    ["Miami", 25.76, -80.19, "America/New_York"], ["Detroit", 42.33, -83.05, "America/Detroit"], ["Toronto", 43.65, -79.38, "America/Toronto"], ["Montreal", 45.5, -73.57, "America/Toronto"],
    ["Chicago", 41.88, -87.63, "America/Chicago"], ["Houston", 29.76, -95.37, "America/Chicago"], ["Dallas", 32.78, -96.8, "America/Chicago"], ["Austin", 30.27, -97.74, "America/Chicago"],
    ["Minneapolis", 44.98, -93.27, "America/Chicago"], ["Nashville", 36.16, -86.78, "America/Chicago"], ["New Orleans", 29.95, -90.07, "America/Chicago"], ["Mexico City", 19.43, -99.13, "America/Mexico_City"],
    ["Denver", 39.74, -104.99, "America/Denver"], ["Salt Lake City", 40.76, -111.89, "America/Denver"], ["Phoenix", 33.45, -112.07, "America/Phoenix"], ["Los Angeles", 34.05, -118.24, "America/Los_Angeles"],
    ["San Francisco", 37.77, -122.42, "America/Los_Angeles"], ["San Diego", 32.72, -117.16, "America/Los_Angeles"], ["Seattle", 47.61, -122.33, "America/Los_Angeles"], ["Portland", 45.52, -122.68, "America/Los_Angeles"],
    ["Vancouver", 49.28, -123.12, "America/Vancouver"], ["Anchorage", 61.22, -149.9, "America/Anchorage"], ["Honolulu", 21.31, -157.86, "Pacific/Honolulu"], ["San Juan", 18.47, -66.11, "America/Puerto_Rico"],
    ["Bogotá", 4.71, -74.07, "America/Bogota"], ["Lima", -12.05, -77.04, "America/Lima"], ["São Paulo", -23.55, -46.63, "America/Sao_Paulo"], ["Rio de Janeiro", -22.91, -43.17, "America/Sao_Paulo"],
    ["Buenos Aires", -34.6, -58.38, "America/Argentina/Buenos_Aires"], ["Santiago", -33.45, -70.67, "America/Santiago"], ["Reykjavík", 64.15, -21.94, "Atlantic/Reykjavik"], ["Dublin", 53.35, -6.26, "Europe/Dublin"],
    ["London", 51.51, -0.13, "Europe/London"], ["Lisbon", 38.72, -9.14, "Europe/Lisbon"], ["Madrid", 40.42, -3.7, "Europe/Madrid"], ["Barcelona", 41.39, 2.17, "Europe/Madrid"],
    ["Paris", 48.86, 2.35, "Europe/Paris"], ["Amsterdam", 52.37, 4.9, "Europe/Amsterdam"], ["Berlin", 52.52, 13.4, "Europe/Berlin"], ["Rome", 41.9, 12.5, "Europe/Rome"],
    ["Zurich", 47.38, 8.54, "Europe/Zurich"], ["Stockholm", 59.33, 18.07, "Europe/Stockholm"], ["Oslo", 59.91, 10.75, "Europe/Oslo"], ["Copenhagen", 55.68, 12.57, "Europe/Copenhagen"],
    ["Athens", 37.98, 23.73, "Europe/Athens"], ["Istanbul", 41.01, 28.98, "Europe/Istanbul"], ["Cairo", 30.04, 31.24, "Africa/Cairo"], ["Lagos", 6.52, 3.38, "Africa/Lagos"],
    ["Nairobi", -1.29, 36.82, "Africa/Nairobi"], ["Johannesburg", -26.2, 28.05, "Africa/Johannesburg"], ["Cape Town", -33.92, 18.42, "Africa/Johannesburg"], ["Dubai", 25.2, 55.27, "Asia/Dubai"],
    ["Tel Aviv", 32.09, 34.78, "Asia/Jerusalem"], ["Mumbai", 19.08, 72.88, "Asia/Kolkata"], ["Delhi", 28.61, 77.21, "Asia/Kolkata"], ["Bangkok", 13.76, 100.5, "Asia/Bangkok"],
    ["Singapore", 1.35, 103.82, "Asia/Singapore"], ["Hong Kong", 22.32, 114.17, "Asia/Hong_Kong"], ["Shanghai", 31.23, 121.47, "Asia/Shanghai"], ["Taipei", 25.03, 121.57, "Asia/Taipei"],
    ["Manila", 14.6, 120.98, "Asia/Manila"], ["Seoul", 37.57, 126.98, "Asia/Seoul"], ["Tokyo", 35.68, 139.69, "Asia/Tokyo"], ["Sydney", -33.87, 151.21, "Australia/Sydney"],
    ["Melbourne", -37.81, 144.96, "Australia/Melbourne"], ["Perth", -31.95, 115.86, "Australia/Perth"], ["Auckland", -36.85, 174.76, "Pacific/Auckland"]
].map(([name, lat, lon, tz]) => ({name, lat, lon, tz}));

const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } };
// Hours a time zone is ahead of UTC at a moment.
function tzOffset(tz, d) {
  try {
    const p = {};
    new Intl.DateTimeFormat("en-US", {timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"}).formatToParts(d).forEach(x => { p[x.type] = x.value; });
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(d.getTime() / 60000) * 60000) / 3600000;
  } catch (e) { return -d.getTimezoneOffset() / 60; }
}
// The place whose day the theme follows: the chosen city, else the first city in this device's time zone,
// else a point on the time zone's middle meridian at latitude 40.
function place(city) {
  if (city && isFinite(city.lat) && isFinite(city.lon) && city.tz) return city;
  const tz = deviceTz(), c = CITIES.find(x => x.tz === tz);
  if (c) return Object.assign({auto: true}, c);
  return {name: tz.split("/").pop().replace(/_/g, " "), lat: 40, lon: Math.max(-180, Math.min(180, tzOffset(tz, new Date()) * 15)), tz, auto: true};
}
// Sunrise, solar noon and sunset today in the place's local hours (NOAA approximation). Also the sun's declination (radians).
function sunTimes(pl, d = new Date()) {
  const doy = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5), g = 2 * Math.PI / 365 * (doy - 1), r = Math.PI / 180;
  const eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const dec = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const off = tzOffset(pl.tz, d), loc = m => ((m / 60 + off) % 24 + 24) % 24;
  const noon = loc(720 - 4 * pl.lon - eq);
  const x = Math.cos(90.833 * r) / (Math.cos(pl.lat * r) * Math.cos(dec)) - Math.tan(pl.lat * r) * Math.tan(dec);
  if (x < -1 || x > 1) return {noon, rise: null, set: null, polar: x < -1 ? "day" : "night", dec};
  const ha = Math.acos(x) / r;
  return {noon, rise: loc(720 - 4 * (pl.lon + ha) - eq), set: loc(720 - 4 * (pl.lon - ha) - eq), dec};
}
// The five real moments in local hours, in order from dawn (later ones may run past 24):
// dawn = sunrise, midday = solar noon, golden hour = 1h before sunset, dusk = 24 min after sunset, midnight = noon + 12h.
function moments(pl, d) {
  const s = sunTimes(pl, d);
  const rise = s.rise != null ? s.rise : s.noon - 6, set = s.set != null ? s.set : s.noon + 6;
  const after = x => { while (x < rise) x += 24; return x; };
  return [["dawn", rise], ["midday", after(s.noon)], ["golden", after(set - 1)], ["dusk", after(set + .4)], ["midnight", after(s.noon + 12)]];
}
// Maps a real local hour onto the standard day the skies are drawn for (dawn 5.5, midday 13, golden 17.5, dusk 20, midnight 24).
const STD = [5.5, 13, 17.5, 20, 24, 29.5];
function skyHour(pl, h, d) {
  const m = moments(pl, d).map(x => x[1]);
  m.push(m[0] + 24);
  if (h < m[0]) h += 24;
  let i = 0;
  while (i < m.length - 2 && h >= m[i + 1]) i++;
  const k = Math.max(0, Math.min(1, (h - m[i]) / (m[i + 1] - m[i])));
  return (STD[i] + k * (STD[i + 1] - STD[i])) % 24;
}
function curve(keys, h) {
  let i = 0;
  while (i < keys.length - 2 && h >= keys[i + 1].h) i++;
  const p = keys[i], q = keys[i + 1], t = ease(Math.min(1, Math.max(0, (h - p.h) / (q.h - p.h))));
  const out = {name: t < .5 ? p.name : q.name};
  ["base", "a", "b", "c"].forEach(k => { out[k] = mix(p[k], q[k], t); });
  return out;
}
function paletteAt(h) {
  let i = 0;
  while (i < PAL_AT.length - 2 && h >= PAL_AT[i + 1][1]) i++;
  const p = PAL_AT[i], q = PAL_AT[i + 1], k = ease(Math.max(0, Math.min(1, (h - p[1]) / (q[1] - p[1]))));
  return PALETTES[p[0]].c.map((c, j) => mix(c, PALETTES[q[0]].c[j], k));
}
function paletteNameAt(h) { let best = "midnight", d = 99; PAL_AT.forEach(([id, x]) => { const e = Math.abs(h - x); if (e < d) { d = e; best = id; } }); return PALETTES[best].label; }

// ---------- the sun spot (Guava uses "glow") ----------
// A small sun that rises in the east (left), arcs over and sets in the west (right) on the REAL clock:
// it sits on the horizon at the city's real sunrise and sunset and is highest at solar noon. Its noon height
// follows the season (low winter sun, high summer sun). Warm near the horizon, near-white at noon, tinted by
// the look's first glow. Hidden at night (and in polar night).
function sunSpot(pl, local, d, sky, style) {
  if (!style || style === "off") return null;
  const s = sunTimes(pl, d);
  let rise = s.rise, set = s.set;
  if (s.polar === "night") return null;
  if (s.polar === "day") { rise = s.noon - 12; set = s.noon + 12; }
  if (set < rise) set += 24;
  let h = local; if (h < rise - 2) h += 24;
  const p = (h - rise) / (set - rise);                       // 0 at sunrise, 1 at sunset
  if (p < -.06 || p > 1.06) return null;
  const decDeg = s.dec * 180 / Math.PI, noonAlt = Math.max(8, 90 - Math.abs(pl.lat - decDeg));
  const lift = Math.sin(Math.PI * Math.max(0, Math.min(1, p))) * (.5 + .5 * Math.min(1, noonAlt / 72));
  const x = 6 + 88 * p;                                      // % across the backdrop, east -> west
  const y = 30 - 24 * lift;                                  // % down: horizon line 30%, top of the arc near 6%
  const warm = 1 - Math.min(1, Math.sin(Math.PI * Math.max(0, Math.min(1, p))) * 2.4); // 1 at the horizon, 0 by mid-morning
  const core = mix("#fffbea", "#ffd9a0", warm);
  const halo = mix(mix("#ffcf6e", "#ff8a4c", warm), sky.a, .22);
  const fade = Math.max(0, Math.min(1, (p + .06) / .1, (1.06 - p) / .1));
  // On a dark sky (Night Shift, or dusk light) light text may cross the sun: soften it so text stays readable.
  const dark = lum(sky.base) < .18;
  return {style, p, x, y, lift, warm, core: dark ? mix(core, halo, .55) : core, halo, opacity: fade * (dark ? .7 : 1), rise, set};
}

function freeHue(list) {
  const hsl = list.map(toHsl), gap = h => Math.min(...hsl.map(([H]) => Math.min(Math.abs(h - H), 360 - Math.abs(h - H))));
  let best = 0;
  for (let h = 0; h < 360; h += 5) if (gap(h) > gap(best)) best = h;
  const avg = k => hsl.reduce((t, x) => t + x[k], 0) / hsl.length;
  return fromHsl(best, avg(1), avg(2));
}

// ---------- everything for one moment ----------
function guavaSky(opts = {}) {
  const look = LOOKS.find(l => l.id === opts.look) || LOOKS[0];
  const font = FONTS[opts.font] ? opts.font : "clean";
  const d = opts.date || new Date(), pl = place(opts.city);
  const cycle = opts.cycle !== false, freeze = typeof opts.freeze === "number" ? opts.freeze : 12;
  const local = opts.at != null ? ((opts.at % 24) + 24) % 24
    : !cycle ? freeze
    : ((d.getUTCHours() + d.getUTCMinutes() / 60 + tzOffset(pl.tz, d)) % 24 + 24) % 24;
  const h = skyHour(pl, local, d);
  const sky = curve(holdNight(SKY_KEYS[look.sky], look.sky), h);
  const dark = lum(sky.base) < .18;                                   // the sky decides light or dark; no separate setting
  const sunX = 10 + Math.max(0, Math.min(1, (h - 6) / 12)) * 70;     // the first glow crosses the top, standard 6am-6pm

  const [ground, panel, ink, soft, faint, rule] = NEUTRALS[look.neutrals][dark ? "dark" : "light"];
  const v = {"--ground": ground, "--panel": panel, "--ink": ink, "--ink-soft": soft, "--ink-faint": faint, "--rule": rule};
  const STATUS = ["--good", "--signal", "--bad"];
  Object.assign(v, dark ? {"--good": "#5fd09a", "--signal": "#f2a93b", "--bad": "#f07a6e"} : {"--good": "#157a4f", "--signal": "#9c5208", "--bad": "#b8352f"});
  // Accent: fill for buttons/selected states, a stronger cousin for text and borders.
  const acc = dark && look.accentDark ? look.accentDark : look.accent;
  let fill = acc;
  if (dark && contrast(fill, panel) < 4.5) fill = reach(fill, panel, 4.5);
  const tf = textFill(fill);
  v["--accent"] = reach(reach(acc, panel, 4.5), ground, 4.5);
  v["--accent-fill"] = tf.fill; v["--on-accent"] = tf.on;
  v["--accent-soft"] = mix(acc, panel, dark ? .8 : .84);
  v["--accent-line"] = mix(acc, panel, dark ? .55 : .5);
  // Category colors for this moment: chart color (3:1 on panel) plus a text-carrying tile fill pair.
  const cols = paletteAt(h);
  cols.forEach((c, i) => {
    v["--c" + (i + 1)] = reach(c, panel, 3);
    const a = textFill(c), b2 = reach(hueShift(c, 22), a.on, 4.5);
    v["--c" + (i + 1) + "-fill"] = a.fill; v["--c" + (i + 1) + "-fill2"] = b2; v["--c" + (i + 1) + "-on"] = a.on;
  });
  v["--c-other"] = dark ? "#5f6680" : "#a3a9bf";                    // "Other" in charts
  v["--c9"] = reach(freeHue(cols.filter((c, i) => i !== 5)), panel, 3); // a 9th color: the hue furthest from the rest
  cols.forEach((c, i) => { v["--cx" + (i + 1)] = reach(hueShift(c, 36), panel, 3); }); // a second shade per category
  // Hero gradient stops, muted toward the ground in dark.
  const g = look.gradient.concat(look.gradient.length === 2 ? [mix(look.gradient[0], look.gradient[1], .5)] : []);
  g.forEach((c, i) => { v["--g" + (i + 1)] = dark ? mix(c, ground, .62) : mix(c, ground, .18); });
  // The sky: ground and four glows (the 4th is a mixed 40% toward c).
  [sky.a, sky.b, sky.c, mix(sky.a, sky.c, .4)].forEach((c, i) => { v["--art" + (i + 1)] = c; });
  v["--ground"] = sky.base; v["--sun-x"] = sunX.toFixed(1) + "%";
  // Text can sit right on the sky: each glow moves just enough to keep 4.5:1 with the ink,
  // then every text tone moves just enough to stay 4.5:1 on the ground, each glow and the panel.
  const field = [v["--ground"]];
  for (let i = 1; i <= 4; i++) { v["--art" + i] = reach(v["--art" + i], v["--ink"], 4.5); field.push(v["--art" + i]); }
  ["--ink", "--ink-soft", "--ink-faint", "--accent"].forEach(k => { field.concat([panel]).forEach(bg => { v[k] = reach(v[k], bg, 4.5); }); });
  const glass = field.slice(1).map(c => mix(c, panel, dark ? .72 : .74));
  STATUS.forEach(k => { [v["--ground"], panel].concat(glass).forEach(bg => { v[k] = reach(v[k], bg, 4.5); }); });
  ["--good", "--bad"].forEach(k => { let c = v[k]; field.forEach(bg => { c = reach(c, bg, 4.5); }); v[k + "-field"] = c; });
  v["--accent"] = reach(v["--accent"], v["--accent-soft"], 4.5);
  let edge = rule;
  for (let i = 1; i <= 20 && Math.min(contrast(edge, panel), contrast(edge, v["--ground"])) < 3; i++) edge = mix(rule, ink, i / 20);
  v["--rule-strong"] = edge;
  v["--on-status"] = dark ? onColor(v["--good"]) : "#ffffff";
  const hc = heroFill(g.slice(0, look.gradient.length).map(c => dark ? mix(c, "#000000", .12) : c));
  v["--hero-bg"] = hc.bg; v["--hero-on"] = hc.on;
  v["--panel-glass"] = "rgba(" + hex2rgb(panel).join(",") + "," + (dark ? .72 : .74) + ")";
  v["--f-display"] = v["--f-body"] = '"' + FONTS[font].family + '", ' + FONTS[font].fallback;
  // The sun spot (new; off unless asked for).
  const sun = sunSpot(pl, local, d, sky, opts.sunSpot == null ? "glow" : opts.sunSpot);
  if (sun) Object.assign(v, {"--sun-gx": sun.x.toFixed(2) + "%", "--sun-gy": sun.y.toFixed(2) + "%", "--sun-core": sun.core, "--sun-halo": sun.halo, "--sun-o": sun.opacity.toFixed(3)});
  else v["--sun-o"] = "0";
  return {look: look.id, font, place: pl, localHour: local, skyHour: h, moment: sky.name, palette: paletteNameAt(h), scheme: dark ? "dark" : "light", sky, sun, vars: v};
}
// A gradient that carries text: one text color for all stops, each stop nudged to 5:1 against it, plus a soft corner highlight.
function heroFill(stops) {
  const white = Math.min(...stops.map(c => contrast("#ffffff", c))), darkInk = Math.min(...stops.map(c => contrast(INK_DARK, c)));
  const on = white >= Math.min(4.5, darkInk) ? "#ffffff" : INK_DARK;
  const fixed = stops.map(c => reach(c, on, 5));
  const parts = fixed.map((c, i) => c + " " + Math.round(i / Math.max(1, fixed.length - 1) * 100) + "%");
  const glow = on === "#ffffff" ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.4)";
  return {on, bg: "radial-gradient(120% 90% at 0% 0%, " + glow + ", transparent 60%), linear-gradient(135deg, " + parts.join(", ") + ")"};
}
// Formats a local hour like the app: "7:04am", "Noon", "12am".
function fmtHour(h) {
  h = ((h % 24) + 24) % 24; let H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H = (H + 1) % 24; M = 0; }
  if (H === 12 && M === 0) return "Noon";
  const ap = H < 12 ? "am" : "pm", h12 = H % 12 || 12;
  return h12 + (M ? ":" + String(M).padStart(2, "0") : "") + ap;
}



export { guavaSky, sunTimes, place, fmtHour, LOOKS, FONTS, CITIES, PALETTES, reach, contrast };
