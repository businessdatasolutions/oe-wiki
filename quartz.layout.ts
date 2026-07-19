import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import BacklinksWithAliases from "./extensions/backlinks-with-aliases"
import RelationshipsPanel from "./extensions/relationships-panel"
import CatalogFooter from "./extensions/catalog-footer"

// The four D-phases run Direct → Design → Deliver → Develop: that is the order
// students walk them, and the order `weeks/index.md` states in its own
// description. Alphabetically they come out Deliver, Design, Develop, Direct,
// which reads as a list of four unrelated things and puts the phase students
// finish with second.
//
// Everything else keeps Quartz's default sort, so this is a rule about four
// known pages rather than a new ordering scheme.
// The order list lives INSIDE the function on purpose. Quartz serialises
// `sortFn` to a string and evals it in the browser (see the `data-data-fns`
// attribute on the explorer element), so the function has no closure: a
// module-level `PHASE_ORDER` compiles fine, ships fine, and then throws
// ReferenceError client-side, leaving the default alphabetical order in place
// with nothing in the build output to suggest anything went wrong.
const explorerSort = (a: { isFolder: boolean; displayName: string }, b: typeof a): number => {
  const phases = ["Direct", "Design", "Deliver", "Develop"]
  const ai = phases.indexOf(a.displayName)
  const bi = phases.indexOf(b.displayName)
  if (ai !== -1 && bi !== -1) return ai - bi

  // Quartz's default below, unchanged: folders first, then alphabetical.
  if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
    return a.displayName.localeCompare(b.displayName, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  }
  return !a.isFolder && b.isFolder ? 1 : -1
}

export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [RelationshipsPanel()],
  footer: CatalogFooter({
    links: {
      GitHub: "https://github.com/businessdatasolutions/oe-wiki",
    },
  }),
}

export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({ sortFn: explorerSort }),
  ],
  right: [
    Component.Graph({
      localGraph: { showTags: true, removeTags: [] },
      globalGraph: { showTags: true, removeTags: [] },
    }),
    Component.DesktopOnly(Component.TableOfContents()),
    BacklinksWithAliases(),
  ],
}

export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({ sortFn: explorerSort }),
  ],
  right: [],
}
