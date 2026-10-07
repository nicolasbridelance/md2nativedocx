# MD2NativeDocx — Roadmap and Open Decisions

**Status:** Working planning document

> **Statut au 2026-10-07 : intégrée.** Les phases V1 / V2 / V3 sont reportées dans
> `docs/specs/cahier_des_charges.md` §11 ; les priorités du §2 sont devenues des items de `TODO.md`
> (§1 pour ce qui revient au mainteneur, §2bis pour le chantier V2). Les notes « État connu » ajoutées
> sous les décisions du §5 rappellent les contraintes que le projet a déjà posées ailleurs ; elles ne
> tranchent rien.

## 1. Product phases

### V1 — Current product

> Generate native, editable Office content from Markdown/Mermaid.

Strengths already present include deep Mermaid coverage, native Word objects, SmartArt/chart work, Pandoc integration, CLI and VS Code integration.

### V2 — Engine

> Turn the existing capability into a composable engine for tools, developers and agents.

Primary work:

1. extract `renderDiagram()`;
2. extract `convert()`;
3. move configuration behind typed contracts;
4. define structured errors;
5. harden Pandoc compatibility;
6. document CLI exit-code contracts;
7. add resource/time limits needed by server use;
8. investigate deterministic output;
9. systematize real-Word verification;
10. expose SDK and thin adapters.

### V2 exploratory probes

After the public engine surface is stable:

- narrow PlantUML probe;
- narrow diagrams.net/draw.io probe;
- architecture findings;
- extract new abstractions only where proven.

### V3 — Human editing and round-trip

> Make Office/native documents and visual editors bidirectional collaboration surfaces between humans and machines.

Start with a narrow Word -> semantic diff experiment before building a graphical product.

## 2. Recommended near-term sequence

### Priority 1 — Real Word demo

Create a short demonstration in Microsoft Word showing:

- Markdown/Mermaid source;
- DOCX generation;
- selection of a native node;
- label edit;
- node movement;
- connector remaining attached.

The demo should prove the central benefit better than screenshots or LibreOffice rendering.

> **État connu (2026-10-07).** `docs/showcase/wow.gif` (README) montre l'export, pas la manipulation
> dans Word. Les gestes demandés ici sont exactement la case « drag a shape — the connected arrow
> follows » de `test-corpus/word-verification/CHECKLIST.md` : la preuve existe, pas la vidéo. Seul le
> mainteneur peut la tourner (vrai Word). Défaut connu à éviter dans la démo : deux connecteurs de
> `crossing-stress-bipartite` ne suivent pas leurs boîtes (`TODO.md` §2).

### Priority 2 — `renderDiagram()` extraction

- map current dispatch logic;
- identify duplicated rendering-plan logic;
- define the smallest useful typed result;
- route current behavior through the new entry point;
- preserve existing tests and outputs.

### Priority 3 — `convert()` extraction

- wrap Pandoc execution/document preparation;
- call `renderDiagram()` internally;
- absorb DOCX post-processing;
- return a programmatic document result;
- migrate CLI to the API.

### Priority 4 — Licensing decision

Resolve CC0 vs Apache-2.0 vs another strategy before accepting significant external contributions if OEM/enterprise use remains a goal.

This should include legal review when commercially justified.

### Priority 5 — Hardening

- supported Pandoc range;
- XML-safe post-processing;
- cancellation/timeouts;
- resource limits;
- deterministic build investigation;
- documented exit codes;
- Word verification corpus.

### Priority 6 — Thin integrations

- Quarto packaging;
- Node SDK documentation;
- MCP server;
- examples for CI/OEM integration.

### Priority 7 — User/business validation

In parallel with engineering:

- seek ten problem conversations;
- aim for five pilot organisations;
- target existing GitHub issues and communities where editable Word export is already requested;
- measure time saved and manual correction effort.

### Priority 8 — Round-trip spike

After identity/provenance support exists, test whether Word retains enough information to reconstruct changes reliably.

## 3. What not to do yet

