# ADR 0007 — Adopter le validateur Open XML SDK comme pratique standard du projet

- **Statut :** Accepté et implémenté en entier (mainteneur, 2026-09-05). Parties A/B (documentation
  + test opt-in) faites. Partie C (devcontainer/CI) préparée dans une PR séparée
  (`devcontainer/add-dotnet-sdk`, PR #7 sur GitHub), non fusionnée. **Partie D (auto-provisioning
  en production) implémentée et vérifiée** : `dotnetProvisioner.ts`, `bundle-oxml-validator.mjs`,
  câblage `.log` dans `md2nativedocx.mjs`, réglage `wordCompatibilityCheck.enabled` (y compris dans
  le panneau Lot 4). Vérifié bout en bout dans un environnement totalement dépourvu de `.NET`
  (`env -i`) : téléchargement + vérification SHA-512 + exécution du DLL réel, succès. **Reste à
  faire par le mainteneur** : confirmation finale en conditions réelles (une vraie machine qui n'a
  jamais eu `.NET`, via l'extension packagée).
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

**Implémenté tel que décrit ci-dessus (2026-09-05)** :
- `packages/vscode-extension/src/dotnetProvisioner.ts` — manifeste `DOTNET_RUNTIME_MANIFEST`
  construit à partir des métadonnées de release **officielles** de Microsoft
  (`dotnet/core`'s `release-notes/10.0/releases.json`, lues directement — jamais inventées),
  runtime `10.0.4` (correspondant au SDK `10.0.200` pinné dans la PR C). Différence trouvée en
  inspectant un vrai téléchargement : Microsoft publie des empreintes **SHA-512**, pas SHA-256
  comme Pandoc — `sha512File()` ajouté en conséquence. `win32-arm64` a un vrai binaire natif
  (contrairement à Pandoc, qui retombe sur `win32-x64`).
- `packages/vscode-extension/scripts/bundle-oxml-validator.mjs` — `dotnet publish
  --no-self-contained -p:UseAppHost=false` (~8,3 Mo, pas de lanceur natif spécifique à une
  plateforme, inutile puisqu'on invoque toujours `dotnet oxmlvalidator.dll` explicitement).
- `packages/cli/bin/md2nativedocx.mjs` — `runWordCompatibilityCheck()`/`formatWordCompatibility()`,
  section dédiée dans le `.log`, opt-in via `MD2NATIVEDOCX_OXML_VALIDATOR_DLL` (absent = non
  vérifié, jamais un échec).
- `md2nativedocx.wordCompatibilityCheck.enabled` (défaut `true`), exposé aussi dans le panneau
  Lot 4 (groupe "Avancé").
- **Vérifié bout en bout dans un environnement sans aucun `.NET`** (`env -i`, seul `HOME` présent) :
  téléchargement réel (~37 Mo, 2 s) + vérification SHA-512 + extraction + exécution du DLL
  framework-dependent réel contre `handmade_samples/cycle-simple.docx`, résultat `errorCount: 0`
  correct. Confirme que l'architecture "runtime officiel + DLL managé" fonctionne réellement de
  bout en bout, pas seulement sur le papier.

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
