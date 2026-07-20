'use strict';

/* global HourglassTime */
const { parseInput, formatDuration, formatClock } = HourglassTime;

// ---- DOM ----------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'),
  progressFill: $('progressFill'),
  title: $('timerTitle'),
  display: $('display'),
  subline: $('subline'),
  inputRow: $('inputRow'),
  input: $('timeInput'),
  startBtn: $('startBtn'),
  hint: $('hint'),
  presets: $('presets'),
  controls: $('controls'),
  pauseBtn: $('pauseBtn'),
  addMinBtn: $('addMinBtn'),
  stopBtn: $('stopBtn'),
  pinBtn: $('pinBtn'),
  settingsBtn: $('settingsBtn'),
  drawer: $('drawer'),
  closeSettings: $('closeSettings'),
  themeSelect: $('themeSelect'),
  soundEnabled: $('soundEnabled'),
  loopSound: $('loopSound'),
  popUp: $('popUp'),
  alwaysOnTop: $('alwaysOnTop'),
  titleProgress: $('titleProgress'),
};

const PRESETS = [
  { label: '1 min', value: '1 minute' },
  { label: '5 min', value: '5 minutes' },
  { label: '10 min', value: '10 minutes' },
  { label: '25 min', value: '25 minutes' },
  { label: '1 hour', value: '1 hour' },
];

// ---- State --------------------------------------------------------------
const State = { IDLE: 'idle', RUNNING: 'running', PAUSED: 'paused', FINISHED: 'finished' };

const DEFAULT_SETTINGS = {
  theme: 'system',
  soundEnabled: true,
  loopSound: false,
  popUpWhenExpired: true,
  alwaysOnTop: false,
  showProgressInTitle: true,
  recentInputs: [],
  window: { width: 520, height: 380 },
};

let state = State.IDLE;
let settings = { ...DEFAULT_SETTINGS }; // safe defaults until persisted load resolves
let endTime = 0; // epoch ms when the timer finishes
let remaining = 0; // ms remaining (authoritative while paused)
let totalMs = 0; // full duration for progress calc
let tick = null; // requestAnimationFrame handle
let targetLabel = ''; // e.g. "until 5:30 PM"

// ---- Sound (Web Audio, no asset needed) ---------------------------------
let audioCtx = null;
let alarmTimer = null;

function beepOnce() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    // A pleasant two-tone chime.
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch (e) {
    /* audio unavailable */
  }
}

function startAlarm() {
  if (!settings.soundEnabled) return;
  beepOnce();
  if (settings.loopSound) {
    alarmTimer = setInterval(beepOnce, 1500);
  }
}

function stopAlarm() {
  if (alarmTimer) {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }
}

// ---- Rendering ----------------------------------------------------------
function setState(next) {
  state = next;
  const idle = next === State.IDLE;
  el.inputRow.hidden = !idle;
  el.presets.hidden = !idle;
  el.controls.hidden = idle;
  el.app.classList.toggle('finished', next === State.FINISHED);
  el.display.classList.toggle('finished', next === State.FINISHED);

  if (next === State.RUNNING) el.pauseBtn.textContent = 'Pause';
  if (next === State.PAUSED) el.pauseBtn.textContent = 'Resume';
  if (next === State.FINISHED) {
    el.pauseBtn.hidden = true;
    el.addMinBtn.hidden = true;
    el.stopBtn.textContent = 'Reset';
  } else {
    el.pauseBtn.hidden = false;
    el.addMinBtn.hidden = false;
    el.stopBtn.textContent = 'Stop';
  }
}

function updateDisplay(ms) {
  const text = ms >= 0 ? formatDuration(ms) : formatDuration(0);
  el.display.textContent = text;

  // progress
  let pct = 0;
  if (totalMs > 0) pct = Math.min(100, Math.max(0, ((totalMs - ms) / totalMs) * 100));
  el.progressFill.style.width = `${pct}%`;

  // window title
  const titlePrefix = el.title.value ? `${el.title.value} — ` : '';
  if (settings.showProgressInTitle && (state === State.RUNNING || state === State.PAUSED)) {
    window.hourglass.setWindowTitle(`${titlePrefix}${text}`);
  } else if (state === State.FINISHED) {
    window.hourglass.setWindowTitle(`${titlePrefix}Time's up!`);
  } else {
    window.hourglass.setWindowTitle(el.title.value || 'Hourglass');
  }
}

