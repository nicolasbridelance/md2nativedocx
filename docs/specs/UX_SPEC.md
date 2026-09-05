# docs/specs/UX_SPEC.md

Comportement à l'écran des composants utilisateur de `md2nativedocx` : l'extension VS Code
(Partie 1) et l'add-in Word (Partie 2). Troisième pilier de la documentation du projet, à lire
avec les deux autres :
- `docs/specs/cahier_des_charges.md` = le **quoi/pourquoi** (produit, architecture)
- `AGENTS.md` = le **comment coder** (règles techniques, sécurité)
- `docs/specs/UX_SPEC.md` (ce fichier) = le **comment ça se comporte à l'écran**

Comme les deux autres, ce fichier fait autorité — une implémentation qui diverge de ce qui est
décrit ici sans décision explicite documentée est un bug, pas une variante acceptable.

**Maturité inégale, assumée :** la Partie 1 (VS Code, Phase 2) est prête à implémenter. La
Partie 2 (Word, Phase 4) est volontairement moins détaillée — elle pose les principes et les
questions ouvertes, pas une spec figée, parce que la Phase 4 est encore loin dans la roadmap et
que la figer aujourd'hui gèlerait des décisions prématurément.

---

## Principe directeur (les deux parties)

Le problème qu'on essaie d'éviter, nommé explicitement : la plupart des extensions VS Code sont
difficiles à localiser et peu intuitives, parce qu'elles reposent sur la Palette de Commandes comme
unique point d'entrée (il faut déjà savoir que l'extension existe et connaître le nom exact de la
commande) et parce qu'elles laissent l'utilisateur sans retour pendant les opérations longues.
Chaque décision de ce document répond directement à l'un de ces deux problèmes : **découvrabilité
sans effort de mémoire**, et **retour visuel à chaque étape**.

Contrainte permanente, héritée de `docs/specs/cahier_des_charges.md` §2 : **aucune édition WYSIWYG des
diagrammes hors de Word.** Toute fonctionnalité UI qui commence à ressembler à un éditeur de formes
— dans VS Code ou dans le taskpane Word — est hors scope, quelle que soit sa popularité
potentielle. Cette limite s'applique aux deux parties ci-dessous, chacune a sa propre section
rappelant où elle est la plus tentante à franchir.

---

# Partie 1 — Extension VS Code

---

## Points d'entrée

