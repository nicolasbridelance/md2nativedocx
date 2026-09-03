# Guide métier — sans lire une ligne de code

Cette page ne parle pas de code. Elle explique ce que fait cet outil, pourquoi, et comment vous
en servir si vous n'êtes pas développeur.

## Le problème, en une phrase

Un diagramme "Mermaid" (un flowchart, un schéma d'architecture...) écrit par un développeur ou une
IA est du texte structuré très efficace à produire et à faire évoluer — mais illisible tel quel
pour la plupart des relecteurs métier, juridiques ou clients. Jusqu'ici, la seule façon de le
rendre lisible dans un Word était de le transformer en **image figée** : plus aucune forme
n'est modifiable, on ne peut plus déplacer une étape, corriger un libellé ou changer une couleur
sans redemander au développeur de tout régénérer.

## Ce que fait `md2nativedocx`

Il convertit un document Markdown (texte, titres, tableaux) contenant des diagrammes Mermaid en
un vrai fichier **Word (`.docx`)**, où chaque forme du diagramme est une **forme Word native** —
exactement comme si quelqu'un l'avait dessinée à la main avec les outils de dessin de Word.
Concrètement, dans le document reçu, vous pouvez :

- cliquer sur une case du diagramme et la sélectionner individuellement ;
- corriger un texte directement dans la forme, sans quitter Word ;
- déplacer une étape, changer une couleur, redimensionner — comme n'importe quelle forme Word ;
- copier le diagramme dans un autre document, un PowerPoint, un email.

Rien de tout cela n'est possible avec une image PNG — c'est la différence que cet outil apporte.

## Comment l'utiliser, sans installer d'outil de développement

**Cas le plus fréquent : on vous envoie déjà le `.docx`.** Vous n'avez rien à installer — ouvrez
le fichier dans Word normalement, tout fonctionne comme un document Word classique.

**Si vous voulez produire le `.docx` vous-même** depuis un document Markdown (par exemple reçu
d'un collègue ou généré par une IA) :

1. Installer l'extension **md2nativedocx** dans Visual Studio Code (gratuit, comme un
   traitement de texte).
2. Ouvrir le fichier `.md` contenant le diagramme.
3. Un lien **"⚙️ Export to Word"** apparaît automatiquement au-dessus de chaque diagramme détecté
   — pas de commande à retenir.
4. Cliquer dessus : une notification propose d'ouvrir directement le `.docx` généré dans Word, ou
   de le localiser dans l'explorateur de fichiers.

C'est tout — aucune ligne de commande, aucune configuration.

## "Et si je fais travailler une IA avec ça ?"

C'est le cas d'usage qui motive l'outil. Une IA raisonne et rédige beaucoup mieux — plus vite,
plus fiable, plus facile à corriger — en Markdown/Mermaid qu'en essayant de produire directement
un `.docx` verbeux formulation par formulation. Vous pouvez donc demander à une IA de rédiger un
compte-rendu ou un schéma d'architecture en Markdown, puis obtenir en un clic un vrai document
Word propre, sans jamais avoir à lire ou écrire de Markdown vous-même : l'outil est la
passerelle, pas une compétence supplémentaire à acquérir.

## Questions fréquentes

**Est-ce que mes documents partent sur un serveur externe ?**
Non. Tout se passe sur votre poste. Voir [`legal.md`](legal.md) pour le détail des (rares) appels
réseau (uniquement le téléchargement, une fois, de l'outil libre "Pandoc" si votre poste ne l'a
pas déjà).

**Est-ce payant ?**
Non — le code est dans le domaine public (licence CC0), et tous les outils qu'il utilise sont
gratuits et open source. Voir [`legal.md`](legal.md) et [`it-security.md`](it-security.md).

**Qui valide que c'est fiable pour un usage professionnel ?**
Voir [`it-security.md`](it-security.md) — tests automatisés, analyse de sécurité, pipeline de
vérification exécutés à chaque changement du code.
