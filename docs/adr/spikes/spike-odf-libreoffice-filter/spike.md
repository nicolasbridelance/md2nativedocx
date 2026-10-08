# Spike S4 — le filtre Markdown de LibreOffice et la porte B (2026-10-08)

Motive la porte B de `docs/specs/05-libreoffice-odf-spec.md` : LibreOffice rend lui-même les
diagrammes Mermaid quand il ouvre un `.md`. Lecture du code, pas de contact public.

## Le code (branches `libreoffice-26-2` et `master`, `sw/source/filter/md/`)

Import (`mdcallbcks.cxx`, `swmd.cxx`), analyseur MD4C :

- `md_parse` est lancé avec `MD_DIALECT_GITHUB | MD_FLAG_WIKILINKS`.
- `MD_BLOCK_CODE` appelle `BeginCodeBlock()` **sans lui passer le détail du bloc**
  (`MD_BLOCK_CODE_DETAIL`, qui porte l'info-string). `BeginCodeBlock()` applique le style
  « Texte préformaté » et un fond, rien de plus : le langage n'est stocké nulle part. C'est ce que S3
  avait observé (`docs/adr/spikes/spike-odf-markdown-import/`).
- Maths : le drapeau `MD_FLAG_LATEXMATHSPANS` n'est pas activé, donc `$…$` reste du texte ordinaire
  et les échappements CommonMark s'appliquent (`\,` devient `,`, vu en S3). Les callbacks
  `MD_SPAN_LATEXMATH*` existent mais ne font rien.

Export (`wrtmd.cxx`) : les blocs de code sortent en ```` ``` ```` sans langage, et seules les images
et les objets OLE sont exportés. Des formes `draw:` natives, les nôtres, disparaîtraient d'un `.odt`
réexporté en Markdown.

`master` au 2026-10-08 : rien de changé sur ces points (passage à MD4C 0.6.0, listes, encodage).
Le filtre est très actif : Miklos Vajna (Collabora, collage Markdown dans Collabora Online),
Ilmari Lauhakangas (TDF), Ujjawal Kumar, Xisco Fauli.

## Ce que LibreOffice a déjà décidé (Bugzilla, méta-bug 167521 « Markdown import and export problems »)

- **172530 « Code fence language identifier is lost during import » : RESOLVED WONTFIX**
  (2026-06-22). Ilmari Lauhakangas : garder ce langage demanderait une modification de la norme
  ODF ; LibreOffice n'est ni un éditeur de code ni un éditeur Markdown. Heiko Tietze (ergonomie)
  dans le même sens. Le rapporteur a lui-même demandé la fermeture.
- **172531 « Feature Request: Recognize Mermaid fenced code blocks as diagrams » : UNCONFIRMED**,
  non assigné. Hossein Nourikhah : il faudrait embarquer la bibliothèque JavaScript de Mermaid ; il
  cite l'extension Pandoc `diagram`, qui appelle des outils externes, et laisse ouverte la question
  « extension ou code de base ». Ilmari Lauhakangas : « Would indeed be best to keep out of core. »
- Maths : 168827 et 171276 (export des objets Math) sont ouverts ; rien sur l'import des `$…$`.

## Les options pour la porte B

| Option | Verdict |
|---|---|
| B1. Correctif dans le code de LibreOffice (garder l'info-string, rendre Mermaid) | **Fermée** : 172530 WONTFIX, 172531 « keep out of core » |
| B2. **Extension LibreOffice** qui convertit un bloc de code Mermaid déjà importé en diagramme natif | **Recommandée.** C'est la forme que les développeurs suggèrent eux-mêmes ; elle ne demande aucun changement à LibreOffice |
| B3. Extension qui ajoute son propre filtre d'import `.md` (notre chaîne Pandoc → `.odt`) | Possible, mais concurrence le filtre intégré pour le même type de fichier : friction à la détection de type, et rien de plus que la porte A |

**B2 sans info-string.** Mermaid reconnaît lui-même un diagramme à son premier mot significatif
(`flowchart`, `sequenceDiagram`, …), après un éventuel en-tête `---` ou une directive `%%{init}%%`.
Le core l'expose déjà : `detectDiagramType()`. Essai sur des textes de blocs :

| Texte du bloc | `detectDiagramType()` |
|---|---|
| `flowchart LR …`, `graph TD …`, `sequenceDiagram …` | reconnu |
| avec en-tête `---` ou directive `%%{init}%%` | reconnu |
| Python, JSON, SQL, YAML, `graph_tool --input x` | `unknown` |
| prose : `pie is tasty`, `timeline of the project`, `gantt chart below` | **faux positif** (`pie`, `timeline`, `gantt`) |

D'où deux contrôles : ne regarder que les paragraphes au style « Texte préformaté » (là où
l'import met les blocs de code), et ne remplacer le bloc que si l'analyse du diagramme réussit et
produit au moins un élément. Sinon le bloc reste tel quel.

**Forme proposée pour B2.** D'abord une commande, « Convertir le code Mermaid en diagramme », sur la
sélection ou sur tout le document ; elle sert aussi pour du code Mermaid collé, pas seulement pour
un `.md` ouvert. Ensuite, en option, la même conversion à l'ouverture d'un `.md`.

**Ce que B2 demande, dans l'ordre.**

1. La sortie ODF du core (phase 1, porte A) : B2 n'en est qu'un adaptateur mince (ADR 0012).
2. Une entrée qui rende un diagramme en **fragment** ODF (`draw:g` + ses styles) : décision d'API du
   mainteneur (spec 05 §8.1).
3. L'insertion du fragment par UNO : un `.fodt` temporaire inséré par
   `XDocumentInsertable.insertDocumentFromURL`, à vérifier.
4. Le moteur : une extension en Python (LibreOffice embarque Python sous Windows et macOS ;
   `python3-uno` sous Linux) qui appelle notre outil comme sous-processus, à la manière de
   l'extension Pandoc `diagram`. Le rendu d'un diagramme ne demande que Node, pas Pandoc. Node n'est
   pas garanti sur le poste : même question d'approvisionnement que Pandoc pour l'extension VS Code
   (`pandocProvisioner.ts`), à trancher plus tard.

**Contact public.** Le bug 172531 est l'endroit naturel pour présenter B2 aux développeurs, une fois
la phase 1 livrée et une première version de l'extension montrable. Écrire sur Bugzilla est une
communication publique : décision du mainteneur (spec 05 §8.6).
