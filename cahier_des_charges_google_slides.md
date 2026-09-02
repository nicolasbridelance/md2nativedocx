# Cahier des charges — Compatibilité du cœur avec Google Slides

> Statut : proposition, à valider en ADR avant implémentation.
> Référence : complète `cahier_des_charges.md` (scope docx) et `docs/adr/` (moteur de layout, intégration Pandoc).

## 1. Contexte et objectif

Le projet convertit aujourd'hui Markdown + Mermaid en `.docx` avec des formes OOXML natives
éditables (`wpg:wgp`), en délégant à Pandoc tout ce qui n'est pas diagramme.

**Objectif de ce chantier** : prouver que le cœur (`parseur → layout Dagre → modèle de graphe
abstrait`) est réellement indépendant du format de sortie, en lui branchant un second traducteur
ciblant l'écosystème Google Slides — sans dupliquer ni la logique de parsing, ni le calcul de
layout.

Ce n'est pas qu'un argument marketing : c'est une contrainte d'architecture testable, formalisée
en §9.

## 2. Rappel de l'architecture actuelle

```
Markdown + ```mermaid  ──►  Pandoc (parsing MD, tables, style, ZIP)
                              │
                              └─►  filtre Lua md2nativedocx
                                      │
                                      └─►  core (parseur → layout Dagre → traducteur OOXML)
                                              │
                                              └─►  fragment wpg:wgp natif injecté dans le .docx
