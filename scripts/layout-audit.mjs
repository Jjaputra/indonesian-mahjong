import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';

// Uses Orca's installed browser; no browser package or server is required by the fixtures.
const root = resolve('.agents/layout-audit');
mkdirSync(resolve(root, 'shots'), { recursive: true });
const source = readFileSync('src/ui/dev-online-demo.ts', 'utf8');
const states = ['early', 'mid', 'late', 'melds-0', 'melds-2', 'melds-4', 'flowers', 'spectator', 'pung', 'claims', 'kong', 'warning', 'turn', 'hu', 'seri', 'final', ...[0, 50].flatMap(n => ['open', 'closed'].flatMap(c => ['open', 'closed'].map(o => `chat-${n}-${c}-options-${o}`))), 'lobby', 'menu', 'create', 'join', 'settings', 'history', 'premium', 'admin', 'admin-users', 'admin-settings', 'admin-audit'];
if (!source.includes('ONLINE_AUDIT_STATES')) throw Error('Missing fixture catalogue');
const viewports = ['360x640', '390x844', '412x915', '430x932', '640x360', '740x360', '844x390', '915x412', '932x430', '768x1024', '800x1280', '820x1180', '1024x768', '1180x820', '1280x800', '1340x800', '1280x560', '1280x690', '1366x768', '1440x900', '1920x1080'];
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const selectedStates = arg('--state') ? [arg('--state')] : states;
const selectedViews = arg('--viewport') ? [arg('--viewport')] : viewports;
if (selectedStates.some(s => !states.includes(s)) || selectedViews.some(v => !/^\d+x\d+$/.test(v))) throw Error('Unknown state or invalid viewport');
const cli = process.env.ORCA_CLI_COMMAND || 'orca';
const pageArgs = arg('--page') ? ['--page', arg('--page')] : [];
function orca(command, args = []) {
  const value = JSON.parse(execFileSync(cli, [command, ...args, ...pageArgs, '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true }));
  if (!value.ok) throw Error(JSON.stringify(value.error));
  return value.result;
}
function evaluate(fn) {
  const result = orca('eval', ['--expression', `(${fn.toString()})()`]).result;
  return typeof result === 'string' ? JSON.parse(result) : result;
}

function settleLayout() {
  return evaluate(async () => {
    const start = performance.now();
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    // Background tabs can throttle animation frames; bound the entire wait.
    await Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), pause(200)]);
    const geometry = () => JSON.stringify([...document.querySelectorAll('.pool-frame, .pool-tile, .seat-panel, .human-area')].map(e => {
      const r = e.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100);
    }));
    let previous = geometry();
    while (performance.now() - start < 1400) {
      await pause(100);
      const current = geometry();
      if (current === previous) return { settled: true, elapsed: Math.round(performance.now() - start) };
      previous = current;
    }
    return { settled: false, elapsed: Math.round(performance.now() - start) };
  });
}

