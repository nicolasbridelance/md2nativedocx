# ADR 0009 — Ordre de résolution Pandoc : PATH système vs cache interne vérifié

- **Statut :** Accepté (mainteneur, 2026-09-07). Décision documentée ; l'implémentation du
  changement d'ordre est traitée séparément (voir "Conséquences").
- **Date :** 2026-09-07
- **Décideur :** Nicolas Bridelance (mainteneur).

## Contexte

`ensurePandoc()` (dans `packages/vscode-extension/src/pandocProvisioner.ts`) résout le binaire
Pandoc à utiliser pour un export dans cet ordre :

1. **PATH système** — si `pandoc` est trouvé sur le `PATH` (`isPandocOnPath()`), il est utilisé
   tel quel, sans aucun téléchargement.
2. **Cache interne vérifié** — sinon, l'extension télécharge la release officielle pinnée
   (`PANDOC_VERSION = '3.1.3'`), la vérifie par SHA-256, l'extrait et la met en cache dans
   `globalStorage` (hors `Program Files`, sans élévation).

Le même ordre s'applique à `ensureDotnet()` pour le runtime `.NET` (ADR 0007 partie D).

**Implication du choix actuel :** si un utilisateur (ou une politique IT, ou un autre outil)
installe une version de Pandoc différente sur le `PATH` (ex. Pandoc 3.9, la plus récente),
l'extension l'utilise **silencieusement** à la place de la version 3.1.3 que les tests
golden/visuels de CI ont validée. Cela peut introduire des différences de rendu non testées,
difficiles à diagnostiquer ("ça marche différemment chez moi vs. dans la CI").

Ce rapport (`docs/missing_pandoc_bugfix.md` §8) demande de trancher explicitement ce choix de
conception, en recommandant pour la persona "poste d'entreprise / non technique" de privilégier
la **reproductibilité** (cache interne prioritaire).

## Décision

**Conserver l'ordre actuel (PATH prioritaire) comme comportement par défaut**, et documenter
explicitement le trade-off. Ne pas inverser l'ordre par défaut.

### Raisonnement

1. **Principe de moindre surprise.** Un utilisateur qui a installé Pandoc lui-même (développeur,
   machine personnelle, ou IT qui a provisionné Pandoc via le portail logiciel) s'attend
   légitimement à ce que l'extension utilise *son* Pandoc. Inverser l'ordre par défaut casserait
   cette attente pour tous les utilisateurs existants, y compris ceux pour qui le PATH est un
   choix délibéré.

2. **Le PATH est déjà le chemin de moindre friction.** Si Pandoc est sur le PATH, il est
   fonctionnel et déjà configuré (proxy, certificats, etc.) — l'utiliser évite un téléchargement
   de ~140 Mo inutile. Le casser forcerait un téléchargement même quand un Pandoc parfaitement
   valide est disponible.

3. **La reproductibilité reste atteignable sans inverser l'ordre par défaut.** Le problème
   réel (une version non testée sur le PATH) est résolu par un **setting explicite** plutôt que
   par un changement d'ordre global : un utilisateur ou une IT qui veut un rendu reproductible
   peut forcer le cache interne via un setting dédié, sans impacter les autres.

### Ce que cette décision n'est pas

- Ce n'est **pas** un refus de la reproductibilité — c'est un refus de l'imposer *par défaut* à
  tous, au profit d'un opt-in explicite.
- Ce n'est **pas** un bug à corriger — c'est un choix de conception assumé, désormais documenté.

## Conséquences

### Pour la persona "poste d'entreprise / non technique"

Cette persona n'installe jamais Pandoc elle-même intentionnellement. Sur un tel poste, un Pandoc
trouvé sur le PATH est plus probablement un résidu d'une tentative de dépannage manuelle
(potentiellement une version non testée) que le choix délibéré de l'utilisateur. Pour couvrir ce
cas, un **setting `md2nativedocx.pandoc.forcePath`** (ou équivalent) est prévu : quand il est
défini, l'extension ignore le PATH et utilise exclusivement le cache interne vérifié (ou échoue
avec un message clair si le cache est indisponible). Ce setting est le point d'entrée pour une
politique IT qui veut un rendu reproductible sur tout un parc.

> **Note d'implémentation :** ce setting n'est **pas** encore implémenté dans cette passe. Il est
> documenté ici comme la conséquence de la décision, et son ajout est un changement de la surface
> de configuration (à faire dans une PR dédiée, avec les traductions `package.nls.*.json`).

### Pour le code actuel

Aucun changement de comportement par défaut dans `ensurePandoc()`/`ensureDotnet()`. L'ordre
PATH-puis-cache est conservé tel quel. La seule chose qui change est la **documentation** de ce
choix (cet ADR), pour que les futurs agents/contributeurs ne le reconsidèrent pas sans contexte.

### Risques et mitigations

- **Régression de rendu non testée** (un Pandoc non pinné sur le PATH) : mitigé par le setting
  `forcePath` ci-dessus pour ceux qui veulent la reproductibilité, et par le fait que la grande
  majorité des utilisateurs n'ont pas de Pandoc système.
- **Incohérence PATH vs CI** : documenté ; le message d'erreur et le `.log` d'export indiquent
  déjà quel binaire a été utilisé quand pertinent.

## Alternatives considérées

- **Inverser l'ordre (cache prioritaire, PATH en dernier recours)** — rejeté : casse la moindre
  surprise pour les utilisateurs ayant un Pandoc système, force un téléchargement inutile, et
  résout un problème (version non testée) qui est mieux adressé par un opt-in explicite.
- **Ne rien documenter** — rejeté : le rapport §8 demande explicitement une décision tranchée,
  et sans ADR ce choix serait reconsidéré à chaque session d'agent.
