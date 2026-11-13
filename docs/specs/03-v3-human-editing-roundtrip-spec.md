# MD2NativeDocx — V3 Human Editing & Round-Trip Specification

**Status:** Vision / exploratory specification  
**Dependency:** V2 public engine contracts and identity/provenance support.

> **Statut au 2026-10-07 : vision, pas commencée.** Cette spec **reprend et élargit**
> `docs/specs/FUTURE_docx2mermaid_SPEC.md` (2026-09) : même boucle « IA → Word → retouche humaine →
> Mermaid », même exigence d'identifiants stables. Ce qu'elle ajoute : le diff sémantique comme
> interface avec le LLM (§8-9), la séparation sens / présentation (§6), d'autres surfaces d'édition
> que Word (§3-4, §10). Ce qu'elle garde de l'ancienne spec : le périmètre réduit aux documents
> produits par ce projet. Ce qui existe déjà : l'id Mermaid de chaque nœud de flowchart dans
> `cNvPr/@descr` (voir `01-v2-engine-spec.md`, annexe A, pour la limite de ce choix).
>
> Deux points à connaître avant le spike V3.0 :
> - **Sécurité.** Lire un `.docx` venu d'ailleurs fait entrer dans le périmètre des risques
>   aujourd'hui marqués « hors scope » dans `AGENTS.md` (ZIP bomb, en particulier). §13 ci-dessous ;
>   la ligne correspondante du tableau de sécurité d'`AGENTS.md` devra changer (escalade).
> - **Accès à Word.** Chaque étape du spike exige un aller-retour dans un vrai Word chez le mainteneur,
>   comme les rounds SmartArt (`test-corpus/word-verification/CHECKLIST.md`). Ce n'est pas faisable
>   depuis le Codespace seul.

## 1. Purpose

V3 explores a different problem from V2.

V2 asks:

> How do we make the existing engine composable and reusable?

V3 asks:

> How can humans and machines edit the same diagram/document through interfaces natural to each of them without flattening the representation?

The long-term interaction model is:

```text
structured source
      |
      v
native Office / visual editor
      |
 human changes
      |
      v
structured semantic diff
      |
      v
LLM reconciliation
      |
      v
updated structured source
```

## 2. Source of truth

The WYSIWYG editor should not automatically become the canonical source.

For developer-oriented workflows, a structured textual representation such as Mermaid may remain version-controlled in Git.

The editor is another editable view of the same logical content.

## 3. Human editing surfaces

Potential hosts include:

- VS Code;
- a web application;
- a Word add-in;
- Word itself through editing of generated native objects;
- diagrams.net / draw.io;
- future domain-specific editors.

V3 should avoid binding the editing model to one host.

## 4. Independent editor component

If a custom WYSIWYG is built, it should be an embeddable component rather than VS Code-specific rendering code.

```text
             Diagram Editor
                  |
        structured operations
                  |
               Engine
          /        |        \
     VS Code      Web     Word add-in
```

VS Code is the recommended first host because source, Git diff, Markdown, Mermaid and agent tooling already coexist there.

## 5. Operation model

The editor should produce structured operations rather than only visual output.

Examples:

```ts
renameNode("payment", "Payment validation");
moveNode("payment", { x: 510, y: 180 });
addNode("fraud", { label: "Fraud check" });
deleteEdge("payment", "confirmation");
addEdge("payment", "fraud");
```

These operations are useful for:

- deterministic change tracking;
- undo/redo;
- semantic diff generation;
- LLM reconciliation;
- Git-friendly source updates.

## 6. Semantic vs presentation changes

V3 must distinguish, where possible, between changes to meaning and changes to presentation.

Semantic examples:

- node added/deleted;
- label changed;
- relationship added/deleted;
- topology changed;
- data series changed.

Presentation examples:

- node moved;
- color changed;
- size changed;
- manual connector routing changed.

Not every source language can express every presentation change. The round-trip system must therefore support preserving presentation metadata separately from source semantics where needed.

## 7. Word as an editing surface

A major V3 research direction is Word -> semantic diff.

Target experiment:

