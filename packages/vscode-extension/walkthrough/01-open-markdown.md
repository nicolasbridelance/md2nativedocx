Open any `.md` file — text, tables and formatting export either way. This walkthrough uses one
with Mermaid diagrams, since that's where `md2nativedocx` stands out: they become real, editable Word
objects, not pictures.

    # Architecture report

    ```mermaid
    graph TD
      A[Client] --> B[API]
      B --> C[Database]
    ```

No setup required — the extension activates on any `.md`, `.qmd` or `.mmd` file.
