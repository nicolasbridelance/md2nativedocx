> **Statut (2026-10-05) : traité et clos — conservé pour l'historique.** Les correctifs de ce rapport
> ont été livrés dans les versions 0.5.0 à 0.5.3 de l'extension (voir `packages/vscode-extension/CHANGELOG.md`,
> `docs/adr/0009-pandoc-path-vs-cache-resolution.md`, l'erreur `PandocBlockedByPolicyError`, le miroir
> `md2nativedocx.pandoc.downloadUrl` et le téléchargement via la pile réseau du système). Le mainteneur a
> re-testé sur le poste Windows d'origine (sans droits admin) le 2026-10-05 : **résolu**. Ne pas
> rouvrir ces points sans nouveau rapport de terrain.

# md2nativedocx — Handoff : robustesse "poste d'entreprise sans droits admin" (préparation V0.5.0)

> **Destinataire de ce document** : un assistant IA/agent de code qui va travailler sur le dépôt
> `https://github.com/nicolasbridelance/md2nativedocx`. Ce document est volontairement très détaillé
> et explicite : ne suppose aucune connaissance préalable du contexte au-delà de ce qui est écrit ici.
> Chaque section donne : le problème, la preuve (si disponible), l'emplacement exact dans le code,
> et le correctif attendu. Suis les priorités dans l'ordre (P0 avant P1, etc.).

---

## 0. Contexte du rapport

L'auteur de l'extension (Nicolas) a installé `md2nativedocx` pour la première fois sur son
**poste professionnel d'entreprise** (Siemens Mobility France), qui a les contraintes suivantes,
très représentatives d'un environnement corporate :

