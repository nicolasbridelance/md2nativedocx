# md2nativedocx

[![CI](https://github.com/nicolasbridelance/md2nativedocx/actions/workflows/ci.yml/badge.svg)](https://github.com/nicolasbridelance/md2nativedocx/actions/workflows/ci.yml)
[![CodeQL](https://github.com/nicolasbridelance/md2nativedocx/actions/workflows/codeql.yml/badge.svg)](https://github.com/nicolasbridelance/md2nativedocx/actions/workflows/codeql.yml)

Convertir du Markdown avec des diagrammes **Mermaid** en un `.docx` complet avec des
**formes vectorielles OOXML natives et éditables** — pas des PNG aplatis.

> **Positionnement.** Tous les outils existants réduisent les diagrammes (Mermaid, Graphviz,
> PlantUML) à une image PNG intégrée. Le texte source est parfois conservé en fallback, jamais la
> structure vectorielle. `md2nativedocx` fait l'inverse : chaque nœud, chaque arête devient une
> forme Word native, sélectionnable et modifiable individuellement.

> **Compliance & confiance.** Licence, dépendances, analyse de risque IT, coût réel, et un guide
> sans jargon pour les non-techniciens — chacun trouve directement ce qui le concerne dans
> [`docs/compliance/`](docs/compliance/README.md).

| | PNG intégré (outils existants) | **md2nativedocx (OOXML natif)** |
|---|---|---|
| Formes éditables dans Word | ❌ | ✅ Chaque nœud/arête est une forme |
| Texte modifiable | ❌ | ✅ Labels natifs |
| Connecteurs dynamiques | ❌ | ✅ Connecteurs magnétiques (`stCxn`/`endCxn`) |
| Fidélité à l'aperçu Mermaid | ~ | ✅ Même moteur de layout (Dagre) |
| Dépendance à un rendu externe | Oui (image) | Non (vectoriel) |
| Formules LaTeX en équations Word natives | Variable selon l'outil | ✅ via Pandoc, gratuit (voir §2) |

Comparaison nominative avec les extensions VS Code concurrentes (installs, méthode de rendu
vérifiée dans leur propre doc) : voir `docs/specs/cahier_des_charges.md` §12.1, ou directement le
[README de l'extension](packages/vscode-extension/README.md).

## Comment ça marche

```
Markdown + ```mermaid  ──►  Pandoc (parsing MD, tables, style, ZIP)
                              │
                              └─►  filtre Lua md2nativedocx
                                      │
                                      └─►  core (parseur → layout Dagre → traducteur OOXML)
                                              │
                                              └─►  fragment wpg:wgp natif injecté dans le .docx
```

L'architecture délègue à Pandoc tout ce qui n'est pas diagramme (parsing Markdown, tableaux,
style, manipulation ZIP) et ne construit que le module manquant : layout + traduction OOXML d'un
diagramme. Voir `docs/specs/cahier_des_charges.md` pour le détail.

## Installation

Prérequis : **Node.js ≥ 18**, **Pandoc** (installé séparément), et un interpréteur **Lua** pour le
filtre.

```bash
npm install
npm run build
```

## Usage (CLI)

```bash
npx md2nativedocx rapport.md -o rapport.docx
```

Chaque bloc ```` ```mermaid ```` du document est converti en un groupe de dessin Word natif
(`wpg:wgp`) : formes vectorielles éditables, connecteurs dynamiques, texte natif.

## Développement

```bash
npm run build        # build tous les packages
npm run typecheck    # tsc --noEmit, strict
npm run lint         # ESLint + eslint-plugin-security
npm run test         # tests unitaires + golden
npm run test:fuzz    # tests property-based sur la frontière non fiable
npm run test:visual  # rendu LibreOffice headless + pixel-diff (CI)
```

## Documentation

- `docs/specs/cahier_des_charges.md` — le **quoi** et le **pourquoi** (spec, phases, scope).
- `AGENTS.md` — le **comment** (conventions, règles de sécurité non négociables).
- `docs/adr/` — décisions d'architecture (moteur de layout, intégration Pandoc).
- `TESTING.md` — les six chapitres de test, ce que chacun garantit, où il vit.
- `docs/compliance/` — licence, dépendances, analyse de risque IT, guide non-technicien.
- `CONTRIBUTING.md` — comment contribuer.

## Licence

**CC0 1.0 Universal** — domaine public. Voir `LICENSE` pour le texte légal complet.

> Note : Pandoc (GPL-2.0-or-later) est invoqué comme sous-processus externe — jamais lié à ce
> codebase. Dans l'extension VS Code, il est téléchargé automatiquement au premier export si absent
> (binaire officiel non modifié, vérifié par empreinte SHA-256, jamais embarqué dans le `.vsix`).
> Voir `AGENTS.md` → Licensing.