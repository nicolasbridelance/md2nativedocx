# Corpus de validation — chapitre 3 (voir `TESTING.md`)

Ce dossier contient les diagrammes Mermaid **sources** utilisés pour la validation
humaine dans Word et pour la conformité automatique (spec §9).

## Principe

Les diagrammes `.mmd` ne sont **pas écrits par ce projet** — ils proviennent de sources
officielles ou de référence, pour exercer une syntaxe réelle plutôt que celle que
nous écririons nous-mêmes. Les fichiers `.md` du corpus (`mixed-content.md`,
`large-report.md`, `medium-report.md`) sont l'exception délibérée : voir §"Corpus texte"
ci-dessous.

## Provenance des sources (`source/`)

| Fichier source | Origine | Taille | Contenu |
|---|---|---|---|
| `mermaid-official-code-flow.mmd` | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) — `docs/diagrams/flowchart-code-flow.mmd` | ~9 Ko | Diagramme officiel documentant l'architecture interne de Mermaid (formes variées, labels multi-lignes `<br/>`) |
| `mermaid-medium1.mmd` … `mermaid-medium5.mmd` | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) — `cypress/platform/dev-diagrams/performance/flowcharts/medium*.mmd` | ~48-50 Ko | Flowcharts de test de performance (générés automatiquement, ~50-200 nœuds, `classDef`, sous-graphes) |
| `large1.mmd`, `large2.mmd` | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) — `cypress/platform/dev-diagrams/performance/flowcharts/large*.mmd` | ~72-75 Ko | Flowcharts de test de performance (grands, sous-graphes imbriqués, `direction` locale) |

Téléchargés depuis la branche `develop` du repo `mermaid-js/mermaid`
(2026-08-06). Référence : https://github.com/mermaid-js/mermaid

## Corpus texte (`mixed-content.md`, `large-report.md`, `medium-report.md`)

Les sources `.mmd` ci-dessus n'exercent que le traducteur de diagramme : le générateur les
enveloppe dans un titre + un seul bloc ```` ```mermaid ```` minimal (voir `wrapMarkdown` dans
`scripts/generate-corpus.mjs`), donc rien dans ce corpus ne vérifiait la promesse produit "un
`.md` complet devient un `.docx` complet" (cahier des charges §1) — seule la moitié "diagramme"
était couverte, jamais la moitié "texte" déléguée à Pandoc.

`mixed-content.md`, écrit pour ce projet (pas une source externe, donc listé à part), est un
rapport type persona "docs-as-code" (§3) : titres H1/H2/H3, gras/italique, liste ordonnée,
tableau, citation, lien, note de bas de page, bloc de code avec langage (```` ```python ````), et
**deux** diagrammes mermaid interleaved avec le texte plutôt qu'un seul bloc isolé — pour vérifier
que les compteurs d'id de forme ne collisionnent pas entre deux diagrammes du même document.
Contrairement aux `.mmd`, ce fichier n'est **pas** enveloppé par le générateur : `.md` = document
complet utilisé tel quel (voir `toMarkdown()` dans `scripts/generate-corpus.mjs` et
`packages/cli/test/corpus.test.mjs`).

**`large-report.md` et `medium-report.md` (2026-09-02)** — le trou restant après
`mixed-content.md` : ses deux diagrammes ne font que 4 et 6 nœuds, donc rien ne combinait texte
riche **et** diagramme volumineux dans le même document, et `TODO.md` notait explicitement que le
corpus à gros diagrammes (24-318 nœuds) n'avait jamais été ouvert dans un vrai Word avec du texte
autour (seulement en enveloppe minimale titre + bloc isolé). Même structure de rapport que
`mixed-content.md` (titres, tableau, liste ordonnée, citation, note de bas de page, blocs de
code — deux langages différents ici pour varier la coloration syntaxique), mais le bloc mermaid
n'est pas écrit pour ce document : c'est le contenu réel d'une source `.mmd` déjà présente dans ce
corpus, copié tel quel (frontmatter YAML retiré, même transformation que `extractDiagram()` dans
`scripts/generate-corpus.mjs` applique aux `.mmd`), pour ne pas dupliquer un diagramme "que nous
écririons nous-mêmes" :
- `large-report.md` embarque `large1.mmd` (~360 nœuds, sous-graphes imbriqués) — le cas taille
  brute, jamais testé avec du texte autour.
- `medium-report.md` embarque `mermaid-official-code-flow.mmd` (~115 nœuds, formes variées,
  labels multi-lignes `<br/>`) — le cas variété des formes plutôt que taille pure, et re-teste
  volontairement la limite HTML brut (§ ci-dessous) à une échelle de document plus réaliste que
  `mixed-content.md`.

