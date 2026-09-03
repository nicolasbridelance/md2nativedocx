# IT / sécurité — analyse de risque, pipeline, coût

## Empreinte d'infrastructure et coût

`md2nativedocx` n'a **pas de composante serveur**. C'est un moteur qui tourne dans le processus
Node.js de la CLI, du filtre Pandoc, ou de l'extension VS Code — sur le poste de l'utilisateur ou
dans une CI, jamais sur une infrastructure dédiée.

| Poste de coût habituel | Ici |
|---|---|
| Licence logicielle | 0 € — CC0 (code propre) + 100 % dépendances runtime MIT + Pandoc GPL gratuit (voir [`legal.md`](legal.md)) |
| Infrastructure serveur / cloud | Aucune — exécution locale uniquement |
| Abonnement SaaS | Aucun |
| Prérequis logiciel | Node.js ≥ 18, Pandoc, un interpréteur Lua — tous gratuits, tous open source |
| Prérequis matériel | Poste de travail standard, aucune ressource dédiée |
| Téléchargement ponctuel (extension VS Code uniquement) | Binaire Pandoc officiel, une fois si absent du poste, mis en cache local — ordre de grandeur documenté dans `AGENTS.md` (~140 Mo par plateforme, c'est le chiffre qui a justifié de *ne pas* l'embarquer dans le `.vsix`) |

Le seul coût réel de déploiement est humain : installation initiale de Node.js/Pandoc sur les
postes, et la revue de sécurité elle-même.

## Analyse de risque

Ce projet accepte du texte non fiable (Mermaid écrit par un humain ou une IA) et produit du XML
que Microsoft Word va parser et rendre — c'est exactement la classe de vulnérabilité des formats
de document. La table ci-dessous, tenue à jour dans [`AGENTS.md`](../../AGENTS.md) →
*Security requirements*, est la référence faisant autorité ; elle est reproduite ici pour éviter
un aller-retour :

| Risque | Où | Mitigation |
|---|---|---|
| Injection XML via les libellés de nœud/arête | Traducteur OOXML | Échappement XML strict (`& < > " '`) de tout texte utilisateur avant insertion, vérifié par tests + fuzzing property-based |
| XXE (XML External Entity) | Tout parsing XML du pipeline, y compris les tests | Résolution DTD/entités externes désactivée sur tout parseur utilisé |
| Relation OOXML externe (classe Follina, CVE-2022-30190) | Traducteur | Jamais de `TargetMode="External"` ni de référence distante — sortie toujours autonome, vérifié par test property-based dédié |
| Injection de commande | Pont CLI → Pandoc | `execFile`/`spawn` avec tableau d'arguments uniquement, jamais d'interpolation shell |
| Path traversal | Chemins d'E/S CLI, extension VS Code | Résolution et validation des chemins avant toute opération fichier |
| Zip bomb / ratio de décompression | Délégué à Pandoc aujourd'hui | Signalé comme point de vigilance si un contributeur manipule un jour directement le ZIP |
| Supply chain | Tout le dépôt | `npm audit` en CI (échoue sur high/critical) + Dependabot hebdomadaire |
| Fuite de secret | Tout le dépôt, public dès le premier commit | Scan `gitleaks` à chaque push/PR |
| Entrée non testée | Frontière la plus exposée : le parseur Mermaid, potentiellement généré par une IA pour le compte d'un tiers | Tests property-based (`fast-check`) dédiés à cette frontière, pas seulement des cas d'exemple |

## Ce que la CI vérifie à chaque push/PR