// Kept in this file so every audit uses the same geometry rules and reports actual values.
function measure() {
  const $ = s => [...document.querySelectorAll(s)];
  const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const visible = e => { const r = rect(e); return r.w > 0 && r.h > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
  const label = e => `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).replaceAll(' ', '.')} ${e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 48) || ''}`;
  const findings = [], metrics = {};
  const add = (severity, check, element, actual) => findings.push({ severity, check, element, actual });
  const modal = $('[role=dialog]').find(visible);
  const auditState = document.querySelector('[data-layout-audit]')?.getAttribute('data-layout-audit') ?? '';
  if (auditState.startsWith('chat-')) {
    const phoneLandscape = matchMedia('(orientation: landscape) and (max-height: 500px) and (min-width: 500px)').matches;
    const expected = auditState.includes('-open-options-') && !(phoneLandscape && auditState.endsWith('options-open')) ? '.chat-panel.is-open' : '.chat-panel.is-collapsed';
    const chat = $(expected)[0];
    if (!chat || !visible(chat)) add('High', 'requested chat panel hidden', expected, chat ? `${getComputedStyle(chat).display}; ${JSON.stringify(rect(chat))}` : 'missing');
    const optionsSelector = auditState.endsWith('options-open') ? '.options-panel' : '.options-tab';
    const options = $(optionsSelector)[0];
    if (!options || !visible(options)) add('High', 'requested Opsi control hidden', optionsSelector, options ? `${getComputedStyle(options).display}; ${JSON.stringify(rect(options))}` : 'missing');
  }
  const active = e => !modal || modal.contains(e);
  const intersects = (a, b) => { const x = Math.min(a.right, b.right) - Math.max(a.x, b.x), y = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y); return x > 1 && y > 1 ? { width: +x.toFixed(1), height: +y.toFixed(1) } : null; };
  if (document.documentElement.scrollWidth > innerWidth + 1) add('High', 'horizontal scroll', 'document', `${document.documentElement.scrollWidth} > ${innerWidth}px`);
  function scrollAncestor(e) {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const css = getComputedStyle(p);
      if ((/(auto|scroll)/.test(css.overflowY) && p.scrollHeight > p.clientHeight + 1) || (/(auto|scroll)/.test(css.overflowX) && p.scrollWidth > p.clientWidth + 1)) return p;
    }
    return null;
  }
  for (const e of $('.hand-row .tile, .hud-btn, .panel-footer button, .options-tab, .options-panel-close, .chat-peek, .chat-close, .mp-code, .mp-invite, .mp-share').filter(visible).filter(active)) {
    const r = rect(e), scroll = scrollAncestor(e);
    const outside = r.x < -1 || r.right > innerWidth + 1 || r.y < -1 || r.bottom > innerHeight + 1;
    const documentScroll = !modal && document.documentElement.scrollHeight > innerHeight && !/(hidden|clip)/.test(getComputedStyle(document.body).overflowY + getComputedStyle(document.documentElement).overflowY);
    if (outside && !scroll && !documentScroll) add('High', 'outside viewport', label(e), JSON.stringify(r));
    for (let p = e.parentElement; p && p !== scroll; p = p.parentElement) {
      const css = getComputedStyle(p), b = rect(p);
      if (/(hidden|clip)/.test(css.overflowX + css.overflowY) && (r.x < b.x - 1 || r.right > b.right + 1 || r.y < b.y - 1 || r.bottom > b.bottom + 1)) { add('High', 'clipped by ancestor', label(e), `${label(p)} ${JSON.stringify(b)} vs ${JSON.stringify(r)}`); break; }
    }
  }
  const phone = Math.min(innerWidth, innerHeight) <= 430 && Math.max(innerWidth, innerHeight) <= 932;
  for (const [selector, minimum, key] of [['.hand-row .tile', phone ? 30 : 40, 'hand width'], ['.pool-tile .tile', 18, 'pool width']]) {
    const values = $(selector).filter(visible).map(e => rect(e).w);
    if (values.length) { metrics[key] = +Math.min(...values).toFixed(2); if (metrics[key] < minimum - .1) add('Med', key, selector, `${metrics[key]}px < ${minimum}px`); }
  }
  for (const e of $('button, input, select, a.btn').filter(visible).filter(active)) {
    const target = e.matches('input[type=checkbox], input[type=radio]') ? [...(e.labels ?? [])].find(visible) ?? e : e;
    const r = rect(target); if (Math.min(r.w, r.h) < 31.9) add('Med', 'tap target', label(target), `${r.w.toFixed(1)}×${r.h.toFixed(1)}px < 32px`);
  }
  for (const e of $('body *').filter(visible).filter(active)) {
    if (e instanceof SVGElement) continue; // SVG tile glyphs scale with the measured tile.
    const css = getComputedStyle(e);
    const minimum = e.matches('.kim-badge') ? 8 : 10;
    if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(css.fontSize) < minimum) add('Med', 'text size', label(e), `${css.fontSize} < ${minimum}px`);
    if (e.matches('.hud-label, .seat-head strong, .mp-account-name, .options-panel-title, .wall-counter, .mp-code') && e.scrollWidth > e.clientWidth + 1 && /(hidden|clip)/.test(css.overflowX) && css.textOverflow !== 'ellipsis') add('Med', 'clipped label without ellipsis', label(e), `${e.scrollWidth} > ${e.clientWidth}px`);
  }
  for (const e of $('.hud-label').filter(visible)) {
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    const lines = new Set();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('svg')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width > 0) lines.add(Math.round(r.y));
    }
    if (lines.size > 1) add('Low', 'action label wraps', label(e), `${lines.size} lines; ${rect(e).w.toFixed(1)}px wide`);
  }
  function pair(a, b, key) {
    for (const x of $(a).filter(visible)) for (const y of $(b).filter(visible)) {
      if (x === y || x.contains(y) || y.contains(x)) continue;
      const overlap = intersects(rect(x), rect(y));
      if (overlap) add('Med', key, `${label(x)} / ${label(y)}`, JSON.stringify(overlap));
    }
  }
  pair('.wall-counter', '.pool-tile', 'SISA overlaps pool tile (known regression)');
  for (const wall of $('.wall-counter').filter(visible)) {
    const range = document.createRange(); range.selectNodeContents(wall);
    const r = range.getBoundingClientRect();
    const textBox = { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    for (const tile of $('.pool-tile').filter(visible)) {
      const overlap = intersects(textBox, rect(tile));
      if (overlap) add('Med', 'SISA text overlaps pool tile (known regression)', `${label(wall)} / ${label(tile)}`, JSON.stringify(overlap));
    }
  }
  for (const tile of $('.pool-tile').filter(visible)) {
    const frame = tile.closest('.pool-frame'); const r = rect(tile), b = rect(frame);
    if (r.x < b.x - 1 || r.right > b.right + 1 || r.y < b.y - 1 || r.bottom > b.bottom + 1) add('High', 'pool tile outside frame', label(tile), JSON.stringify(r));
  }
  pair('.pending-discard', '.center-prompt, .turn-prompt, .table-stage', 'center prompt overlaps discard');
  pair('.chat-panel', '.table-info, .hand-row', 'chat overlap');
  // A seat box is a loose container: compare the chat with what the seat shows (name, badges, melds, rack, flowers, tiles).
  // Seat content painted under an open Opsi panel is hidden anyway, so a chat tab on the panel head can't cover it.
  const underPanel = (a, b) => {
    const stack = document.elementsFromPoint((Math.max(a.x, b.x) + Math.min(a.right, b.right)) / 2, (Math.max(a.y, b.y) + Math.min(a.bottom, b.bottom)) / 2);
    const panel = stack.findIndex(e => e.matches('.options-panel')), seat = stack.findIndex(e => e.closest('.seat-panel'));
    return panel >= 0 && (seat < 0 || panel < seat);
  };
  for (const chat of $('.chat-panel').filter(visible)) for (const seat of $('.seat-panel').filter(visible)) {
    for (const part of [...seat.querySelectorAll('.seat-head strong, .badges, .melds, .rack, .flowers, .tile')].filter(visible)) {
      const overlap = intersects(rect(chat), rect(part));
      if (overlap && !underPanel(rect(chat), rect(part))) { add('Med', 'chat overlap', `${label(chat)} / ${label(seat)} content ${label(part)}`, JSON.stringify(overlap)); break; }
    }
  }
  pair('.action-hud', '.online-warning, .kong-toast, .mp-countdown', 'action HUD overlap');
  pair('.claim-banner', '.online-warning, .kong-toast, .mp-countdown', 'claim banner overlap');
  pair('.table-info', '.hand-row', 'table info overlaps hand');
  pair('.seat-panel .melds, .seat-panel .rack', '.seat-panel .seat-head, .human-area .seat-head, .human-area .hand-row', 'seat sets overlap player labels or hand');
  for (const seat of $('.seat-panel, .human-area').filter(visible)) {
    const boxes = [...seat.querySelectorAll('.seat-head strong, .badges, .melds, .rack')].filter(visible);
    for (let i = 0; i < boxes.length; i++) for (const b of boxes.slice(i + 1)) {
      const a = boxes[i]; if (a.contains(b) || b.contains(a)) continue;
      const overlap = intersects(rect(a), rect(b)); if (overlap) add('Med', 'seat boxes overlap', `${label(seat)}: ${label(a)} / ${label(b)}`, JSON.stringify(overlap));
    }
  }
  for (const body of $('.panel-body').filter(visible)) {
    const before = body.scrollTop; body.scrollTop = body.scrollHeight;
    const last = body.lastElementChild; const lastBox = last ? rect(last) : null;
    metrics.modal = { clientHeight: body.clientHeight, scrollHeight: body.scrollHeight, maxScroll: body.scrollTop, overflowY: getComputedStyle(body).overflowY, lastBottom: lastBox?.bottom, bodyBottom: rect(body).bottom };
    if (body.scrollHeight > body.clientHeight + 1 && (!/(auto|scroll)/.test(getComputedStyle(body).overflowY) || body.scrollTop === 0 || (lastBox && lastBox.bottom > rect(body).bottom + 2))) add('High', 'modal last row unreachable', label(body), JSON.stringify(metrics.modal));
    body.scrollTop = before;
  }
  metrics.knownRegressions = { sisa: findings.some(f => f.check.startsWith('SISA')), jia789Wrap: findings.some(f => f.check === 'action label wraps' && f.element.includes('Jia 7-8-9')) };
  const assets = [];
  for (const e of $('img').filter(visible)) assets.push({ url: e.currentSrc || e.src, natural: [e.naturalWidth, e.naturalHeight], rendered: [rect(e).w, rect(e).h], type: 'img' });
  for (const e of $('body *').filter(visible)) {
    const urls = [...getComputedStyle(e).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)].map(m => m[1]);
    for (const url of urls) assets.push({ url: new URL(url, location.href).href, rendered: [rect(e).w, rect(e).h], type: 'background' });
  }
  return { measurementVersion: 4, state: document.querySelector('[data-layout-audit]')?.getAttribute('data-layout-audit'), size: [innerWidth, innerHeight], findings, metrics, assets, text: document.body.innerText.slice(0, 150) };
}

