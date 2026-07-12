import { QuartzTransformerPlugin } from "../quartz/plugins/types"
import { Root as HtmlRoot, Element, ElementContent, Text, Properties } from "hast"

// Renders the course's 4D "you-are-here" diagram (FR-13, LRD Deel 6.2/8) on
// week-landing pages: a Direct -> Design -> Deliver -> Develop cycle,
// structurally modelled on the source textbook's own recurring chapter-opener
// diagram (Slack, Brandon-Jones & Burgess, 2022, Figure 1.13 "A general model
// of operations management" and the per-chapter "this chapter examines..."
// variants) -- four stage-nodes arranged around a central hub, connected by a
// directional cycle, with the CURRENT page's `stage` frontmatter value
// highlighted. This is a structural reproduction (node/cycle layout), not a
// pixel copy of the book's proprietary artwork.
//
// Triggers only on pages carrying `type: week-landing` with a valid `stage`
// value -- i.e. wiki/weeks/*.md (Task 1.6). Renders nothing on other pages so
// book-concept / business-case / Lean-tool pages are unaffected.
//
// Implemented as an htmlPlugin (same pattern as InjectConfidenceBadge) so it
// runs against the already-built hast tree, purely from frontmatter -- no
// client-side JS, fully static, consistent with NFR-02 (no new hosting).
// Must be registered in quartz.config.ts alongside the other Inject* plugins.

const STAGES = ["direct", "design", "deliver", "develop"] as const
type Stage = (typeof STAGES)[number]

const STAGE_LABELS: Record<Stage, string> = {
  direct: "Direct",
  design: "Design",
  deliver: "Deliver",
  develop: "Develop",
}

const STAGE_WEEKS: Record<Stage, string> = {
  direct: "wk 1–4",
  design: "wk 5–8",
  deliver: "wk 9–12",
  develop: "wk 13–14",
}

// Node centers, arranged as a compass around the central hub (viewBox 0 0 320 320),
// matching the book's own diagram layout (top/left/bottom/right around a
// central "Operations management" hub) and the Direct -> Design -> Deliver ->
// Develop -> Direct reading order.
const NODE_POS: Record<Stage, { x: number; y: number }> = {
  direct: { x: 160, y: 55 },
  design: { x: 55, y: 160 },
  deliver: { x: 160, y: 265 },
  develop: { x: 265, y: 160 },
}

const NODE_R = 42
const HUB_R = 30

// Quadratic-bezier connector paths for the Direct -> Design -> Deliver ->
// Develop -> Direct cycle. Endpoints are drawn slightly short of each node's
// edge; the node circles are drawn on top afterwards, so exact tangency
// doesn't matter. Control points bow outward to read as a cycle, not a cross.
const CONNECTORS: { from: Stage; to: Stage; d: string }[] = [
  { from: "direct", to: "design", d: "M135,80 Q72,72 80,135" },
  { from: "design", to: "deliver", d: "M80,185 Q72,248 135,240" },
  { from: "deliver", to: "develop", d: "M185,240 Q248,248 240,185" },
  { from: "develop", to: "direct", d: "M240,135 Q248,72 185,80" },
]

function text(value: string): Text {
  return { type: "text", value }
}

function h(tagName: string, properties: Properties = {}, children: ElementContent[] = []): Element {
  return { type: "element", tagName, properties, children }
}

