# Round 9 — trouvé avec le vrai validateur Open XML SDK, pas en devinant

Après 7 rounds de correctifs structurels devinés (dsp:drawing, éléments manquants sur
`dgm:layoutNode`/`dgm:shape`, points `parTrans`/`sibTrans`) tous infirmés, le mainteneur a posé la
bonne question : Microsoft ne distribue-t-il pas un vrai validateur avec le détail de l'erreur ?
Oui — le SDK Open XML (`DocumentFormat.OpenXml`, .NET) expose `OpenXmlValidator`, qui valide
contre le **même schéma que Word** et donne le chemin XPath + la description précise de chaque
violation. `.NET` était déjà disponible dans ce sandbox.

## Outil

`OpenXmlValidator.cs`/`oxmlvalidator.csproj` : programme .NET minimal,
`dotnet run -- <fichier.docx> [2007|2010|2013|2016]`, imprime chaque erreur de schéma (partie,
XPath, description). Vérifié d'abord sur `handmade_samples/cycle-simple.docx` (0 erreur, comme
attendu) avant de l'utiliser sur notre propre sortie.

## Cause réelle trouvée immédiatement

Sur `cycle-ours.docx` (notre sortie, cycle à 3 nœuds) : **53 erreurs**, dont un groupe massif et
homogène, toutes de la même forme :

```
Part: /word/diagrams/data1.xml
Path: /dgm:dataModel[1]/dgm:cxnLst[1]/dgm:cxn[13]
Description: The 'modelId' attribute is invalid - The value 'pp3b' is not valid according to
any of the memberTypes of the union.
```

**`modelId` (et `srcId`/`destId`, qui partagent le même type) n'est pas une chaîne libre — c'est un
type union `ST_ModelId` qui n'accepte qu'un entier non signé ou un GUID.** Nos points de contenu
("0", "1", "2"...) passaient déjà (numériques). Tous nos points de présentation et connexions
(`"p-root"`, `"p-composite1"`, `"c1"`, `"po0"`, `"pp1a"`...) échouaient — **34 des 53 erreurs**,
le reste (17) étant du bruit préexistant dans `styles.xml`/`numbering.xml`/`settings.xml` (déjà
présent dans un export SANS SmartArt, donc déjà toléré par Word en pratique, sans rapport avec cet
incident).

C'est exactement l'écart qu'un validateur strict (Word) rejette et qu'un parseur tolérant
(LibreOffice, qui ne valide contre aucun schéma) ignore — mais contrairement aux 3 hypothèses des
rounds précédents, celle-ci est **confirmée directement par le validateur officiel**, pas déduite
par comparaison manuelle.

**Note pour plus tard, sans lien direct avec ce bug** : ADR 0004 "Round 3" avait conclu "le format
du modelId n'a pas d'effet sur le rendu" — c'était vrai, mais seulement vérifié sous LibreOffice,
qui ne fait aucune validation de schéma. Cette conclusion aurait dû être qualifiée dès le début.

## Correctif appliqué

`packages/core/src/smartart/{chain,tree,cycle}.ts` : tous les `modelId` de points de présentation
et de connexions remplacés par des entiers séquentiels (un compteur partagé continuant après les
ids de points de contenu déjà numériques), au lieu du schéma `"p-*"`/`"c*"`/`"po*"`/`"pp*"`. Même
motif d'écriture partagé par les trois générateurs, corrigé identiquement dans les trois.

## Vérification (avant tout nouveau test Word réel)

- `dotnet run -- <fichier>.docx` sur `cycle`/`chain`/`tree`, tailles 3 et 5-6 nœuds : **0 erreur
  liée au diagramme** dans les 3 cas (seul le bruit préexistant de 17 erreurs reste, identique à
  un export sans SmartArt).
- Rendu LibreOffice réel inchangé (aucune régression visuelle) sur les 5 fichiers testés.
- 291 tests `packages/core` verts (2 tests mis à jour : ils vérifiaient littéralement la chaîne
  `"p-root"`, remplacés par une vérification structurelle — chercher le point de présentation
  `presName="root"` puis vérifier le `presOf` vers son id réel, quel qu'il soit).
- `npm test` (449 tests), lint, typecheck : tous verts. `test:visual` 35/35 à 0,000 % de diff
  (chemin par défaut SmartArt désactivé, non affecté par ce correctif).

Fichiers `cycle-fixed.docx`/`chain-fixed.docx`/`tree-fixed.docx` construits pour le test réel final
— voir le message remis au mainteneur.
