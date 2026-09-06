// Preloaded via `node --require` before any test file. commands.word.ts calls
// `Office.onReady(...)` as a module-level side effect (to register the add-in commands with the
// host), so `Office` must exist as a global before that module is ever required — this stub is
// only enough to satisfy that one call; per-test Office/Word behavior is mocked separately with
// office-addin-mock (see test/unit/spikes.test.ts).
globalThis.Office = globalThis.Office || { onReady: () => {} };
