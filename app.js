const STORAGE_KEY = 'cross-chrono';
const TAB_KEY = 'cross-chrono-tab';
const DEFAULT_RACE = 'Course';
const UNLISTED_RACE = 'Hors liste';
const SCAN_COOLDOWN_MS = 3000;
const SCAN_INTERVAL_MS = 120;

const $ = (selector) => document.querySelector(selector);
const state = load();
const lastSeen = new Map();
let scanner = null;
let audio = null;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch {}
  return { runners: [], starts: {}, finishes: [] };
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function runnerByBib(bib) {
  return state.runners.find((r) => r.bib === bib);
}

function races() {
  const names = [...new Set(state.runners.map((r) => r.race))];
  return names.length ? names : [DEFAULT_RACE];
}

function raceOf(bib) {
  const runner = runnerByBib(bib);
  if (runner) return runner.race;
  const all = races();
  return all.length === 1 ? all[0] : UNLISTED_RACE;
}

function pad(n, size = 2) {
  return String(n).padStart(size, '0');
}

function formatElapsed(ms) {
  if (ms == null) return '';
  const tenths = Math.floor(ms / 100) % 10;
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);
  const base = `${pad(minutes)}:${pad(seconds)}.${tenths}`;
  return hours ? `${hours}:${base}` : base;
}

function formatClock(time) {
  const d = new Date(time);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseBib(value) {
  const match = String(value ?? '').trim().match(/^\d{1,6}$/);
  return match ? Number(match[0]) : null;
}

function parseRunners(text, firstBib) {
  let next = firstBib;
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const fields = line.split(/[;\t]/).map((f) => f.trim());
    const bib = /^\d+$/.test(fields[0]) ? Number(fields.shift()) : next;
    next = bib + 1;
    return { bib, name: fields[0] || '', race: fields[1] || DEFAULT_RACE };
  });
}

function duplicateBibs(runners) {
  const seen = new Set();
  return runners.filter((r) => seen.has(r.bib) || !seen.add(r.bib)).map((r) => r.bib);
}

function setStatus(message, kind) {
  const el = $('#runners-status');
  el.textContent = message;
  el.className = `status ${kind}`;
}

function replaceRunners(runners) {
  const duplicates = duplicateBibs(runners);
  if (duplicates.length) return setStatus(`Dossards en double : ${duplicates.join(', ')}`, 'error');
  state.runners = runners;
  save();
  setStatus(`${runners.length} coureurs enregistrés`, 'ok');
  render();
}

function importRunners() {
  const firstBib = Number($('#first-bib').value) || 1;
  const runners = parseRunners($('#runners-input').value, firstBib);
  if (!runners.length) return setStatus('La liste est vide', 'error');
  replaceRunners(runners);
}

function generateAnonymous() {
  const firstBib = Number($('#first-bib').value) || 1;
  const count = Math.min(Number($('#anon-count').value) || 0, 2000);
  if (!count) return setStatus('Indique un nombre de dossards', 'error');
  replaceRunners(Array.from({ length: count }, (_, i) => ({ bib: firstBib + i, name: '', race: DEFAULT_RACE })));
}

function runnersToText() {
  return state.runners.map((r) => [r.bib, r.name, r.race].join(' ; ')).join('\n');
}

function beep(frequency) {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = frequency;
  gain.gain.value = 0.2;
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.12);
}

function flash(message, kind) {
  const el = $('#flash');
  el.textContent = message;
  el.className = `flash ${kind}`;
  beep(kind === 'ok' ? 1320 : 440);
  navigator.vibrate?.(kind === 'ok' ? 80 : [60, 60, 60]);
}

function record(bib, fromScan) {
  const now = Date.now();
  if (fromScan && now - (lastSeen.get(bib) ?? 0) < SCAN_COOLDOWN_MS) return;
  lastSeen.set(bib, now);
  if (bib != null && state.finishes.some((f) => f.bib === bib)) return flash(`${bib} déjà arrivé`, 'warn');
  state.finishes.push({ id: `${now}-${Math.random().toString(36).slice(2, 7)}`, bib, time: now });
  save();
  const runner = runnerByBib(bib);
  const expected = runner || bib == null || !state.runners.length;
  flash(bib == null ? 'Arrivée sans dossard' : `${bib} ${runner?.name ?? ''}`, expected ? 'ok' : 'warn');
  render();
}

