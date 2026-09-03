# Cahier des Charges Fonctionnel & Technique

## Module : Word-to-Markdown / SmartArt-to-Mermaid ("Chemin Retour")

### 1. Contexte & Objectifs

#### 1.1 Contexte

Le moteur `md2nativedocx` permet la génération de documents Word (`.docx`) riches et de schémas éditables (SmartArt / DrawingML) à partir de fichiers Markdown et de code Mermaid.js.

En environnement B2B, les documents `.docx` générés sont fréquemment modifiés par des parties prenantes non techniques (Chefs de projet, Métier, Juridique) directement dans Microsoft Word.

#### 1.2 Objectif du projet

Permettre aux profils techniques (Devs, Architectes) de réimporter les modifications apportées par le métier dans leur environnement de travail (VS Code / Markdown) sans perte d'information, en reconvertissant le texte Word en Markdown et les structures SmartArt/DrawingML modifiées en code Mermaid propre et réutilisable.

---

### 2. Périmètre du Projet (Scope)

#### Dans le périmètre (In-Scope)

* Conversion du texte formaté Word (`.docx` ou sélection) vers la syntaxe Markdown standard (GFM).
* Détection et extraction des objets SmartArt / Formes vectorielles groupées générés par `md2nativedocx` (ou créés nativement dans Word).
* Conversion des structures de diagrammes Word identifiées vers du code Mermaid.js (`flowchart`, `sequenceDiagram`, `erDiagram`).
* Deux modes d'utilisation ciblés :
1. **Mode Fichier (`.docx` -> `.md`)** via CLI ou extension VS Code (parsing OpenXML).
2. **Mode UI Word (Add-in / Presse-papier)** pour du "Copy as Markdown" direct depuis Word.



#### Hors périmètre (Out-of-Scope V1)

* Rétro-ingénierie des schémas SmartArt complexes à mise en page libre sans connecteurs logiques stricts (ex: schémas illustratifs 3D).
* Importation et vectorisation d'images matricielles (PNG, JPEG) insérées manuellement à la place des SmartArt.

---

### 3. Spécifications Fonctionnelles

#### SF-01 : Conversion du texte et de la structure documentaire

* **Formatage de base :** Conversion des styles Word vers Markdown (`# H1` à `###### H6`, **gras**, *italique*, `code`, ~~barré~~).
* **Tableaux :** Parsing des tableaux Word vers la syntaxe Markdown GFM (`| col 1 | col 2 |`).
* **Listes :** Préservation de l'imbrication des listes puces (`-`) et numérotées (`1.`).

#### SF-02 : Reconstitution de diagrammes (SmartArt / DrawingML ➔ Mermaid)

Le moteur doit lire le graphe d'objets sous-jacent du document et appliquer les règles d'équivalence suivantes :

| Structure Word détectée | Syntaxe Mermaid générée |
| --- | --- |
| **SmartArt Processus / Formes reliées par connecteurs** | `graph LR` / `flowchart TD` |
| **SmartArt Hiérarchie / Organigramme** | `flowchart TD` (avec arborescence parente/enfant) |
| **Groupes de formes alignées avec lignes d'interaction** | `sequenceDiagram` |

#### SF-03 : Gestion des altérations métier

Si l'utilisateur métier a modifié le diagramme dans Word :

* **Modification de texte :** Les nouveaux libellés dans les formes SmartArt doivent être répercutés dans les nœuds Mermaid.
* **Ajout / Suppression d'étape :** La création ou suppression d'un bloc SmartArt doit ajouter ou retirer le nœud correspondant dans la relation Mermaid.
* **Changement de couleur / style :** Ignoré par défaut pour conserver un code Mermaid sémantique et épuré (sauf option specifique `%%{init}%%` ou styles de nœud).

---

### 4. Spécifications Techniques & Architecture

#### ST-01 : Stratégie de Parsing (Deux Approches Complémentaires)

1. **Approche AST / OpenXML (Côté VS Code / CLI) :**
* Analyse directe de l'archive `.docx` (Zip/XML).
* Lecture de `document.xml` et des fichiers de relations `diagrams/data1.xml` (spécifique aux structures SmartArt).
* Construction d'un Abstract Syntax Tree (AST) document.
* Génération des blocs ````mermaid` correspondants.


2. **Approche Office.js (Côté Add-in Word) :**
* Utilisation de l'API JavaScript pour Microsoft Office pour intercepter la sélection courante.
* Extraction du HTML / OpenXML du presse-papier lors du clic sur "Copy as Markdown".



#### ST-02 : Algorithme de reconstruction SmartArt ➔ Mermaid (`Flowchart`)

1. **Extraction du Graphe :**
* Identifier les **Nœuds** (Noeuds `dNode` ou formes individuelles) et extraire leur `ID` et le texte associé (`t` / text body).
* Identifier les **Liaisons/Connecteurs** (Relations `dRel` ou formes de type "Connector" possédant un `startShapeId` et `endShapeId`).


2. **Normalisation des identifiants :**
* Assainir les IDs (ex: supprimer les espaces/caractères spéciaux) pour générer des identifiants Mermaid valides (`node1["Texte du bloc"]`).


3. **Sérialisation :**
* Écrire la matrice d'adjacence sous forme de déclarations Mermaid : `A["Départ"] --> B["Étape 1"]`.



---

### 5. Hypothèses, Limitations & Modèle Dégradé

Afin de garantir la faisabilité technique (notamment face à la complexité du standard OpenXML) :

1. **Hypothèse 1 (Sémantique conservée) :** Le module suppose que la structure Word provient soit d'un document généré par `md2nativedocx`, soit d'un SmartArt standard disposant de relations parent/enfant claires dans le XML.
2. **Mode Dégradé (Fallback) :** Si un SmartArt est trop complexe ou corrompu pour être parsé en graph Mermaid :
* Le module extrait le texte contenu sous forme de liste à puces imbriquée.
* Un avertissement / commentaire est inséré dans le fichier Markdown : `%% [WARNING] SmartArt non reconvertible en Mermaid - Texte extrait sous forme de liste %%`.



---

### 6. Recette & Critères d'Acceptation (KPIs)

* **Test de Round-Trip (Aller-Retour) :**

$$\text{Markdown + Mermaid} \xrightarrow{\text{md2nativedocx}} \text{Word (.docx)} \xrightarrow{\text{Word2MD}} \text{Markdown + Mermaid}$$


* *Critère :* Le fichier `.md` réobtenu doit produire un diagramme Mermaid fonctionnel et identique au niveau de sa topologie (nœuds et liens).


* **Couverture des types de diagrammes (V1) :**
* 100% de réussite sur les `flowchart` (Processus, Décisions).
* 80% de réussite sur les `sequenceDiagram`.