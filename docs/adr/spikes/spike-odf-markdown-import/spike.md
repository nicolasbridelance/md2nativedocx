# Spike S3 — l'import Markdown de LibreOffice 26.2 (2026-10-08)

Motive la porte B de `docs/specs/05-libreoffice-odf-spec.md` (LibreOffice rend lui-même les blocs
Mermaid à l'ouverture d'un `.md`).

**Question.** Que devient, à l'ouverture dans LibreOffice 26.2, un `.md` avec un bloc Mermaid, un
tableau et des formules ?

**Montage.** LibreOffice 26.2.6.3, paquets `.deb` officiels
(`download.documentfoundation.org/libreoffice/stable/26.2.6/`, signature GPG vérifiée avec la clé
« LibreOffice Build Team (CODE SIGNING KEY) », empreinte
`C283 9ECA D940 8FBE 9531 C3E9 F434 A1EF AFEE AEA3`), extraits par `dpkg -x` dans un dossier
temporaire du Codespace, sans installation ni modification de `.devcontainer/`.

```bash
soffice --headless --convert-to fodt source.md   # ODF à plat, pour lire le XML
soffice --headless --convert-to pdf source.md    # rendu (s3-render.png)
```

**Résultats.**

| Élément de `source.md` | Ce que produit l'import |
|---|---|
| Titre, gras, italique, code en ligne, lien, liste | Correct : `text:h`, `text:span`, `text:a`, `text:list` |
| Bloc ```` ```mermaid ```` | Un seul paragraphe au style « Texte préformaté », lignes séparées par `text:line-break`. L'info-string `mermaid` **disparaît** : rien ne le distingue du bloc ```` ```python ```` (même style `P1`, aucune trace du mot dans le fichier) |
| Tableau | Vrai `table:table`, ligne d'en-tête répétée, alignement à droite de la colonne `--:` conservé |
| Formule en ligne `$E = mc^2$` | Texte brut, dollars compris : pas d'objet formule |
| Formule en bloc `$$…$$` | Texte brut sur une ligne, et **altéré** : `\,` devient `,` (échappement CommonMark appliqué au LaTeX) |

**Conséquences pour la porte B.**

- Aujourd'hui LibreOffice ne garde pas l'info-string : une fois le `.md` ouvert, on ne peut plus
  savoir qu'un bloc était du Mermaid. Rendre les diagrammes à l'ouverture demande donc une
  modification dans le filtre Markdown lui-même (à l'endroit où il lit le bloc de code), pas un
  traitement après coup du document. C'est l'objet de S4.
- Les maths ne sont pas prises en charge et sont abîmées : point à signaler aux développeurs
  LibreOffice avec S4, et argument pour la porte A (Pandoc convertit `$…$` en objet formule).
- Le `.odt` de S0/S1 (formes et connecteur) s'affiche à l'identique en 26.2.

**LibreOffice 26.8.0** (sortie le 2026-10-08, même vérification de signature) : résultat identique
sur le même `source.md`, info-string perdue et maths altérées comprises.

**Non vérifié.** Le comportement à l'ouverture dans l'interface (même filtre, donc même résultat
attendu) ; l'export Markdown.

**Suite.** La version 26.2.6 est désormais épinglée (`scripts/install-libreoffice-pinned.sh`,
commande `soffice-26.2`) et la CI refait la conversion de `source.md` à chaque passage du job
`visual`.
