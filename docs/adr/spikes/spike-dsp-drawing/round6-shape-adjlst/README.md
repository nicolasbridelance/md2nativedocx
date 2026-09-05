# Round 6 — élément/attributs manquants sur `dgm:shape`

Round 5 a innocenté l'URN elle-même (le fichier réel, seule l'URN changée, s'ouvre normalement).
Le problème reste donc dans le contenu structurel de `data.xml`/`layout.xml` (round 3), et round 4
(éléments manquants sur `dgm:layoutNode`) n'était pas suffisant seul.

Nouvelle comparaison, cette fois sur `dgm:shape` (pas `dgm:layoutNode`) : les 4 `dgm:shape` du
fichier réel ont toutes **les deux mêmes caractéristiques**, absentes des nôtres :
1. Un enfant `<dgm:adjLst/>` — les nôtres sont toujours auto-fermantes (`<dgm:shape/>`), sans aucun
   enfant.
2. Une déclaration `xmlns:r=".../relationships"` + un attribut `r:blip=""` (vide) — absents chez
   nous.

Même famille de problème que round 4 (élément/attribut requis par le schéma, contenu vide toléré
mais absence non tolérée par Word, tolérée par LibreOffice) — mais sur un type complexe différent
(`CT_Shape`, pas `CT_LayoutNode`).

Run avec `node build-round6.mjs` → `cycle-round6-graft.docx` : cumule le correctif du round 4
(toujours appliqué) + ce nouveau correctif sur les 3 `dgm:shape` de notre `layoutDef`, greffé dans
le vrai fichier Word (méthode du round 3, la plus propre).

- **S'ouvre** → un de ces deux correctifs (ou la combinaison) était la vraie cause.
- **Échoue encore** → il reste au moins une autre différence structurelle à trouver.