| Point d'entrée | Où | Quand il apparaît |
|---|---|---|
| CodeLens "⚙️ Exporter en Word" | Au-dessus de chaque bloc ` ```mermaid ` | Automatique, dès qu'un bloc mermaid est détecté dans un `.md` ouvert |
| CodeLens "Exporter le bloc seul" | Idem, à côté du précédent | Idem |
| CodeLens "⚙️ Exporter en Word" (pleine largeur, ligne 0) | Haut du fichier | `.md` sans aucun bloc mermaid, ou `.mmd` — voir décision ci-dessous |
| CodeLens "👁 Aperçu" (Phase 2.5) | Au-dessus de chaque bloc mermaid | Idem — seulement une fois le prérequis Phase 2.5 rempli (voir TODO.md) |
| Pastille barre de statut | Barre de statut VS Code, en bas | Dès qu'un `.md` ou `.mmd` est le fichier actif (plus besoin d'un bloc mermaid — voir décision ci-dessous) |
| Menu contextuel (clic droit) | Explorateur de fichiers, et clic droit dans l'éditeur | Sur tout `.md`/`.mmd` |
| Palette de Commandes | `Ctrl+Shift+P` → "md2nativedocx: ..." | Toujours disponible — c'est le filet de sécurité pour qui préfère le clavier, jamais le point d'entrée principal |
| Walkthrough d'accueil | Onglet Welcome de VS Code, à l'installation | Une fois, à l'installation, via l'API `Walkthroughs` de VS Code |
| Panneau de configuration (Phase 8, Lot 4) | Icône dédiée dans l'Activity Bar → vue Webview dans la Sidebar primaire | Toujours disponible — réglages de mise en page/typo/TOC/emoji (spec `export_customization_SPEC.md` §3), synchronisé en lecture/écriture avec `settings.json` natif, jamais de double source de vérité. N'expose que les réglages qui existent réellement (Lots 1-3) ; pas de contrôle pour un réglage pas encore livré (Lot 5, Lot 6). |

Le CodeLens et la pastille de statut sont délibérément redondants : le CodeLens peut être filtré
mentalement par des utilisateurs habitués à en voir beaucoup (GitLens, Copilot, etc.), la pastille
de statut sert de second point d'entrée persistant pour ce cas.

**Décision (Nicolas Bridelance, 2026-09-02) — les points d'entrée ne sont plus conditionnés à la
présence d'un bloc mermaid.** La version précédente de cette section masquait le CodeLens et la
pastille de statut tant qu'aucun bloc mermaid n'était détecté, en cohérence avec le positionnement
"diagrammes Mermaid → Word". Mais le pipeline (Pandoc) exporte déjà **tout** le Markdown — texte,
tableaux, mise en forme, formules LaTeX — que le document contienne un diagramme ou non ; masquer
les points d'entrée pour ce cas contredisait donc la promesse réelle de l'outil plutôt que de la
refléter. Corrigé : le CodeLens et la pastille de statut sont désormais toujours visibles sur tout
`.md`/`.mmd` ouvert (un lens unique en haut de fichier remplace les lenses par-bloc quand il n'y en
a aucun à ancrer), et un menu contextuel clic-droit (Explorateur + éditeur) est ajouté comme point
d'entrée supplémentaire pour qui n'ouvre pas forcément le fichier avant d'exporter. Ceci inclut
aussi le support d'un fichier `.mmd` brut (Mermaid seul, sans balisage Markdown) : il est enveloppé
automatiquement dans un document minimal avant export — voir `src/mermaidBlocks.ts` (`wrapMermaidSource`)
et `src/exportService.ts` (`exportMermaidFile`).

Le walkthrough d'accueil est sous-exploité par la majorité des extensions alors qu'il répond
exactement au moment où quelqu'un vient d'installer et ne sait pas par où commencer — à traiter
comme une tâche de Phase 2 à part entière, pas comme un "nice to have" repoussable indéfiniment.

---

## Les 4 états de l'export

| État | Signal visuel | Règle |
|---|---|---|
| **Repos** | CodeLens visible, pastille de statut à jour | Aucune configuration requise avant ce point (voir "Zéro config" plus bas) |
| **En cours** | Barre de progression fine sous l'éditeur + toast avec spinner | Jamais de gel silencieux de l'interface — l'appel à Pandoc n'est pas instantané, l'absence de retour est lue comme un bug par l'utilisateur |
| **Succès** | Toast avec actions directes : "Ouvrir dans Word" / "Révéler dans l'explorateur" | Referme la boucle en un clic — ne jamais forcer l'utilisateur à aller chercher le fichier lui-même |
| **Erreur** | Toast avec message explicite + action de réparation | Jamais de stack trace brute (voir "Conventions de copy") |

Le même schéma à 4 états s'applique à l'aperçu (Phase 2.5), avec l'état de chargement explicitement
requis (rendu LibreOffice headless : 1 à 3 secondes typiquement, pas instantané non plus).

---

## Conventions de copy

- **Le verbe reste identique du déclenchement à la confirmation.** Le bouton dit "Exporter" → la
  progression dit "Export en cours" → la confirmation dit "Exporté". Ne jamais glisser vers un
  synonyme ("Générer", "Conversion terminée") en cours de route — la cohérence du vocabulaire est
  ce qui permet à quelqu'un de suivre ce qui se passe sans y réfléchir.
- **Voix active, verbes concrets.** "Exporter vers Word", pas "Soumettre" ; "Ouvrir dans Word", pas
  "Continuer".
- **Jamais de stack trace brute affichée à l'utilisateur.** Une erreur dit ce qui a manqué
  ("Pandoc est introuvable sur cette machine") et propose une action de réparation directe
  ("Installer Pandoc"), pas un lien générique vers une documentation à parcourir seul. La stack
  trace complète va dans les logs de sortie de l'extension (Output panel), pas dans le toast.
- **Nommer les choses comme l'utilisateur les voit, pas comme le système les construit.** "Diagramme
  détecté", pas "Bloc de code avec le langage mermaid identifié".

---

## Aperçu (Phase 2.5) — la limite à ne pas franchir

Voir TODO.md pour le détail d'implémentation. La règle qui compte ici, à ne jamais assouplir sans
décision humaine explicite :

**Le panneau d'aperçu est strictement en lecture seule.** Aucune interaction d'édition — pas de
déplacement de forme, pas de redimensionnement, pas de changement de couleur, pas de sélection
persistante. C'est une image rendue, affichée dans un webview, point final. Toute demande future
("et si on pouvait juste ajuster la couleur avant d'exporter ?") doit être reconnue comme une
tentative de reconstruire un éditeur de formes dans VS Code — exactement ce que le projet exclut
depuis `docs/specs/cahier_des_charges.md` §2 — et escaladée à un humain plutôt qu'implémentée directement.

---

## Zéro configuration avant le premier usage

Aucun réglage ne doit être nécessaire pour que le chemin nominal (CodeLens → export → fichier
`.docx`) fonctionne à l'installation. Les seuls réglages exposés — dossier de sortie, choix
Dagre/Graphviz, chemin d'un `reference.docx` personnalisé — restent optionnels, avec des valeurs
par défaut qui marchent sans y toucher. Si l'implémentation d'une fonctionnalité en vient à exiger
une configuration manuelle avant le premier usage, c'est un signal pour repenser la fonctionnalité,
pas pour documenter l'étape de configuration.

---

## Icône

`icon.svg` (racine du package `packages/vscode-extension/`). Rationale complète : un losange —
directement le nœud "décision" `{texte}` de la syntaxe Mermaid (§6.1 du cahier des charges), pas une
forme arbitraire — avec quatre poignées de sélection à ses coins, le vocabulaire visuel universel
d'"objet vectoriel sélectionné et éditable" (Word, PowerPoint, Figma, Illustrator), directement lisible
sans légende. Testé à 16px (barre d'activité) et pas seulement en grand, puisque c'est la taille où la
différenciation compte le plus. Couleur délibérément à l'écart du bleu dominant (VS Code, Word, la
plupart des extensions markdown) sans se confondre avec la couleur de marque de l'un ou l'autre.

---

# Partie 2 — Add-in Word (Office.js)

**Statut : Phase 4 (cahier des charges §11), bien après l'extension VS Code.** Section volontairement
moins détaillée que la Partie 1 — à affiner juste avant le démarrage réel de la Phase 4, pas figée
aujourd'hui. Ne pas la traiter comme une liste de tâches prête à implémenter.

## Ce qui change par rapport à la Partie 1

- **Persona différent.** Ici c'est le rédacteur technique/fonctionnel qui vit dans Word (persona 2,
  cahier des charges §3), pas l'ingénieur docs-as-code. De toute façon Word n'a pas d'équivalent
  CodeLens ni Palette de Commandes — les paradigmes de la Partie 1 ne se transposent pas tels quels.
- **Le résultat est visible immédiatement.** Contrairement à VS Code, où l'utilisateur doit aller
  ouvrir un `.docx` généré séparément, l'insertion Word se fait directement dans le document déjà
  ouvert, sous les yeux de l'utilisateur. Ça change ce qui compte comme "retour visuel" — voir la
  question ouverte sur l'aperçu ci-dessous.

## Point d'entrée (hypothèse de travail)

Un bouton de ruban personnalisé (onglet Insertion, ou onglet dédié) — c'est l'équivalent du
CodeLens/pastille de statut de la Partie 1 : visible sans avoir à chercher dans un menu. Ouvre un
taskpane (panneau latéral) avec une zone de texte pour coller/écrire du Mermaid et un bouton
"Insérer".

## Flux (hypothèse de travail)

1. Ouvrir le taskpane (bouton de ruban).
2. Coller ou écrire le Mermaid.
3. Cliquer "Insérer" → traduction exécutée côté client (le module core bundlé navigateur, §5.4.c —
   pas de Pandoc sur ce canal) → `insertOoxml` à la position du curseur.
4. Les formes apparaissent directement dans le document — c'est la confirmation, pas besoin d'un
   toast "Ouvrir dans Word" puisqu'on est déjà dedans.

## Question ouverte : la Partie 2 a-t-elle besoin d'un équivalent Phase 2.5 ?

Probablement pas sous la même forme. L'aperçu de la Partie 1 résout un problème précis : "je ne vois
pas le résultat avant d'ouvrir le `.docx`." Ce problème n'existe pas ici — l'insertion est
immédiatement visible dans le document déjà ouvert. **Ne pas porter Phase 2.5 telle quelle sur ce
canal sans revalider d'abord que le problème qu'elle résout se pose réellement.**

## Ce qui reste vrai depuis la Partie 1

- Zéro configuration avant le premier usage (voir Partie 1).
- Jamais d'édition de formes dans le taskpane lui-même — le taskpane insère, l'édition se fait
  ensuite dans Word avec ses propres outils de dessin natifs. Reconstruire un mini-éditeur dans le
  taskpane serait la même dérive que dans l'aperçu VS Code, sur une nouvelle surface.
- Conventions de copy identiques (verbe cohérent du bouton à la confirmation, jamais de stack trace
  brute).

## Erreurs spécifiques à ce canal — à cartographier avant la Phase 4, pas fait ici

- Mermaid mal formé (erreur de parsing) — pas de scénario "Pandoc introuvable" sur ce canal, ce mode
  d'échec de la Partie 1 n'a pas d'équivalent ici.
- Échec de `insertOoxml` (document protégé, restrictions de content control, incompatibilité de
  version Office) — surface d'erreur propre à Office.js, non explorée à ce stade.