- **Aucun droit administrateur local** (impossible d'installer quoi que ce soit dans
  `C:\Program Files`, impossible d'utiliser `msiexec` avec élévation, `winget` a une source
  cassée sur cette machine et n'est de toute façon pas fiable en environnement géré).
- Poste probablement derrière un **proxy d'entreprise** (avec inspection SSL / authentification).
- Poste probablement protégé par un **EDR/antivirus avec scan temps réel** des fichiers
  nouvellement écrits/exécutés.
- Utilisateur cible réel de l'extension pour ce genre de poste : **non technique**, ne sachant pas
  déboguer une erreur Node/PATH/proxy.

Résultat observé : au premier export d'un document Markdown contenant un diagramme Mermaid,
l'utilisateur a vu s'afficher :

```
Pandoc could not be found on this machine.
Source: md2nativedocx
[Install Pandoc]
```

Le bouton "Install Pandoc" ouvre `https://pandoc.org/installing.html`, qui **suppose des droits
administrateur** pour installer quoi que ce soit — ce qui est strictement incompatible avec la
persona visée par ce rapport.

**Objectif de ce document** : lister tous les problèmes de robustesse identifiés dans le mécanisme
d'auto-provisioning de Pandoc/.NET, avec des correctifs priorisés, en vue d'une **V0.5.0** axée
"fonctionne nativement, sans élévation, sans choco, sans npm, sur un poste d'entreprise contraint".

---

## 1. Preuves collectées (investigation menée sur le poste concerné)

Ces éléments ont été vérifiés **directement sur le poste** ayant rencontré le problème :

1. Le cache d'auto-provisioning de l'extension (`globalStorage\md2nativedocx.md2nativedocx\`)
   contient bien un **Pandoc 3.1.3 complet et fonctionnel** :
   - `pandoc\3.1.3\win32-x64\pandoc.exe` — 140 532 224 octets
   - `pandoc\3.1.3\win32-x64\.verified` — présent
   - Testé manuellement : `pandoc.exe --version` répond correctement `pandoc.exe 3.1.3`.
   - Donc **le téléchargement + vérification SHA-256 + extraction ont réussi** au moins une fois
     sur ce poste, malgré le proxy d'entreprise.
2. Le cache contient aussi un **.NET runtime 10.0.4 complet et fonctionnel**
   (`dotnet-runtime\10.0.4\win32-x64\`, avec `.verified`), utilisé pour le contrôle de compatibilité
   Word (ADR 0007). Donc le réseau de ce poste **n'est pas totalement bloqué** vers
   `github.com` / `builds.dotnet.microsoft.com` — au moins ces deux téléchargements de plusieurs
   dizaines/centaines de Mo ont abouti.
3. Le output channel VS Code `md2nativedocx` (fichier
   `%APPDATA%\Code\logs\<session>\window1\exthost\output_logging_*\*-md2nativedocx.log`) est
   **resté vide sur les 3 sessions VS Code de la journée**, y compris pendant la fenêtre où le
   téléchargement de Pandoc a réussi (cache créé à 11:19:56, extension activée à 10:53:20 puis
   11:32:26). Or `resolvePandocBin()` dans `extension.ts` écrit dans ce channel **uniquement**
   quand `ensurePandoc()` rejette (catch). Le channel vide ne permet donc pas de confirmer
   avec certitude à quel moment précis, ni pourquoi, l'erreur affichée à l'utilisateur a eu lieu.
4. `exthost.log` (log principal, pas le channel de l'extension) ne contient **aucune trace**
   d'erreur/stack trace liée à pandoc/ENOENT/EBUSY/EPERM/rmSync sur la période.

**Conclusion de l'investigation** : impossible de prouver avec 100% de certitude la cause exacte
du premier échec (le diagnostic est un trou noir — voir Bug #2 ci-dessous, qui explique
*pourquoi* c'est un trou noir). Mais l'investigation a mis au jour **plusieurs bugs et lacunes de
conception réels et indépendants**, détaillés ci-dessous, qui doivent être corrigés dans tous les
cas pour que l'extension soit fiable sur un poste d'entreprise contraint.

---

## 2. Bug P0 — `finally { rmSync(...) }` peut annuler silencieusement un provisioning réussi

### Fichiers concernés (le même bug existe dans les DEUX fichiers, à corriger dans les deux)
- `packages/vscode-extension/src/pandocProvisioner.ts`
- `packages/vscode-extension/src/dotnetProvisioner.ts`

### Explication du bug
Dans `pandocProvisioner.ts`, fonction `provisionForPlatform()`, le code actuel est :

```ts
mkdirSync(dir, { recursive: true });
const tmpRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-pandoc-'));
try {
  const archivePath = join(tmpRoot, spec.asset);
  onProgress?.({ phase: 'downloading', fraction: 0 });
  await downloadFile(RELEASE_BASE_URL + spec.asset, archivePath, (fraction) =>
    onProgress?.({ phase: 'downloading', fraction }),
  );

  const actualHash = await sha256File(archivePath);
  if (actualHash !== spec.sha256) {
    throw new PandocProvisionError(/* ... */);
  }

  onProgress?.({ phase: 'extracting' });
  const extractDir = join(tmpRoot, 'extract');
  mkdirSync(extractDir, { recursive: true });
  await execFileP('tar', ['-xf', archivePath, '-C', extractDir]);

  const extractedBin = join(extractDir, spec.binaryPathInArchive);
  if (!existsSync(extractedBin)) {
    throw new PandocProvisionError(/* ... */);
  }
  copyFileSync(extractedBin, binPath);
  if (process.platform !== 'win32') {
    chmodSync(binPath, 0o755);
  }
  writeFileSync(sentinelPath, actualHash);
  return binPath;
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
```

**Le problème** : en JavaScript/TypeScript, si le bloc `finally` lève une exception, cette
exception **remplace silencieusement** la valeur retournée par `return` dans le bloc `try`
(même si le `try` s'est terminé avec succès jusqu'au bout). Ici, `rmSync(tmpRoot, ...)` peut
échouer de façon transitoire pour plusieurs raisons courantes sur un poste d'entreprise :
- un antivirus/EDR qui scanne en temps réel le fichier `.exe` fraîchement extrait dans `tmpRoot`
  et maintient un verrou dessus quelques centaines de ms à quelques secondes (`EBUSY`/`EPERM`
  sous Windows) ;
- un indexeur de fichiers Windows Search ;
- tout autre verrou transitoire de fichier.

Si cela se produit, **le fichier `binPath` est déjà correctement copié et vérifié sur disque**
(preuve : c'est exactement ce que montre le cache observé sur le poste concerné), mais
`provisionForPlatform()` lève quand même une exception au lieu de retourner `binPath`. L'appelant
`resolvePandocBin()` (dans `extension.ts`) catch cette exception et retombe sur `undefined`,
ce qui fait échouer tout l'export avec `PandocMissingError`, **alors que Pandoc était en fait
prêt à l'emploi**.

### Correctif attendu (à appliquer identiquement dans les deux fichiers)

Remplacer le `finally` par une version qui ne peut jamais faire perdre le `return` :

```ts
} finally {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // Le nettoyage du dossier temporaire est best-effort : un verrou transitoire
    // (antivirus/EDR scannant le binaire fraîchement extrait, indexeur Windows, ...)
    // ne doit jamais faire perdre un provisioning déjà réussi et vérifié sur disque.
  }
}
```

Appliquer ce même correctif :
- dans `pandocProvisioner.ts`, fonction `provisionForPlatform()`, autour de `rmSync(tmpRoot, ...)`.
- dans `dotnetProvisioner.ts`, fonction `provisionForPlatform()`, autour de son `rmSync(tmpRoot, ...)`
  (structure identique, même pattern try/finally).

### Test de non-régression à ajouter
Ajouter un test unitaire (dans les fichiers de test existants, ex.
`packages/vscode-extension/test/unit/pandocProvisioner.test.ts` et l'équivalent pour dotnet) qui :
1. simule un `provisionForPlatform()` qui réussit toutes les étapes normalement,
2. fait échouer `rmSync` (via mock du module `node:fs`) pendant le nettoyage,
3. vérifie que la fonction retourne quand même `binPath`/`hostPath` (pas de throw), et que le
   fichier + sentinel existent bien sur disque.

---

## 3. Bug P0 — `PandocMissingError` n'est jamais logué (trou noir de diagnostic)

### Fichier concerné
`packages/vscode-extension/src/extension.ts`, fonction `handleExportError()`.

### Code actuel
```ts
async function handleExportError(err: unknown): Promise<void> {
  if (err instanceof PandocMissingError) {
    const installPandoc = vscode.l10n.t('Install Pandoc');
    const choice = await vscode.window.showErrorMessage(
      vscode.l10n.t('Pandoc could not be found on this machine.'),
      installPandoc,
    );
    if (choice === installPandoc) {
      await vscode.env.openExternal(vscode.Uri.parse('https://pandoc.org/installing.html'));
    }
    return;
  }
  if (err instanceof BlockNotFoundError) {
    // ...
  }
  if (err instanceof ExportFailedError) {
    outputChannel.appendLine(err.details || err.message);   // <-- logué ici
    // ...
  }
  // ...
}
```

**Le problème** : contrairement à la branche `ExportFailedError` (qui logue `err.details` dans
`outputChannel`), la branche `PandocMissingError` **ne logue jamais rien**. Résultat : quand
un utilisateur (ou l'auteur lui-même en investigation) ouvre le output channel "md2nativedocx"
après avoir vu ce message, **il est vide**, sans aucune indication de la cause réelle (proxy ?
binaire bloqué par une politique de sécurité ? cache corrompu ? `ensurePandoc()` qui a réussi
mais dont le retour a été perdu par le bug de la section 2 ?).

### Correctif attendu
Toujours logger la raison réelle avant d'afficher le toast, même pour `PandocMissingError`.
Pour cela, il faut que `PandocMissingError` puisse porter un détail (comme `ExportFailedError`
le fait déjà avec son champ `details`). Concrètement :

1. Dans `packages/vscode-extension/src/exportService.ts`, la classe `PandocMissingError` est
   actuellement une simple `class PandocMissingError extends Error {}`. L'enrichir pour accepter
   un détail optionnel :
   ```ts
   export class PandocMissingError extends Error {
     constructor(
       message: string,
       public readonly details?: string,
     ) {
       super(message);
     }
   }
   ```
2. Là où `PandocMissingError` est levée (dans `runCli()`, sur détection de `ENOENT` dans
   `stderr`), passer le `stderr` complet en second argument :
   ```ts
   if (stderr.includes('ENOENT')) {
     reject(new PandocMissingError('Pandoc could not be found on this machine.', stderr));
     return;
   }
   ```
3. Dans `extension.ts`, `handleExportError()`, logger ce détail avant d'afficher le toast :
   ```ts
   if (err instanceof PandocMissingError) {
     outputChannel.appendLine(err.details || err.message);
     const installPandoc = vscode.l10n.t('Install Pandoc');
     // ... (reste inchangé, voir section 4 pour la suite du correctif sur ce même bloc)
   }
   ```
4. Par ailleurs, dans `resolvePandocBin()` (toujours dans `extension.ts`), le catch qui entoure
   `ensurePandoc()` logue déjà `outputChannel.appendLine(`Automatic Pandoc setup failed, falling
   back to PATH: ${detail}`)` — **c'est bien**, mais s'assurer que cette ligne est écrite **avant**
   que le CLI ne soit lancé sans `pandocBin`, pour que la chronologie du log soit lisible
   (télécharger a échoué → puis le CLI tente `pandoc` nu → puis ENOENT → puis le nouveau log de
   la section 3 point 3 s'ajoute à la suite). Vérifier qu'il n'y a pas de réordonnancement
   asynchrone qui rendrait ces deux logs incohérents dans le temps.

---

## 4. Bug/UX P0 — l'action de secours "Install Pandoc" est incompatible avec la persona sans droits admin

### Fichier concerné
`packages/vscode-extension/src/extension.ts`, fonction `handleExportError()`, branche
`PandocMissingError` (même bloc que la section 3).

### Le problème
Le bouton unique proposé aujourd'hui, "Install Pandoc", ouvre
`https://pandoc.org/installing.html` dans le navigateur. Cette page propose des installeurs
(`.msi`, `choco`, etc.) qui **nécessitent des droits administrateur** sur Windows dans la
majorité des cas (installation dans `C:\Program Files`). Pour un utilisateur d'entreprise sans
droits admin, ce bouton mène à une impasse : il ne peut rien faire avec.

Or l'extension a **déjà** un mécanisme d'auto-provisioning qui ne nécessite aucune élévation
(téléchargement dans `globalStorage`, hors `Program Files`). Si ce mécanisme a échoué une
première fois (transitoirement, ex. bug de la section 2, ou coupure réseau ponctuelle), il n'y
a aujourd'hui **aucun moyen simple de le relancer** depuis le toast d'erreur.

### Correctif attendu
Remplacer le toast à un seul bouton par un toast à deux actions, l'auto-provisioning en premier :

```ts
if (err instanceof PandocMissingError) {
  outputChannel.appendLine(err.details || err.message);
  const retry = vscode.l10n.t('Réessayer (installation automatique)');
  const installManually = vscode.l10n.t('Installer manuellement (nécessite les droits admin)');
  const choice = await vscode.window.showErrorMessage(
    vscode.l10n.t('Pandoc could not be found on this machine.'),
    retry,
    installManually,
  );
  if (choice === retry) {
    // Relance directement le flux d'export courant (même commande qu'à l'origine),
    // ce qui réappelle resolvePandocBin() -> ensurePandoc() depuis zéro.
    // Voir comment handleExportDocument()/handleExportBlock() sont invoquées plus haut
    // dans ce même fichier pour réutiliser exactement le même chemin de code.
  } else if (choice === installManually) {
    await vscode.env.openExternal(vscode.Uri.parse('https://pandoc.org/installing.html'));
  }
  return;
}
```

Note pour l'implémenteur : il faut probablement remonter la référence à la commande/URI/args
d'origine (document, bloc à exporter) jusqu'à `handleExportError()`, ou plus simplement faire en
sorte que le bouton "Réessayer" ré-invoque la commande VS Code correspondante
(`md2nativedocx.exportDocument` ou `md2nativedocx.exportBlock`) avec les mêmes arguments que
l'appel initial, via `vscode.commands.executeCommand(...)`.

---

## 5. P1 — Le téléchargement ne respecte pas le proxy d'entreprise (cause probable de flakiness réseau)

### Fichiers concernés
`packages/vscode-extension/src/pandocProvisioner.ts` et `dotnetProvisioner.ts`, fonction
`downloadFile()` dans les deux (utilisent directement `fetch(url, { redirect: 'follow' })`).

### Explication du problème
Le `fetch` global de Node.js (basé sur `undici`) **n'utilise pas automatiquement** :
- les variables d'environnement `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` (même si elles sont
  définies sur la machine, contrairement à beaucoup d'outils CLI classiques) ;
- le proxy système Windows configuré via WinINet/registre (`Paramètres réseau > Proxy`), que
  d'autres outils Windows respectent nativement ;
- une éventuelle CA racine d'entreprise utilisée pour l'inspection SSL/TLS du trafic sortant
  (très courant en entreprise) — le magasin de certificats de confiance de Node peut ne pas la
  connaître, ce qui casse le TLS handshake vers `github.com`/`builds.dotnet.microsoft.com`.

C'est une cause plausible d'échecs intermittents de téléchargement sur un réseau d'entreprise,
même si dans le cas investigué ici le téléchargement a fini par réussir (donc pas forcément
bloquant sur ce poste précis, mais **certainement bloquant sur d'autres postes/entreprises** avec
un proxy plus strict, ex. proxy authentifié NTLM/Kerberos obligatoire).

### Deux options de correctif (à choisir, la seconde est recommandée pour la robustesse maximale)

**Option A — Rendre `fetch` proxy-aware avec `undici` :**
1. Ajouter la dépendance déjà présente transitivement (`undici` est la base du `fetch` global de
   Node ≥ 18, mais `ProxyAgent` doit être importé explicitement depuis le module `undici`).
2. Lire, dans cet ordre de priorité, la config proxy à utiliser :
   - les settings VS Code `http.proxy` / `http.proxyStrictSSL` / `http.proxyAuthorization`
     (accessibles via `vscode.workspace.getConfiguration('http')` — **VS Code résout déjà le
     proxy système pour ses propres besoins**, donc c'est la source la plus fiable et déjà
     configurée correctement par l'utilisateur/l'IT dans la plupart des cas) ;
   - à défaut, les variables d'environnement `HTTPS_PROXY`/`HTTP_PROXY`/`https_proxy`/`http_proxy`.
3. Si une URL de proxy est trouvée, configurer :
   ```ts
   import { ProxyAgent, setGlobalDispatcher } from 'undici';
   setGlobalDispatcher(new ProxyAgent(proxyUrl));
   ```
   avant tout appel à `downloadFile()`.
4. Limite connue de cette option : ne gère pas nativement l'authentification NTLM/Kerberos
   transparente (SSO) d'un proxy d'entreprise — seulement les proxys avec URL simple
   (éventuellement `http://user:pass@proxy:port`).

**Option B (recommandée) — Déléguer le téléchargement à `curl` :**
Le code utilise déjà `execFile('tar', [...])` pour l'extraction (voir le commentaire dans le
code : *"no new dependency (AGENTS.md rule 6)"*). `curl` est disponible nativement et sans
installation supplémentaire :
- Windows 10 version 1803+ et Windows 11 : `curl.exe` est présent nativement dans `System32`.
- macOS : `curl` présent nativement.
- Linux : présent sur la quasi-totalité des distributions (à vérifier/documenter comme
  prérequis minime si absent, avec message clair).

