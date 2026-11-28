# Non-technical guide — no code required

This page does not talk about code. It explains what this tool does, why, and how to use it if you are
not a developer.

## The problem, in one sentence

A "Mermaid" diagram (a flowchart, an architecture sketch, a timeline...) written by a developer or an AI
is text that is quick to produce and change, but unreadable as it is for most business, legal or client
reviewers. Until now, the only way to put it in a Word document was to turn it into a **frozen image**:
no shape can be edited, you cannot move a step, fix a label or change a colour without asking someone to
regenerate it.

## What `md2nativedocx` does

It turns a Markdown document (text, headings, tables) containing diagrams into a real **Word file
(`.docx`)**, where each diagram is made of **native Word shapes**, as if someone had drawn it with Word's
own tools. Some diagrams become Word **SmartArt** or real Word **charts** (a pie chart whose figures you
can change in Word). In the document you receive, you can:

- click a box and select it on its own;
- fix the text inside a shape without leaving Word;
- move a step, change a colour, resize it;
- copy the diagram into another document, a PowerPoint or an email.

None of this is possible with a picture. The same document can also be produced for **LibreOffice**
(`.odt`) or as a **PowerPoint** deck (`.pptx`).

## How to use it, without installing developer tools

**Someone sends you the `.docx`.** You need nothing: open it in Word as usual.

**You want to make the `.docx` yourself**, from a Markdown document a colleague or an AI gave you:

- **In your web browser, nothing to install:** open
  <https://nicolasbridelance.github.io/md2nativedocx/>, paste or drop your Markdown file, click
  **Convert**, and the Word file downloads. The first visit downloads the conversion engine (about 17 MB,
  once); the page explains the wait. Your text stays in your browser: the page cannot send it anywhere.
  This version has no page-layout options and leaves out images.
- **In Visual Studio Code**, for more options (page size, fonts, table of contents, images, `.odt`):
  install the free **md2nativedocx** extension, open the `.md` file, and click the **Export to Word** link
  that appears above each diagram. A notification offers to open the result in Word.

## "What if an AI does this work?"

That is what the tool is built for. An AI writes considerably better, faster and more reliably in
Markdown with diagrams than it can produce a Word file directly. Ask an AI to draft a report or an
architecture diagram in Markdown, then get a clean Word document in one step, without reading or writing
Markdown yourself. Some AI assistants can even call the tool directly (through what is called an MCP
server) and hand you the Word file.

## Frequently asked questions

**Is my content sent to a server?**
No. Everything happens on your own computer, or inside your browser for the web page. Nothing is
collected or measured. Details, including the few one-time downloads, in [`legal.md`](legal.md).

**Is it paid?**
No. The code is in the public domain (CC0 license) and every tool it relies on is free. See
[`legal.md`](legal.md).

**Who checks it is reliable enough for professional use?**
Every change is checked automatically: nearly 1,500 tests, a check that each Word file follows
Microsoft's own file-format rules, security analysis, on Windows, macOS and Linux. See
[`it-security.md`](it-security.md).