- Do not build a universal IR before a third genuinely different target or second source implementation proves the need.
- Do not rewrite the 29 Mermaid translators for architectural cleanliness alone.
- Do not build a full graphical editor in V2.
- Do not build a SaaS platform before demand is validated.
- Do not maintain large bespoke plugins for every Markdown editor if CLI/Pandoc/SDK integrations suffice.
- Do not position PowerPoint generation alone as the core moat; that space is already active.

## 4. Technical moat to strengthen

The most defensible asset is not merely OOXML generation.

It is accumulated empirical knowledge of what real Microsoft Word accepts and preserves:

- drawing IDs;
- namespace behavior;
- connector semantics;
- SmartArt data and cached drawings;
- chart packages/workbooks;
- object relationships;
- compatibility quirks not obvious from the schema.

Strengthen this moat by converting tacit knowledge into:

- ADRs;
- regression fixtures;
- Word-verified corpus cases;
- compatibility matrices;
- reproducible tests where automation is possible.

## 5. Open architectural decisions

### 5.1 High-level package location

Should `convert()` live in `core` or a new high-level package that depends on Pandoc/packaging code?

Decision criterion: keep `core` conceptually coherent rather than forcing all orchestration into it merely for naming convenience.

> **État connu.** `AGENTS.md` (« Repo structure ») exige déjà que `packages/core` ignore Pandoc, VS Code
> et Office : `renderDiagram()` peut y aller, `convert()` non. Restent deux options : une entrée
> bibliothèque dans `packages/cli` (aucun paquet de plus), ou un nouveau paquet `@md2nativedocx/engine`
> dont `cli` dépendrait (frontière plus nette pour un intégrateur OEM, un paquet npm de plus à
> publier). Recommandation : commencer dans `cli`, extraire en paquet si un deuxième consommateur
> (MCP, Quarto) le justifie, conformément à la règle 2 de l'ADR 0012.
>
> **Décidé le 2026-10-07** (mainteneur) : entrée bibliothèque dans `packages/cli`, avant la première
> publication npm. Voir ADR 0012, « Decisions taken at acceptance ».

### 5.2 Stable identity storage

Where should semantic IDs/provenance be stored in generated DOCX/PPTX?

Requirements:

- survive common Word save operations where possible;
- not interfere with Office behavior;
- be inspectable by the engine;
- not expose fragile implementation assumptions unnecessarily.