function ranking(race) {
  const start = state.starts[race];
  return state.finishes
    .filter((f) => raceOf(f.bib) === race)
    .sort((a, b) => a.time - b.time)
    .map((f, i) => ({ ...f, rank: i + 1, runner: runnerByBib(f.bib), elapsed: start ? f.time - start : null }));
}

function rankedRaces() {
  const all = races();
  const hasUnlisted = state.finishes.some((f) => raceOf(f.bib) === UNLISTED_RACE);
  return hasUnlisted ? [...all, UNLISTED_RACE] : all;
}

function startRace(race) {
  state.starts[race] = Date.now();
  save();
  render();
}

function cancelStart(race) {
  delete state.starts[race];
  save();
  render();
}

function deleteFinish(id) {
  state.finishes = state.finishes.filter((f) => f.id !== id);
  save();
  render();
}

function updateFinishBib(id, value) {
  const finish = state.finishes.find((f) => f.id === id);
  if (!finish) return;
  finish.bib = parseBib(value);
  save();
  render();
}

function resetAll() {
  state.runners = [];
  state.starts = {};
  state.finishes = [];
  save();
  $('#runners-input').value = '';
  render();
}

async function createDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    return formats.includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

async function readCodes(video, detector) {
  if (detector) return (await detector.detect(video)).map((c) => c.rawValue);
  const canvas = $('#frame');
  const scale = Math.min(1, 640 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
  return code ? [code.data] : [];
}

async function scanLoop() {
  if (!scanner) return;
  const { video, detector } = scanner;
  if (video.readyState >= 2) {
    try {
      const codes = await readCodes(video, detector);
      codes.map(parseBib).filter((bib) => bib != null).forEach((bib) => record(bib, true));
    } catch {}
  }
  scanner && setTimeout(scanLoop, SCAN_INTERVAL_MS);
}

async function startScanner() {
  const video = $('#video');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    const wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
    scanner = { video, stream, wakeLock, detector: await createDetector() };
    $('#toggle-scan').textContent = 'Arrêter le scan';
    scanLoop();
  } catch {
    flash('Caméra indisponible : autorise-la, ou saisis les numéros à la main', 'warn');
  }
}

function stopScanner() {
  if (!scanner) return;
  scanner.stream.getTracks().forEach((t) => t.stop());
  scanner.wakeLock?.release();
  scanner.video.hidden = true;
  scanner = null;
  $('#toggle-scan').textContent = 'Lancer le scan';
}

function toggleScanner() {
  audio ??= new AudioContext();
  scanner ? stopScanner() : startScanner();
}

function renderRunnersSummary() {
  if (!state.runners.length) {
    $('#runners-summary').innerHTML = '<p class="empty">Aucun coureur pour l\'instant.</p>';
    return;
  }
  const counts = races().map((race) => `<li>${escapeHtml(race)} : ${state.runners.filter((r) => r.race === race).length}</li>`);
  const bibs = state.runners.map((r) => r.bib);
  $('#runners-summary').innerHTML = `
    <p>${state.runners.length} coureurs, dossards ${Math.min(...bibs)} à ${Math.max(...bibs)}.</p>
    <ul class="race-list">${counts.join('')}</ul>`;
}