function loop() {
  if (state !== State.RUNNING) return;
  const now = Date.now();
  remaining = endTime - now;
  if (remaining <= 0) {
    remaining = 0;
    updateDisplay(0);
    finish();
    return;
  }
  updateDisplay(remaining);
  tick = requestAnimationFrame(loop);
}

// ---- Timer control ------------------------------------------------------
function start(text) {
  clearHint();
  let parsed;
  try {
    parsed = parseInput(text, new Date());
  } catch (err) {
    showError(err.message);
    return;
  }
  if (parsed.ms <= 0) {
    showError('That time has already passed.');
    return;
  }

  totalMs = parsed.ms;
  remaining = parsed.ms;
  endTime = Date.now() + parsed.ms;
  targetLabel = parsed.type === 'datetime'
    ? parsed.label
    : `ends at ${formatClock(parsed.target)}`;
  el.subline.textContent = targetLabel;

  rememberInput(text);
  setState(State.RUNNING);
  // Prime the audio context on a user gesture so the alarm can play later.
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  updateDisplay(remaining);
  cancelAnimationFrame(tick);
  tick = requestAnimationFrame(loop);
}

function pause() {
  if (state !== State.RUNNING) return;
  cancelAnimationFrame(tick);
  remaining = endTime - Date.now();
  setState(State.PAUSED);
  updateDisplay(remaining);
}

function resume() {
  if (state !== State.PAUSED) return;
  endTime = Date.now() + remaining;
  setState(State.RUNNING);
  tick = requestAnimationFrame(loop);
}

function togglePause() {
  if (state === State.RUNNING) pause();
  else if (state === State.PAUSED) resume();
}

function addMinute() {
  if (state === State.RUNNING) {
    endTime += 60000;
    totalMs += 60000;
  } else if (state === State.PAUSED) {
    remaining += 60000;
    totalMs += 60000;
    updateDisplay(remaining);
  }
}

function stop() {
  cancelAnimationFrame(tick);
  stopAlarm();
  state = State.IDLE;
  remaining = 0;
  totalMs = 0;
  endTime = 0;
  el.subline.textContent = '';
  el.display.textContent = '0:00';
  el.progressFill.style.width = '0%';
  el.app.classList.remove('finished');
  el.display.classList.remove('finished');
  setState(State.IDLE);
  window.hourglass.setWindowTitle(el.title.value || 'Hourglass');
  el.input.focus();
}

function finish() {
  cancelAnimationFrame(tick);
  setState(State.FINISHED);
  el.display.textContent = "Time's up!";
  el.subline.textContent = el.title.value || '';
  el.progressFill.style.width = '100%';
  window.hourglass.setWindowTitle("Time's up! — Hourglass");
  window.hourglass.notifyExpired();
  startAlarm();
}

// ---- Hints --------------------------------------------------------------
function showError(msg) {
  el.hint.textContent = msg;
  el.hint.classList.add('error');
}
function showHint(msg) {
  el.hint.textContent = msg;
  el.hint.classList.remove('error');
}
function clearHint() {
  el.hint.textContent = '';
  el.hint.classList.remove('error');
}

function livePreview() {
  const text = el.input.value.trim();
  if (!text) return clearHint();
  try {
    const parsed = parseInput(text, new Date());
    if (parsed.type === 'datetime') {
      showHint(`→ ${formatDuration(parsed.ms)} (${parsed.label})`);
    } else {
      showHint(`→ ${parsed.label}`);
    }
  } catch (err) {
    showHint('');
  }
}

// ---- Recents / presets --------------------------------------------------
function rememberInput(text) {
  const t = text.trim();
  if (!t) return;
  let recents = settings.recentInputs || [];
  recents = [t, ...recents.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 5);
  settings.recentInputs = recents;
  window.hourglass.setSettings({ recentInputs: recents });
  renderPresets();
}