`curl` respecte **nativement** le proxy système (WinINet sous Windows), gère
`--proxy-negotiate`/NTLM/Kerberos avec `--proxy-user :` (credentials par défaut de session), et
un magasin de certificats plus permissif/configurable côté OS. Remplacer `downloadFile()` par un
appel `execFile('curl', ['-fL', '--proto', '=https', '-o', destPath, url])` (avec gestion de la
progression via `curl --progress-bar` parsé, ou en acceptant de perdre la granularité fine de
progression pour ce mode de repli). Prévoir un **repli automatique** : essayer `fetch` d'abord
(rapide, fonctionne dans le cas commun sans proxy), et si ça échoue, retenter via `curl` avant de
lever une erreur définitive.

### Recommandation
Implémenter les deux : `fetch` en premier essai (rapide, cas commun), `curl` en repli automatique
si `fetch` échoue (réseau d'entreprise). Documenter clairement dans le message d'erreur final
(si les deux échouent) que le poste est probablement derrière un proxy nécessitant une
configuration manuelle, avec un lien vers un futur setting (voir section 7).

---

## 6. P1 — Aucune distinction entre "Pandoc introuvable" et "Pandoc bloqué par une politique de sécurité"

### Contexte
Sur un poste d'entreprise avec AppLocker / Windows Defender Application Control (WDAC) / une
politique SmartScreen stricte, l'exécution d'un binaire **non signé Authenticode** téléchargé
dans un dossier utilisateur (`%APPDATA%\Code\User\globalStorage\...`) peut être **bloquée par la
politique de sécurité**, indépendamment de tout problème réseau. Les binaires Windows officiels
de Pandoc ne sont pas signés Authenticode (à vérifier/confirmer au moment de l'implémentation,
mais c'est l'hypothèse de travail).

Dans ce cas, `execFile('pandoc', ['--version'], ...)` ou l'exécution du binaire mis en cache ne
renverra **pas** un `ENOENT` (fichier introuvable) mais un code d'erreur différent (accès
refusé / bloqué par la stratégie de groupe — sous Windows, souvent visible comme code de sortie
`1260` ("This program is blocked by group policy") ou une erreur `EACCES`/`EPERM` selon le
mécanisme de blocage). Aujourd'hui, ce cas de figure produit très probablement le même message
générique et trompeur "Pandoc could not be found on this machine", alors que la cause et la
solution sont complètement différentes (contacter le support IT / demander une exception de
politique / demander l'app via le portail logiciel d'entreprise, plutôt que "réessayer" ou
"installer soi-même").

