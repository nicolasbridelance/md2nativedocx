/** Options shared by the SmartArt generators. */
export interface SmartArtGenerateOptions {
  /**
   * Also produce the pre-rendered `dsp:drawing` part (and reference it from the data model through
   * `dgm:extLst`). Off by default: the caller must then add the part and replace the relationship
   * placeholder (`DRAWING_REL_TOKEN`) — the Pandoc bridge and the CLI do.
   */
  drawing?: boolean;
}
