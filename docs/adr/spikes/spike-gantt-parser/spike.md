# Spike — réutiliser le parseur Gantt interne de Mermaid.js ?

Suite à `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` (Famille D, `gantt`) et au §5.1 du
cahier des charges ("ne pas réécrire un parseur Mermaid depuis zéro si une bibliothèque JS
existante permet d'accéder à l'AST post-parsing sans forcer le rendu SVG complet — à valider en
spike"). Question posée : peut-on dépendre à l'exécution du parseur Gantt réel de `mermaid` (npm)
plutôt que d'en écrire un maison, pour éviter une classe de bugs (dates, `after`, `excludes`) ?

Run : `npm install` puis `node test-parse-no-dom.mjs` (Finding 2) et `node test-parse-jsdom.mjs`
(Finding 3).

## Finding 1 — pas de module Gantt exporté proprement

`mermaid@12.0.0` (MIT) n'expose que `.` et `./*` dans son `package.json#exports`. Les fichiers
`.d.ts` par diagramme existent (`dist/diagrams/gantt/*.d.ts`) mais n'ont **pas de `.js`/`.mjs`
jumeau** — l'implémentation réelle est bundlée dans un chunk unique généré par le build
(`dist/chunks/mermaid.core/ganttDiagram-<HASH>.mjs`, ex. `ganttDiagram-FUAMR5RP.mjs`). Ce `<HASH>`
est un hash de contenu du bundler, **pas un chemin d'API publique stable** : il change à chaque
build (potentiellement à chaque version, y compris un patch). Un import direct dessus depuis
`node_modules/mermaid` est donc fragile par construction — un `npm update mermaid` peut le casser
silencieusement.

## Finding 2 — même le parsing pur n'est pas DOM-free

`test-parse-no-dom.mjs` (aucun shim) plante dès le premier appel à `parser.parse()`, avant même
d'atteindre la logique de dates :

```
TypeError: DOMPurify.addHook is not a function
  at setupDompurifyHooks ... at Object.setDiagramTitle ...
```

`setDiagramTitle`/`sanitizeText` (module `common` partagé par tous les diagrammes Mermaid)
sanitize inconditionnellement via DOMPurify, qui a besoin d'un vrai DOM pour s'instancier — même
pour parser un `title` en texte brut, sans aucun rendu SVG. Donc "accéder à l'AST post-parsing sans
forcer le rendu SVG complet" (cahier des charges §5.1) ne suffit pas à éviter le DOM : la
dépendance DOM est dans la couche `db` partagée, pas seulement dans le renderer.

## Finding 3 — ça marche avec un shim jsdom, et la donnée récupérée est bonne

`test-parse-jsdom.mjs` (shim `jsdom` + `dompurify` en globals) parse ce fixture :

```
gantt
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
```

et résout correctement : chaînage `after taskX` → vraies dates, jours de `excludes weekends`
sautés dans le calcul de durée, `dateFormat` respecté, tags `done`/`active`/`crit`/`milestone`. La
partie difficile de la grammaire Gantt (arithmétique dates + calendrier + dépendances) est donc
bien gérée nativement par Mermaid, comme espéré.

Mais le prix : `jsdom` (~15-20 Mo installés, cascade de dépendances `cssstyle`/`whatwg-*`) +
`dompurify` embarqués juste pour parser du texte, dans un package (`packages/core`) qui n'a
aujourd'hui qu'une seule dépendance (`dagre`).

## Décision

**Pas de dépendance runtime sur `mermaid` npm.** Le combo Finding 1 (chemin de chunk instable,
non-API) + Finding 2 (DOM requis même pour le titre) rend ce choix plus fragile qu'un parseur
maison, malgré Finding 3 qui prouve que le résultat serait correct s'il était stable.

**Référence de code gardée en local pour écrire notre propre parseur**, à
`reference/mermaid-gantt-source/` (voir son `README.md`) : `gantt.jison` (grammaire) +
`ganttDb.js` (résolution `after`/`excludes`/dates), copiés verbatim au tag `mermaid@12.0.0`,
licence MIT intacte. Notre parseur (`packages/core/src/diagrams/gantt/`, à écrire) sera une
réécriture indépendante en TypeScript sous licence CC0 du projet — cette référence sert à couvrir
les mêmes cas limites (pas à être copiée), le même principe que lire une RFC avant d'implémenter
un protocole.

## Le vrai risque long terme, et comment le couvrir sans dépendance runtime

Écrire notre propre grammaire (ici, et pour les 9 types déjà livrés) crée un risque réel et
durable : elle peut dériver de ce que Mermaid accepte réellement, silencieusement — un Markdown
valide sur mermaid.live pourrait mal se parser chez nous sans erreur visible, exactement le mode de
panne que `detectDiagramType()` existe déjà pour empêcher côté classification de type
(`parser/diagram-type.ts`, doc comment). Ce risque ne se referme pas une fois pour toutes en
copiant la grammaire aujourd'hui : la grammaire de Mermaid elle-même continue d'évoluer, donc même
un parseur "dérivé fidèlement" dériverait à nouveau dès la prochaine version de Mermaid si personne
ne revérifie.

La réponse proportionnée n'est donc pas de réécrire les 9 parseurs déjà livrés (grammaires bien
plus simples que Gantt, déjà vérifiées par rendu réel + `oxml-validate`, réécrire pour un gain
spéculatif = risque de régression pour un bénéfice non mesuré) — c'est un **test de conformance
récurrent**, sur le modèle de ce spike : rejouer un corpus de Mermaid représentatif par type à
travers `mermaid` npm (`jsdom`-shimmé, comme ici, en dépendance de dev seulement, jamais en
runtime) et diffuser le résultat contre notre AST, pour détecter une dérive **avant** qu'un
utilisateur la découvre. Pas fait dans ce spike (hors scope), mais c'est la prochaine pierre à poser
une fois Gantt livré — à documenter dans `FUTURE_full_mermaid_coverage_SPEC.md` si retenu.
