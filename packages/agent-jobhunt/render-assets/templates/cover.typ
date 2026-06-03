// Cover letter template — single-column, matching resume header.
// Reads:
//   sys.inputs.data  → resume.yaml (for header)
//   sys.inputs.cover → markdown file with the body
//
// Ported from the legacy cover-letter.typ but WITHOUT the @preview/cmarker
// package (which needs network access at compile time). The cover body is
// plain prose (humanizer rules forbid markdown flourish), so we render it as
// blank-line-separated paragraphs. Interpolating each block as a string also
// means LLM text is treated as data, not re-parsed as Typst markup.

#let data-path = sys.inputs.at("data", default: "../data/resume-master.yaml")
#let cover-path = sys.inputs.at("cover", default: "")
#let data = yaml(data-path)
#let body_text = if cover-path != "" { read(cover-path) } else { "" }

#set document(
  title: data.profile.name + " — Cover Letter",
  author: data.profile.name,
)
#set page(paper: "a4", margin: (x: 0.7in, y: 0.7in))
#set text(font: ("Arial", "Liberation Sans"), size: 11pt, lang: "en")
#set par(leading: 0.6em, justify: true)

// Header — plain, no photo (cover letters are textual)
#text(size: 16pt, weight: "bold")[#data.profile.name]
#v(-3pt)
#text(size: 10pt)[#data.profile.title]
#v(-3pt)
#text(size: 9pt)[
  #data.profile.location · #data.profile.phone · #link("mailto:" + data.profile.email)[#data.profile.email]
]

#v(12pt)
#line(length: 100%, stroke: 0.5pt + rgb("#cccccc"))
#v(12pt)

// Body — split on blank lines, render each block as its own paragraph.
#if body_text != "" {
  for block in body_text.split("\n\n") {
    let para = block.trim()
    if para != "" {
      par(para)
      v(0.6em)
    }
  }
}
