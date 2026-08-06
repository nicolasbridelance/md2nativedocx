# ADR 0001 — Moteur de layout : Dagre (défaut), Graphviz en option

- **Statut :** Accepté (Phase 0 spike)
- **Date :** 2026-08-06
- **Décideur :** Nicolas Bar Bridelance (mainteneur) — validé par spike, voir ci-dessous

## Contexte

Le cahier des charges (§5.2, §11 Phase 0) exige de trancher explicitement entre deux
moteurs de layout pour `packages/core/layout` :

- **Dagre** — pur JS, même moteur que Mermaid en interne. Zéro dépendance binaire/WASM,
  cohérent avec un stack 100 % TypeScript.
- **Graphviz (WASM, `@hpcc-js/wasm`)** — `splines=ortho` et coordinate assignment plus
  matures pour des layouts destinés à un rendu en coudes (comme le connecteur Word).

Le cahier des charges recommande par défaut **Dagre**, avec Graphviz en option de secours
pour les diagrammes denses (>25 nœuds).

## Spike réalisé

`scripts/spike-layout.mjs` compare les deux moteurs sur un flowchart à 10 nœuds avec
arêtes croisées volontaires (le cas qui différencie le crossing minimization).

Résultat Dagre (baseline documentée) :
- Boîte englobante : 390 × 1040 px.
- Croisements d'arêtes : 1 (attendu, vu les 2 arêtes croisées volontaires).
- Positions de nœuds stables et déterministes.

Graphviz-WASM n'est pas exécuté automatiquement dans le spike (grosse dépendance WASM,
réseau au runtime) — il reste une option manuelle.

## Décision

1. **Dagre est le moteur de layout par défaut** de `packages/core`. Il remplace la
   réimplémentation maison "Dagre-like" de `layout/layout.ts`, qui est **jetable** (le
   cahier des charges §"Réécrire le moteur de layout" a explicitement écarté la
   réimplémentation d'un algorithme de layout de graphe).
2. **Graphviz-WASM reste une option de secours** pour les diagrammes denses (>25 nœuds),
   à activer via une option de layout, sans changer l'API publique du traducteur.
3. L'API de `packages/core/layout` expose une fonction `layout(flowchart, options)` dont
   l'implémentation par défaut délègue à Dagre. Le contrat de sortie (coordonnées en
   pixels) est inchangé quel que soit le moteur.

## Conséquences

- Ajout de la dépendance `dagre` (+ `@types/dagre`) à `packages/core` — justifiée par ce
  spike et par le cahier des charges §5.2.
- `layout/layout.ts` actuel est remplacé par un wrapper Dagre (pas construit dessus).
- La fidélité visuelle avec l'aperçu Mermaid d'origine est maximisée (même moteur).

## Alternatives rejetées

- **Réimplémentation maison** : rejetée — reproduit 90 % d'un moteur existant (scope creep,
  règle n°1 d'`AGENTS.md`).
- **Graphviz par défaut** : rejeté pour V1 — cohérence de stack et fidélité au rendu source
  priment ; Graphviz reste disponible en option.