> **État connu.** Aujourd'hui : `wps:cNvPr/@descr` pour les nœuds de flowchart, `cNvPr/@name`
> `"<from>--<to>"` pour leurs arêtes. Or `descr` est le **texte de remplacement** (Alt Text) de la
> forme dans Word, lu par les lecteurs d'écran : un id comme `A` ou `decision1` y est du bruit
> d'accessibilité. Pistes à comparer pendant le spike V3.0 : un `<a:extLst>` avec un URI propre au
> projet (prévu par DrawingML pour les données d'extension, mais à vérifier : Word le conserve-t-il
> à l'enregistrement ?), le `name` (visible dans le volet Sélection), ou une partie XML personnalisée
> qui associe des ids de forme à des ids source. Le critère « survit à un enregistrement Word » ne se
> vérifie que dans un vrai Word.

### 5.3 Pandoc dependency model

Options include:

- external executable with supported version range;
- bundled/managed Pandoc for official distributions;
- adapter boundary allowing alternative document frontends later.

> **État connu.** Pandoc 3.1.3 est la seule version testée (CI macOS/Windows, `pandocProvisioner.ts`,
> minimum exigé par le CLI). L'extension télécharge déjà le binaire officiel, vérifié par SHA-256,
> hors du `.vsix` (décision du 2026-09-02, `AGENTS.md` « Licensing ») : c'est le modèle « Pandoc géré »
> pour la distribution officielle. Embarquer Pandoc dans un paquet a été écarté (taille, GPL, pipeline
> de build). Tester une plage de versions modifie `ci.yml` (revue humaine).

### 5.4 Quarto/Deno compatibility

Verify the runtime assumptions of the current Pandoc/Lua path and determine whether a Deno-compatible bundle or alternative bridge is required.

> **État connu.** Le filtre Lua (`packages/pandoc-filter/md2nativedocx.lua`) lance `node` une fois par
> diagramme (`MD2NATIVEDOCX_NODE_BIN`). Quarto embarque Pandoc et Deno, pas Node : un utilisateur
> Quarto sans Node sur sa machine ne peut pas utiliser le filtre tel quel. Le post-traitement
> (SmartArt, graphiques, ids) vit dans le CLI, pas dans le filtre : sous Quarto, sans le CLI, les
> SmartArt et graphiques ne seraient pas injectés. Les deux points sont à mesurer avant de promettre
> une intégration Quarto.

### 5.5 Byte determinism

Determine whether reproducible byte-identical documents are achievable and useful enough to support as a formal guarantee.

> **État connu.** Non déterministe aujourd'hui par construction : les ids des parties graphiques
> viennent de `randomUUID()` (`md2nativedocx-core.mjs`), Pandoc horodate `docProps/core.xml`,
> `adm-zip` écrit des dates d'entrée.

### 5.6 Licensing

Evaluate CC0, Apache-2.0 or other models in light of:

- patent grants;
- external contributions;
- OEM procurement;
- enterprise legal review;
- continued openness goals.

> **État connu — contrainte forte.** `cahier_des_charges.md` §13 : CC0 a été retenu parce que la
> **demande d'autorisation d'activité accessoire adressée à l'employeur mentionne explicitement une
> publication en CC0**, et « ce qui est promis par écrit prime ». Passer à Apache-2.0 (ou ajouter une
> offre payante, §6-7 ci-dessous) peut donc exiger une nouvelle démarche auprès de l'employeur, en plus
> de la revue juridique. Deuxième contrainte de calendrier : tant qu'aucune contribution externe n'est
> acceptée, le mainteneur peut relicencier seul ; après, il faut l'accord des contributeurs, ou un
> DCO/CLA posé avant (`TODO.md` §1, `AGENTS.md` « Licensing »). Décision du mainteneur uniquement.
>
> **Décidé le 2026-10-07** (mainteneur) : rester en CC0, adopter le DCO dès maintenant, rouvrir la
> licence seulement sur demande d'un intégrateur réel. Correction de la deuxième contrainte : voir
> cahier §13.

### 5.7 Third target threshold

Do not create a generalized render IR merely because PPTX exists.

Revisit when a genuinely different third target is selected, for example:

- Visio;
- Google Slides API;
- ODF;
- SVG preview/editor representation.

> **État connu.** `packages/pptx` réécrit la sortie Word du core (`fragment-converter.ts`) au lieu
> d'avoir son propre traducteur : c'est exactement la situation que ce point accepte (ADR 0010).
> Google Slides passe déjà par l'import `.pptx` ; ODF est laissé aux contributeurs externes
> (`cahier_des_charges.md` §2.1).

## 6. Open product decisions

- Is the long-term product primarily an engine, an SDK, or a branded application ecosystem?
- Which capabilities remain permanently free/open to maximize adoption?
- Is OEM support the first serious paid offer?
- Does MCP become the primary AI distribution channel?
- Does Word round-trip create enough value to justify V3 investment?
- Can diagrams.net serve as the first visual editor rather than building a custom one?
- Is Mermaid the canonical source in round-trip workflows or simply one supported textual representation?

## 7. Open business decisions

Validate before building pricing architecture:

- who pays: individual, team, OEM or enterprise;
- whether value is in conversion, workflow automation, integration or support;
- willingness to pay for official/LTS builds;
- demand for private deployment;
- demand for deterministic and schema-validated AI document generation;
- objection created by single-maintainer bus factor.

> **État connu.** Le projet est une activité accessoire autorisée par l'employeur du mainteneur
> (`cahier_des_charges.md` §13). Toute offre payante (OEM, LTS, support) est à vérifier contre les
> termes de cette autorisation avant d'être annoncée.

## 8. Current working thesis

The immediate bottleneck is not funding.

It is packaging the existing technical capability behind the right interfaces so other tools and people can consume it without understanding its internals.

Funding becomes strategically useful when there is evidence of demand that exceeds the maintainer's ability to support integration, validation, distribution or enterprise requirements.
