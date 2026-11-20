/**
 * The page: the editor, the engine's status and the conversion's steps. All the work happens in the
 * worker (worker.mjs); this side only shows what is going on, so the page never freezes.
 */

import { MESSAGES, preferredLanguage } from './i18n.mjs';
import { EXAMPLES } from './examples.mjs';
import { PANDOC_RELEASE } from './pandoc-release.mjs';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const editor = /** @type {HTMLTextAreaElement} */ ($('markdown'));
const convertButton = /** @type {HTMLButtonElement} */ ($('convert'));
const engineProgress = /** @type {HTMLProgressElement} */ ($('engine-progress'));
const engineAction = /** @type {HTMLButtonElement} */ ($('engine-action'));
const download = /** @type {HTMLAnchorElement} */ ($('download'));
const options = {
  smartArt: /** @type {HTMLInputElement} */ ($('opt-smartart')),
  nativeCharts: /** @type {HTMLInputElement} */ ($('opt-charts')),
  toc: /** @type {HTMLInputElement} */ ($('opt-toc')),
};

// --- per-viewer conveniences in localStorage (a draft, the options, the language) ------------------

const store = {
  get(key) {
    try {
      return localStorage.getItem(`md2nativedocx.${key}`);
    } catch {
      return null; // storage blocked (private window, site data off): the page works without it
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`md2nativedocx.${key}`, value);
    } catch {
      // same as above: nothing is remembered, nothing breaks
    }
  },
};

let lang = /** @type {'en' | 'fr'} */ (store.get('lang') === 'fr' || store.get('lang') === 'en' ? store.get('lang') : preferredLanguage());
let t = MESSAGES[lang];

// --- state ---------------------------------------------------------------------------------------

/** @type {{ phase: string, loaded?: number, total?: number, ms?: number, reason?: string }} */
let engine = { phase: 'idle' };
/** @type {null | { id: number, step: string, done?: number, total?: number, waiting: boolean }} total stays undefined until the diagrams are counted */
let job = null;
let nextJobId = 1;
let sourceName = '';
let downloadUrl = '';

const worker = new Worker('worker.js', { type: 'module' });

// --- text ----------------------------------------------------------------------------------------

function applyLanguage() {
  t = MESSAGES[lang];
  document.documentElement.lang = t.lang;
  document.title = `md2nativedocx: ${t.title}`;
  for (const el of document.querySelectorAll('[data-text]')) {
    const value = t[/** @type {keyof typeof t} */ (el.getAttribute('data-text'))];
    if (typeof value === 'string') el.textContent = value;
  }
  editor.placeholder = t.placeholder;
  $('engine-why-text').textContent = t.engineWhyText(mb(PANDOC_RELEASE.wasmBytes, 1), PANDOC_RELEASE.version);
  $('footer-pandoc').textContent = t.footerPandoc(PANDOC_RELEASE.version);
  const source = /** @type {HTMLAnchorElement} */ ($('footer-source'));
  source.href = `pandoc/pandoc-${PANDOC_RELEASE.version}-source.tar.gz`;
  renderEngine();
  renderEditorMeta();
  renderJob();
}