```text
Mermaid
  |
Engine
  |
DOCX native objects
  |
user edits in Word
  |
modified DOCX
  |
object reconstruction
  |
semantic/presentation diff
```

The first implementation should focus narrowly on flowcharts and/or SmartArt.

Questions to answer empirically:

- Which shape identifiers survive a Word edit/save cycle?
- Which connector relationships survive?
- How does Word rewrite IDs and relationships?
- Which text identities can be matched reliably?
- How are SmartArt data models changed after user edits?
- Which presentation edits should be preserved but not reflected in Mermaid?

## 8. Semantic diff as the LLM interface

The LLM should not be required to inspect raw DOCX or OOXML to understand human changes.

The engine should produce a compact structured diff, for example:

```text
NODE payment
  label: "Payment" -> "Payment validation"
  position: (420,180) -> (510,180)

NODE fraud
  added
  label: "Fraud check"

EDGE payment->confirmation
  deleted

EDGE payment->fraud
  added
```

The LLM receives:

1. original structured source;
2. structured semantic/presentation diff;
3. optional constraints about which presentation changes should be represented.

The LLM returns an updated source representation.

## 9. Deterministic vs probabilistic responsibility

A central V3 architecture rule:

```text
DOCX -> object reconstruction -> semantic diff
            deterministic

semantic diff + original source -> revised Mermaid/PlantUML
            LLM-assisted
```

The engine should own precise observation and identity matching.

The LLM should own flexible re-expression into a textual DSL where ambiguity exists.

This avoids turning the renderer into a complex handcrafted reverse compiler for every source syntax.

## 10. diagrams.net / draw.io as a possible frontend

Before building a full custom graphical editor, test whether diagrams.net can act as a visual editing surface.

Potential flow:

```text
source
  |
engine/model adapter
  |
draw.io
  |
human editing
  |
updated structured model
  |
semantic diff
```

This experiment should determine how much custom editor technology MD2NativeDocx truly needs to own.

## 11. Git integration

For source-controlled workflows, V3 should preserve the desirable chain:

```text
visual edit
   |
source update
   |
Git diff
   |
code review
   |
merge
```

This is a key differentiator from editors that replace source-controlled representation with an opaque binary editing model.

## 12. V3 staged plan

### V3.0 — Word round-trip spike

- Generate a controlled set of flowcharts/SmartArt.
- Edit them in Word.
- Save and inspect what survives.
- Produce a structured before/after report.

### V3.1 — Change/operation model

- Define stable structured change operations from real round-trip observations.
- Implement semantic vs presentation classification where reliable.

### V3.2 — LLM reconciliation prototype

- Feed original Mermaid + semantic diff to an LLM.
- Validate whether regenerated Mermaid preserves intended changes.
- Measure cases requiring human confirmation.

### V3.3 — Minimal visual editor

- Build or integrate the smallest useful editor surface.
- Prefer reuse of existing visual-editor technology where practical.

### V3.4 — VS Code host

- Side-by-side text + visual editing.
- Structured operations -> source proposal -> Git diff.

### Later

Decide from evidence whether the product needs:

- a standalone web editor;
- a Word add-in;
- deeper diagrams.net integration;
- additional hosts.

## 13. Security implications

Reading untrusted DOCX files becomes a materially different threat surface from generating documents.

Before production round-trip import, address at minimum:

- ZIP bombs;
- XML entity attacks where applicable;
- oversized parts;
- malformed relationship graphs;
- unexpected external references;
- parser resource exhaustion.

Security requirements become part of the product rather than out-of-scope hardening once import exists.

## 14. V3 non-goals at the start

Do not begin V3 by:

- building a complete draw.io replacement;
- supporting every Mermaid diagram type in reverse;
- reconstructing arbitrary third-party DOCX drawings;
- preserving every manual styling change;
- solving a universal bidirectional IR.

Start from generated documents whose provenance is known and controlled.

## 15. V3 success criterion

The compelling proof is not visual polish.

It is this loop working reliably on a narrow domain:

```text
Mermaid -> Word -> human edit -> semantic diff -> LLM -> revised Mermaid
```

If that works, the project has moved from export tooling to a collaboration surface between humans and machines.
