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

## S1 — le connecteur suit-il la forme ? (2026-10-08)

Fait par l'agent, sans interface graphique : `move-b.py` pilote LibreOffice 24.2.7.2 sans fenêtre
par l'API UNO (`python3-uno` du système), ouvre `s0.odt`, descend B de 3 cm, enregistre `s1.odt`.

```bash
pandoc docs/adr/spikes/spike-odf-connector/source.md -o s0.odt
/usr/bin/python3 -I docs/adr/spikes/spike-odf-connector/move-b.py s0.odt s1.odt
soffice --headless --convert-to png s1.odt
```

**Résultats.**

- La page de dessin contient trois objets distincts (A, B, le connecteur), non groupés : chaque
  forme est un objet à part, donc sélectionnable seule.
- Après le déplacement, le connecteur reste attaché (`StartShape=A@1`, `EndShape=B@3`) et son
  extrémité descend de 3 cm avec B ; LibreOffice le réachemine en coude (`s1-after-move.png`).
- L'attache survit à l'enregistrement : dans `s1.odt`, LibreOffice a renommé les ids (`id1`, `id2`)
  et le connecteur pointe vers les nouveaux, avec un tracé `svg:d` recalculé.
- Limite : un déplacement par l'API n'est pas un glisser à la souris. Le recalcul se fait dans le
  modèle, le même que celui de l'interface, mais l'affichage à l'écran n'a pas été vu. Un essai à la
  souris par le mainteneur confirmerait en 30 secondes ; il n'est plus bloquant.
