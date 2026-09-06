import assert from "node:assert/strict";
import { test } from "node:test";
import { OfficeMockObject } from "office-addin-mock";

import { runSpike1Clipboard, runSpike2Ooxml } from "../../src/commands/commands.word";

/**
 * These tests exercise the spike-harness logic (ADR 0008 §6) without any Office app open, using
 * office-addin-mock for Word.run/context/range and a hand-rolled navigator.clipboard stub (the
 * Clipboard API is a Web API, not an Office.js host object, so office-addin-mock doesn't cover
 * it). They can only prove the call sequence and result shape are right — they cannot replace
 * spikes 1-2 themselves, which need a real Word desktop (see HANDOVER.md / ADR 0008).
 */

function installClipboardMock(overrides?: {
  writeText?: (text: string) => Promise<void>;
  readText?: () => Promise<string>;
}): void {
  let stored = "";
  // Node 21+ ships a built-in read-only `navigator` global, so replace `navigator.clipboard`
  // rather than `navigator` itself.
  (navigator as unknown as { clipboard: unknown }).clipboard = {
    writeText: overrides?.writeText ?? (async (text: string) => {
      stored = text;
    }),
    readText: overrides?.readText ?? (async () => stored),
  };
}

test("runSpike1Clipboard reports success when readText echoes what writeText wrote", async () => {
  installClipboardMock();
  const { write, read } = await runSpike1Clipboard();
  assert.equal(write.ok, true);
  assert.equal(read.ok, true);
});

test("runSpike1Clipboard reports failure and mentions the safety net when readText throws", async () => {
  installClipboardMock({
    readText: async () => {
      throw new Error("NotAllowedError: no focus in this context");
    },
  });
  const { write, read } = await runSpike1Clipboard();
  assert.equal(write.ok, true);
  assert.equal(read.ok, false);
  assert.match(read.detail, /filet de sécurité/i);
});

test("runSpike2Ooxml returns the mocked OOXML through Word.run/getSelection/getOoxml", async () => {
  const WordMockData = {
    context: {
      document: {
        getSelection: function (this: { selectionRange: unknown }) {
          return this.selectionRange;
        },
        selectionRange: {
          getOoxml: function (this: { ooxmlResult: { load: () => void } }) {
            // office-addin-mock requires an explicit load() before sync() will populate the
            // wrapped value — real Word's ClientResult.getOoxml() needs no such call.
            this.ooxmlResult.load();
            return this.ooxmlResult;
          },
          ooxmlResult: { value: "<pkg:package>MOCK-OOXML</pkg:package>" },
        },
      },
    },
    run: async function (this: { context: unknown }, callback: (context: unknown) => unknown) {
      return await callback(this.context);
    },
  };

  (globalThis as unknown as { Word: unknown }).Word = new OfficeMockObject(WordMockData);

  const result = await runSpike2Ooxml();
  assert.equal(result.ok, true);
  assert.match(result.detail, /MOCK-OOXML/);
  assert.match(result.detail, /Longueur totale/);
});

test("runSpike2Ooxml reports failure when Word.run rejects", async () => {
  const WordMockData = {
    context: {},
    run: async function () {
      throw new Error("Word.run is not available outside Word");
    },
  };

  (globalThis as unknown as { Word: unknown }).Word = new OfficeMockObject(WordMockData);

  const result = await runSpike2Ooxml();
  assert.equal(result.ok, false);
  assert.match(result.detail, /Word\.run is not available/);
});