function renderPresets() {
  el.presets.innerHTML = '';
  const recents = (settings.recentInputs || []).map((v) => ({ label: v, value: v }));
  const items = recents.length ? recents.slice(0, 5) : PRESETS;
  for (const p of items) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = p.label;
    chip.addEventListener('click', () => {
      el.input.value = p.value;
      start(p.value);
    });
    el.presets.appendChild(chip);
  }
}

// ---- Settings wiring ----------------------------------------------------
function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function syncSettingsUI() {
  el.themeSelect.value = settings.theme;
  el.soundEnabled.checked = settings.soundEnabled;
  el.loopSound.checked = settings.loopSound;
  el.popUp.checked = settings.popUpWhenExpired;
  el.alwaysOnTop.checked = settings.alwaysOnTop;
  el.titleProgress.checked = settings.showProgressInTitle;
  el.pinBtn.classList.toggle('active', settings.alwaysOnTop);
}

function persist(partial) {
  settings = { ...settings, ...partial };
  window.hourglass.setSettings(partial);
}

function openDrawer() { el.drawer.hidden = false; }
function closeDrawer() { el.drawer.hidden = true; }

// ---- Events -------------------------------------------------------------
el.inputRow.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = el.input.value.trim();
  if (text) start(text);
});

el.input.addEventListener('input', livePreview);

el.pauseBtn.addEventListener('click', togglePause);
el.addMinBtn.addEventListener('click', addMinute);
el.stopBtn.addEventListener('click', stop);

el.pinBtn.addEventListener('click', () => {
  const next = !settings.alwaysOnTop;
  persist({ alwaysOnTop: next });
  window.hourglass.setAlwaysOnTop(next);
  el.pinBtn.classList.toggle('active', next);
  el.alwaysOnTop.checked = next;
});

el.settingsBtn.addEventListener('click', openDrawer);
el.closeSettings.addEventListener('click', closeDrawer);
el.drawer.addEventListener('click', (e) => { if (e.target === el.drawer) closeDrawer(); });

el.themeSelect.addEventListener('change', () => {
  persist({ theme: el.themeSelect.value });
  applyTheme(el.themeSelect.value);
});
el.soundEnabled.addEventListener('change', () => persist({ soundEnabled: el.soundEnabled.checked }));
el.loopSound.addEventListener('change', () => persist({ loopSound: el.loopSound.checked }));
el.popUp.addEventListener('change', () => persist({ popUpWhenExpired: el.popUp.checked }));
el.alwaysOnTop.addEventListener('change', () => {
  persist({ alwaysOnTop: el.alwaysOnTop.checked });
  window.hourglass.setAlwaysOnTop(el.alwaysOnTop.checked);
  el.pinBtn.classList.toggle('active', el.alwaysOnTop.checked);
});
el.titleProgress.addEventListener('change', () => persist({ showProgressInTitle: el.titleProgress.checked }));

el.title.addEventListener('input', () => {
  if (state === State.IDLE) window.hourglass.setWindowTitle(el.title.value || 'Hourglass');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.drawer.hidden) { closeDrawer(); return; }
  const typing = document.activeElement === el.input || document.activeElement === el.title;
  if (typing) return;
  if (e.code === 'Space') { e.preventDefault(); if (state !== State.IDLE) togglePause(); }
  else if (e.key === 'Escape' && state !== State.IDLE) stop();
});

// Menu-driven actions
window.hourglass.onMenu('menu:toggle-pause', () => { if (state !== State.IDLE) togglePause(); });
window.hourglass.onMenu('menu:stop', () => { if (state !== State.IDLE) stop(); });
window.hourglass.onMenu('menu:add-minute', () => addMinute());

// Save window size on resize
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    window.hourglass.saveWindowSize({ width: window.innerWidth, height: window.innerHeight });
  }, 400);
});

// ---- Init ---------------------------------------------------------------
async function init() {
  settings = { ...DEFAULT_SETTINGS, ...(await window.hourglass.getSettings()) };
  applyTheme(settings.theme);
  syncSettingsUI();
  renderPresets();
  setState(State.IDLE);
  el.input.focus();
}

init();
