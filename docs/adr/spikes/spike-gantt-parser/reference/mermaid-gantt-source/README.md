# Référence externe — grammaire Gantt de Mermaid (MIT)

**Ces fichiers ne sont pas du code de ce projet.** Ce sont des copies verbatim, non modifiées, du
dépôt [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid), récupérées au tag
[`mermaid@12.0.0`](https://github.com/mermaid-js/mermaid/tree/mermaid@12.0.0/packages/mermaid/src/diagrams/gantt),
sous licence **MIT** (voir `LICENSE` dans ce dossier, copyright Knut Sveidqvist et contributeurs).

## Pourquoi elles sont là

Lisibles à côté du code qu'on écrit, pour servir de spécification de référence pendant qu'on
écrit **notre propre** parseur/traducteur Gantt en TypeScript sous licence CC0
(`packages/core/src/diagrams/gantt/`, à venir). Rien ici n'est compilé, importé, ni exécuté par le
produit livré — voir `../../spike.md` pour le détail de pourquoi une dépendance runtime sur le
paquet npm `mermaid` a été écartée (chemins de chunks internes non stables, dépendance DOM/
DOMPurify).

## Fichiers

| Fichier | Rôle dans Mermaid |
|---|---|
| `parser/gantt.jison` *(placé à plat ici, pas de sous-dossier)* → `gantt.jison` | Grammaire Jison : mots-clés (`dateFormat`, `excludes`, `section`, tags `crit`/`active`/`done`/`milestone`), syntaxe de ligne de tâche |
| `ganttDb.js` | Résolution sémantique post-parse : chaînage `after taskX`, exclusion de jours (`excludes`/`weekends`/jours nommés), arithmétique de dates via `dayjs` |
| `ganttDiagram.ts` | Point d'assemblage (`{ parser, db, renderer, styles }`) — utile pour voir la forme d'ensemble, sans intérêt propre |
| `ganttDetector.ts` | Regex de détection du type de diagramme (`^\s*gantt`) — déjà couvert côté nôtre par `parser/diagram-type.ts` |

## Ne pas faire

- Ne pas importer ces fichiers depuis `packages/core` ou tout autre package publié.
- Ne pas copier-coller de blocs de logique tels quels dans notre implémentation — c'est une
  référence de lecture pour couvrir les mêmes cas limites (dates, exclusions, dépendances), pas une
  base de code à forker. Notre implémentation reste une réécriture indépendante, en TypeScript,
  license CC0 comme le reste du projet.
- Si Mermaid sort une nouvelle version avec des changements de grammaire Gantt pertinents, mettre à
  jour cette copie (nouveau tag, mêmes chemins) plutôt que de la laisser dériver silencieusement.
