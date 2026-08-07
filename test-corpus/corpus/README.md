# Corpus de validation — chapitre 3 (voir `TESTING.md`)

Ce dossier contient les diagrammes Mermaid **sources** utilisés pour la validation
humaine dans Word et pour la conformité automatique (spec §9).

## Principe

Les diagrammes ne sont **pas écrits par ce projet** — ils proviennent de sources
officielles ou de référence, pour exercer une syntaxe réelle plutôt que celle que
nous écririons nous-mêmes.

## Provenance des sources (`source/`)

| Fichier source | Origine | Taille | Contenu |
|---|---|---|---|
| `mermaid-official-code-flow.mmd` | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) — `docs/diagrams/flowchart-code-flow.mmd` | ~9 Ko | Diagramme officiel documentant l'architecture interne de Mermaid (formes variées, labels multi-lignes `<br/>`) |
| `mermaid-medium1.mmd` … `mermaid-medium5.mmd` | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) — `cypress/platform/dev-diagrams/performance/flowcharts/medium*.mmd` | ~48-50 Ko | Flowcharts de test de performance (générés automatiquement, ~50-200 nœuds, `classDef`, sous-graphes) |
| `large1.mmd`, `large2.mmd` | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) — `cypress/platform/dev-diagrams/performance/flowcharts/large*.mmd` | ~72-75 Ko | Flowcharts de test de performance (grands, sous-graphes imbriqués, `direction` locale) |

Téléchargés depuis la branche `develop` du repo `mermaid-js/mermaid`
(2026-08-06). Référence : https://github.com/mermaid-js/mermaid

## Limites connues du scope V1

Notre scope V1 (cahier des charges §5.1, §6) ne couvre pas tout le langage Mermaid.
Les constructions suivantes sont **ignorées avec un warning** (tolérance, pas d'échec) :

- `style`, `linkStyle`, `classDef` avec `stroke`/`rx`/`shape:` (seul `fill:#RRGGBB` est mappé, §6.3)
- `direction` locale dans un sous-graphe (`subgraph ... direction TB ... end`)
- Arêtes entre sous-graphes (ex. `U1 --> Y2`) — ignorées en V1
- Icônes `fa:`, images `@{ img: ... }`, `click` handlers
- `flowchart-elk` (renderer ELK)

## `generated/` — sortie régénérée, pas accumulée

Un `.docx` par source, **écrasé** à chaque run (`npm test` ou `node scripts/generate-corpus.mjs`)
— jamais un nouveau fichier horodaté. C'est le corpus de validation humaine dans Word (spec §9) :
ouvrez-les directement pour vérifier qu'une forme se sélectionne individuellement, que le texte
ne déborde pas, qu'un connecteur reste attaché après déplacement d'une boîte.

Les enveloppes `.md` (titre + bloc mermaid) sont des entrées transitoires dérivées des `.mmd`
sources : écrites dans un répertoire temporaire par le générateur, jamais persistées.

## Usage

```bash
# Régénérer tous les .docx du corpus (dans generated/)
node scripts/generate-corpus.mjs

# Un seul fichier
node scripts/generate-corpus.mjs --only large2
```

Chaque source est convertie via le CLI réel (`packages/cli`), donc ce corpus teste
aussi le pipeline complet : Markdown → Pandoc → filtre Lua → core → `.docx`.