/** Megabytes with `digits` decimals, in the page's language. */
function mb(bytes, digits = 0) {
  return (bytes / 1e6).toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// --- engine status -------------------------------------------------------------------------------

function renderEngine() {
  const status = $('engine-status');
  status.className = 'status';
  engineProgress.hidden = true;
  engineAction.hidden = true;
  switch (engine.phase) {
    case 'idle':
      status.textContent = t.engineIdle;
      break;
    case 'saveData':
      status.textContent = t.engineSaveData;
      engineAction.textContent = t.engineLoadNow;
      engineAction.hidden = false;
      break;
    case 'download':
    case 'cache': {
      const loaded = engine.loaded ?? 0;
      const total = engine.total ?? PANDOC_RELEASE.wasmBytes;
      status.textContent = engine.phase === 'cache' ? t.engineCache : t.engineDownload(mb(loaded, 1), mb(total, 1));
      engineProgress.hidden = false;
      engineProgress.value = Math.round((loaded / total) * 100);
      break;
    }
    case 'verify':
      status.textContent = t.engineVerify;
      engineProgress.hidden = false;
      engineProgress.removeAttribute('value'); // indeterminate
      break;
    case 'compile':
      status.textContent = t.engineCompile;
      engineProgress.hidden = false;
      engineProgress.removeAttribute('value');
      break;
    case 'ready':
      status.textContent = t.engineReady(((engine.ms ?? 0) / 1000).toLocaleString(lang, { maximumFractionDigits: 1 }));
      status.className = 'status ok';
      break;
    case 'failed': {
      const text = { unsupported: t.engineUnsupported, network: t.engineNetwork, integrity: t.engineIntegrity }[engine.reason ?? ''] ?? t.engineInternal;
      status.textContent = text;
      status.className = 'status error';
      if (engine.reason !== 'unsupported') {
        engineAction.textContent = t.retry;
        engineAction.hidden = false;
      }
      break;
    }
  }
  // While the engine is not there yet, the "why" stays open: that is the question people have.
  /** @type {HTMLDetailsElement} */ ($('engine-why')).open = engine.phase !== 'ready' && engine.phase !== 'failed';
}

function startEngine() {
  engine = { phase: 'download', loaded: 0, total: PANDOC_RELEASE.wasmBytes };
  renderEngine();
  worker.postMessage({ type: 'start' });
}

// --- conversion ----------------------------------------------------------------------------------

const STEPS = ['read', 'diagrams', 'write', 'finish'];

function renderJob() {
  if (!job) return;
  const list = $('steps');
  list.replaceChildren();
  const add = (text, state) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (state) li.className = state;
    list.append(li);
  };
  if (job.waiting) {
    let text = t.stepWait;
    if (engine.phase === 'download' && engine.loaded && engine.total) text = t.stepWaitDownload(Math.round((engine.loaded / engine.total) * 100));
    else if (engine.phase === 'verify' || engine.phase === 'compile' || engine.phase === 'cache') text = t.stepWaitPrepare;
    add(text, 'active');
  }
  const current = job.waiting ? -1 : STEPS.indexOf(job.step);
  STEPS.forEach((step, index) => {
    const state = job?.step === 'done' || index < current ? 'done' : index === current ? 'active' : '';
    let text = { read: t.stepRead, write: t.stepWrite, finish: t.stepFinish }[step];
    if (step === 'diagrams') text = t.stepDiagrams(job?.done ?? 0, job?.total);
    add(/** @type {string} */ (text), state);
  });
}