const records = [];
const resultsPath = resolve(root, 'results.json');
// Filtered runs update only their cells, preserving the rest of the previous matrix.
try { records.push(...JSON.parse(readFileSync(resultsPath, 'utf8'))); } catch {}
for (const record of records) if (record.findings) record.findings = record.findings.filter(f => f.check !== 'action label wraps' || f.element.includes('Jia'));
for (const record of records) for (const finding of record.findings ?? []) if (finding.check === 'pool tile outside frame') finding.severity = 'High';
function report() {
  writeFileSync(resultsPath, JSON.stringify(records, null, 2) + '\n');
  const rank = { High: 0, Med: 1, Low: 2 };
  const rows = records.flatMap(r => r.error ? [{ severity: 'High', check: 'render failed', element: '', actual: r.error, ...r }] : r.findings.map(f => ({ ...f, viewport: r.viewport, state: r.state, shot: r.shot }))).sort((a, b) => rank[a.severity] - rank[b.severity]);
  const escape = s => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const summary = `# Layout audit\n\nGenerated ${new Date().toISOString()}. Measurements are CSS pixels, using Orca embedded Chromium. Fixtures use 12-character player names.\n\nRe-run: \`node scripts/layout-audit.mjs [--state claims] [--viewport 844x390]\`. Start Vite at :5199 first; override with --url, and optionally pin --page. Full matrix: ${states.length} states × ${viewports.length} viewports = ${states.length * viewports.length} cells. Recorded: ${records.length}; render failures: ${records.filter(r => r.error).length}.\n\n## Findings (severity sorted)\n\nHigh = hidden, clipped or unusable; Med = overlap or below minimum; Low = cosmetic. Repeated instances are retained in results.json; identical check/element/value within a cell is shown once below. Rectangle intersections are candidates for review; modal-over-table is intentionally excluded from the visibility checks.\n\n| Severity | Viewport | State | Check / elements | Actual | Screenshot |\n| --- | --- | --- | --- | --- | --- |\n`;
  const seen = new Set();
  writeFileSync(resolve(root, 'report.md'), summary + rows.filter(r => { const key = JSON.stringify([r.viewport, r.state, r.check, r.element, r.actual]); if (seen.has(key)) return false; seen.add(key); return true; }).map(r => `| ${r.severity} | ${r.viewport} | ${r.state} | ${escape(r.check)}: ${escape(r.element)} | ${escape(r.actual)} | [shot](${r.shot}) |`).join('\n') + '\n\n## Coverage and already fine\n\nSee results.json for each cell, minima, modal scroll geometry and asset dimensions. Empty findings mean all implemented checks passed for that cell. SVG tile art is resolution independent. Body/document vertical scrolling is allowed on menus; table controls must fit the viewport or an explicit scroll container. Native SVG glyphs are excluded from the CSS text-size threshold.\n\n| State | Measured viewports | Failed | Clean cells |\n| --- | --- | --- | --- |\n' + states.map(s => { const rs = records.filter(r => r.state === s); return `| ${s} | ${rs.filter(r => !r.error).length} / ${viewports.length} | ${rs.filter(r => r.error).length} | ${rs.filter(r => !r.error && !r.findings.length).length} |`; }).join('\n') + '\n\n## Scope and limits\n\nFixtures use real RemoteTableView and online modals with fabricated public SeatView data. Hu has 30 receipt rows. History currently covers the empty-history screen. Admin uses fake local responses, never real accounts. Logged-in account panels use a 12-character name. Audit does not prove OS keyboard/safe-area behavior or physical touch accuracy. Background asset resolution and file sizes are in assets.json. Contact sheets are omitted; every cell has a screenshot.\n');
}
let loadedState = null;
for (const state of selectedStates) for (const viewport of selectedViews) {
  if (process.argv.includes('--resume') && records.some(r => r.state === state && r.viewport === viewport && !r.error && r.measurementVersion === 4)) continue;
  const [width, height] = viewport.split('x');
  const shot = `shots/${state}-${viewport}.png`;
  try {
    if (loadedState !== state) {
      orca('goto', ['--url', `${arg('--url') || 'http://localhost:5199/'}?demo=online&state=${state}`]);
      loadedState = state;
    }
    orca('viewport', ['--width', width, '--height', height]);
    await new Promise(r => setTimeout(r, 100));
    let result;
    for (let attempt = 0; attempt < 15; attempt++) {
      result = evaluate(measure);
      if (result.state === state) break;
      await new Promise(r => setTimeout(r, 150));
    }
    if (result.state !== state) throw Error(`Fixture did not render: ${JSON.stringify(result)}`);
    if (result.size[0] !== Number(width) || result.size[1] !== Number(height)) throw Error(`Viewport mismatch: ${result.size} instead of ${viewport}`);
    if (state === 'turn') {
      orca('eval', ['--expression', "document.querySelector('.hand-row button')?.click()"]);
      result = evaluate(measure);
    }
    const settling = settleLayout();
    result = evaluate(measure);
    result.metrics.settling = settling;
    if (!settling.settled) result.findings.push({ severity: 'High', check: 'layout did not settle', element: '.pool-tile, .seat-panel', actual: JSON.stringify(settling) });
    copyFileSync(orca('screenshot').path, resolve(root, shot));
    const old = records.findIndex(r => r.state === state && r.viewport === viewport); if (old >= 0) records.splice(old, 1);
    records.push({ ...result, viewport, shot });
    console.log(`${state} ${viewport}: ${result.findings.length} findings`);
  } catch (error) {
    const old = records.findIndex(r => r.state === state && r.viewport === viewport); if (old >= 0) records.splice(old, 1);
    records.push({ state, viewport, shot, error: String(error) });
    console.error(`${state} ${viewport}: ${error}`);
  }
  report();
}

