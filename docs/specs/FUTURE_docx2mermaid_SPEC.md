# SPEC — `docx2mermaid` (nom provisoire) : lecture inverse, formes Word → Mermaid stable

**Statut : piste documentée, hors roadmap de l'équipe cœur pour l'instant.** Contrairement à
l'extension ODF (`docs/specs/cahier_des_charges.md` §2.1, qui est explicitement "l'équipe cœur ne le fera pas,
contribution externe bienvenue"), le statut ici est différent et volontairement laissé ouvert : ce
n'est pas écarté par principe, juste pas priorisé tant que la V1 (Mermaid → Word) n'est pas stable.
Qui la construira — le mainteneur plus tard, ou un contributeur externe — n'est pas tranché par ce
document.

**Une seule action est actionnable dès aujourd'hui**, pendant le débug de la V1 : voir
"Futur-proofing à faire maintenant" plus bas. Tout le reste de ce document décrit une
fonctionnalité qui n'est pas construite et ne doit pas être commencée sans révision de ce statut.

---

## 0. Pourquoi ça compte — la vraie boucle produit

Le cas d'usage qui motive ce document, tel que décrit par le mainteneur : une IA génère du Mermaid
→ `md2nativedocx` produit un `.docx` avec des formes natives → l'utilisateur (technique ou non)
ouvre le document, ajoute des cases, corrige deux flèches directement dans Word → le résultat
repart en Mermaid propre, prêt à être redonné à l'IA pour continuer l'itération.

Ce n'est utile **que si le Mermaid réexporté est un diff propre et minimal** par rapport à
l'original. Un Mermaid qui renomme tous les IDs à chaque relecture casse la boucle : l'IA reçoit
l'équivalent d'un fichier entièrement réécrit là où deux flèches ont changé, et ne peut plus
raisonner sur "qu'est-ce qui a changé". La stabilité des identifiants (§3) n'est donc pas un détail
de confort, c'est la condition qui rend toute la fonctionnalité utile ou inutile.

Personne d'autre ne fait ça. Même Pandoc, dans le sens `.docx` → Markdown, laisse tomber ou
transforme en image opaque tout dessin embarqué. S'il n'y a pas de solution du marché à récupérer
pour le sens Mermaid → formes natives (déjà rare), il y en a encore moins pour le retour formes
éditées à la main → Mermaid stable.

---

## 1. Non-objectifs explicites

| Exclu du scope | Raison |
|---|---|
| Reconvertir n'importe quel dessin Word arbitraire | Scope = documents produits par `md2nativedocx`, ou respectant sa convention de formes/connecteurs. Un dessin Word fait à la main de zéro, sans lien avec notre traducteur, n'a pas de garantie de mapping propre |
| Diagrammes non-flowchart | Aligné sur `docs/specs/cahier_des_charges.md` §2 — même limite que le sens direct |
| Deviner la sémantique d'une forme non répertoriée en §6.1 | Une forme ajoutée à la main sans référence connue est signalée explicitement (avertissement ou erreur), jamais convertie par supposition silencieuse |
| Reconstruire le layout dans le Mermaid de sortie | Mermaid n'encode pas de coordonnées, seulement la topologie (nœuds, liens, formes). Un déplacement pur d'une boîte dans Word n'a donc aucun effet sur le Mermaid réexporté — seul l'ajout/suppression de nœuds/liens ou le changement de forme/texte compte |

---

## 2. Architecture — miroir inversé du pipeline existant

```
.docx (édité à la main dans Word)
        │
        ▼
Extracteur OOXML : itère les <wps:wsp> (formes) et <wpg:cxnSp> (connecteurs)
d'un groupe <wpg:wgp>
        │
        ▼
Ré-identification : lit cNvPr/@name pour retrouver l'ID Mermaid d'origine
(voir §4 — nécessite le futur-proofing fait côté génération)
si absent → fallback : ID généré par ordre de lecture + position spatiale
        │
        ▼
Traducteur inverse : prstGeom → syntaxe Mermaid (inverse §6.1)
headEnd/style de trait → syntaxe de lien (inverse §6.2)
        │
        ▼
Résolution des connecteurs (voir §3 — le point le plus fragile)
        │
        ▼
Mermaid stable, ordonné, prêt à redonner à l'IA
```

