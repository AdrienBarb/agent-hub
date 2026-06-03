import "server-only";

export interface RenderInput {
  /** Stable per-job id — used to isolate the sandbox working directory. */
  jobId: string;
  /** Tailored resume as a YAML string (ResumeYamlSchema shape). */
  resumeYaml: string;
  /** Tailored cover letter body as Markdown/plain prose. */
  coverMd: string;
  /** Document language for Typst typesetting ("en"|"fr"). Mirrors the resume's
   *  prose language so French documents are typeset with French rules. */
  lang: "en" | "fr";
}

export interface RenderOutput {
  resumePdf: Buffer;
  coverPdf: Buffer;
}

export interface Renderer {
  render(input: RenderInput): Promise<RenderOutput>;
}
