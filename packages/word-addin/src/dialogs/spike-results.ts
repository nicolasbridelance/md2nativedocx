/* global window document navigator console URLSearchParams HTMLTextAreaElement setTimeout */

import type { SpikeResults, SpikeResult } from "../commands/commands.word";

function readResults(): SpikeResults | undefined {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("data");
  if (fromUrl) {
    try {
      return JSON.parse(decodeURIComponent(fromUrl)) as SpikeResults;
    } catch (error) {
      console.error(`Paramètre "data" illisible : ${String(error)}`);
    }
  }
  try {
    const fromStorage = window.localStorage.getItem("md2docx:lastSpikeResults");
    if (fromStorage) {
      return JSON.parse(fromStorage) as SpikeResults;
    }
  } catch (error) {
    console.error(`Lecture localStorage impossible : ${String(error)}`);
  }
  return undefined;
}

function renderSpike(title: string, result: SpikeResult): string {
  const cls = result.ok ? "ok" : "fail";
  const badge = result.ok ? "OK" : "ÉCHEC";
  return `
    <div class="spike ${cls}">
      <h2>${title} — ${badge}</h2>
      <pre></pre>
    </div>`;
}

function render(results: SpikeResults): void {
  document.getElementById("timestamp")!.textContent = `Exécuté le ${results.timestamp}`;

  const container = document.getElementById("results")!;
  container.innerHTML =
    renderSpike("Spike 1a — clipboard.writeText()", results.clipboardWrite) +
    renderSpike("Spike 1b — clipboard.readText()", results.clipboardRead) +
    renderSpike("Spike 2 — range.getOoxml()", results.getOoxml) +
    `<div class="reminder"><strong>Spike 3</strong> — ${results.spike3Reminder}</div>`;

  // Set text via textContent (not innerHTML) so any XML/HTML in the OOXML preview is escaped.
  const pres = container.querySelectorAll(".spike pre");
  const detailOrder = [
    results.clipboardWrite.detail,
    results.clipboardRead.detail,
    results.getOoxml.detail,
  ];
  pres.forEach((pre, i) => {
    pre.textContent = detailOrder[i];
  });

  const raw = document.getElementById("raw") as HTMLTextAreaElement;
  raw.value = JSON.stringify(results, null, 2);
}

async function copyAll(): Promise<void> {
  const raw = document.getElementById("raw") as HTMLTextAreaElement;
  const status = document.getElementById("copy-status")!;
  try {
    await navigator.clipboard.writeText(raw.value);
    status.textContent = "Copié !";
  } catch {
    raw.select();
    document.execCommand("copy");
    status.textContent = "Copié (méthode de repli) !";
  }
  setTimeout(() => {
    status.textContent = "";
  }, 3000);
}

const results = readResults();
if (results) {
  render(results);
} else {
  document.getElementById("no-data")!.style.display = "block";
}
document.getElementById("copy-btn")!.addEventListener("click", () => {
  void copyAll();
});
