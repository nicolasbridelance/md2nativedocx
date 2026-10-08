# ADR 0013 — Sortie ODF : conclusions de la phase 0

- **Statut :** **Accepté** (2026-10-08). Le mainteneur a délégué à l'agent les trois décisions
  ci-dessous (« fais selon tes recommandations ») et a accepté le validateur de S5.
- **Spec liée :** `docs/specs/05-libreoffice-odf-spec.md` (phases, sécurité, §8).
- **Preuves :** les spikes S0 à S5 sous `docs/adr/spikes/` (`spike-odf-connector/`,
  `spike-odf-styles/`, `spike-odf-markdown-import/`, `spike-odf-validator/`,
  `spike-odf-libreoffice-filter/`).

## Contexte

La cible LibreOffice / ODF est la priorité du projet depuis le 2026-10-08. La phase 0 devait dire si
le mécanisme du `.docx` (le filtre remplace le bloc Mermaid par du XML brut, Pandoc écrit le paquet)
tient pour un `.odt`, et par où passe l'intégration dans LibreOffice.

## Ce que la phase 0 a établi

1. **Pandoc écrit le `.odt`, sans post-traitement.** Un bloc brut `{=opendocument}` passe tel quel
   (S0). Les styles qu'un bloc brut ne peut pas déclarer arrivent par une variable ajoutée au
   gabarit `opendocument` de Pandoc, dans `office:automatic-styles`, remplie par le filtre ; les
   flèches (`draw:marker`) vivent dans le `reference.odt` (S2).
2. **Un diagramme = un `draw:g` ancré comme caractère.** Formes ancrées une à une : le connecteur se
   détache à l'ouverture. Dans le groupe : connecteur juste, attaché, qui suit une forme déplacée
   (S1, S2), texte suivant placé dessous.
3. **Le connecteur porte ses extrémités et un `svg:viewBox`** : attribut obligatoire, que
   LibreOffice tolère sans rien dire et que le validateur a trouvé (S5).
4. **Validateur : `odfvalidator` 0.13.0** de l'ODF Toolkit, zéro erreur exigée
   (`npm run test:odf-validate`, en CI depuis le 2026-10-08).
5. **LibreOffice 26.2.6 épinglé** à côté de celui d'apt (`soffice-26.2`,
   `scripts/install-libreoffice-pinned.sh`) ; 26.8 à partir de 26.8.2 (S3).
6. **Porte B = une extension LibreOffice.** L'import Markdown jette l'info-string et LibreOffice a
   refusé de la garder (bug 172530, WONTFIX) ; ses développeurs préfèrent Mermaid hors du code de base
   (bug 172531). L'extension reconnaît Mermaid au contenu (`detectDiagramType()` + une analyse qui
   doit réussir) (S4).

## Décision 1 — API du core : une fonction à part, `renderDiagramOdf()`

Plutôt qu'une option de format dans `renderDiagram()`.

**Pourquoi.** `RenderResult` est fait pour Word : `kind` vaut `shapes`, `smartart` ou `chart`,
`parts` contient des parties de paquet `.docx`, le fragment est du WordprocessingML. Une sortie ODF
n'a ni SmartArt ni graphique natif pour l'instant, mais elle a des styles à déclarer. Une option de
format ferait de chaque champ une union dont la moitié ne s'applique pas. L'ADR 0012 (règle 2) veut
une abstraction seulement quand deux implémentations la prouvent : la phase 1 écrit la seconde, et ce
qu'elles partagent (détection, limites, mise en page, métadonnées) sera extrait ensuite.

**Forme visée** (à affiner en phase 1, sans promesse de stabilité avant 1.0) :

```ts
renderDiagramOdf(source: string, options?: OdfRenderOptions): OdfRenderResult

interface OdfRenderResult {
  /** `<text:p>` holding one `draw:g` anchored as a character (or a note paragraph). */
  fragment: string;
  /** `<style:style>` elements for `office:automatic-styles`, through the derived template. */
  automaticStyles: string[];
  metadata: RenderMetadata;              // same as renderDiagram()
}
```