Vérifié à ce stade (2026-09-02) : régénération sans erreur via le CLI réel
(`node scripts/generate-corpus.mjs`), conformité structurelle (`packages/cli/test/corpus.test.mjs`,
XML bien formé), et rendu LibreOffice headless inspecté visuellement (titres/tableau/liste/
citation/code correctement stylés, les deux diagrammes visibles et complets, aucune forme
manquante). **Pas encore ouvert dans un vrai Word** — c'est précisément le but de ces deux
fichiers, à faire avant toute nouvelle fonctionnalité qui réutilise le même pipeline (pptx,
SmartArt).

**Coloration syntaxique des blocs de code :** gérée entièrement par le highlighter intégré de
Pandoc (`skylighting`), pas par ce projet — un bloc ```` ```python ```` produit des styles de
caractère (`KeywordTok`, `CommentTok`, …) définis dans `styles.xml` avec couleur + police
monospace (`Consolas`). Vérifié par le même test que ci-dessus, qui contrôle à la fois la
présence des styles dans `document.xml` et leur définition réelle dans `styles.xml` (un styleId
référencé mais non défini rendrait du texte plat sans coloration).

Assertions dédiées : `packages/cli/test/corpus.test.mjs` → test `corpus mixed-content: ...`.

## Limites connues du scope V1

Notre scope V1 (cahier des charges §5.1, §6) ne couvre pas tout le langage Mermaid.
Les constructions suivantes sont **ignorées avec un warning** (tolérance, pas d'échec) :

- `style`, `linkStyle`, `classDef` avec `stroke`/`rx`/`shape:` (seul `fill:#RRGGBB` est mappé, §6.3)
- `direction` locale dans un sous-graphe (`subgraph ... direction TB ... end`)
- Arêtes entre sous-graphes (ex. `U1 --> Y2`) — ignorées en V1
- Icônes `fa:`, images `@{ img: ... }`, `click` handlers
- `flowchart-elk` (renderer ELK)

## Limites connues — Markdown non-diagramme (délégué à Pandoc)

Le texte n'a pas de vraie "RFC" — la référence normative la plus proche est
[CommonMark](https://spec.commonmark.org/) (pas un RFC IETF ; RFC 7763/7764 ne font
qu'enregistrer le media-type `text/markdown`, sans imposer de syntaxe). Notre CLI invoque Pandoc
sans `--from` explicite, donc lit avec le dialecte "markdown" étendu de Pandoc (superset de
CommonMark : tables, footnotes, definition lists — tous nécessaires à `mixed-content.md` — plus
guillemets typographiques et ids de titre automatiques). Comparé empiriquement (2026-08-07) à la
suite de test officielle CommonMark 0.31.2 (652 cas) : 269 cas (41 %) produisent un AST différent
de CommonMark strict, mais la quasi-totalité vient de ces extensions volontaires ou d'une
tolérance de parsing plus permissive (ex. URL avec espace non échappé) — pas d'un manque de
couverture.

**Le vrai trou, trouvé en testant manuellement plutôt que via CommonMark** : le HTML brut
(`<img>`, `<br/>`, `<div>`, `<strong>` en HTML, etc.) est **silencieusement supprimé** dans le
`.docx` — aucune erreur, aucun warning. Le writer docx de Pandoc n'a pas d'équivalent OOXML pour
du HTML arbitraire (contrairement à ses writers html/pdf). C'est une limitation de Pandoc, pas un
choix de scope de ce projet (cahier des charges §2) — mais elle mérite d'être connue car le HTML
brut est courant dans les README GitHub (images centrées, badges, `<details>`). Verrouillé par le
test `known limitation: raw HTML (img/br/strong/div) is silently dropped, not translated` dans
`packages/cli/test/corpus.test.mjs`, pour qu'une évolution future (upgrade Pandoc, ajout d'un
fallback) soit une décision explicite plutôt qu'un changement de comportement muet.

## Formules mathématiques (LaTeX) — trouvaille positive, pas juste une limite

Contrairement au HTML brut ci-dessus, le writer docx de Pandoc a un équivalent OOXML natif pour
les formules LaTeX (`$...$`/`$$...$$`) : `m:oMath`/`m:oMathPara` (bibliothèque `texmath`),
éditables dans l'éditeur d'équations de Word — même logique que nos formes de diagramme, gratuite
ici puisque déléguée à Pandoc (cahier des charges §2). Vérifié empiriquement 2026-09-01 (intégrale
avec bornes, fraction, matrice — structure XML **et** rendu LibreOffice headless contrôlés, pas
seulement la présence de la balise). Verrouillé par le test
`bonus finding: LaTeX math converts to native OOXML equations (m:oMath), not an image` dans
`packages/cli/test/corpus.test.mjs`.

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
