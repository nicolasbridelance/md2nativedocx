# ADR 0003 — Traducteur `.pptx` (Google Slides, Option A) : spike Phase 0

- **Statut :** Spike concluant côté génération/paquet, décision finale **en attente** de
  vérification manuelle dans Google Slides/PowerPoint réels.
- **Date :** 2026-09-02
- **Contexte :** `cahier_des_charges_google_slides.md` §8, Phase 0.

## Contexte

`cahier_des_charges_google_slides.md` propose de prouver l'indépendance du `core`
(parseur → layout Dagre) vis-à-vis du format de sortie en lui branchant un traducteur `.pptx`
(Option A), réutilisant le même vocabulaire DrawingML que le traducteur `.docx` existant
(`p:sp`/`p:cxnSp` au lieu de `wps:wsp`/`wps:cxnSp`, sans l'indirection canevas `wpg:wgp`). La
Phase 0 exige un spike de validation avant tout code de traducteur.

## Spike réalisé

`docs/adr/spikes/spike-pptx/` — `.pptx` minimal assemblé à la main (`build-spike.mjs`, zéro
dépendance ajoutée, zip via `execFile` en tableau d'arguments) : 2 formes (rectangle + losange)
et 1 connecteur, réutilisant explicitement la convention d'indices de site de connexion
`{ top: 0, right: 3, bottom: 2, left: 1 }` déjà validée pour le docx (`ooxml-translator.ts`).

Résultats vérifiés (détail complet dans `spike.md`) :
- ZIP valide, 13 parties XML/`.rels` bien formées (parseur XXE-safe, règle n°5), 0 relation
  externe (règle n°3).
- Rendu LibreOffice Impress headless propre (PNG 960×720 + PDF 1 page) : deux formes distinctes
  et reliées, connecteur correctement positionné bord à bord — pas de diapositive vide, pas
  d'image aplatie.
- Recherche web inconclusive sur deux points (voir "Risques restants" ci-dessous).

## Décision

**Le mécanisme de génération est validé** : un paquet OPC pptx auto-contenu, avec formes et
connecteur DrawingML dans `p:spTree` (sans canevas intermédiaire, contrairement au docx), est
structurellement correct et se rend proprement dans un moteur DrawingML (LibreOffice Impress).
Rien dans ce spike ne remet en cause la prémisse centrale du cahier des charges §4 (réutilisation
forte du vocabulaire de formes docx).

**Ce qui reste ouvert avant de démarrer la Phase 1 (traducteur de production)** — la question que
ce spike ne pouvait pas trancher depuis ce bac à sable (aucun accès réseau/compte Google
disponible) :
1. Importer réellement `spike.pptx` dans Google Slides et confirmer que les formes/connecteur
   restent des objets individuellement sélectionnables (pas rasterisés).
2. Confirmer l'absence d'invite de réparation dans PowerPoint réel (LibreOffice est connu pour
   être plus tolérant que PowerPoint sur un OPC incomplet).
3. Tester le comportement magnétique réel du connecteur (déplacer une forme) — impossible à
   vérifier par un rendu headless statique.
4. Tester un cas plus complexe (connecteur coudé multi-points, plusieurs formes) pour évaluer le
   risque §10 du cahier des charges ("fidélité sur des groupes de formes complexes").

## Conséquences

- Pas de blocage technique identifié pour démarrer la Phase 1 (traducteur `.pptx` de production,
  §5-§7 du cahier des charges) une fois les points ci-dessus vérifiés par un humain.
- Aucune modification de `packages/` à ce stade — ce spike reste isolé dans `docs/adr/spikes/`.

## Alternatives rejetées

- Aucune nouvelle alternative évaluée ici — les deux options (pptx vs API Slides) avaient déjà été
  comparées dans le cahier des charges §4 ; ce spike ne fait que valider l'Option A retenue.
