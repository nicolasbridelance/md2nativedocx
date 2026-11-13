/** Raised when a Markdown source or a generated DrawingML fragment cannot be turned into a deck. */
export class PptxConversionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PptxConversionError';
  }
}
