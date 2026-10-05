# Vérification initiale — Markdown standard

Cette partie vérifie le rendu de tout ce qui n'est pas un diagramme. Pour chaque section, comparer à ce qui
est décrit dans le texte.

## 1. Texte et emphase

Paragraphe avec **gras**, *italique*, ***gras italique***, ~~barré~~, `code en ligne`, H~2~O (indice),
x^2^ (exposant) et un [lien hypertexte](https://example.com) cliquable. Caractères spéciaux : & < > " ' é à ç ñ œ — « guillemets » … €.

Deuxième paragraphe, avec une ligne coupée\
par un saut de ligne forcé.

> Citation en bloc.
>
> > Citation imbriquée, doit être plus décalée.

---

La ligne ci-dessus est une règle horizontale.

### Titres de niveaux 3, 4, 5

#### Niveau 4

##### Niveau 5

## 2. Listes

- Puce niveau 1
  - Puce niveau 2
    - Puce niveau 3
- Autre puce

1. Premier
2. Deuxième
   1. Sous-élément a
   2. Sous-élément b
3. Troisième

- [x] Tâche faite
- [ ] Tâche à faire

Terme
:   Définition du terme (liste de définitions).

## 3. Tableaux

| Alignement gauche | Centré | Droite |
|:------------------|:------:|-------:|
| a                 |   b    |      1 |
| texte plus long   |   **c** |   22,5 |
| `code`            |   ✅   |    333 |

Tableau large (8 colonnes), pour tester le passage en paysage si l'option est active :

| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| a | b | c | d | e | f | g | h |

## 4. Équations

Équation en ligne : $E = mc^2$ et $\alpha + \beta = \gamma$.

Équation en bloc :

$$\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$$

$$\sum_{k=1}^{n} k = \frac{n(n+1)}{2} \qquad \begin{pmatrix} a & b \\ c & d \end{pmatrix}$$

Les équations doivent être éditables dans Word (objet équation natif), pas des images.

## 5. Code

Bloc de code avec langage :

```python
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

Bloc sans langage :

```
texte brut   avec    espaces
et <balises> & entités
```

## 6. Images

Image locale avec légende :

![Image de test locale (PNG)](assets/sample-image.png)

Image redimensionnée à 50 % :

![Même image, 50 %](assets/sample-image.png){width=50%}

## 7. Notes et divers

Une phrase avec une note de bas de page.[^1] Une autre avec une seconde note.[^2]

[^1]: Première note, doit apparaître en bas de page.
[^2]: Seconde note, avec du **gras**.

Ligne HTML brute : <span>texte dans un span</span> et un commentaire <!-- invisible --> après.

Texte avec emojis : ✅ ❌ ⚠️ 🚀 ⭐.

# Diagrammes Mermaid
