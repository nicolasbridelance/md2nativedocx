# Word reference — comparaison avec un document Word réel

Cet outil permet de générer un document Word **réel** contenant un groupe de formes
(`wpg:wgp` / `wps:wsp`) via l'automatisation Office, et de comparer sa structure avec
celle produite par notre traducteur. C'est l'outil de référence pour diagnostiquer les
différences de rendu entre notre sortie et ce que Word produit nativement.

## Prérequis

- **Windows** avec **Microsoft Word** installé (pour `create-word-diagram.ps1`)
- **Node.js** (pour `compare.mjs`)

## Usage

### 1. Générer le document de référence Word

Sur Windows avec Word :

```powershell
powershell -File tools/word-reference/create-word-diagram.ps1 -OutputPath C:\Temp\word-group.docx
```

Le script crée un document Word avec un canvas contenant deux rectangles "A" et "B"
reliés par un connecteur, groupés en un `wpg:wgp`. C'est la structure que Word génère
nativement.

### 2. Extraire et comparer

```bash
# Extraire le fragment wpg:wgp du document de référence (pour inspection)
node tools/word-reference/compare.mjs C:\Temp\word-group.docx

# Comparer avec notre sortie
node tools/word-reference/compare.mjs C:\Temp\word-group.docx test-corpus/output/simple/<timestamp>/ab.docx
```

Le script compare la structure des deux fragments `wpg:wgp` élément par élément
(noms + attributs, en ignorant l'ordre des attributs et les espaces), et affiche les
différences avec un marqueur `≠`. Un exit code 0 signifie que les structures sont
identiques ; 1 signifie qu'il y a des différences.

## Ce qu'on cherche

Lorsque Word affiche notre diagramme comme un rectangle gris vide (au lieu des formes),
c'est qu'il manque un élément ou un attribut dans notre `wpg:wgp`. La comparaison avec
le document Word réel permet d'identifier précisément ce qui diffère :

- Ordre des éléments dans `wps:wsp` (`cNvPr` → `cNvSpPr`/`cNvCnPr` → `spPr` → ...)
- Attributs du `wps:bodyPr` (ex. `anchor`, `anchorCtr`)
- Structure du `wps:txbx` / `w:txbxContent`
- Attributs du `wpg:grpSpPr` (`chOff`, `chExt`)
- Tout élément obligatoire que nous omettons

## Où placer les documents de référence

Les documents Word de référence générés sont des artefacts de diagnostic. Placez-les
dans un répertoire temporaire (`C:\Temp\`) ou partagez-les directement — ils ne sont
pas destinés à être commités dans le repo.