function buildDiagram(activeStage: Stage): Element {
  const title = h("title", {}, [
    text(
      `4D-cyclus: Direct, Design, Deliver, Develop. Huidige fase: ${STAGE_LABELS[activeStage]}.`,
    ),
  ])
  const desc = h("desc", {}, [
    text(
      "Cirkeldiagram met vier fasen die elkaar cyclisch opvolgen: Direct, Design, Deliver, Develop. " +
        "De huidige fase is gemarkeerd met een gevulde node en een 'je bent hier'-label.",
    ),
  ])

  const defs = h("defs", {}, [
    h(
      "marker",
      {
        id: "stage-diagram-arrow",
        viewBox: "0 0 10 10",
        refX: "8",
        refY: "5",
        markerWidth: "7",
        markerHeight: "7",
        orient: "auto-start-reverse",
      },
      [h("path", { d: "M0,0 L10,5 L0,10 z", className: ["stage-diagram-arrowhead"] })],
    ),
  ])

  const connectorEls = CONNECTORS.map((c) =>
    h("path", {
      d: c.d,
      className: ["stage-diagram-connector"],
      markerEnd: "url(#stage-diagram-arrow)",
    }),
  )

  const hub = h("g", { className: ["stage-diagram-hub"] }, [
    h("circle", { cx: "160", cy: "160", r: String(HUB_R) }),
    h("text", { x: "160", y: "156", textAnchor: "middle" }, [text("Operations")]),
    h("text", { x: "160", y: "170", textAnchor: "middle" }, [text("management")]),
  ])

  const nodeEls: Element[] = []
  for (const stage of STAGES) {
    const pos = NODE_POS[stage]
    const isActive = stage === activeStage
    const classes = ["stage-diagram-node", `stage-diagram-node--${stage}`]
    if (isActive) classes.push("stage-diagram-node--active")

    const nodeChildren: ElementContent[] = [
      h("circle", { cx: String(pos.x), cy: String(pos.y), r: String(NODE_R) }),
      h(
        "text",
        { x: String(pos.x), y: String(pos.y - 3), textAnchor: "middle" },
        [text(STAGE_LABELS[stage])],
      ),
      h(
        "text",
        { x: String(pos.x), y: String(pos.y + 15), textAnchor: "middle", className: ["stage-diagram-week"] },
        [text(STAGE_WEEKS[stage])],
      ),
    ]

    if (isActive) {
      // "You are here" marker, offset outward from the node.
      const dx = pos.x - 160
      const dy = pos.y - 160
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const labelX = pos.x + (dx / len) * 58
      const labelY = pos.y + (dy / len) * 58
      nodeChildren.push(
        h(
          "text",
          {
            x: String(labelX),
            y: String(labelY),
            textAnchor: "middle",
            className: ["stage-diagram-here-label"],
          },
          [text("◄ je bent hier")],
        ),
      )
    }

    nodeEls.push(h("g", { className: classes }, nodeChildren))
  }

  const svg = h(
    "svg",
    {
      viewBox: "0 0 320 320",
      className: ["stage-diagram"],
      role: "img",
      "aria-labelledby": "stage-diagram-title",
    },
    [
      { ...title, properties: { ...title.properties, id: "stage-diagram-title" } },
      desc,
      defs,
      ...connectorEls,
      hub,
      ...nodeEls,
    ],
  )

  const caption = h("p", { className: ["stage-diagram-caption"] }, [
    text(`4D-navigatie (LRD §6.2, FR-13) · huidige fase: `),
    h("strong", {}, [text(STAGE_LABELS[activeStage])]),
    text(` (${STAGE_WEEKS[activeStage]})`),
  ])

  return h("figure", { className: ["stage-diagram-figure"] }, [svg, caption])
}

export const InjectStageDiagram: QuartzTransformerPlugin = () => ({
  name: "InjectStageDiagram",
  htmlPlugins() {
    return [
      () => (tree: HtmlRoot, file) => {
        const fm = file.data.frontmatter
        if (!fm) return
        if (fm.type !== "week-landing") return
        const stage = typeof fm.stage === "string" ? fm.stage.trim().toLowerCase() : ""
        if (!STAGES.includes(stage as Stage)) return

        const diagram = buildDiagram(stage as Stage)

        // Insert immediately after the first <h1>, matching InjectConfidenceBadge.
        const children = tree.children
        let insertIndex = 0
        for (let i = 0; i < children.length; i++) {
          const node = children[i]
          if (node.type === "element" && node.tagName === "h1") {
            insertIndex = i + 1
            break
          }
        }
        children.splice(insertIndex, 0, diagram)
      },
    ]
  },
})