### Correctif attendu
1. Dans `isPandocOnPath()` / la détection d'échec du CLI (`exportService.ts`, `runCli()`),
   inspecter le message d'erreur/code de sortie renvoyé, en plus de la simple détection de la
   sous-chaîne `'ENOENT'` dans `stderr`. Ajouter une détection spécifique (à documenter avec les
   codes d'erreur exacts observés en test réel, si possible avec une VM configurée avec AppLocker)
   pour un blocage de type politique de sécurité.
2. Introduire une nouvelle erreur distincte, ex. `PandocBlockedByPolicyError extends Error`, levée
   quand ce cas est détecté.
3. Dans `handleExportError()` (`extension.ts`), ajouter une branche dédiée pour cette erreur avec
   un message clair et actionnable, par exemple :
   > "L'exécution de Pandoc a été bloquée par la politique de sécurité de votre poste
   > (AppLocker/SmartScreen). Contactez votre support informatique pour demander une exception,
   > ou installez Pandoc via le portail logiciel de votre entreprise si disponible."
4. Ne pas proposer de bouton "Réessayer" pour ce cas précis (retenter ne changera rien tant que
   la politique n'est pas modifiée côté IT) — proposer plutôt "Copier les détails techniques"
   pour faciliter un ticket support.

---

## 7. P2 — Permettre à une IT de fournir Pandoc/.NET via un miroir interne (réseaux totalement cloisonnés)

### Contexte
Certaines entreprises appliquent une politique d'allowlist stricte au niveau du firewall/proxy,
où seuls certains domaines explicitement autorisés sont joignables (`github.com` et
`builds.dotnet.microsoft.com` pourraient ne pas en faire partie). Dans ce cas, **aucun** correctif
réseau côté extension (proxy-aware ou non) ne suffira : il faut un point d'extension pour que
l'IT du client fournisse elle-même les binaires via une source interne (ex. Nexus/Artifactory/
partage réseau d'entreprise).

### Correctif attendu
1. Ajouter deux nouveaux settings VS Code dans `package.json` (`contributes.configuration`) :
   - `md2nativedocx.pandoc.downloadUrl` (string, optionnel) — si défini, remplace
     `RELEASE_BASE_URL + spec.asset` dans `pandocProvisioner.ts`.
   - `md2nativedocx.pandoc.sha256` (string, optionnel) — si défini, remplace `spec.sha256` pour la
     vérification (permet à l'IT d'héberger une version différente si besoin, tout en gardant la
     vérification d'intégrité obligatoire — **ne jamais désactiver la vérification de hash même
     dans ce mode**, seulement permettre de la reparamétrer).
   - Équivalent pour le .NET runtime si jugé utile (`md2nativedocx.dotnet.downloadUrl` /
     `.sha512`).
2. Documenter ces settings dans `packages/vscode-extension/README.md`, section dédiée
   "Déploiement en entreprise" avec un exemple concret de configuration via `settings.json` géré
   par une politique IT (GPO/Intune profile déployant un `settings.json` par défaut).

---

## 8. P2 — Réflexion sur l'ordre de résolution PATH vs cache vérifié

### Contexte
`ensurePandoc()` vérifie **d'abord** si `pandoc` est disponible sur le `PATH` système
(`isPandocOnPath()`), et ne retombe sur le cache interne (téléchargé et vérifié, version pinnée
`PANDOC_VERSION = '3.1.3'`) que si rien n'est trouvé sur le `PATH`.

Implication : si un utilisateur (ou une politique IT, ou un autre outil) installe une version de
Pandoc différente sur le `PATH` (ex. Pandoc 3.9 le plus récent), l'extension l'utilisera
silencieusement à la place de la version 3.1.3 que les tests golden/visuels de CI ont validée.
Cela peut introduire des différences de rendu non testées, difficiles à diagnostiquer pour
l'utilisateur ("ça marche différemment chez moi vs. dans la CI").

### Décision à prendre (pas un bug, un choix de conception à trancher explicitement)
Deux options, à choisir consciemment et à documenter dans un ADR :
- **Conserver l'ordre actuel** (PATH prioritaire) : respecte le principe de moindre surprise
  ("j'ai installé Pandoc moi-même, l'extension doit l'utiliser"), mais expose à des régressions
  de rendu non testées selon la version trouvée sur le poste.
- **Inverser l'ordre** (cache vérifié interne prioritaire, PATH en dernier recours si le
  téléchargement/cache échoue totalement) : garantit un rendu reproductible et testé pour tous
  les utilisateurs, au prix de ne pas respecter un Pandoc système que l'utilisateur aurait
  installé intentionnellement (mais celui-ci peut toujours forcer son propre binaire via le
  setting `md2nativedocx.referenceDocument`/un futur setting `md2nativedocx.pandoc.forcePath`
  explicite, plutôt que par un simple PATH implicite).

Recommandation pour la persona "poste d'entreprise/non technique" : privilégier la
**reproductibilité** (cache interne prioritaire), car cette persona n'installe jamais Pandoc
elle-même intentionnellement — un Pandoc trouvé sur le PATH dans ce contexte est plus probablement
un résidu d'une tentative de dépannage manuelle antérieure (potentiellement une version non
testée) que le choix délibéré de l'utilisateur.