Fichiers sources : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) et
[`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml).

| Contrôle | Outil | Fréquence | Bloquant |
|---|---|---|---|
| Typecheck strict | `tsc --noEmit` | Chaque push/PR | Oui |
| Lint + règles de sécurité | ESLint + `eslint-plugin-security` | Chaque push/PR | Oui |
| Tests unitaires + golden | `node --test` | Chaque push/PR | Oui |
| Tests property-based (fuzzing) | `fast-check` | Chaque push/PR | Oui |
| Audit de dépendances | `npm audit --audit-level=high` | Chaque push/PR | Oui (high/critical) |
| Scan de secrets | `gitleaks` | Chaque push/PR | Oui |
| Analyse statique (SAST) | CodeQL | Chaque push/PR + hebdomadaire | Oui (alertes remontées à l'onglet Security GitHub) |
| Mise à jour des dépendances | Dependabot | Hebdomadaire | Non-bloquant, PR automatique |
| Régression visuelle (rendu réel) | LibreOffice headless + pixel-diff | Planifié / branches de release | Non-bloquant sur chaque PR (documenté comme arbitrage explicite) |

Statut live : les badges en tête du [`README`](../../README.md) reflètent le dernier run sur
`main`, pas un instantané figé.

## Où sont les fichiers source des tests

Chaque test est un fichier versionné dans le dépôt, pas une boîte noire :

| Package | Tests unitaires/golden | Tests property-based (fuzz) |
|---|---|---|
| `packages/core` (moteur — parseur, layout, traducteur) | `packages/core/test/unit/`, `packages/core/test/golden/` | `packages/core/test/fuzz/` |
| `packages/cli` | `packages/cli/test/` | — |
| `packages/pandoc-filter` | `packages/pandoc-filter/test/` | — |
| `packages/vscode-extension` | `packages/vscode-extension/test/unit/` | — |

Détail de ce que chaque chapitre garantit et où vivent les cinq autres (corpus de diagrammes
réels, régression visuelle, comparaison Word natif, spikes historiques) : [`TESTING.md`](../../TESTING.md).

## Rapports automatiques et datés

Les chiffres ci-dessus ne sont pas une capture ponctuelle recopiée à la main : chaque run CI sur
`main` (déclenché à chaque push, donc daté et rattaché à un commit précis) produit et conserve :

- **Un résumé lisible dans l'onglet Actions** : chaque run affiche un "Job Summary" — nombre de
  tests, pass/fail, couverture — généré par [`scripts/ci-summary.mjs`](../../scripts/ci-summary.mjs)
  à partir des rapports du run, pas retapé.
- **Des rapports téléchargeables (artefacts GitHub Actions, conservés 90 jours, un par run/commit)** :
  - `test-reports-<sha>` : un `junit.xml` par package (format standard, exploitable par un outil
    tiers) + `lcov.info` (couverture) pour `packages/core`.
  - `npm-audit-<sha>` : sortie complète de `npm audit --json`, y compris quand l'audit échoue —
    utile pour voir précisément *quoi* a échoué, pas juste que ça a échoué.
- **Les alertes CodeQL**, nativement datées et historisées par GitHub dans l'onglet *Security* →
  *Code scanning*.

Pour consulter l'état exact à une date donnée : onglet **Actions** du dépôt → sélectionner le run
correspondant à cette date/ce commit → *Summary* (résumé inline) ou section *Artifacts* en bas de
page (rapports bruts).

Reproductible en local, à l'identique de ce que la CI exécute, avec :
`npm run build && npm run typecheck && npm run lint && npm run test:ci && npm run test:fuzz
&& npm audit --audit-level=high` — `test:ci` produit les mêmes `reports/junit.xml` (et `lcov.info`
pour `core`) que le run CI, dans `packages/*/reports/`.

## Ce que la CI ne couvre pas encore (transparence)

- **Hook pre-commit local pour le scan de secrets** — la CI l'a (gitleaks), pas encore de hook
  local (husky/lefthook). Le secret ne sortirait pas du poste avant d'être bloqué au push, mais il
  serait déjà dans l'historique local.
- **CODEOWNERS / revue obligatoire** — projet mono-mainteneur à ce stade (voir `SECURITY.md`),
  pas encore de règle de branche protégée exigeant une revue tierce.
- **Test de régression visuelle** — nécessite LibreOffice headless, pas exécuté sur chaque PR par
  choix explicite de compromis vitesse/couverture (voir commentaire dans `ci.yml`).

## Documents liés

- [`SECURITY.md`](../../SECURITY.md) — politique de signalement de vulnérabilité, périmètre.
- [`TESTING.md`](../../TESTING.md) — les six chapitres de test et ce que chacun garantit.
- [`AGENTS.md`](../../AGENTS.md) → *Development environment* — le risque spécifique aux
  Codespaces/PR externes (exécution de `.devcontainer/`/`.vscode/` à l'ouverture) et sa mitigation
  procédurale.
