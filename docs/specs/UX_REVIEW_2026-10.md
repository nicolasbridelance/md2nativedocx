# Revue UX de l'extension VS Code — octobre 2026

Statut : **décisions D1–D9 validées telles que recommandées par le mainteneur (2026-10-06)** ; lots A, B et C livrés (2026-10-06), lot D ensuite. Une fois livrée,
la cible (section 3) remplacera la Partie 1 de `UX_SPEC.md`, qui décrit l'état de septembre.

Pourquoi maintenant : l'extension a été pensée pour « un document Markdown → un `.docx` ». Depuis,
le projet a gagné le `.pptx`, les SmartArt (validés dans Word, mais désactivés par défaut), les
graphiques natifs et une promesse recentrée sur « des diagrammes que le lecteur peut modifier dans
Word ». L'interface n'a suivi aucun de ces changements.

---

## 1. Ce qui existe aujourd'hui (inventaire du code, v0.5.6)

| Point d'entrée | Ce qu'il fait | Remarque |
|---|---|---|
| CodeLens « ⚙️ Export to Word », au-dessus de **chaque** bloc mermaid | Exporte **tout le document** | Placé sur un bloc, il agit sur le document entier |
| CodeLens « Export this block only », à côté | Exporte ce seul diagramme dans un `.docx` à part | |
| CodeLens unique en ligne 0 | Exporte le document (fichier sans bloc mermaid, ou `.mmd`) | |
| Pastille de barre d'état « Export to Word » | Exporte le document ; l'infobulle compte les diagrammes | |
| Clic droit (explorateur, éditeur, onglet) | « Export document to Word » | Rien pour un bloc, rien pour PowerPoint |
| Palette | 2 commandes (document, diagramme sous le curseur) | Pas de raccourci clavier |
| Panneau latéral (icône dans l'Activity Bar) | Mise en page, typographie, structure, emoji, avancé, aperçu de page | **En français codé en dur** (l'extension est traduite en 6 langues) ; **aucun réglage de diagramme** (SmartArt, graphiques) |
| `settings.json` | 30 réglages | Réglages utilisateur et réglages techniques (`pandoc.sha256`, `dotnet.sha512`…) au même niveau |
| Walkthrough d'accueil | 3 étapes : ouvrir un `.md`, CodeLens, résultat | Ne mentionne ni PowerPoint ni SmartArt |

Absents : **export PowerPoint** (la CLI le fait, l'extension ne l'expose pas), **survol** d'un bloc
(prévu par `FUTURE_mmd2smartart_SPEC.md` §10.1, jamais fait), toute indication de **ce que deviendra**
un diagramme (SmartArt, graphique natif, formes, type non pris en charge) avant d'avoir exporté et
ouvert le fichier.

---

## 2. Problèmes

1. **Le CodeLens ment sur sa portée.** « Export to Word » posé sur un bloc exporte tout le document,
   et il est répété au-dessus de chaque bloc : sur un document à 8 diagrammes, 8 boutons identiques
   font la même chose.
2. **On ne sait pas ce qu'on va obtenir.** Le même bloc peut devenir un SmartArt, des formes, un
   graphique natif ou une note « type non pris en charge », selon sa forme et deux réglages. On ne
   l'apprend qu'en ouvrant Word. Le cas le plus fréquent (« fusion après branchement », spec §6)
   retombe en formes sans que l'utilisateur sache pourquoi ni comment l'éviter.
3. **PowerPoint est invisible.** Un utilisateur de l'extension ne peut pas savoir que le `.pptx` existe.
4. **Les meilleurs rendus sont cachés.** SmartArt et graphiques natifs sont désactivés par défaut
   et absents du panneau de réglages. La promesse du README (« modifiez vos diagrammes dans Word,
   ajoutez une étape en un clic ») n'est tenue que pour qui va fouiller `settings.json`.
5. **« Exporter le bloc seul » a un usage flou.** Il produit un `.docx` contenant un diagramme. Le
   besoin réel est presque toujours « mettre ce diagramme dans un autre document Word ou dans une
   diapo » : le résultat devrait aller vers ce besoin (PowerPoint, une diapo par diagramme, est
   souvent la meilleure réponse).
6. **Réglages à plat.** 30 réglages dans une liste, dont 4 que personne ne doit toucher sauf
   environnement d'entreprise ; le panneau n'est pas traduit.
7. **Clic droit pauvre** : une seule entrée, pas de sous-menu, pas d'action sur un bloc, pas d'export
   de plusieurs fichiers sélectionnés.

---

## 3. Cible proposée

