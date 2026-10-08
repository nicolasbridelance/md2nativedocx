# Spike S0 — formes et connecteur ODF par un bloc brut Pandoc (2026-10-08)

Motive la phase 0 de `docs/specs/05-libreoffice-odf-spec.md` ; l'ADR viendra à la fin de cette phase.

**Question.** Le mécanisme du `.docx` (le filtre remplace le bloc Mermaid par du XML brut, Pandoc
assemble le paquet) marche-t-il pour un `.odt` ?

**Montage.** `source.md` contient un bloc brut `{=opendocument}` : deux `draw:custom-shape`
(rectangles, `draw:id` + `xml:id`) et un `draw:connector` dont `draw:start-shape` / `draw:end-shape`
pointent vers ces ids, collé au point 1 (droite) de A et 3 (gauche) de B.

```bash
pandoc docs/adr/spikes/spike-odf-connector/source.md -o s0.odt
soffice --headless --convert-to png s0.odt
```

**Résultats (Pandoc 3.1.3, LibreOffice 24.2.7.2).**

- Pandoc recopie le bloc tel quel dans `content.xml` (2 `draw:custom-shape`, 1 `draw:connector`).
- Le rendu LibreOffice montre les deux rectangles avec leur texte et le connecteur tiré du bord
  droit de A au bord gauche de B : l'attache par id est lue.
- Les rectangles s'affichent moins hauts que les 1,5 cm demandés : la forme s'ajuste
  probablement à son texte par défaut. À régler avec un style (`draw:auto-grow-height="false"`), ce
  qui rejoint la question des styles (S2).
- À retenir : `draw:start-shape` désigne un **id** (`draw:id` / `xml:id`), pas `draw:name`. Un
  premier essai avec des noms a été recopié par Pandoc sans erreur : Pandoc ne valide rien, donc une
  référence fausse ne se voit qu'au rendu (ce premier essai n'a pas été rendu).

**Non vérifié (S1).** Que le connecteur suive la forme quand on la déplace dans LibreOffice, et que
chaque forme soit sélectionnable seule. Demande une interface graphique : ouvrir `s0.odt` dans
LibreOffice et déplacer B.
