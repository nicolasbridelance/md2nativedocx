# ADR 0008 — Add-in Word : ruban dédié plutôt que menu contextuel natif, plan de spikes

- **Statut :** Recherche plateforme faite et décision de pivot prise (2026-09-06). **Scaffold codé
  le même jour** (`packages/word-addin/` — 5 boutons de production en stub + un bouton `[Dev]
  Vérifier les spikes` qui exécute réellement les spikes 1 et 2 et affiche le résultat dans un
  panneau copiable, voir `TODO.md`/`HANDOVER.md`). **Toujours bloqué sur les 3 spikes du §5**, qui
  nécessitent un vrai Word (desktop, pas Word Online) et ne peuvent pas être exécutés depuis ce
  sandbox Linux (pas de Word installable, pas d'identifiants Microsoft 365, pas de pattern
  d'automatisation E2E supporté pour Word) — le bouton `[Dev]` existe précisément pour que cette
  vérification humaine se limite à "lancer `npm run start`, cliquer une fois, coller le résultat
  ici".
- **Date :** 2026-09-06
- **Décideur :** Nicolas Bridelance (mainteneur).

## Contexte

Le plan Phase 4 d'origine (`TODO.md`, une ligne depuis le début du projet) était un taskpane avec
une zone de collage Mermaid. Le mainteneur a proposé une UX plus proche de ce qu'on trouve dans un
traitement de texte : clic droit natif "Copy as MD" / "Paste MD", plus une entrée "Save as .md"
dans "Enregistrer sous". Avant de s'engager sur cette forme, la plateforme Office Add-ins a été
vérifiée (Microsoft Learn, pages `add-in-commands` et `officemenu`, récupérées le 2026-09-06) —
deux des trois demandes butent sur des limites réelles de la plateforme, pas seulement des
difficultés d'implémentation.

## Décision

### 1. Ce que la plateforme permet réellement (recherché, pas supposé)

- **Menu contextuel natif "Copy as MD" — possible.** Le manifeste expose un vrai point
  d'extension : `<ExtensionPoint xsi:type="ContextMenu"><OfficeMenu id="ContextMenuText">` ajoute
  un bouton (ou un menu) au clic droit natif de Word (aussi Excel/PowerPoint/OneNote), **mais
  seulement quand du texte est sélectionné** — exactement le flux "sélectionner → clic droit →
  Copy as MD". Requirement set `AddinCommands 1.1`, largement supporté (web, Windows/Mac sur M365
  ou Perpetual 2021+).
- **Menu contextuel natif "Paste MD" — impossible.** `ContextMenuText` ne s'affiche que sur une
  sélection existante ; il n'existe aucun équivalent Word du `ContextMenuCell` d'Excel (clic droit
  sur un curseur sans sélection). Aucun point d'extension documenté ne couvre "clic droit à un
  endroit vide".
- **Entrée native dans "Enregistrer sous" — impossible.** Aucun point d'extension du manifeste
  n'ajoute de format à la liste native de Word. Un add-in ne peut pas s'enregistrer comme format de
  sauvegarde.

### 2. Décision de conception : un ruban dédié, pas le menu contextuel

Un mélange menu-contextuel-pour-Copy + ruban-pour-le-reste aurait produit une UX incohérente pour
un gain minime (un seul des 5 boutons aurait pu vivre dans le menu natif). **Décision : un ruban
dédié avec 5 boutons** — Charger un `.md`, Enregistrer sous `.md`, Couper en MD, Copier en MD,
Coller en MD. Ceci élimine aussi la contrainte "texte sélectionné" : un bouton de ruban fonctionne
quel que soit l'état de sélection du document.

**Insertion/remplacement à la position du curseur depuis un bouton de ruban — confirmé fiable**,
ce n'est pas un point de risque : un clic sur un bouton de ruban ne fait pas perdre la sélection du
document (pattern déjà utilisé par des add-ins de citation/équation depuis des années).
`context.document.getSelection()` lu au moment du clic, puis `range.insertOoxml(xml,
Word.InsertLocation.replace)`, remplace la sélection ou insère au curseur si elle est vide.

### 3. Le vrai point de risque : le presse-papiers, pas le curseur

Office.js n'a pas d'API presse-papiers dédiée pour Word — tout passe par l'API Web
(`navigator.clipboard`) :

- **Écriture** (`writeText()`, pour Couper/Copier) — risque faible, fonctionne presque toujours
  après un clic utilisateur.
- **Lecture** (`readText()`, pour Coller) — risque réel : elle exige un contexte avec focus/
  permission, et un *function command* (bouton de ruban sans UI visible) tourne dans un runtime
  caché, pas garanti d'avoir le focus. C'est le spike 1 ci-dessous.