---

## 9. P1 — Re-vérifier le binaire caché à chaque utilisation, pas seulement au premier téléchargement

### Contexte
`provisionForPlatform()` considère le provisioning comme terminé dès que `binPath` et
`sentinelPath` existent sur disque (`if (existsSync(binPath) && existsSync(sentinelPath)) return
binPath;`). Un antivirus d'entreprise peut mettre un fichier exécutable en **quarantaine** après
son écriture initiale (scan asynchrone a posteriori, comportement courant de certains EDR), ce
qui peut faire disparaître ou corrompre `binPath` **après** que le sentinel a été écrit. Dans ce
cas, l'extension croira à tort que Pandoc est prêt, puis l'exécution échouera avec un ENOENT/EACCES
au moment de l'export, sans qu'un nouveau téléchargement ne soit tenté automatiquement.

### Correctif attendu
Avant de retourner `binPath` depuis le cache existant, vérifier rapidement que le fichier existe
**encore** ET a la **taille attendue** (ou, plus robuste mais plus coûteux, re-calculer le hash
et comparer au sentinel stocké — acceptable car ce n'est fait qu'une fois par lancement de VS Code,
pas à chaque export). Si la vérification échoue, supprimer le cache invalide et relancer un
provisioning complet automatiquement, sans intervention de l'utilisateur.

