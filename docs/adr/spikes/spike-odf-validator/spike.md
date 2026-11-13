# Spike S5 — un validateur ODF (2026-10-08)

Équivalent ODF de `scripts/oxml-validator/` (AGENTS.md, « Diagnosing 'Word won't open the file' ») :
LibreOffice tolère beaucoup, un fichier qu'il affiche bien peut quand même être invalide.

**Candidat retenu : `odfvalidator` de l'ODF Toolkit**, celui qui tourne derrière odfvalidator.org.
Version 0.13.0 (la plus récente hors bêta ; 1.0.0-BETA1 existe), Maven Central,
`odfvalidator-0.13.0-jar-with-dependencies.jar`, 24 Mo, licence Apache-2.0 (déclarée dans le `.pom`).
SHA-256 `5684feec5cbdcd5783998978c096ac9ccea53a454e2d6ae803ce482d2336d1dc`, signature GPG valide
(clé de Svante Schubert, mainteneur de l'ODF Toolkit, `05BE82F3F005BA84597D7F25EAFBA1450EFFB0A1`,
expirée depuis la signature). Demande Java (le Codespace a OpenJDK 25).

```bash
java -jar odfvalidator-0.13.0-jar-with-dependencies.jar -w fichier.odt   # rien affiché = valide
```

Il valide chaque partie contre le schéma RelaxNG de la version ODF déclarée (1.3 pour Pandoc 3.1.3)
et vérifie la conformité du paquet (manifeste, `mimetype`).

**Résultats sur les fichiers des spikes.**

| Fichier | Résultat |
|---|---|
| `.odt` Pandoc ordinaire (paragraphe + tableau) | **Valide.** Pas de bruit hérité du gabarit, contrairement au `.docx` |
| S0 et S2 (notre bloc brut) | **Une vraie erreur** : `draw:connector` sans `svg:viewBox`, attribut obligatoire. LibreOffice l'affichait sans rien dire |
| S2 corrigé (`svg:x1`…`svg:y2` + `svg:viewBox` sur le connecteur) | **Valide** ; rendu identique, connecteur toujours attaché et qui suit B |
| S1 (réenregistré par LibreOffice 24.2) | Erreurs sur les extensions `loext:` de LibreOffice : normal en conformité stricte, et ce n'est pas notre sortie |

Le validateur a donc trouvé, dès son premier passage, un défaut que trois spikes de rendu n'avaient
pas vu : c'est exactement la leçon de l'ADR 0006 côté Word.

**Proposition (décision du mainteneur : nouvelle dépendance de développement, règle 6).**
Un script `scripts/odf-validate` qui télécharge le `.jar` épinglé par SHA-256 (même modèle que
`scripts/install-libreoffice-pinned.sh`), une commande `npm run test:odf-validate` qui passe
gracieusement sans Java (même convention que `test:oxml-validate` sans .NET), et l'exigence
« zéro erreur » sur tout `.odt` produit par le projet. Justification : outil de développement et de
CI seulement, jamais livré, lancé comme sous-processus séparé, Apache-2.0.

**Point de sécurité à noter (règle 5).** Le validateur est un outil tiers en Java ; il charge un DTD
MathML embarqué pour les formules MathML 1.01. On ne lui donne que des fichiers produits par le
projet, en développement et en CI, comme pour `scripts/oxml-validator/`.
