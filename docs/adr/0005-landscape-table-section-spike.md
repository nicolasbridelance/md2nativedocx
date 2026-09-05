# ADR 0005 — Spike : tableaux en section paysage dédiée (Lot 5, spec §1.9/§2.3)

- **Statut :** Spike réalisé, puis option (a) ("Décision" ci-dessous) implémentée en entier le
  même jour — voir `TODO.md`, entrée Lot 5. Ce document reste la trace des faits empiriques
  découverts par le spike ; les détails d'implémentation (dont un piège supplémentaire trouvé en
  écrivant le code réel, pas anticipé ici) sont dans `TODO.md`, pas dupliqués ici.
- **Date :** 2026-09-05
- **Décideur :** Nicolas Bridelance (mainteneur) — option (a) confirmée avant implémentation.

## Contexte

`docs/specs/export_customization_SPEC.md` §1.9/§2.3 et `TODO.md` (Lot 5) demandent un saut de
section Word pour basculer un tableau (précédé de son titre) en page paysage, puis revenir en
portrait après. La spec documente déjà un piège connu (le `<w:sectPr>` d'une section se code dans
le **dernier** paragraphe de la section qui **se termine**, pas en tête de la section qui
commence) et demande explicitement un spike avant d'estimer plus finement — pratique déjà suivie
pour l'intégration Pandoc (ADR 0002) et SmartArt (ADR 0004).

## Spike réalisé

`docs/adr/spikes/spike-landscape-table/` contient 3 documents de test + un filtre Lua minimal
(`spike-filter.lua`, callback `Pandoc(doc)` avec lookahead `Header`→`Table`), rendus en vrai PDF
via `soffice --headless --convert-to pdf` (pas juste une inspection XML statique) :

1. `spike.md` — `Header`+`Table` au milieu du document, avec du contenu avant et après.
2. `spike-edge.md` — deux paires `Header`+`Table` **adjacentes** (aucun bloc entre les deux),
   la seconde étant le dernier bloc du document.
3. `spike-trailing-only.md` — une seule paire `Header`+`Table`, qui est le **dernier bloc** du
   document (cas le plus simple possible de ce sous-cas).

### Résultat 1 — le piège documenté par la spec est confirmé, et la règle exacte est établie

