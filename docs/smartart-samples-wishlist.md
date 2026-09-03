# Liste de courses — échantillons SmartArt réels à extraire de Word

> Objectif : débloquer les deux pistes de `docs/smartart-layout-catalog.md` qui ne peuvent pas être
> devinées sans un vrai fichier produit par Word (`Labeled Hierarchy` pour représenter un
> `subgraph`, layouts "convergents" pour la fusion après branchement — la limitation la plus citée
> de tout ce chantier). Même méthode que celle déjà utilisée pour `hierarchy1`/`hierarchy2`
> (`docs/adr/0004-smartart-feasibility-spike.md`, `docs/adr/spikes/spike-smartart/spike.md`,
> Round 1-4) : un SmartArt est un simple `.docx`, donc un ZIP — on regarde dedans.
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

Un dossier `handmade_samples/` à la racine du dépôt (je m'en occupe de l'ajouter au `.gitignore` —
comme pour `docs/adr/spikes/spike-smartart/`, ces fichiers ne doivent jamais être commités, ce sont
des créations Microsoft/Word, pas du contenu qu'on a le droit de redistribuer), avec un sous-dossier
par échantillon, nommé comme indiqué dans chaque entrée ci-dessous (ex.
`handmade_samples/labeled-hierarchy-basique/mon-fichier.docx`). Si c'est plus simple pour toi de
tout mettre à plat avec des noms de fichiers explicites, ça marche aussi — l'essentiel est que je
puisse deviner quel fichier correspond à quelle entrée de cette liste.

## Échantillon 1 — `Labeled Hierarchy`, cas de base

**Objectif** : comprendre la structure `dataModel`/`layoutDef` de ce layout, jamais extraite jusqu'ici.

- **Menu Word** : Insertion > SmartArt > catégorie **Hiérarchie** > **Hiérarchie étiquetée**
  (anglais : *Labeled Hierarchy*).
- **Structure à taper** : une racine + 2 branches de 2 enfants chacune (6 formes au total) :
  ```
  RACINE-LH1
  ├── BRANCHE-A-LH1
  │   ├── ENFANT-A1-LH1
  │   └── ENFANT-A2-LH1
  └── BRANCHE-B-LH1
      ├── ENFANT-B1-LH1
      └── ENFANT-B2-LH1
  ```
- **Important** : ce layout a normalement une zone de texte "étiquette" séparée du contenu des
  boîtes (à côté ou au-dessus d'un niveau). Tape dedans `ETIQUETTE-NIVEAU-LH1` — si tu ne trouves
  pas cette zone ou si l'UI ne te propose rien de tel, dis-le-moi tel quel dans ton message, c'est
  une information utile en soi (ça voudrait dire que "Labeled Hierarchy" n'a pas l'étiquette que
  j'imagine depuis sa description Microsoft).
- **Nom de fichier suggéré** : `labeled-hierarchy-basique.docx`

## Échantillon 2 — `Labeled Hierarchy`, étiquette différente par branche

**Objectif** : répondre à la question ouverte du catalogue — l'étiquette de niveau peut-elle varier
librement par sous-arbre, ou s'applique-t-elle uniformément à tout un niveau de profondeur ? C'est
la différence entre "peut représenter n'importe quel `subgraph` Mermaid" et "seulement le cas très
restrictif où tous les nœuds d'une même profondeur appartiennent au même `subgraph`".

- **Même structure que l'échantillon 1**, mais essaie de donner à l'étiquette de la branche A un
  texte différent de celui de la branche B (`ETIQUETTE-BRANCHE-A-LH2` vs `ETIQUETTE-BRANCHE-B-LH2`).
- **Si l'UI ne te laisse pas faire ça** (l'étiquette semble figée par niveau, pas par branche) —
  c'est exactement la réponse cherchée, pas la peine de forcer : dis-le-moi et n'envoie même pas ce
  fichier si tu n'as pas réussi à créer une vraie différence.
- **Nom de fichier suggéré** : `labeled-hierarchy-etiquette-par-branche.docx`

## Échantillon 3 — `Converging Arrows` (ou `Converging Text`), arité 2

**Objectif** : voir si le `dataModel` d'un layout convergent accepte une topologie "plusieurs
sources, une destination" et comment il représente les *deux flux entrants* — c'est le pattern
décision → Oui/Non → fusion, le plus fréquent dans un vrai flowchart et actuellement disqualifié
par `classify.ts` pour toute stratégie SmartArt.

- **Menu Word** : Insertion > SmartArt > catégorie **Processus** > **Flèches convergentes**
  (anglais : *Converging Arrows*). Si ce nom n'apparaît pas chez toi, **Texte convergent**
  (*Converging Text*) est un remplaçant acceptable — dis-moi lequel tu as utilisé.
- **Structure à taper** : 2 éléments qui convergent + 1 résultat, si l'outil distingue les deux :
  ```
  SOURCE-1-CONV
  SOURCE-2-CONV
  RESULTAT-CONV
  ```
- **Nom de fichier suggéré** : `converging-arrows-arite2.docx`

## Échantillon 4 — même layout que l'échantillon 3, arité 3

**Objectif** : savoir si l'arité (le nombre d'éléments qui convergent) est libre ou plafonnée. Dans
la galerie SmartArt de Word, ajoute un 3ᵉ élément dans le volet de texte du même layout (ou crée un
nouveau diagramme si Word ne permet pas d'agrandir celui de l'échantillon 3) :
  ```
  SOURCE-1-CONV3
  SOURCE-2-CONV3
  SOURCE-3-CONV3
  RESULTAT-CONV3
  ```
- **Si Word refuse d'ajouter un 3ᵉ élément convergent** (bouton grisé, message d'erreur, ou le
  4ᵉ élément apparaît mais ne converge visuellement pas comme les deux premiers) — note-le, c'est
  la réponse à la question posée : le layout serait alors figé à une arité fixe, pas généralisable
  à un flowchart Mermaid arbitraire.
- **Nom de fichier suggéré** : `converging-arrows-arite3.docx`

## Échantillon 5 (optionnel, si tu as le temps) — `Funnel`

**Objectif** : `Funnel` a une description Microsoft proche des layouts convergents ("montrer le
filtrage d'information ou comment des parties fusionnent") mais une mécanique visuelle différente
(entonnoir, pas des flèches) — potentiellement un comportement d'arité différent des échantillons
3/4, utile en comparaison.

- **Menu Word** : Insertion > SmartArt > catégorie **Processus** (ou **Relation**) > **Entonnoir**.
- **Structure à taper** : 3 éléments, même convention que l'échantillon 3 (`SOURCE-1-FUNNEL`,
  `SOURCE-2-FUNNEL`, `SOURCE-3-FUNNEL`).
- **Nom de fichier suggéré** : `funnel-arite3.docx`

## Ce que je ferai une fois les fichiers reçus

Même méthode que `hierarchy1` (spike.md Round 1-4) : ouvrir chaque `.docx`, inspecter
`word/diagrams/data{N}.xml` et `layout{N}.xml`, identifier le motif `presOf`/`presParOf` et la
structure de l'algorithme, puis écrire un compte-rendu dans `docs/adr/spikes/spike-smartart/spike.md`
(nouvelle section "Round 6" ou suivant) avant de décider si un générateur `labeledHierarchy.ts`
et/ou `converge.ts` a du sens. **Aucun de ces fichiers ne sera commité** ni redistribué — comme pour
les échantillons `hierarchy1`/`hierarchy2` déjà fournis, ils restent une référence de recherche
locale (voir `[[feedback-licensing-caution-smartart]]` dans la mémoire projet).
