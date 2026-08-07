# md2nativedocx — extension VS Code

Exporte les diagrammes Mermaid d'un document Markdown en formes Word **natives et éditables**
(OOXML) — pas des images PNG figées. Voir le [README du monorepo](../../README.md) pour le
positionnement complet du projet.

## Usage

1. Ouvrez un fichier `.md` contenant un bloc ` ```mermaid `.
2. Cliquez sur **⚙️ Exporter en Word** (document entier) ou **Exporter le bloc seul**
   (un diagramme), au-dessus du bloc — ou sur la pastille dans la barre de statut.
3. Une notification propose d'ouvrir le `.docx` généré ou de le révéler dans l'explorateur.

Aucune configuration requise avant le premier usage. Le seul réglage optionnel,
`md2nativedocx.outputDirectory`, choisit où écrire les `.docx` (par défaut : le même dossier
que la source).

## Prérequis

[Pandoc](https://pandoc.org/installing.html) doit être installé sur la machine — l'extension
invoque le CLI `@md2nativedocx/cli`, qui délègue tout ce qui n'est pas diagramme à Pandoc
(cahier des charges §2). Un message d'erreur explicite propose le lien d'installation si Pandoc
est introuvable.

## Ce que l'extension ne fait pas

Pas d'édition de formes dans VS Code — l'édition se fait dans Word une fois le `.docx` ouvert
(voir `UX_SPEC.md` du monorepo, "la limite à ne pas franchir").
