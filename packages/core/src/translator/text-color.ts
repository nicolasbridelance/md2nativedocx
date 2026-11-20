/**
 * Black or white text, whichever reads on a fill, so labels stay visible on both light and dark fills.
 * Word resolves shape text colour from the theme (`a:fontRef` -> `lt1`, i.e. white), which is invisible on
 * a light fill; an explicit run colour overrides it. Shared by the flowchart (`.docx` and `.odt`) and class
 * diagram translators.
 *
 * `fillHex` is 6 hexadecimal digits, already validated (`validateHexColor`).
 */
export function textColorFor(fillHex: string): string {
  const r = parseInt(fillHex.slice(0, 2), 16);
  const g = parseInt(fillHex.slice(2, 4), 16);
  const b = parseInt(fillHex.slice(4, 6), 16);
  // Relative luminance (sRGB coefficients, WCAG's simplified form).
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '000000' : 'FFFFFF';
}
