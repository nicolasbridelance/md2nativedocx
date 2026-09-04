# Régression visuelle — chapitre 4 (voir `TESTING.md`)

Rendu réel du `.docx` généré via LibreOffice headless, comparé pixel par pixel à une baseline
acceptée. Existe parce que la conformité XML structurelle (chapitres 1-3) ne suffit pas : un
`.docx` peut être un ZIP valide, un XML bien formé, avec tous les ids uniques, et pourtant
s'afficher comme un rectangle gris vide ou ne se rendre pas du tout dans Word/LibreOffice — voir
`TODO.md` pour l'historique complet des défauts trouvés uniquement grâce à ce mécanisme
(namespaces, flèches invisibles, chevauchement de titre de sous-graphe, arêtes traversant un
nœud, rendu totalement absent au-delà d'un ratio largeur/hauteur donné).

## Structure

```
visual/
├── fixtures/   # .mmd source de chaque cas testé
└── baseline/   # .png accepté après revue visuelle — la référence du pixel-diff
```

## Ajouter une fixture

1. Écrire `fixtures/mon-cas.mmd`.
2. `node scripts/test-visual.mjs --update-baseline` — génère le rendu et l'accepte en baseline.
3. **Relire le PNG produit avant de committer** (`baseline/mon-cas.png`) — l'outil ne le fait
   jamais pour vous. Une baseline générée sans revue humaine peut figer un bug comme référence
   (c'est arrivé : deux fixtures de ce lot ont d'abord révélé un défaut de rendu LibreOffice en
   étant vides, voir `TODO.md`).
4. `npm run test:visual` doit passer avec la nouvelle baseline en place.

## Piège connu : hauteur × ratio

Un groupe de dessin (`wpc:wpc`/`wpg:wgp`) ne se rend **pas du tout** dans LibreOffice (absence
totale, pas de dégradation) si sa hauteur native dépasse ~7,5-9 pouces **et** que son ratio
largeur/hauteur natif descend sous ~0,85-0,9. Corrigé côté traducteur
(`nativeExtent()`/`TALL_RATIO_RISK_HEIGHT`/`MIN_SAFE_ASPECT_RATIO` dans
`packages/core/src/translator/ooxml-translator.ts`), mais si une nouvelle fixture ressort vide
après `--update-baseline`, c'est le premier suspect — voir `TODO.md` pour la caractérisation
empirique complète avant de creuser ailleurs.

## Polices de substitution pinnées

`reference.docx` déclare des polices que Linux ne fournit pas (`Aptos`/`Aptos Display` dans le
thème actuel, `Calibri`/`Cambria` dans d'anciens `reference.docx`). Sans intervention, la police
de repli choisie par LibreOffice dépend de fontconfig et de l'environnement (quelles polices sont
installées, dans quel ordre) — ça a produit une vraie dérive de baseline d'un environnement à
l'autre (voir `TODO.md` → "Drift des baselines visuelles corrigé"), pas juste cosmétique : une
police de repli plus large tronquait carrément du texte dans certaines boîtes. `fontconfig/
fonts.conf` force ces familles vers `Liberation Sans`/`Liberation Serif` (dépendance apt
automatique de `libreoffice-writer`, donc toujours présente) ; `scripts/test-visual.mjs` le charge
via `FONTCONFIG_FILE` uniquement pour son propre appel à `soffice`, sans toucher la config système.
Si un futur `reference.docx` change de thème/polices, ajouter les nouvelles familles à ce fichier
plutôt que de laisser la substitution redevenir non déterministe.

## Limites actuelles

- 12 fixtures acceptées ; la spec §9 en demande 20-30. Écart documenté dans `TODO.md`, pas cette
  page (qui décrit le mécanisme, pas son état d'avancement).
- Le corpus réel (`../corpus/source/`, 24-318 nœuds) n'est délibérément pas inclus ici — chaque
  fixture demande une revue visuelle individuelle, ce qui ne passe pas à l'échelle sans une passe
  dédiée.
- Seuil de tolérance : 1 % de pixels différents (marge 24/255 par canal pour absorber
  l'anti-aliasing entre versions de LibreOffice) — voir `scripts/test-visual.mjs`.
