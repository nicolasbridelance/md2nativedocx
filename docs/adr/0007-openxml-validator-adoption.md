# ADR 0007 — Adopter le validateur Open XML SDK comme pratique standard du projet

- **Statut :** Accepté (mainteneur, 2026-09-05). Parties A/B (documentation + test opt-in)
  implémentées ; partie C (devcontainer/CI) préparée dans une PR séparée, non fusionnée ; partie D
  (auto-provisioning en production) planifiée, séquencée par étapes.
- **Date :** 2026-09-05
- **Décideur :** Nicolas Bridelance (mainteneur).

## Contexte

ADR 0006 raconte l'incident : 7 rounds de tests Word réels et de comparaisons manuelles de XML
avant que `DocumentFormat.OpenXml.Validation.OpenXmlValidator` (SDK Open XML de Microsoft, .NET)
ne trouve la vraie cause en une seule passe — un schéma `modelId` invalide (`ST_ModelId`, ECMA-376
§21.4, n'accepte qu'un entier non signé ou un GUID). Cet outil valide contre le **même schéma que
Word**, ce qu'aucune autre couche de test de ce projet ne fait : ni la vérification de bonne
formation XML, ni LibreOffice (chapitre 4 de `TESTING.md`, qui ne valide aucun schéma).

Le mainteneur a demandé que cette découverte devienne une pratique standard plutôt qu'un artefact
de spike isolé, sur trois plans : documentation pour les futurs agents/contributeurs, suite de
tests, et intégration en production (rapport de conformité dans le `.log` généré à chaque export).

## Décision

### 1. Outil permanent, pas un artefact de spike

`scripts/oxml-validator/` (copié depuis `docs/adr/spikes/spike-dsp-drawing/round9-modelid-fix/`,
qui reste la trace historique du round 9) — wrapper C# minimal autour du SDK officiel, sortie
`--json` ajoutée pour une consommation programmatique par `scripts/test-oxml-validate.mjs` et,
plus tard, par le câblage CLI (partie D).

### 2. Documentation — `AGENTS.md`/`TESTING.md` comme sources de vérité pour les futurs agents

`AGENTS.md` gagne une section dédiée ("Diagnosing 'Word won't open the file'") posant la règle
explicite : **toujours lancer le validateur avant toute comparaison manuelle de XML**. `TESTING.md`
gagne un 8e chapitre (documenté comme fondamentalement différent des chapitres 1-4 : schéma strict
vs bonne formation/tolérance LibreOffice, pas une redite).

### 3. Suite de tests — opt-in, dégradation propre

`npm run test:oxml-validate` suit exactement le motif déjà établi par `test:visual`
(LibreOffice)/`test:extension-host` (Xvfb) : saute proprement (`exit 0`) si `dotnet` est absent,
jamais un échec pour un outil optionnel. Distingue les erreurs sous `/word/diagrams/*` (notre code,
doit être 0, fait échouer le test) des erreurs préexistantes ailleurs (`styles.xml`/
`numbering.xml`/`settings.xml`, héritées de `packages/cli/assets/reference.docx`, trackées
séparément dans `TODO.md`, non bloquantes pour ce test).

### 4. `.devcontainer/`/CI — PR séparée, non fusionnée

Ajouter le SDK `.NET` à `.devcontainer/setup.sh`/`.github/workflows/ci.yml` (pour que
`test:oxml-validate` tourne automatiquement, pas seulement en local) suit la règle déjà établie
dans ce projet pour ce type de changement (AGENTS.md, section Codespaces) : revue humaine
obligatoire, jamais fusionné automatiquement — même pratique que LibreOffice/Xvfb en leur temps.

### 5. Intégration production — nuance architecturale importante

Le mainteneur a demandé un "auto-provisioning comme Pandoc". **La bonne lecture de cette demande
suit l'architecture de Pandoc, pas seulement son esprit** :

- Pandoc auto-télécharge un **binaire officiel tiers déjà publié** (`pandocProvisioner.ts`,
  releases GitHub de `jgm/pandoc`). `AGENTS.md` documente déjà pourquoi une approche "empaqueter
  nos propres binaires multi-plateformes dans le `.vsix`" a été explicitement rejetée pour Pandoc
  ("un pipeline de build qui n'existe pas encore" — section Licensing).
- Notre validateur n'a pas d'équivalent tiers : c'est un petit wrapper que **nous** écrivons autour
  du paquet NuGet `DocumentFormat.OpenXml`. Construire un pipeline de binaires natifs `.NET`
  auto-contenus pour 5 plateformes tomberait dans l'écueil déjà rejeté pour Pandoc.
- **Architecture retenue, cohérente avec ce précédent** : auto-provisionner le **runtime `.NET`
  officiel de Microsoft** (qui, lui, a de vrais binaires officiels par plateforme, exactement comme
  Pandoc) via un nouveau `dotnetProvisioner.ts` miroir de `pandocProvisioner.ts`, et ne construire
  nous-mêmes qu'un **petit DLL managé** (notre validateur + ses dépendances NuGet, *framework-
  dependent*, pas self-contained), empaqueté dans le `.vsix` au moment du `npm run package` — pas
  un exécutable natif par OS. Câblé dans `packages/cli/bin/md2nativedocx.mjs` (même endroit que
  `writeExportLog()`), avec un réglage `md2nativedocx.wordCompatibilityCheck.enabled` pour
  permettre de désactiver le coût d'un subprocess `.NET` supplémentaire par export.
- Ne doit jamais transformer un export réussi en échec rapporté — un validateur indisponible ou en
  erreur produit une note "non vérifié" dans le `.log`, jamais un crash (même philosophie que
  `readWarningCount()` déjà existant côté extension VS Code).

## Conséquences

- `docs/adr/spikes/spike-dsp-drawing/round9-modelid-fix/` reste la trace historique ; `scripts/
  oxml-validator/` est désormais la copie de référence utilisée par les scripts et, plus tard, par
  le câblage de production.
- Nouvelle entrée `TODO.md` : les 17 erreurs de schéma préexistantes trouvées dans
  `packages/cli/assets/reference.docx` (déjà tolérées par Word aujourd'hui) restent hors scope de
  ce chantier, tracées pour plus tard.
- La partie D (auto-provisioning) est le morceau le plus lourd — séquencée en sous-étapes
  vérifiables (provisioner, packaging du DLL, câblage CLI, réglage VS Code) plutôt que livrée d'un
  bloc, chacune vérifiable indépendamment avant la confirmation finale en vrai Word.