```

Point de licence déjà tranché (cf. `LICENSE` / `AGENTS.md` → Licensing) : Pandoc (GPL-2.0-or-later)
est invoqué en sous-processus externe, jamais lié au codebase. Le `core` reste CC0.

## 3. La question posée : Dagre a-t-il sa place dans le `core` ?

Réponse courte : **oui, logiquement, mais son maintien dans le core dépend de l'environnement
d'exécution choisi pour la cible Google — pas de sa fonction.**

- **Sur le plan logique**, Dagre est exactement à sa place : c'est le moteur de layout qui ne
  connaît ni OOXML ni Slides, il produit un graphe positionné en unités neutres. C'est le
  traducteur (docx aujourd'hui, pptx/Slides demain) qui doit tout savoir du format cible — pas
  l'inverse. Le déplacer hors du core casserait l'architecture en couches actuelle pour rien.

- **Le vrai risque est environnemental.** Dagre est un paquet npm (dépend de `graphlib`), il tourne
  nativement partout où il y a un runtime Node complet : CLI, host d'extension VS Code. Mais si la
  cible Google est un **Add-on Apps Script** exécuté *dans* l'éditeur Slides (comme le fait le
  concurrent « Mermaid Toolkit for Google Docs »), l'environnement d'exécution n'est **pas** Node —
  c'est le runtime Apps Script V8 : pas d'accès aux modules Node natifs, pas de `npm install`
  classique côté runtime (bundling obligatoire via `clasp` + webpack en éliminant tout import
  Node-only), quotas d'exécution stricts (6 min/appel), pas de filesystem, et surtout **pas de
  Pandoc disponible** dans ce contexte (pas de sous-processus possible).

**Conclusion pour ce chantier** : on ne tranche pas la question Apps Script maintenant. On choisit
une Phase 1 qui reste 100 % Node, où Dagre ne bouge pas d'un pouce (§5). La cible « add-on vivant
dans l'éditeur Slides » est explicitement reportée et isolée en Phase 3 (§8), avec son propre spike
de faisabilité avant tout engagement.

## 4. Décision d'architecture proposée

Deux options existent pour « supporter Google Slides ». Elles ne coûtent pas le même prix et ne
prouvent pas la même chose.

| | Option A — Export `.pptx` | Option B — API Slides (`batchUpdate`) |
|---|---|---|
| Réutilisation du core | Très forte : `.pptx` est OOXML/DrawingML, même famille que `.docx` | Nulle sur la couche traduction : nouveau format de requêtes JSON |
| Réutilisation du traducteur docx existant | Élevée — le modèle de formes (`a:` namespace, connecteurs `stCxn`/`endCxn`) est quasi identique | Aucune |
| Complexité ajoutée | Faible — pas d'auth, pas de quota API, pas de réseau | Élevée — OAuth2, quotas, mapping d'unités PT/EMU, `ConnectionSite` |
| Fidélité dans Google Slides | Bonne à vérifier (import pptx natif de Google) mais pas garantie à 100 % sur des groupes complexes | Totale par construction (on écrit directement dans le modèle Slides) |
| Expérience « live dans l'éditeur » | Non — c'est un import de fichier | Oui, potentiellement |
| Risque Dagre / environnement | Aucun — reste 100 % Node comme aujourd'hui | Aucun si cible = script/service Node (pas un Add-on) |
| Effort | Petit à moyen | Moyen à grand |

**Recommandation : Option A en premier (Phase 1)**, pour trois raisons :

1. Elle démontre le « cœur commun » le plus vite et le plus honnêtement possible : même parseur,
   même Dagre, seul le traducteur change.
2. PowerPoint/Slides n'a pas l'indirection « canvas de dessin » que Word impose (`wpg:wgp`) : les
   formes vivent directement dans l'arbre de formes de la diapositive (`p:spTree`). Le portage est
   donc structurellement **plus simple** que ne l'a été le traducteur docx, pas plus complexe.
3. Google Slides importe nativement les `.pptx` — aucune dépendance à l'API Slides, à OAuth, ni à
   `googleapis` pour ce premier jalon.

L'Option B (API Slides directe) reste pertinente ensuite, en Phase 2, pour une intégration plus
« vivante » (génération à la volée dans une présentation existante) — cf. §8.

## 5. Portée fonctionnelle — Phase 1 (traducteur `.pptx`)

**Dans le scope :**
- Nouveau traducteur consommant le graphe de layout produit par `core` (parseur + Dagre, inchangés)
  et émettant des formes DrawingML natives dans un fragment de diapositive (`p:sp`, `p:cxnSp` pour
  les connecteurs), au lieu du fragment `wpg:wgp` docx.
- Commande CLI dédiée (ex. `npx md2nativedocx rapport.md -o rapport.pptx`), même modèle d'usage que
  l'existant.
- Un même fichier `.md` avec bloc(s) Mermaid ⇒ diapositive(s) avec formes éditables individuellement
  une fois importées dans Google Slides (objectif de fidélité à valider, cf. §9).

**Hors scope Phase 1 (à traiter séparément si besoin) :**
- Conversion du contenu non-diagramme (titres, listes, tableaux Markdown) en diapositives
  structurées — contrairement au docx, il n'existe pas d'équivalent Pandoc « qui prend tout le
  reste en charge » pour un format naturellement paginé comme les slides. Ce chantier (mapping
  Markdown → structure de diapositives) est un sujet à part entière, non couvert ici.
- API Slides / OAuth / génération live dans une présentation ouverte (Option B, Phase 2).
- Add-on Apps Script dans l'éditeur (Phase 3).
- Toute intégration Google **Docs** native éditable en place : rappel, l'API Docs publique n'expose
  aucune primitive de création de forme/canvas (`InsertShapeRequest` n'existe pas côté Docs) ; ce
  mur est indépendant de ce chantier et ne sera pas contourné ici.

## 6. Découpage en modules

À aligner sur la structure réelle de `packages/` au moment de l'implémentation, principe général :

- `core` (existant) — **aucune modification de surface d'API** exigée par ce chantier. Toute
  évolution nécessaire pour Slides/pptx doit passer par un format de sortie neutre déjà exposé
  (le graphe de layout), jamais par un import spécifique à un format dans `core`.
- Nouveau package traducteur (miroir du traducteur docx existant), consommant le même graphe de
  layout, produisant le XML DrawingML pour `p:spTree`.
- Réutilisation du module d'assemblage ZIP/OPC déjà écrit pour le docx (docx et pptx partagent le
  même conteneur OPC — `[Content_Types].xml`, relations, etc. — seule la structure interne des
  parties change).

**Règle d'architecture à faire respecter par le lint (`eslint-plugin-security` + règle de
dépendances, ex. `dependency-cruiser`)** : `core` ne doit importer aucun module spécifique à un
format de sortie (ni `ooxml-docx`, ni `ooxml-pptx`, ni futur `slides-api`). C'est la condition pour
que la revendication « cœur commun » soit vérifiable en CI, pas seulement affirmée dans le README.

## 7. Mapping technique (formes et connecteurs)

| Concept | docx (existant) | pptx (Phase 1) | API Slides (Phase 2, référence) |
|---|---|---|---|
| Conteneur de formes | `wpg:wgp` (canvas de dessin injecté dans le corps du document) | `p:spTree` (arbre de formes natif de la diapositive, pas d'indirection canvas) | `pageElements` de la présentation via `batchUpdate` |
| Forme simple | `wps:wsp` | `p:sp` | `CreateShapeRequest` |
| Connecteur | `wps:cxnSp` avec `stCxn`/`endCxn` | `p:cxnSp` avec `a:stCxn`/`a:endCxn` (même vocabulaire DrawingML) | `CreateLineRequest` + `startConnection`/`endConnection` (`connectedObjectId`, `connectionSiteIndex`) |
| Unité | EMU | EMU (identique — pptx utilise aussi l'EMU nativement) | Points (PT) par défaut, EMU accepté selon les requêtes |

Point notable : la conversion d'unités **ne change pas** entre docx et pptx (EMU des deux côtés) —
la seule couche de conversion nouvelle à écrire concerne l'Option B (Phase 2, PT/EMU selon les
requêtes Slides API).

## 8. Phases et jalons

- **Phase 0 — Spike de validation** : générer un `.pptx` minimal à la main (formes + connecteur),
  l'importer dans Google Slides, vérifier que les formes restent individuellement sélectionnables
  et éditables (pas de rasterisation silencieuse à l'import). Bloquant avant tout développement.
- **Phase 1 — Traducteur `.pptx`** : scope décrit en §5. Livrable testable en CLI, sans dépendance
  réseau ni Apps Script.
- **Phase 2 — Traducteur API Slides direct** (optionnel, selon retours Phase 1) : package séparé,
  Node/service (pas un Add-on), auth OAuth2, dépendance `googleapis` (Apache-2.0, aucun souci de
  compatibilité avec le CC0 du core). Toujours zéro changement sur `core`.
- **Phase 3 — Exploratoire, hors engagement actuel** : Add-on Apps Script vivant dans l'éditeur
  Slides. Nécessite un spike dédié : bundlabilité de `dagre`/`graphlib` en V8 Apps Script (taille de
  bundle, absence de deps Node-only, quotas d'exécution), et une réflexion sur l'absence de Pandoc
  dans ce runtime. À trancher par une ADR séparée avant tout développement.

## 9. Critères d'acceptation

- Tests golden existants (docx) inchangés et toujours verts.
- Nouveaux tests golden pptx, même méthodologie que l'existant.
- **Test de « cœur commun »** (nouveau, cœur de la preuve technique) : une même fixture `.md` produit
  un snapshot de graphe de layout (sortie de `core`, avant tout traducteur) ; ce snapshot doit être
  strictement identique que l'on s'apprête à générer un `.docx` ou un `.pptx`. Le test échoue si le
  choix du traducteur influence de quelque façon que ce soit la sortie de `core`.
- Test visuel : rendu LibreOffice Impress headless + pixel-diff, sur le même principe que
  `test:visual` existant (actuellement LibreOffice/Writer pour le docx).
- Checklist manuelle d'import Google Slides (fidélité des formes, éditabilité, connecteurs) —
  documentée dans `TESTING.md`, non automatisable dans un premier temps.

## 10. Risques et points ouverts

- Fidélité de l'import `.pptx` par Google Slides sur des groupes de formes complexes (à confirmer en
  Phase 0 — c'est le risque qui peut remettre en cause l'Option A si la fidélité est mauvaise).
- Bundlabilité de Dagre en environnement Apps Script (Phase 3 uniquement, non bloquant pour ce
  chantier).
- Divergence future entre le vocabulaire connecteur docx (`stCxn`/`endCxn`) et pptx : à valider
  qu'ils sont réellement interchangeables au niveau XML (forte présomption, à confirmer en Phase 0).

## 11. Hors scope explicite

- Intégration Google Docs éditable en place (mur d'API constaté, indépendant de ce chantier).
- Conversion du contenu Markdown non-diagramme en diapositives structurées.
- Toute forme d'Add-on Apps Script tant que la Phase 3 n'a pas été validée séparément.
