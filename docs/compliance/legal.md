# Legal — licences, dépendances, flux de données

> Ceci n'est pas un avis juridique. C'est un état des lieux factuel, vérifiable par les commandes
> indiquées, destiné à accélérer la revue d'un service juridique ou achats.

## Licence du code

Tout le code de ce dépôt (`packages/cli`, `packages/core`, `packages/pandoc-filter`,
`packages/vscode-extension`) est publié sous **CC0 1.0 Universal** — domaine public. Texte légal
intégral et non modifié dans [`LICENSE`](../../LICENSE) (copie exacte de
<https://creativecommons.org/publicdomain/zero/1.0/legalcode>).

Conséquence pratique : aucune attribution requise, aucune clause copyleft, aucune restriction
d'usage commercial, aucune redevance. C'est la licence la plus permissive qui existe — plus
permissive que le MIT (qui exige encore la conservation de la notice de copyright).

## Dépendances tierces embarquées (runtime)

Arbre de dépendances réellement exécuté en production (`npm ls --omit=dev --all`), pas les
outils de développement/CI :

| Package | Rôle | Licence |
|---|---|---|
| `dagre` | Moteur de layout de graphe (positionnement des nœuds/arêtes) | MIT |
| `graphlib` | Dépendance de `dagre` | MIT |
| `lodash` | Dépendance de `graphlib` | MIT |
| `fast-check` | Génération de cas de test property-based (frontière parseur) | MIT |
| `pure-rand` | Dépendance de `fast-check` | MIT |
| `@types/dagre` | Typage TypeScript, aucun code exécuté à l'usage | MIT |

**100 % MIT.** Aucune dépendance runtime sous licence copyleft (GPL, AGPL, LGPL) ou sous licence
non-OSI. Vérifiable avec `npx license-checker --production` depuis la racine du dépôt.

## Le cas Pandoc (GPL-2.0-or-later)

Le pipeline délègue à [Pandoc](https://pandoc.org) tout ce qui n'est pas la conversion de
diagramme elle-même (parsing Markdown, tableaux, styles, manipulation de l'archive `.docx`) — voir
[`README.md`](../../README.md) → *Comment ça marche*. Pandoc est distribué sous GPL-2.0-or-later
(vérifié directement dans `COPYING.md` du dépôt `jgm/pandoc`).

Ce que ça signifie concrètement :

- Pandoc est **toujours invoqué comme sous-processus externe** (`execFile`/`spawn` avec un
  tableau d'arguments, jamais une chaîne shell — voir `AGENTS.md` règle 4), **jamais lié** au code
  de ce projet, ni statiquement ni dynamiquement. L'invocation à l'arm's length est généralement
  comprise comme n'imposant pas les obligations de la GPL au programme appelant — ce point reste
  à faire valider par votre propre service juridique si le dossier l'exige, ce document ne
  remplace pas cet avis.
- **CLI (`packages/cli`)** : suppose Pandoc déjà installé sur le poste (prérequis documenté dans
  `README.md`), ne le télécharge ni ne le distribue.
- **Extension VS Code (`packages/vscode-extension`)** : si Pandoc est absent du `PATH`, le binaire
  officiel non modifié est téléchargé depuis les releases GitHub de `jgm/pandoc`, vérifié par
  empreinte SHA-256 pinnée dans le code (`src/pandocProvisioner.ts`), et mis en cache **hors** du
  `.vsix` — jamais embarqué dans le package publié sur le Marketplace. Détail complet, y compris
  le texte GPL-2.0 intégral, dans
  [`packages/vscode-extension/THIRD_PARTY_NOTICES.md`](../../packages/vscode-extension/THIRD_PARTY_NOTICES.md).

## Flux de données / vie privée

- Le traitement (parsing Markdown, layout, génération OOXML) est **100 % local**, dans le
  processus Node.js qui exécute la CLI ou l'extension. Aucun contenu de document n'est envoyé à
  un service tiers.
- **Aucune télémétrie, aucun SDK d'analytics** dans le code (`grep` reproductible : pas de
  `fetch`/appel réseau hors ceux listés ci-dessous).
- Les seuls appels réseau du code sont, tous les deux dans l'extension VS Code uniquement, sur
  action explicite de l'utilisateur :
  1. Téléchargement du binaire Pandoc officiel depuis GitHub Releases (voir ci-dessus), une seule
     fois, si Pandoc est absent.
  2. Ouverture de la page `pandoc.org/installing.html` dans le navigateur si l'utilisateur clique
     sur le lien d'aide à l'installation.
- La CLI et le cœur (`packages/core`) n'effectuent **aucun** appel réseau.

## Où vérifier par vous-même

| Question | Commande / fichier |
|---|---|
| Licence de chaque dépendance runtime | `npx license-checker --production` |
| Texte légal de la licence du projet | [`LICENSE`](../../LICENSE) |
| Notices tierces (Pandoc) | [`packages/vscode-extension/THIRD_PARTY_NOTICES.md`](../../packages/vscode-extension/THIRD_PARTY_NOTICES.md) |
| Décision et historique sur le choix de licence/Pandoc | [`AGENTS.md`](../../AGENTS.md) → *Licensing* |
| Politique de vulnérabilité / contact sécurité | [`SECURITY.md`](../../SECURITY.md) |
