/* global Office Word console navigator window */

/**
 * The 5 production ribbon buttons decided in ADR 0008. None of them are implemented yet:
 * per the ADR, no production code should be written on top of the clipboard/OOXML behavior
 * these depend on until spikes 1-2 have actually run in a real Word desktop (see
 * docs/adr/0008-word-addin-ribbon-platform-spike.md §5). Each stub only proves the button is
 * wired end-to-end (manifest -> Office.actions.associate -> handler -> event.completed()).
 */
async function notImplemented(label: string, event: Office.AddinCommands.Event): Promise<void> {
  console.log(`[md2docx] "${label}" n'est pas encore implémenté (bloqué sur les spikes ADR 0008).`);
  event.completed();
}

export async function loadMarkdown(event: Office.AddinCommands.Event): Promise<void> {
  await notImplemented("Charger un .md", event);
}

export async function saveAsMarkdown(event: Office.AddinCommands.Event): Promise<void> {
  await notImplemented("Enregistrer sous .md", event);
}

export async function cutAsMarkdown(event: Office.AddinCommands.Event): Promise<void> {
  await notImplemented("Couper en MD", event);
}

export async function copyAsMarkdown(event: Office.AddinCommands.Event): Promise<void> {
  await notImplemented("Copier en MD", event);
}

export async function pasteMarkdown(event: Office.AddinCommands.Event): Promise<void> {
  await notImplemented("Coller en MD", event);
}

// --- Spike harness (dev-only ribbon button, ADR 0008 §5/§6) --------------------------------
//
// Runs spikes 1 and 2 from a real Word desktop and reports the results in a copyable dialog.
// Spike 3 (do the 5 buttons above render/behave correctly?) isn't something code can check —
// it's a visual confirmation the maintainer makes by looking at the ribbon, so the harness just
// reminds them to note it.

export interface SpikeResult {
  ok: boolean;
  detail: string;
}

export interface SpikeResults {
  timestamp: string;
  clipboardWrite: SpikeResult;
  clipboardRead: SpikeResult;
  getOoxml: SpikeResult;
  spike3Reminder: string;
}

const CLIPBOARD_SAFETY_NET =
  "Filet de sécurité prévu si ça échoue : boîte de dialogue avec zone de collage manuel (Ctrl+V), voir ADR 0008 §3.";

export async function runSpike1Clipboard(): Promise<{ write: SpikeResult; read: SpikeResult }> {
  const probe = `md2docx-spike-${Date.now()}`;

  let write: SpikeResult;
  try {
    await navigator.clipboard.writeText(probe);
    write = { ok: true, detail: "navigator.clipboard.writeText() a réussi sans erreur." };
  } catch (error) {
    write = {
      ok: false,
      detail: `navigator.clipboard.writeText() a levé une erreur : ${String(error)}`,
    };
  }

  let read: SpikeResult;
  try {
    const text = await navigator.clipboard.readText();
    read =
      text === probe
        ? { ok: true, detail: "navigator.clipboard.readText() a relu exactement la valeur écrite." }
        : {
            ok: false,
            detail: `navigator.clipboard.readText() a renvoyé une valeur différente de celle écrite (${JSON.stringify(
              text
            )}). ${CLIPBOARD_SAFETY_NET}`,
          };
  } catch (error) {
    read = {
      ok: false,
      detail: `navigator.clipboard.readText() a levé une erreur : ${String(error)}. ${CLIPBOARD_SAFETY_NET}`,
    };
  }

  return { write, read };
}

const OOXML_PREVIEW_MAX_CHARS = 4000;

export async function runSpike2Ooxml(): Promise<SpikeResult> {
  try {
    return await Word.run(async (context) => {
      const range = context.document.getSelection();
      const ooxml = range.getOoxml();
      await context.sync();
      // getOoxml() returns an OfficeExtension.ClientResult<string>, not a loadable proxy object:
      // .value is populated by context.sync() alone, no .load() call exists or is needed (see
      // Microsoft's own samples). The rule's getFunctions.json flags every "get*" Office.js method
      // by name regardless of return type, so it can't tell ClientResult apart from Range getters.
      // eslint-disable-next-line office-addins/load-object-before-read -- false positive, see above
      const xml = ooxml.value;
      const preview =
        xml.length > OOXML_PREVIEW_MAX_CHARS
          ? `${xml.slice(0, OOXML_PREVIEW_MAX_CHARS)}\n… (tronqué)`
          : xml;
      return {
        ok: true,
        detail: `range.getOoxml() a réussi. Longueur totale : ${xml.length} caractères.\n\n${preview}`,
      };
    });
  } catch (error) {
    return { ok: false, detail: `range.getOoxml() a levé une erreur : ${String(error)}` };
  }
}

export async function collectSpikeResults(): Promise<SpikeResults> {
  const [clipboard, getOoxml] = await Promise.all([runSpike1Clipboard(), runSpike2Ooxml()]);
  return {
    timestamp: new Date().toISOString(),
    clipboardWrite: clipboard.write,
    clipboardRead: clipboard.read,
    getOoxml,
    spike3Reminder:
      "Spike 3 ne se vérifie pas par code : confirmez à l'œil que les 5 boutons Md2Docx du ruban " +
      "(Charger, Enregistrer sous, Couper/Copier/Coller en MD) s'affichent et répondent au clic, " +
      "puis notez le résultat des 3 spikes dans docs/adr/0008-word-addin-ribbon-platform-spike.md.",
  };
}

function openResultsDialog(results: SpikeResults): void {
  const payload = encodeURIComponent(JSON.stringify(results));
  const dialogUrl = `${window.location.origin}/spike-results.html?data=${payload}`;
  Office.context.ui.displayDialogAsync(
    dialogUrl,
    { height: 60, width: 50, promptBeforeOpen: false },
    (asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Failed) {
        console.error(`displayDialogAsync a échoué : ${asyncResult.error.message}`);
      }
    }
  );
}

export async function runSpikes(event: Office.AddinCommands.Event): Promise<void> {
  try {
    const results = await collectSpikeResults();
    // localStorage is same-origin (https://localhost:3000) between the hidden function-command
    // runtime and the dialog page, so it's the primary channel; the URL query string above is a
    // fallback in case that sharing doesn't hold in the real function-command runtime — which is
    // itself exactly the kind of thing spike 1 is checking for the clipboard API.
    try {
      window.localStorage.setItem("md2docx:lastSpikeResults", JSON.stringify(results));
    } catch (error) {
      console.error(`Écriture localStorage impossible : ${String(error)}`);
    }
    openResultsDialog(results);
  } finally {
    event.completed();
  }
}

Office.onReady(() => {
  Office.actions.associate("loadMarkdown", loadMarkdown);
  Office.actions.associate("saveAsMarkdown", saveAsMarkdown);
  Office.actions.associate("cutAsMarkdown", cutAsMarkdown);
  Office.actions.associate("copyAsMarkdown", copyAsMarkdown);
  Office.actions.associate("pasteMarkdown", pasteMarkdown);
  Office.actions.associate("runSpikes", runSpikes);
});