function convert() {
  const markdown = editor.value;
  const result = $('result');
  result.hidden = false;
  const status = $('result-status');
  status.className = 'status';
  download.hidden = true;
  $('open-hint').hidden = true;
  $('warnings').hidden = true;
  if (!markdown.trim()) {
    $('steps').replaceChildren();
    status.textContent = t.emptyInput;
    job = null;
    return;
  }
  if (engine.phase === 'failed' || engine.phase === 'idle' || engine.phase === 'saveData') startEngine();
  status.textContent = '';
  job = { id: nextJobId++, step: 'read', done: 0, total: undefined, waiting: engine.phase !== 'ready' };
  convertButton.disabled = true;
  convertButton.textContent = job.waiting ? t.convertQueued : t.converting;
  renderJob();
  worker.postMessage({
    type: 'convert',
    id: job.id,
    markdown,
    options: { smartArt: options.smartArt.checked, nativeCharts: options.nativeCharts.checked, toc: options.toc.checked },
  });
  if (window.matchMedia('(max-width: 860px)').matches) result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function finishJob() {
  convertButton.disabled = false;
  convertButton.textContent = t.convert;
}

/** A file name for the result: the opened file's, else the document's title or first heading. */
function outputName() {
  let base = sourceName.replace(/\.[^.]+$/, '');
  if (!base) {
    const text = editor.value;
    const title = /^---\s*\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m.exec(text)?.[1] ?? /^#\s+(.+)$/m.exec(text)?.[1] ?? '';
    base = title;
  }
  base = base.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base || 'document'}.docx`;
}

worker.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'engine') {
    engine = { ...engine, ...message };
    renderEngine();
    if (message.phase === 'ready' && job?.waiting) {
      job.waiting = false;
      convertButton.textContent = t.converting;
    }
    if (job) renderJob();
  } else if (message.type === 'engine-failed') {
    engine = { phase: 'failed', reason: message.reason };
    renderEngine();
    // A queued conversion receives its own "failed" message from the worker.
  } else if (message.type === 'progress' && job && message.id === job.id) {
    job.waiting = false;
    job.step = message.step;
    if (message.step === 'diagrams') {
      job.done = message.done;
      job.total = message.total;
    }
    convertButton.textContent = t.converting;
    renderJob();
  } else if (message.type === 'done' && job && message.id === job.id) {
    job.step = 'done';
    renderJob();
    finishJob();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([message.docx], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const name = outputName();
    download.href = downloadUrl;
    download.download = name;
    download.textContent = t.download(name);
    download.hidden = false;
    $('open-hint').hidden = false;
    const status = $('result-status');
    status.className = 'status ok';
    status.textContent = t.done((message.ms / 1000).toLocaleString(lang, { maximumFractionDigits: 1 }), message.diagrams);
    const warnings = /** @type {string[]} */ (message.warnings);
    $('warnings').hidden = warnings.length === 0;
    $('warnings-title').textContent = t.warningsTitle(warnings.length);
    $('warnings-list').replaceChildren(...warnings.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
    download.focus();
  } else if (message.type === 'failed' && job && message.id === job.id) {
    finishJob();
    $('steps').replaceChildren();
    const status = $('result-status');
    status.className = 'status error';
    status.textContent = `${t.failed} ${message.message}`;
    job = null;
  }
};

worker.onerror = (event) => {
  event.preventDefault();
  engine = { phase: 'failed', reason: 'internal' };
  renderEngine();
  finishJob();
};

// --- editor --------------------------------------------------------------------------------------

function renderEditorMeta() {
  $('source-name').textContent = sourceName ? t.loadedFrom(sourceName) : '';
  $('char-count').textContent = editor.value ? t.charCount(editor.value.length) : '';
}

let saveTimer = 0;
editor.addEventListener('input', () => {
  renderEditorMeta();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => store.set('draft', editor.value), 400);
});

function setText(text, name = '') {
  editor.value = text;
  sourceName = name;
  store.set('draft', text);
  renderEditorMeta();
}

/** @param {File} file */
async function openFile(file) {
  setText(await file.text(), file.name);
  editor.focus();
}

const fileInput = /** @type {HTMLInputElement} */ ($('file-input'));
$('open-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) openFile(file);
  fileInput.value = '';
});
$('load-example').addEventListener('click', () => setText(EXAMPLES[lang]));
$('clear').addEventListener('click', () => {
  setText('');
  editor.focus();
});

const wrap = $('editor-wrap');
wrap.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  wrap.classList.add('dragging');
});
wrap.addEventListener('dragleave', () => wrap.classList.remove('dragging'));
wrap.addEventListener('drop', (event) => {
  wrap.classList.remove('dragging');
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  event.preventDefault();
  openFile(file);
});

// --- options and language --------------------------------------------------------------------------

for (const [key, input] of Object.entries(options)) {
  const saved = store.get(`option.${key}`);
  if (saved === 'true' || saved === 'false') input.checked = saved === 'true';
  input.addEventListener('change', () => store.set(`option.${key}`, String(input.checked)));
}

$('lang-switch').addEventListener('click', () => {
  lang = lang === 'fr' ? 'en' : 'fr';
  store.set('lang', lang);
  applyLanguage();
  if (!job) convertButton.textContent = t.convert;
});

convertButton.addEventListener('click', convert);
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !convertButton.disabled) convert();
});
engineAction.addEventListener('click', startEngine);

// --- start -------------------------------------------------------------------------------------------

// First visit: the example, so there is something to convert; afterwards, the last draft (even empty).
setText(store.get('draft') ?? EXAMPLES[lang]);
applyLanguage();
// Start downloading the engine right away (it is what the page is for), unless the browser asks to save
// data: then the person decides.
const connection = /** @type {{ saveData?: boolean } | undefined} */ (/** @type {any} */ (navigator).connection); // not in every browser's types
if (connection?.saveData) {
  engine = { phase: 'saveData' };
  renderEngine();
} else {
  startEngine();
}
