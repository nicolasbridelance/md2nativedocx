# Incident `flux_arcs` — 2026-11-13

> **Brouillon : à compléter par le mainteneur** avec le résultat de la vérification manuelle (section
> « Vérification »), puis à retirer de TODO §R1. Rédigé à partir de TODO §R et du code au 2026-11-13.

## Ce qui s'est passé

Un utilisateur sous Windows et OneDrive Entreprise exporte `flux_arcs.md` avec l'extension 0.8.0. Word
plante, puis affiche « erreur grave » à chaque réouverture de ce chemin.

## Cause retenue

1. Le CLI écrivait directement sur la cible, sans fichier temporaire ni contrôle du verrou, pendant que
   Word ouvrait le fichier (Word : « Opération annulée » à 08:54:40 ; écrasement à 08:54:42-43), dans un
   dossier synchronisé par OneDrive.
2. Word a ensuite mis ce chemin en quarantaine (`Resiliency` / `PotentialDataLossInfo2`).

**Le contenu XML n'est pas en cause** : une copie identique octet pour octet du `.docx` s'ouvre, se modifie
et s'enregistre sans problème dans Word.

Facteur aggravant : le fichier exporté ne contenait aucun diagramme. Le bloc ```` ```mermaid ```` n'était pas
fermé ; Pandoc 3.1.3 en fait un paragraphe de texte brut, sans avertissement (reproduit le 2026-11-13).

## Analyses reçues : ce qui était faux

Trois analyses externes mêlaient du vrai et du faux (détail dans TODO §R, tableau de vérification) :
les « 13 erreurs du template maison » viennent toutes de Pandoc 3.1.3 ; le style de tableau est identique
à celui de Pandoc ; l'injection de formules dans les classeurs de graphiques ne s'applique pas.

## Corrections (release extension 0.8.1, CLI 0.2.1)

| Lot | Correction |
|---|---|
| R1.1 | `writeOutputSafely` : refus si le verrou `~$` de Word existe ou si la cible n'est pas modifiable ; sinon fichier temporaire dans le même dossier, `fsync`, `rename`. Code de sortie 2. |
| R1.2 | Extension : notification « ouvert dans Word » avec « Exporter sous… ». |
| R1.3 | Extension : enregistrement des éditeurs modifiés avant l'export d'un document. |
| R1.4 | Contrôle Word classé par partie (nos diagrammes / écarts connus de Pandoc / autres) ; le canevas `wpc` du corps du document n'est plus un angle mort ; plus d'affirmation sur l'effet dans Word. |
| R1.5 | Bloc ```` ```mermaid ```` non fermé signalé (journal du CLI, diagnostic et Quick Fix dans l'éditeur). |

Suites : R2 à R5 (TODO §R). Limites connues des lots R1 : journal de R1 dans TODO.md.

## Vérification

À remplir par le mainteneur, poste Windows + OneDrive : exporter pendant que le `.docx` est ouvert dans
Word.

- [ ] Message « ouvert dans Word », sans plantage de Word
- [ ] Le fichier ouvert dans Word n'est pas modifié
- [ ] « Exporter sous… » produit un document qui s'ouvre
- [ ] Après fermeture de Word, un nouvel export remplace le fichier
- [ ] Un bloc ```` ```mermaid ```` non fermé : avertissement visible dans l'éditeur et dans le journal

Date et version testées :
