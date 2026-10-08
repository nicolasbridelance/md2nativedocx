# Spike S2 — couleurs, tailles et flèches des formes ODF (2026-10-08)

Motive la phase 0 de `docs/specs/05-libreoffice-odf-spec.md` : en ODF, couleurs et traits ne
s'écrivent pas sur la forme mais dans un **style** (`draw:style-name`), et un bloc brut placé dans le
corps du document ne peut pas déclarer de style automatique. Faut-il alors retoucher le `.odt` après
Pandoc (amendement de la règle 7) ?

**Réponse : non.** Le gabarit `opendocument` de Pandoc écrit lui-même `<office:automatic-styles>` à
partir d'une variable. Un gabarit dérivé du sien, avec une variable de plus à cet endroit, suffit :
le filtre Lua y range les styles dont le diagramme a besoin (métadonnée du document), et Pandoc
continue d'écrire tout le paquet.

```bash
docs/adr/spikes/spike-odf-styles/build.sh /tmp/s2      # écrit /tmp/s2/s2.odt
soffice-26.2 --headless --convert-to pdf /tmp/s2/s2.odt
```

`build.sh` dérive le gabarit et le `reference.odt` des fichiers par défaut de Pandoc au moment de la
construction, pour ne copier aucun fichier de Pandoc dans le dépôt.

**Montage.** `source.md` : un bloc brut `{=opendocument}` avec deux formes (rectangle, ellipse) et un
connecteur. `styles-filter.lua` : déclare quatre styles automatiques (deux styles de forme avec
fond, contour et hauteur fixe ; un style de connecteur avec flèche ; un style de paragraphe centré).
Le `reference.odt` porte la définition de la flèche (`draw:marker`), qui ne peut vivre que dans
`office:styles`.

**Résultats (Pandoc 3.1.3, LibreOffice 26.2.6 ; déplacement par l'API UNO avec 24.2.7).**

| Question | Résultat |
|---|---|
| Couleurs de fond et de contour par forme | Rendues, depuis les styles déclarés par le filtre |
| Hauteur demandée (1,5 cm) | Respectée avec `draw:auto-grow-height="false"` dans le style (en S0 la forme se réduisait à son texte) |
| Texte centré dans la forme | Style de paragraphe automatique `fo:text-align="center"` + `draw:textarea-vertical-align="middle"` |
| Flèche au bout du connecteur | `draw:marker` défini dans le `styles.xml` du `reference.odt`, référencé par le style du connecteur |
| Texte échappé (`A & <x>`) | Affiché tel quel |
| Les styles de Pandoc (tableau, listes) | Intacts, à côté des nôtres dans `office:automatic-styles` |

**Ancrage : le point qui a coûté le plus.** Formes ancrées une à une au paragraphe : le texte suivant
passe sous le diagramme, et avec `style:wrap="none"` il passe dessous, mais **le connecteur se
détache à l'ouverture**. Il reste attaché dans le modèle (`StartShape`/`EndShape` corrects) et se
recale au premier déplacement d'une forme, mais LibreOffice ne recalcule pas son tracé après la mise
en page initiale. Écrire ses extrémités (`svg:x1`…`svg:y2`) n'y change rien.

La bonne forme : **tout le diagramme dans un `draw:g` ancré comme caractère** (`as-char`). Le groupe
occupe sa place dans le flux (le texte suivant vient dessous), le connecteur est juste dès
l'ouverture, sans coordonnées explicites, et quand on déplace B dans le groupe il suit. C'est
l'équivalent du `wpg:wgp` de la sortie `.docx` ; comme dans Word, on entre dans le groupe (F3) pour
sélectionner une forme seule.

**Conséquences pour la phase 1.**

- Pas de post-traitement du `.odt` : la règle 7 n'a pas besoin d'une liste d'opérations sur le paquet
  ODF. Elle doit en revanche mentionner les deux fichiers fournis à Pandoc, le gabarit
  `opendocument` dérivé et le `reference.odt` avec ses `draw:marker`, comme elle mentionne le
  `reference.docx` (décision du mainteneur, spec 05 §8).
- Tout ce qui entre dans un style vient d'un texte non fiable (`style`, `classDef` du Mermaid) :
  couleurs validées (`#rrggbb`) et valeurs échappées avant d'entrer dans le XML, comme les étiquettes.
- Licence (vérifiée dans le `copyright` du paquet Debian de Pandoc 3.1.3) : les gabarits de
  `data/templates` sont sous double licence GPL-2+ **ou BSD-3-Clause**, donc un gabarit dérivé peut
  être livré sous BSD-3 avec sa notice. Le `reference.odt` relève du reste de Pandoc, GPL-2+ seule ;
  on peut l'éviter en créant le nôtre dans LibreOffice. Livrer l'un ou l'autre avec le CLI est une
  question de licence, donc une décision du mainteneur (rien de livré par ce spike).

**Non vérifié.** Validation par un validateur ODF (S5) ; rendu avec LibreOffice 24.2 (seul le
déplacement par l'API y a été fait) ; une vraie interface graphique.
