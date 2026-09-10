// Spike step 2: same parse, this time with a jsdom + DOMPurify shim, to see what
// Mermaid's internal Gantt db actually recovers once it can run at all — see
// spike.md Finding 3. Kept as a reproduction script, not something the product runs.
//
// Run: npm install (in this directory) && node test-parse-jsdom.mjs
//
// NOTE: same hashed-chunk caveat as test-parse-no-dom.mjs.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMPurify = (await import('dompurify')).default(dom.window);

const { diagram } = await import('mermaid/dist/chunks/mermaid.core/ganttDiagram-FUAMR5RP.mjs');

const text = `gantt
    title Adoption d'un logiciel
    dateFormat YYYY-MM-DD
    excludes weekends
    section Cadrage
    Recueil besoins      :done,    des1, 2026-01-05, 5d
    Choix outil          :active,  des2, after des1, 3d
    section Deploiement
    Formation            :crit,    des3, after des2, 4d
    Go-live              :milestone, des4, after des3, 0d
    Suivi post go-live   :         des5, after des4, 10d
`;

diagram.db.clear();
diagram.parser.yy = diagram.db;
diagram.parser.parse(text);

console.log('title:', diagram.db.getDiagramTitle());
console.log('excludes:', diagram.db.getExcludes());
console.log('dateFormat:', diagram.db.getDateFormat());
const tasks = diagram.db.getTasks();
for (const t of tasks) {
  console.log({
    id: t.id,
    task: t.task,
    section: t.section,
    start: t.startTime,
    end: t.endTime,
    milestone: t.milestone,
    classes: t.classes,
    active: t.active,
    done: t.done,
  });
}