---

## 10. Checklist de validation avant de considérer la V0.5.0 comme prête

À tester, si possible sur des VM/conteneurs simulant chaque contrainte séparément :

- [ ] Poste sans droits admin, aucun logiciel préinstallé : export fonctionne du premier coup
      (télécharge Pandoc + .NET automatiquement, sans intervention).
- [ ] Poste derrière un proxy HTTP simple (sans authentification) : le téléchargement aboutit
      (valider avec un proxy de test type `mitmproxy`/`squid` local).
- [ ] Poste derrière un proxy authentifié (Basic auth) : le téléchargement aboutit ou échoue avec
      un message clair sur la nécessité de configurer `http.proxyAuthorization`.
- [ ] Simulation d'un verrou de fichier transitoire pendant le nettoyage du dossier temp
      (mock `rmSync` qui échoue une fois) : le provisioning aboutit quand même (non-régression
      du fix section 2).
- [ ] Simulation d'un `PandocMissingError` : le output channel contient bien le détail de l'échec
      (non-régression du fix section 3).
- [ ] Le bouton "Réessayer" du toast d'erreur relance bien l'export sans que l'utilisateur ait à
      rouvrir manuellement quoi que ce soit.
- [ ] Réseau totalement cloisonné (bloquer `github.com` au niveau hosts file de test) :
      l'extension affiche un message clair invitant à configurer `md2nativedocx.pandoc.downloadUrl`
      plutôt qu'un message générique.
- [ ] Cache corrompu manuellement après un premier provisioning réussi (supprimer `pandoc.exe`
      tout en laissant `.verified`) : l'extension détecte l'incohérence et re-télécharge
      automatiquement (non-régression du fix section 9).

---

## 11. Résumé exécutif (à lire en premier si le temps manque)

1. **Deux bugs concrets et non ambigus à corriger immédiatement** (section 2 et 3) : un `finally`
   qui peut annuler un succès, et une erreur qui n'est jamais loguée. Faible risque, gain élevé.
2. **Un choix UX à corriger** (section 4) : ne plus rediriger un utilisateur sans droits admin
   vers un lien d'installation qui nécessite des droits admin.
3. **Le vrai chantier structurant de la V0.5.0** : rendre le téléchargement compatible avec un
   proxy d'entreprise (section 5), et distinguer clairement "introuvable" de "bloqué par une
   politique de sécurité" (section 6) — ces deux points déterminent si l'extension fonctionne
   *du tout* sur un poste d'entreprise typique, au-delà du cas particulier déjà observé.
4. Les sections 7 à 9 sont des durcissements complémentaires, utiles mais non bloquants pour un
   premier jet de V0.5.0.