---

## 3. Risques — la partie qui compte le plus dans ce document

### 3.1 Connecteurs non ancrés (le risque principal)

Word ne force pas un connecteur à être réellement ancré (`<a:stCxn>`/`<a:endCxn>`) à une forme. Si
l'utilisateur redessine ou déplace une flèche sans viser précisément les points d'accroche qui
apparaissent au survol d'une forme, on obtient une ligne flottante, sans référence d'ancrage.

C'est précisément le persona §3 du cahier des charges principal — "rédacteur qui vit dans Word, pas
forcément technique" — qui a le plus de chances de redessiner une flèche à main levée sans la
coller correctement. Le cas d'usage qui motive tout ce document ("je corrige deux flèches") est
exactement le point de fragilité le plus probable.

**Comportement requis, non négociable si cette fonctionnalité est construite :** en l'absence
d'ancrage explicite, la résolution géométrique (proximité du point de départ/arrivée avec une
bounding box de forme) reste une heuristique probabiliste. L'échec de résolution doit être
**explicite** — flèche ignorée avec avertissement visible, ou lien marqué d'un commentaire Mermaid
signalant l'incertitude — jamais une décision silencieuse qui invente une connexion fausse.

### 3.2 Duplication d'ID au copier-coller

Si l'utilisateur copie-colle une forme dans Word pour en créer une nouvelle, le comportement de
Word vis-à-vis de l'attribut `cNvPr/name` dupliqué n'est pas garanti (conservé tel quel → collision
d'ID, ou régénéré → perte de la référence). **À vérifier empiriquement avant de faire une quelconque
hypothèse dans le code de résolution.**

### 3.3 Surface de sécurité nouvelle, symétrique à celle de la génération

Ce composant **lit** de l'OOXML potentiellement fourni par un tiers — l'utilisateur peut ouvrir
n'importe quel `.docx`, pas seulement ceux produits par `md2nativedocx`. Toutes les règles de
sécurité XML d'`AGENTS.md` (DTD et entités externes désactivées, pas de confiance aveugle dans la
structure) s'appliquent ici avec la même rigueur que côté génération — sauf que jusqu'ici, le
projet n'avait pensé la sécurité que côté **écriture** (échapper avant de produire du XML). Un
`.docx` malveillant conçu pour exploiter un bug du parseur de lecture est une classe de risque
distincte, à traiter avec le même sérieux, pas en supposant que "c'est juste notre propre format en
retour".

---

## 4. Futur-proofing à faire maintenant, pendant le débug de la V1

**C'est la seule partie de ce document actionnable immédiatement.** Une fois le format de sortie du
traducteur stabilisé et les golden tests figés dessus, ajouter cette métadonnée rétroactivement
coûtera bien plus cher que de l'ajouter maintenant, pendant que `packages/core/src/translator/` est
encore activement modifié.

- Au moment de générer chaque `<wps:sp>`, définir `<wps:cNvPr id="..." name="{id_mermaid}">` —
  stocker l'ID Mermaid d'origine du nœud (`A`, `B`, `decision1`...) dans l'attribut `name`. C'est
  une métadonnée d'accessibilité déjà native à OOXML, invisible visuellement dans Word, quasi
  gratuite puisque le traducteur connaît déjà cet ID en interne au moment de la génération.
- Faire de même pour chaque connecteur `<wpg:cxnSp>` : `name` = `"{id_source}--{id_cible}"`.
- Ajouter un test golden dédié vérifiant que `cNvPr/name` contient bien l'ID Mermaid attendu, pour
  chaque forme et connecteur des fixtures existantes — sans ce test, un refactor futur pourrait
  supprimer cette métadonnée sans que personne ne le remarque avant que la fonctionnalité inverse en
  ait besoin, puisqu'elle n'a aucun effet visuel observable aujourd'hui.

---

## 5. Ordonnancement de sortie

Pour que le Mermaid réexporté soit lisible par un humain ou une IA sans réordonnancement mental,
préserver un ordre stable des nœuds : par ID Mermaid d'origine si connu (§4), sinon par position
spatiale (lecture gauche→droite, haut→bas) en fallback.