`OdfRenderOptions` reprend les limites (`maxSourceLength`, `maxNodes`, `maxEdges`) et ajoute un
`idPrefix` : `draw:id`, `xml:id` et noms de style doivent être uniques dans le document, l'appelant
donne un préfixe par diagramme (validé, `[A-Za-z][A-Za-z0-9_-]{0,31}`). Les noms des flèches
viennent d'une liste fixe, exportée, que le `reference.odt` définit.

Une fonction exportée de plus dans le core reste une décision d'API (AGENTS.md) : elle est prise
ici ; sa forme exacte sera relue au moment de la phase 1.

## Décision 2 — Licence des deux fichiers fournis à Pandoc

Vérifié dans le fichier `copyright` du paquet Debian de Pandoc 3.1.3 : les gabarits
(`data/templates/*`) sont sous **GPL-2+ ou BSD-3-Clause** au choix ; le reste des données,
`reference.odt` et `reference.docx` compris, sous **GPL-2+** seule.

- **Gabarit `opendocument` dérivé : livré sous BSD-3-Clause**, avec la notice de copyright de
  Pandoc (John MacFarlane) et le texte de la licence dans un `THIRD_PARTY_NOTICES.md` du paquet qui
  le livre. Notre modification (une variable) reste dans le gabarit, sous la même licence.
- **`reference.odt` : le nôtre, pas celui de Pandoc.** Écrit à la main et minimal (les `draw:marker`
  et ce qui doit différer des styles par défaut de LibreOffice), sous CC0 comme le reste du dépôt.
  À vérifier en phase 1 : que Pandoc s'en contente pour les titres, le code et les tableaux. Repli :
  un document vierge enregistré par LibreOffice, complété des marqueurs. Jamais le `reference.odt` de
  Pandoc.

## Décision 3 — Règles d'`AGENTS.md` pour le `.odt`

- **Règle 7** : Pandoc écrit aussi le paquet `.odt`, et **aucune** opération n'est permise sur un
  `.odt` produit par Pandoc. Les seuls fichiers propres au projet qu'on lui fournit sont le gabarit
  `opendocument` dérivé (seul écart avec celui de Pandoc : la variable de styles) et notre
  `reference.odt`.
- **Règle 3** élargie à l'ODF : pas de macro ni de script, pas de lien hypertexte ni de référence
  vers une URL, pas de source DDE, pas d'objet lié hors du paquet (spec 05 §7).
- **Règle 2** : les valeurs qui entrent dans un style (couleurs d'un `style` ou `classDef` Mermaid)
  sont du texte non fiable comme les étiquettes : validées par un motif strict avant d'entrer
  dans le XML, comme le fait déjà `hexColor()` côté OOXML.
- **Tableau de sécurité** : une ligne « références externes et macros ODF » ; la ligne « Zip bomb »
  ne cite plus l'ancien §2.1 du cahier des charges.

## Conséquences

- Phase 1 (flowcharts en `.odt`) peut commencer : `renderDiagramOdf()` dans le core, branche ODF du
  filtre Lua, `-o doc.odt` dans le CLI, gabarit et `reference.odt` dans `packages/cli/assets/`,
  golden tests ODF, `test:odf-validate` sur la sortie réelle du CLI.
- Porte B (phase 3) : extension LibreOffice, adaptateur mince sur `renderDiagramOdf()`. Contact sur
  le bug 172531 seulement quand une première version est montrable (décision du mainteneur).
- Le `reference.docx` déjà livré par le CLI était dérivé de celui de Pandoc, donc GPL-2+ selon la même
  source. Le mainteneur a choisi de le refaire de zéro (2026-10-08) : il est désormais écrit par le
  projet (`packages/cli/reference-docx-src/`, `scripts/build-reference-docx.mjs`), même rendu au pixel
  près dans LibreOffice, sans relation externe.
