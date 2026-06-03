// Resume template — single-column ATS-friendly with photo top-left.
// Reads YAML data path from sys.inputs.data.
//
// Ported from the legacy job-hunt skill. Only change vs legacy: the font is a
// fallback list ("Arial", "Liberation Sans") so it renders identically whether
// Arial is present (macOS) or only the bundled metric-compatible clone is
// (Linux sandbox via --font-path).
//
// Compile:
//   typst compile --root <root> --font-path <fonts> --input data=/resume.yaml templates/resume.typ out/resume.pdf

#let data-path = sys.inputs.at("data", default: "../data/resume-master.yaml")
#let data = yaml(data-path)

// Document language ("en"|"fr"), passed via `--input lang=`. Drives Typst
// locale: French smart-quotes (« »), spacing before ; : ! ?, and justification
// rules. Mirrors the resume's prose language so a French resume is typeset as
// French, not with English typography. Named `doc-lang` to avoid shadowing the
// `lang` loop variable in the Languages section below.
#let doc-lang = sys.inputs.at("lang", default: "en")

// ---- Page setup ----
#set document(
  title: data.profile.name + " — " + data.profile.title,
  author: data.profile.name,
)
#set page(
  paper: "a4",
  margin: (x: 0.55in, y: 0.5in),
)
#set text(
  font: ("Arial", "Liberation Sans"),
  size: 10pt,
  lang: doc-lang,
  hyphenate: false,
)
#set par(leading: 0.55em, justify: false)

// ---- Helpers ----
#let section(title) = {
  v(8pt)
  text(size: 11pt, weight: "bold", upper(title))
  v(2pt)
  line(length: 100%, stroke: 0.5pt + rgb("#cccccc"))
  v(4pt)
}

#let role-header(role, company, dates, url: none) = {
  grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    text(size: 12pt)[
      *#role*, #if url != none [#link(url)[#underline(company)]] else [#company]
    ],
    text(size: 9pt)[#dates],
  )
}

#let engagement-header(name, duration) = {
  grid(
    columns: (1fr, auto),
    align: (left, right),
    [*▸ #name*],
    text(size: 9pt)[#duration],
  )
}

#let render-bullets(bullets) = {
  list(
    ..bullets.map(b => b.text),
    indent: 8pt,
    body-indent: 4pt,
    spacing: 6pt,
  )
}

#let render-blurb(blurb) = {
  if blurb != none and blurb != "" {
    v(2pt)
    text(size: 9.5pt, style: "italic")[#blurb]
    v(2pt)
  }
}

#let render-stack(stack) = {
  if stack != none and stack != "" {
    v(2pt)
    text(size: 9.5pt)[*Stack:* #stack]
  }
}

// ---- Header (photo + name/contact) ----
#let profile = data.profile

#grid(
  columns: (auto, 1fr),
  column-gutter: 16pt,
  align: (top + left, top + left),
  // Photo (circular if present, else placeholder)
  {
    let photo-path = profile.at("photo", default: none)
    if photo-path != none and photo-path != "" {
      box(
        clip: true,
        radius: 50%,
        image(photo-path, width: 80pt, height: 80pt, fit: "cover"),
      )
    } else {
      box(
        width: 80pt,
        height: 80pt,
        radius: 50%,
        fill: rgb("#eeeeee"),
      )
    }
  },
  // Header text
  [
    #text(size: 18pt, weight: "bold")[#profile.name]

    #v(-2pt)
    #text(size: 11pt)[#profile.title]

    #v(-2pt)
    #text(size: 9pt)[
      #profile.location | #profile.phone | #link("mailto:" + profile.email)[#profile.email]
    ]

    #v(-2pt)
    #text(size: 9pt)[
      #profile.links.map(l => link(l.url)[#underline(l.label)]).join(" | ")
    ]
  ],
)

// ---- Summary ----
#section("Professional Summary")
#data.summary

// ---- Work Experience ----
#section("Work Experience")

#for exp in data.experience {
  let dates = exp.start + " — " + exp.end
  let duration = exp.at("duration", default: none)
  if duration != none {
    dates = dates + " · " + duration
  }
  role-header(
    exp.role,
    exp.company,
    dates,
    url: exp.at("url", default: none),
  )
  render-blurb(exp.at("blurb", default: none))

  let bullets = exp.at("bullets", default: ())
  if bullets.len() > 0 {
    render-bullets(bullets)
  }
  render-stack(exp.at("stack", default: none))

  let engagements = exp.at("engagements", default: ())
  for eng in engagements {
    v(6pt)
    engagement-header(eng.name, eng.at("duration", default: ""))
    render-blurb(eng.at("blurb", default: none))
    let eng-bullets = eng.at("bullets", default: ())
    if eng-bullets.len() > 0 {
      render-bullets(eng-bullets)
    }
    render-stack(eng.at("stack", default: none))
  }

  v(14pt)
}

// ---- Skills ----
#section("Skills")

#for (cat, items) in data.skills.pairs() [
  *#cat*: #items.join(", ") \
]

// ---- Education ----
#section("Education")

#for edu in data.education {
  role-header(edu.degree, edu.school, edu.start + " — " + edu.end)
  v(2pt)
  let edu-bullets = edu.at("bullets", default: ())
  if edu-bullets.len() > 0 {
    list(
      ..edu-bullets,
      indent: 8pt,
      body-indent: 4pt,
      spacing: 6pt,
    )
  }
  v(4pt)
}

// ---- Languages ----
#let languages = data.at("languages", default: ())
#if languages.len() > 0 {
  section("Languages")
  for lang in languages [
    *#lang.name*: #lang.level \
  ]
}