- **Filet de sécurité si le spike échoue** : une boîte de dialogue (`displayDialogAsync`) avec une
  zone "collez votre Markdown ici" (Ctrl+V manuel) — zéro dépendance à l'API clipboard, garanti de
  fonctionner partout, un clic de plus pour l'utilisateur. Cette même boîte sert aussi pour
  "Charger un `.md`", qui a de toute façon besoin d'un sélecteur de fichier (`<input type=file>`,
  donc une surface visible, pas un function command pur).

### 4. Nouveau besoin d'architecture : le sens inverse OOXML→Markdown n'existe pas

Le moteur actuel (`packages/core`) ne va que dans le sens Markdown+Mermaid → OOXML. "Copier en MD"
et "Enregistrer sous .md" ont besoin du sens inverse — un module entièrement nouveau, pas du
branchement. Le cadrage fonctionnel de ce sens inverse existe déjà :
`docs/specs/FUTURE_wordextension.md` (conversion texte/tableaux/listes + reconstruction de
diagrammes) et `docs/specs/FUTURE_docx2mermaid_SPEC.md` (architecture, risques — connecteurs non
ancrés, duplication d'ID — et futur-proofing du traducteur direct). "Coller en MD" en revanche
réutilise le moteur *existant* quasiment tel quel, une fois bundlé pour un runtime navigateur — le
moins cher des 5 boutons.

### 5. Spikes requis avant tout code de production

Aucun ne peut être fait depuis ce sandbox : Word n'a pas de mode headless (contrairement à
LibreOffice), Word Online exigerait un compte Microsoft 365 réel (identifiants absents, et aucun
pattern d'automatisation E2E officiel/documenté trouvé en recherchant). Les 3 spikes demandent la
main du mainteneur dans un vrai Word desktop :

1. `navigator.clipboard.readText()` fonctionne-t-il de façon fiable depuis un function command
   dans le vrai Word desktop ? (risque n°1 de "Coller en MD", voir §3)
2. Forme réelle de l'OOXML renvoyé par `range.getOoxml()` sur une sélection Word ordinaire
   (titres/listes/tableaux/gras-italique) — dimensionne le nouveau convertisseur inverse (§4).
3. Rendu/comportement visuel des 5 boutons du ruban dans un vrai Word desktop.

### 6. Outillage retenu pour maximiser l'autonomie malgré ça

Trois outils, autonomes (aucun Word requis), à intégrer dès le scaffold :

- `office-addin-manifest validate` (CLI officielle Microsoft) — valide le schéma du manifeste,
  équivalent du validateur OOXML pour le manifeste.
- `office-addin-mock` (npm, officiel Microsoft) — simule `Word.run`/`context.document`/`range` en
  Node/Jest, pour tester la logique d'appel Office.js (bon ordre, bons paramètres) sans aucune app
  Office ouverte.
- Le validateur `dotnet` déjà dans ce repo (`scripts/oxml-validator/`, ADR 0007) — réutilisable tel
  quel pour valider tout fragment OOXML produit par le futur convertisseur avant de l'envoyer à
  `insertOoxml`.

Ces trois-là couvrent la validation statique/logique. Ils ne remplacent pas les 3 spikes du §5 —
rien dans l'écosystème Office Add-ins ne simule le comportement réel de Word en marche. Pour
limiter la friction malgré ce mur : le scaffold doit inclure un harnais minimal (un seul bouton qui
exécute les 3 spikes d'affilée et écrit le résultat dans un panneau copiable), pour que la
vérification humaine se limite à "ouvre Word, clique une fois, colle le résultat".

## Conséquences

- `TODO.md`, section "Phase 4 — Add-in Word (Office.js)", pointe vers ce document plus
  `FUTURE_wordextension.md`/`FUTURE_docx2mermaid_SPEC.md` et liste les 3 spikes + l'ordre de
  construction recommandé (Coller → Copier → Couper → Enregistrer sous/Charger).
- Le plan Phase 4 d'origine (taskpane + zone de collage) est remplacé par le ruban à 5 boutons
  décrit ici — pas une régression de périmètre, une UX plus proche de ce que le mainteneur a
  demandé, rendue possible par cette recherche.
- Tant que les spikes 1-3 n'ont pas tourné dans un vrai Word, aucun code de production ne doit être
  écrit sur l'hypothèse qu'ils réussissent — en particulier ne pas construire le convertisseur
  OOXML→Markdown avant le spike 2, qui en dimensionne la portée réelle.
