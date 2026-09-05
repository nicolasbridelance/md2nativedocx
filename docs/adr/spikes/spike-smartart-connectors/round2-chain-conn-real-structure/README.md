# Round 2 — rebuilt from a real Word connector sample's structure

## Contexte

Round 1 (`../round1-chain-conn/`) reconstruted the `dgm:alg type="conn"` connector purely from
Microsoft's public parameter reference — schema-valid, but confirmed by the maintainer to render
**no visible arrow in real Word either**, ruling out "LibreOffice-only limitation". Same failure
mode as ADR 0004's first `hierarchy1` attempt: plausible against the schema, wrong in a detail the
parameter reference alone doesn't cover.

The maintainer already had a real Word-authored sample on disk: `handmade_samples/
processus_simple.docx`, a genuine "Processus" SmartArt (3 boxes with arrows, real `process1`
layout — confirmed via its `layout1.xml`'s `uniqueId`). Extracted and studied its `layout1.xml`/
`data1.xml` **structure only** (never their content — no `layoutDef`/`colorsDef`/`styleDef` value
from this file is read into the generator, same discipline as ADR 0004 Round 4/5).

## Trois écarts trouvés face au round 1

1. **`<dgm:shape type="conn"/>`** — round 1 left the connector's shape empty (`<dgm:shape/>`); the
   real layout always types it `"conn"`, the identifier that makes Word draw the algorithm's own
   connector geometry rather than nothing.
2. **`begPts="auto"` / `endPts="auto"`**, no `dim`, no `begSty`/`endSty` — round 1 hardcoded
   `dim="1D"`, explicit `midR`/`midL` points and arrow styles. The real layout lets `conn`'s own
   documented defaults do the work (`dim="2D"` — a filled 2D shape, not a thin line — `begSty=
   "noArr"`, `endSty="arr"`), and doesn't need direction-specific values at all, which also
   simplified `chain.ts`'s TD/BT/RL derivation (no more point substitution needed).
3. **`parTransId` always paired with `sibTransId`** on the same `parOf` cxn — round 1 wired
   `sibTransId` alone. Every `sibTransId`-bearing cxn in the real sample also carries a
   `parTransId`, even though this layout has no hierarchy to speak of. Added a `parTrans` content
   point per gap, unused by any `layoutNode`, purely for that pairing.

Also switched `colorsDef`/`styleDef`'s `sibTrans` styleLbl from a "visible line, no fill" recipe
(round 1's `dim="1D"` assumption) to "visible fill, no line" (`fillRef idx="1"`), matching `dim`
now defaulting to a filled 2D shape — and reordered `data1.xml`'s `ptLst` to interleave each node
with its own `parTrans`/`sibTrans` pair (`text, parTrans, sibTrans, text, ...`), matching the real
sample's physical order exactly, in case Word's engine relies on it for anything the `cxnLst` graph
alone doesn't capture.

## Vérifications faites

- **Tests unitaires** (`packages/core/test/unit/smartart-chain.test.ts`) : 293/293 côté
  `packages/core`, y compris les cas ajoutés en round 1 (nombre de transitions, mirroir de
  présentation, cas dégénéré à 1 nœud).
- **Schéma (Open XML SDK)** : `chain-conn.docx` (ce dossier) — **0 erreur sous
  `/word/diagrams/*`**.
- **LibreOffice headless** : toujours aucune flèche visible — attendu et non concluant (voir round
  1 : LibreOffice ne rend probablement pas l'algorithme `conn` du tout, indépendamment de la
  validité du câblage).

## Statut

**En attente d'un second test Word réel par le mainteneur** (`chain-conn.docx`, ce dossier).