const files = [];
function walk(path) { for (const name of readdirSync(path)) { const p = resolve(path, name); if (statSync(p).isDirectory()) walk(p); else if (/\.(png|jpe?g|webp|ico|svg|webmanifest)$/i.test(name)) {
  const data = readFileSync(p); let natural;
  if (extname(p) === '.png') natural = [data.readUInt32BE(16), data.readUInt32BE(20)];
  if (extname(p) === '.ico') natural = Array.from({ length: data.readUInt16LE(4) }, (_, i) => [data[6 + i * 16] || 256, data[7 + i * 16] || 256]);
  if (extname(p) === '.svg') natural = /viewBox="([^"]+)"/.exec(data.toString())?.[1] || 'vector';
  files.push({ path: relative('.', p).replaceAll('\\', '/'), bytes: statSync(p).size, oversized: statSync(p).size > 256 * 1024, natural });
} } }
walk('public'); walk('src/assets');
const images = new Map();
for (const record of records) for (const asset of record.assets ?? []) {
  if (!asset.natural) {
    const url = new URL(asset.url); const path = resolve('public', url.pathname.slice(1));
    try { const data = readFileSync(path); if (extname(path) === '.png') asset.natural = [data.readUInt32BE(16), data.readUInt32BE(20)]; } catch {}
  }
  const key = JSON.stringify([asset.url, asset.rendered]);
  images.set(key, { ...asset, dpr: [1, 2, 3].map(dpr => ({ dpr, required: asset.rendered.map(n => Math.ceil(n * dpr)), sufficient: asset.natural ? asset.natural[0] >= asset.rendered[0] * dpr && asset.natural[1] >= asset.rendered[1] * dpr : 'requires natural dimensions' })) });
}
writeFileSync(resolve(root, 'assets.json'), JSON.stringify({ files, images: [...images.values()], manifest: JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')), metadata: readFileSync('index.html', 'utf8').split('\n').filter(l => /og:|twitter:|icon/.test(l)) }, null, 2) + '\n');
report();

// A light contact sheet per state needs no image-processing package.
for (const state of states) {
  const cells = records.filter(r => r.state === state && !r.error);
  writeFileSync(resolve(root, `${state}.html`), `<!doctype html><meta charset="utf-8"><title>${state} layout audit</title><style>body{font:14px system-ui;background:#eee;margin:24px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}figure{margin:0}img{max-width:100%;max-height:500px;object-fit:contain;object-position:top}figcaption{padding:8px}</style><h1>${state}</h1><main>${cells.map(r => `<figure><a href="${r.shot}"><img loading="lazy" src="${r.shot}" alt="${state} at ${r.viewport}"></a><figcaption>${r.viewport} · ${r.findings.length} findings</figcaption></figure>`).join('')}</main>`);
}
const successful = records.filter(r => !r.error);
const groups = new Map();
for (const r of successful) for (const f of r.findings) {
  const key = `${f.severity}: ${f.check}`; const group = groups.get(key) || { cells: new Set(), example: `${r.state} ${r.viewport}: ${f.actual}` };
  group.cells.add(`${r.state}/${r.viewport}`); groups.set(key, group);
}
const missing = states.flatMap(state => viewports.filter(viewport => !records.some(r => r.state === state && r.viewport === viewport && !r.error)).map(viewport => `${state} ${viewport}`));
const overview = `\n## Overview\n\n${successful.length} successful cells; ${missing.length} unavailable cells. ${missing.length ? `Not rendered: ${missing.join(', ')}. See failure rows for reasons.` : 'Every requested state rendered at every requested viewport.'}\n\n| Severity / check | Affected cells | Example measured value |\n| --- | --- | --- |\n${[...groups].sort(([a], [b]) => ['High', 'Med', 'Low'].indexOf(a.split(':')[0]) - ['High', 'Med', 'Low'].indexOf(b.split(':')[0])).map(([key, value]) => `| ${key} | ${value.cells.size} | ${value.example.replaceAll('|', '\\|')} |`).join('\n')}\n\nAlready fine (each check independently):\n\n- No horizontal page overflow in ${successful.filter(r => !r.findings.some(f => f.check === 'horizontal scroll')).length}/${successful.length} cells.\n- Hand tile width meets the requested minimum in ${successful.filter(r => r.metrics['hand width'] !== undefined && !r.findings.some(f => f.check === 'hand width')).length} cells with a hand.\n- Pool tile width meets 18px in ${successful.filter(r => r.metrics['pool width'] !== undefined && !r.findings.some(f => f.check === 'pool width')).length} cells with pool tiles.\n- All modal scroll and footer visibility checks pass in ${successful.filter(r => r.metrics.modal && !r.findings.some(f => f.check === 'modal last row unreachable' || ((f.check === 'outside viewport' || f.check === 'clipped by ancestor') && f.element.includes('btn')))).length} modal cells.\n\nContact sheets: ${states.map(s => `[${s}](${s}.html)`).join(' · ')}.\n`;
const assetRows = [...images.values()].map(a => `| ${a.url.split('/').at(-1)} | ${a.type} | ${a.natural?.join('×') ?? 'unknown'} | ${a.rendered.map(n => n.toFixed(1)).join('×')} | ${a.dpr.map(d => `${d.dpr}x: ${d.required.join('×')} ${d.sufficient === true ? 'OK' : d.sufficient === false ? 'undersized' : 'unknown'}`).join('; ')} |`).join('\n');
const assetsText = `\n## Assets\n\nDPR values below are required source pixels for the observed CSS size; they are predictions at 1x/2x/3x, rather than device emulation. SVG tile art has no raster resolution limit. Oversized threshold: 256 KiB. No OG or Twitter image is declared in index.html.\n\n| File | Bytes | Natural pixels / viewBox | Oversized |\n| --- | --- | --- | --- |\n${files.map(f => `| ${f.path} | ${f.bytes} | ${JSON.stringify(f.natural ?? '')} | ${f.oversized ? 'yes' : 'no'} |`).join('\n')}\n\nManifest declarations: ${JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')).icons.map(i => `${i.src} ${i.sizes} (${i.purpose})`).join('; ')}. Compare declarations against the measured natural dimensions above; favicon and apple-touch-icon are included.\n\n| Rendered image | Type | Natural | Rendered CSS px | Required pixels at DPR |\n| --- | --- | --- | --- | --- |\n${assetRows}\n`;
const reportPath = resolve(root, 'report.md');
let reportText = readFileSync(reportPath, 'utf8').replace('History currently covers the empty-history screen.', 'History contains 40 fabricated online hand records.').replace('Contact sheets are omitted; every cell has a screenshot.', 'Every cell has a screenshot and each state has an HTML contact sheet.');
reportText = reportText.replace('## Findings (severity sorted)', `${overview}\n## Findings (severity sorted)`);
writeFileSync(reportPath, reportText + assetsText);
if (records.some(r => selectedStates.includes(r.state) && selectedViews.includes(r.viewport) && r.error)) process.exitCode = 1;