function qrSvg(bib) {
  const qr = qrcode(0, 'M');
  qr.addData(String(bib));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function renderBibs() {
  if (!state.runners.length) {
    $('#bib-sheet').innerHTML = '<p class="empty">Enregistre d\'abord des coureurs dans l\'onglet Coureurs.</p>';
    return;
  }
  $('#bib-sheet').innerHTML = state.runners.map((r) => `
    <article class="bib-card">
      <div class="race">${escapeHtml(r.race)}</div>
      <div class="number">${r.bib}</div>
      <div class="qr">${qrSvg(r.bib)}</div>
      <div class="name">${escapeHtml(r.name)}</div>
    </article>`).join('');
}

function renderStarts() {
  $('#starts').innerHTML = races().map((race) => {
    const start = state.starts[race];
    const action = start
      ? `<button data-cancel-start="${escapeHtml(race)}" data-confirm>Annuler le départ</button>`
      : `<button class="primary" data-start="${escapeHtml(race)}">Donner le départ</button>`;
    return `
      <div class="start-card">
        <span class="name">${escapeHtml(race)}</span>
        <span class="clock ${start ? '' : 'idle'}" data-clock="${escapeHtml(race)}">${start ? '' : '00:00.0'}</span>
        ${action}
      </div>`;
  }).join('');
  tickClocks();
}

function tickClocks() {
  document.querySelectorAll('[data-clock]').forEach((el) => {
    const start = state.starts[el.dataset.clock];
    if (start) el.textContent = formatElapsed(Date.now() - start);
  });
}

function renderRecent() {
  const recent = [...state.finishes].sort((a, b) => b.time - a.time).slice(0, 8);
  $('#recent').innerHTML = recent.map((f) => `
    <li>
      <span class="bib">${f.bib ?? '?'}</span>
      <span class="who">${escapeHtml(runnerByBib(f.bib)?.name || raceOf(f.bib))}</span>
      <span>${formatClock(f.time)}</span>
    </li>`).join('');
}

function renderResults() {
  if (!state.finishes.length) {
    $('#results').innerHTML = '<p class="empty">Les arrivées s\'afficheront ici, course par course.</p>';
    return;
  }
  $('#results').innerHTML = rankedRaces().map((race) => {
    const rows = ranking(race).map((f) => `
      <tr class="${f.runner ? '' : 'unknown'}">
        <td class="rank">${f.rank}</td>
        <td><input type="number" value="${f.bib ?? ''}" data-edit-bib="${f.id}" aria-label="Dossard"></td>
        <td>${escapeHtml(f.runner?.name ?? (f.bib == null ? 'Sans dossard' : 'Dossard inconnu'))}</td>
        <td>${formatElapsed(f.elapsed)}</td>
        <td>${formatClock(f.time)}</td>
        <td><button data-delete="${f.id}" data-confirm>Supprimer</button></td>
      </tr>`).join('');
    return `
      <div class="race-results">
        <h2>${escapeHtml(race)}</h2>
        ${rows ? `<div class="table-wrap"><table>
          <thead><tr><th>Rang</th><th>Dossard</th><th>Nom</th><th>Temps</th><th>Arrivée</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : '<p class="empty">Personne n\'est encore arrivé.</p>'}
      </div>`;
  }).join('');
}

function render() {
  renderRunnersSummary();
  renderBibs();
  renderStarts();
  renderRecent();
  renderResults();
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  const header = ['Course', 'Rang', 'Dossard', 'Nom', 'Temps', 'Heure d\'arrivée'];
  const rows = rankedRaces().flatMap((race) => ranking(race).map((f) => [
    race, f.rank, f.bib ?? '', f.runner?.name ?? '', formatElapsed(f.elapsed), formatClock(f.time),
  ]));
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `classement-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function confirmed(button) {
  if (!button.hasAttribute('data-confirm') || button.dataset.armed) return true;
  const label = button.textContent;
  button.dataset.armed = '1';
  button.textContent = 'Confirmer ?';
  setTimeout(() => {
    delete button.dataset.armed;
    button.textContent = label;
  }, 3000);
  return false;
}

function showTab(name) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  if (name !== 'finish') stopScanner();
  if (name === 'finish') $('#manual-bib').focus();
  try { localStorage.setItem(TAB_KEY, name); } catch {}
}

function handleClick(event) {
  const button = event.target.closest('button');
  if (!button || !confirmed(button)) return;
  const { tab, start, cancelStart: cancel, delete: id } = button.dataset;
  if (button.id === 'reset-all') return resetAll();
  if (tab) return showTab(tab);
  if (start) return startRace(start);
  if (cancel) return cancelStart(cancel);
  if (id) return deleteFinish(id);
}

function submitManual(event) {
  event.preventDefault();
  audio ??= new AudioContext();
  const input = $('#manual-bib');
  const bib = parseBib(input.value);
  input.value = '';
  input.focus();
  if (bib == null) return flash('Numéro invalide', 'warn');
  record(bib, false);
}

function init() {
  document.addEventListener('click', handleClick);
  document.addEventListener('change', (e) => e.target.dataset.editBib && updateFinishBib(e.target.dataset.editBib, e.target.value));
  $('#import-runners').addEventListener('click', importRunners);
  $('#generate-anon').addEventListener('click', generateAnonymous);
  $('#print-bibs').addEventListener('click', () => window.print());
  $('#toggle-scan').addEventListener('click', toggleScanner);
  $('#manual-form').addEventListener('submit', submitManual);
  $('#no-bib').addEventListener('click', () => record(null, false));
  $('#export-csv').addEventListener('click', exportCsv);
  $('#runners-input').value = runnersToText();
  setInterval(tickClocks, 100);
  render();
  let tab = 'runners';
  try { tab = localStorage.getItem(TAB_KEY) || tab; } catch {}
  showTab(tab);
}

init();
