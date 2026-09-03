# Liste de courses — échantillons SmartArt réels à extraire de Word

> Objectif : débloquer les pistes de `docs/smartart-layout-catalog.md` qui ne peuvent pas être
> devinées sans un vrai fichier produit par Word. Même méthode que celle déjà utilisée pour
> `hierarchy1`/`hierarchy2` (`docs/adr/0004-smartart-feasibility-spike.md`,
> `docs/adr/spikes/spike-smartart/spike.md`, Round 1-4) : un SmartArt est un simple `.docx`, donc
> un ZIP — on regarde dedans.
>
> **Mise à jour 2026-09-03 (Round 6 de `spike.md`)** : les échantillons 2 et 3/4/5 de la version
> précédente de cette liste ont déjà répondu à leur question (négativement pour les deux pistes
> testées — voir §"Clos" plus bas) et sont retirés. Un nouvel échantillon (`Nested Target`) les
> remplace comme piste active pour `subgraph`.
>
> **Fichiers déjà fournis, pas la peine de les refaire** : `SmartArt-Hierarchie+Hierarchiehorizontale.docx`,
> `4niveaux profondeur hierarchie et hiararchie horizontale.docx`, `unparent4 enfants hierarchie et
> hiararchie horizontale.docx` (dans `docs/adr/spikes/spike-smartart/`, gitignorés). Ils couvrent
> `hierarchy1`/`hierarchy2` — je ne les ai pas encore tous analysés en détail, je peux le faire sans
> rien de plus de ta part.

## Comment extraire un échantillon (à faire pour chaque fichier ci-dessous)

1. Crée le SmartArt dans Word (menu **Insertion > SmartArt**, ou l'onglet Création si tu pars d'un
   diagramme existant), avec le texte exact indiqué pour chaque échantillon plus bas — les libellés
   sont choisis exprès pour être faciles à repérer dans le XML (`grep`), donc merci de les taper
   tels quels plutôt que de mettre un texte "réaliste".
2. **Enregistre sous** `.docx` (format Word standard, pas `.doc`) — ne convertis rien, n'active pas
   de mode de compatibilité.
3. Un `.docx` est un ZIP. Pour l'extraire :
   - **Windows** : renomme une **copie** du fichier en `.zip` (garde l'original `.docx` intact),
     puis double-clique pour l'ouvrir comme un dossier.
   - **Mac** : `cp fichier.docx fichier.zip && unzip fichier.zip -d fichier-extrait/` dans le
     Terminal (ou double-clic sur le `.zip` renommé).
4. Dans le dossier extrait, le dossier qui m'intéresse est `word/diagrams/` — il contient
   `data1.xml`, `layout1.xml`, `colors1.xml`, `quickStyle1.xml`, et parfois `drawing1.xml`. S'il y a
   plusieurs diagrammes dans le même fichier, il y aura `data2.xml`/`layout2.xml`/etc. — envoie-les
   tous, je trierai.
5. **Le plus simple pour moi** : ne fais pas le tri toi-même, envoie-moi directement le `.docx`
   d'origine (je sais l'extraire) — l'étape 3/4 est utile seulement si tu veux vérifier toi-même
   qu'il y a bien un dossier `word/diagrams/` avant de me l'envoyer.

## Rangement souhaité

Un dossier `handmade_samples/` à la racine du dépôt (gitignoré — comme pour
`docs/adr/spikes/spike-smartart/`, ces fichiers ne doivent jamais être commités, ce sont des
créations Microsoft/Word, pas du contenu qu'on a le droit de redistribuer), avec un sous-dossier
par échantillon, nommé comme indiqué dans chaque entrée ci-dessous. Si c'est plus simple pour toi
de tout mettre à plat avec des noms de fichiers explicites, ça marche aussi.

## Échantillon actif — `Nested Target` pour représenter un `subgraph`

**Objectif** : `Labeled Hierarchy` (voir §"Clos" plus bas) ne couvre qu'un cas restreint de
`subgraph`. `Nested Target` (cercles concentriques, containment réel) est un candidat mieux
motivé — son langage visuel est littéralement "un anneau autour d'un groupe", plus proche de ce
qu'est un `subgraph` Mermaid qu'une hiérarchie avec étiquette. Voir
`docs/smartart-layout-catalog.md` pour le raisonnement complet.

- **Menu Word** : Insertion > SmartArt > catégorie **Relation** > **Cible imbriquée** (anglais :
  *Nested Target*).
- **Structure à taper** : au moins 3 anneaux, pour voir comment le texte se répartit :
  ```
  ANNEAU-EXTERIEUR-NT1
  ANNEAU-MILIEU-NT1
  ANNEAU-INTERIEUR-NT1
  ```
- **Question clé à observer** : est-ce que Word te laisse mettre **plusieurs** éléments de texte
  dans un même anneau (ex. deux boîtes/puces dans l'anneau du milieu, comme deux nœuds Mermaid qui
  appartiendraient au même `subgraph`) ? Si oui, essaie et note comment c'est structuré dans
  l'volet de texte. Si l'UI ne propose qu'un seul texte par anneau, dis-le-moi tel quel — c'est une
  réponse utile en soi (ça voudrait dire que ce layout ne couvre que "un `subgraph` = un seul
  nœud", pas un groupe de plusieurs nœuds reliés entre eux).
- **Nom de fichier suggéré** : `nested-target-basique.docx`

## Clos — merci pour les deux réponses, plus besoin de rien sur ces pistes

- **`Labeled Hierarchy`, étiquette différente par branche** : tu as confirmé que ce n'est pas
  possible dans l'UI — l'étiquette est bien par niveau, pas par branche. Ça ferme la question
  ouverte du catalogue dans le sens le plus restrictif. Voir `spike.md` Round 6 pour la conclusion
  complète. (L'échantillon 1 "cas de base", lui, reste utile si tu l'as déjà — envoie-le si c'est
  fait, mais plus la peine de le prioriser vu que `Nested Target` est maintenant la piste active
  pour `subgraph`.)
- **`Converging Arrows`** : tu as confirmé qu'il n'y a pas d'élément "résultat" distinct — le
  résultat est une flèche supplémentaire avec du texte dessus, pas une boîte. Combiné à un test
  indépendant du mécanisme `presParOf` lui-même (fait de mon côté, pas besoin d'un nouvel
  échantillon) qui montre qu'un point de présentation ne peut avoir qu'un seul parent, ça ferme
  toute la piste "layout convergent pour la fusion après branchement" — voir `spike.md` Round 6.
  Plus besoin des échantillons arité-3 / `Funnel` prévus initialement.

## Ce que je ferai une fois le fichier `Nested Target` reçu

Même méthode que `hierarchy1` (spike.md Round 1-4) : ouvrir le `.docx`, inspecter
`word/diagrams/data1.xml` et `layout1.xml`, identifier le motif `presOf`/`presParOf` et la
structure de l'algorithme, puis écrire un compte-rendu dans `docs/adr/spikes/spike-smartart/spike.md`
(Round 7) avant de décider si un générateur `nestedTarget.ts` a du sens pour `subgraph`. **Le
fichier ne sera pas commité** ni redistribué — comme pour les échantillons `hierarchy1`/
`hierarchy2` déjà fournis, il reste une référence de recherche locale (voir
`[[feedback-licensing-caution-smartart]]` dans la mémoire projet).