### 3.1 Vocabulaire
Un verbe, deux formats, deux portées. Partout (CodeLens, menus, palette, barre d'état, toasts) :

| | Word | PowerPoint |
|---|---|---|
| **Document** | Exporter en Word | Exporter en PowerPoint |
| **Diagramme** | Exporter ce diagramme en Word | Exporter ce diagramme en PowerPoint |

Le `.pptx` d'un document = une diapo par diagramme (comportement actuel de la CLI) ; le `.pptx` d'un
diagramme = une seule diapo.

### 3.2 CodeLens
- **En haut du fichier, une seule ligne, pour le document :**
  `Exporter en Word · Exporter en PowerPoint · ⚙ Réglages`
- **Au-dessus de chaque bloc, ce que deviendra le diagramme, puis l'action sur ce bloc :**
  `◆ SmartArt (arbre, 3 niveaux) · Exporter ce diagramme…`
  `▭ Formes Word modifiables · Exporter ce diagramme…`
  `▭ Formes (SmartArt impossible : fusion entre B et E) · Exporter ce diagramme…`
  `📊 Graphique Word (Modifier les données) · Exporter ce diagramme…`
  « Exporter ce diagramme… » ouvre un choix rapide Word / PowerPoint.
- La ligne d'état du bloc se met à jour à la frappe (classification pure, sans Pandoc, < 1 ms).

### 3.3 Survol d'un bloc
Survoler la clôture ` ```mermaid ` affiche : le type détecté, le rendu prévu et pourquoi, ce qui se
perd (ex. « disposition rayonnante du mindmap »), et un lien d'action quand un réglage changerait le
résultat (« Activer les SmartArt »). C'est le §10.1 de la spec SmartArt, enfin livré.

### 3.4 Clic droit
Un sous-menu **md2nativedocx** (explorateur, éditeur, onglet) : Exporter en Word, Exporter en
PowerPoint ; dans l'éditeur, curseur dans un bloc : « Exporter ce diagramme en Word / PowerPoint ».
Sélection multiple dans l'explorateur : export de chaque fichier.

### 3.5 Barre d'état
La pastille garde « Exporter en Word » au clic (l'action la plus courante) ; son infobulle donne le
bilan du document (« 6 diagrammes : 3 SmartArt, 2 formes, 1 graphique ») et propose PowerPoint.

### 3.6 Réglages
Regroupés en sections, dans `settings.json` comme dans le panneau (traduit) :

| Section | Réglages |
|---|---|
| **Sortie** | dossier de sortie ; ouvrir le fichier après export (nouveau) ; modèle Word d'entreprise (`referenceDocument`) |
| **Diagrammes** | SmartArt (activé, style, dessin pré-rendu) ; graphiques natifs ; PowerPoint : afficher la source Mermaid à côté (`--show-source`, nouveau dans l'extension) |
| **Mise en page** | inchangé |
| **Typographie** | inchangé |
| **Structure du document** | table des matières, emoji |
| **Avancé** (repliée) | vérification de compatibilité Word ; URL/empreintes Pandoc et .NET pour postes verrouillés |

### 3.7 Valeurs par défaut
SmartArt **activé** avec dessin pré-rendu (tout est validé dans Word : chaînes, cycles, arbres 2-10
niveaux dans 4 directions, organigramme compact, mindmap, treeView, 7 profils). Graphiques natifs :
activés pour `pie` (validé) ; `xychart`/`radar` à valider d'abord (CHECKLIST Round 5). **Mise à jour 2026-10-06 :** Round 5 confirmée dans Word, les trois types sont activés par défaut.
Un utilisateur qui a déjà réglé explicitement un de ces paramètres garde son choix (VS Code ne
remplace jamais une valeur explicite).

### 3.8 Walkthrough
4 étapes : ouvrir un `.md` · lire la ligne au-dessus d'un diagramme (ce qu'il deviendra) · exporter en
Word ou PowerPoint · modifier le diagramme dans Word (ajouter une étape au SmartArt).

---

## 4. Décisions à prendre

| # | Question | Recommandation |
|---|---|---|
| D1 | SmartArt activé par défaut (+ dessin pré-rendu) ? | **Oui** — tout est validé dans Word ; c'est la promesse du README |
| D2 | Graphiques natifs par défaut ? | **`pie` oui ; `xychart`/`radar` après validation** dans Word (Round 5) |
| D3 | PowerPoint dans l'extension, au même rang que Word ? | **Oui**, mêmes points d'entrée, `.pptx` déjà fiable dans PowerPoint |
| D4 | CodeLens : une ligne document en haut + une ligne « ce que deviendra ce diagramme » par bloc | **Oui** (remplace les 2 lenses répétées par bloc) |
| D5 | Survol avec rendu prévu, raisons et lien « activer » | **Oui** ; demande d'embarquer le classifieur du moteur dans l'extension (bundle esbuild, aucune dépendance nouvelle) |
| D6 | « Exporter le bloc seul » devient « Exporter ce diagramme… » avec choix Word / PowerPoint | **Oui** |
| D7 | Nouveau réglage « Ouvrir le fichier après export » | **Non par défaut** (le toast propose déjà « Ouvrir ») ; à ajouter seulement si demandé |
| D8 | Raccourci clavier pour « Exporter en Word » | **Non** (conflits fréquents) ; la palette et la barre d'état suffisent |
| D9 | Panneau de réglages traduit dans les 6 langues | **Oui**, comme le reste de l'extension |

---

## 5. Livraison proposée

1. **Lot A — vocabulaire + PowerPoint** : commandes et sous-menu Word/PowerPoint, CodeLens document en
   haut, « Exporter ce diagramme… » avec choix, réglage `--show-source`. (D3, D6)
2. **Lot B — savoir avant d'exporter** : classifieur embarqué, ligne d'état par bloc, survol, bilan
   dans la barre d'état. (D4, D5)
3. **Lot C — réglages** : sections, section Diagrammes dans le panneau, traduction du panneau,
   nouvelles valeurs par défaut. (D1, D2, D9)
4. **Lot D — walkthrough et README de l'extension** mis à jour, nouvelles captures.

Chaque lot se vérifie dans un vrai VS Code (captures dans `packages/vscode-extension/docs/`) avant le
suivant.