Le paragraphe de bascule inséré **avant** le `Header` doit porter les réglages de la section qui
**se termine** à cet endroit — c'est-à-dire les réglages **portrait/inchangés** de la section
précédente, pas les réglages paysage. Symétriquement, le paragraphe inséré **après** le `Table`
doit porter les réglages **paysage** (il ferme la section qui vient de s'ouvrir). C'est l'inverse
d'une lecture littérale naïve de "insérer une bascule paysage avant le Header".

Vérifié par rendu réel (`spike.md` → 3 pages : portrait / paysage / portrait, tailles PDF
612×792pt puis 792×612pt puis 612×792pt, contenu correct sur chaque page via `pdftotext`).

### Résultat 2 — piège supplémentaire non documenté par la spec, trouvé par le spike : section vide = page blanche

Chaque fois que deux bascules de section se retrouvent **sans aucun paragraphe de contenu réel
entre elles**, Word/LibreOffice matérialise cette section vide par une **page blanche
supplémentaire**. Deux cas concrets, tous deux confirmés par rendu réel :

- **`spike-edge.md` (deux paires adjacentes)** : 5 pages produites au lieu de 3 attendues —
  portrait(Intro) / paysage(Table 1) / **portrait vide** / paysage(Table 2) / **portrait vide**.
  La 3e page (entre les deux tableaux) et la 5e page (après le second tableau) sont confirmées
  vides par `pdftotext` page par page.
- **`spike-trailing-only.md` (une seule paire, en toute fin de document)** : 3 pages produites au
  lieu de 2 attendues — portrait(Intro) / paysage(Table) / **portrait vide**. Ce n'est **pas** un
  cas rare (double tableau) : n'importe quel document se terminant par un tableau paysage déclenche
  ce bug dans son cas le plus simple.

Cause : notre filtre insère systématiquement un paragraphe de fermeture "retour au portrait" après
le `Table`, sans savoir si du contenu réel le suit. S'il n'y en a pas, ce paragraphe se retrouve
immédiatement adjacent au `<w:sectPr>` final de `<w:body>` (lui-même toujours présent, vide ou
peuplé par `reference.docx` — voir Résultat 3), formant une section réellement vide.

## Résultat 3 — confirmation d'un fait déjà établi au Lot 1, reconfirmé ici dans ce contexte précis

Le `<w:sectPr>` final de `<w:body>` (portrait par défaut) est bien repris **tel quel** du
`reference.docx` passé en `--reference-doc` quand celui-ci en porte un non vide (testé avec un
`pgSz`/`pgMar` custom distinctif, round-trippé). Ça confirme que le paragraphe de fermeture
"portrait" que notre filtre doit insérer **avant le Header** ne peut pas être une constante
Letter/portrait figée : il doit refléter le `pgSz`/`pgMar` réellement actif pour ce document (ceux
que Lot 1 calcule déjà côté CLI, `resolvePageSize`/`resolveMargins`), sans quoi un utilisateur ayant
choisi A4 verrait ses sections portrait basculer silencieusement en Letter autour de chaque tableau
paysage.

## Implications de conception pour l'implémentation réelle

1. **Fusionner les paires `Header`→`Table` contiguës** (aucun autre bloc entre la fin d'une paire
   et le début de la suivante) en **une seule** section paysage — n'émettre la paire
   fermeture/réouverture qu'aux véritables frontières de contenu, jamais entre deux tableaux
   adjacents.
2. **Le cas "dernier bloc du document" ne peut pas se corriger dans le filtre Lua seul** : le
   `<w:sectPr>` final de `<w:body>` est un artefact du writer Pandoc/`reference.docx` (Résultat 3),
   pas un nœud exposé dans `doc.blocks`. Il faut une passe de chirurgie XML **après** Pandoc, dans
   `packages/cli/src/postprocess.mjs` (même catégorie que le déplacement du patch `updateFields` du
   TOC au Lot 3, pour une raison structurellement identique — "Pandoc synthétise cette partie lui-
   même") : détecter le motif "paragraphe ne portant qu'un `sectPr` immédiatement suivi du
   `sectPr` final vide de `<w:body>`, sans paragraphe de contenu entre les deux", fusionner les
   réglages paysage dans le `sectPr` final de `<w:body>`, supprimer le paragraphe intermédiaire
   devenu redondant.
3. **Conséquence sur le découpage du travail** : ce lot n'est donc pas purement "nouveau filtre
   Lua" comme le cadre l'architecture de la spec (§2.3) — c'est un filtre Lua (bascules
   intermédiaires + fusion des paires contiguës) **et** une extension de `postprocess.mjs` (cas de
   fin de document), deux fichiers déjà distincts dans le pipeline mais dont l'interaction ici est
   nouvelle.
4. **Le paragraphe "retour au portrait" doit être paramétré par le `pgSz`/`pgMar` réellement actif**
   (Résultat 3), pas une constante Letter — probablement via une variable d'env passée au filtre
   Lua, même convention que `MD2NATIVEDOCX_MAX_DRAWING_CX`/`_CY` (Lot 1, dimensionnement dynamique
   des diagrammes).

## Non couvert par ce spike (à valider avant/pendant l'implémentation)

- Détection exacte de "Header immédiatement suivi d'un Table à travers d'éventuels blocs vides"
  (la spec mentionne ce cas sans préciser ce qu'est un "bloc vide" dans l'AST Pandoc réel — le
  filtre du spike gère uniquement un lookahead direct, pas de blocs intermédiaires réels testés).
- Tableaux imbriqués dans une `Div`/un `BlockQuote`, ou précédés d'un titre de niveau différent de
  celui testé ici (H1/H2) — non testés, périmètre probablement identique mais non vérifié.
- Interaction avec `md2nativedocx.referenceDocument` custom (Lot 1 ignore silencieusement ses
  propres réglages dans ce cas — même règle probablement applicable ici, non testée).

## Décision

**Option (a) retenue et implémentée en entier (2026-09-05, même jour que ce spike).** Ce spike a
confirmé que le Lot 5 était correctement noté "L" (le plus risqué) dans la spec, et a révélé un
piège plus large que celui déjà anticipé par la spec (pages blanches sur tableaux contigus ou en
fin de document, pas seulement le décalage d'un paragraphe) :

- (a) **[retenue]** Implémenter la solution complète ci-dessus (fusion des sections vides
  résultant de paires contiguës ou d'une fin de document + paramétrage dynamique du retour
  portrait) — livrée, voir `TODO.md` (Lot 5) pour le détail (dont un bug de regex et une
  dépendance de géométrie de page trouvés en écrivant le code réel, ni l'un ni l'autre anticipé
  par ce spike).
- (b) Réduire le périmètre v1 : n'accepter que les tableaux qui ne sont **ni** contigus à un autre
  tableau paysage **ni** en toute fin de document — non retenue, l'implémentation complète s'est
  révélée abordable (les deux mécanismes en jeu, `RawBlock('openxml', ...)` et la chirurgie ZIP
  post-Pandoc, étaient déjà éprouvés ailleurs dans le projet).

## Conséquences

- Les 3 documents de test + le filtre Lua du spike restent dans
  `docs/adr/spikes/spike-landscape-table/` comme base de départ pour l'implémentation réelle,
  même pratique que les spikes Pandoc (ADR 0002) et SmartArt (ADR 0004).
- `TODO.md` (Lot 5) mis à jour avec ce résultat de spike.
