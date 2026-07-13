import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"
import { InjectTypeTags } from "./extensions/inject-type-tags"
import { InjectAliases } from "./extensions/inject-aliases"
import { InjectStaleBanner } from "./extensions/inject-stale-banner"
import { InjectConfidenceBadge } from "./extensions/inject-confidence-badge"
import { InjectStageDiagram } from "./extensions/inject-stage-diagram"
import { StripDataview } from "./extensions/strip-dataview"
import { LatexNoSingleDollar } from "./extensions/latex-no-single-dollar"

// FR-30 (TDD Deel 3.7 "Wiki-gebruiksanalyse", buildplan Main Task 19.1):
// GoatCounter — self-hostable, privacy-oriented aggregate-only analytics
// (no individual cookies/fingerprinting), confirmed at Task 19 kickoff as
// the provider from Task 13.4's open point. Quartz supports it natively
// (`quartz/cfg.ts`'s `Analytics` union) as a pure config change, no new
// code. The `websiteId` is a GoatCounter *site code*, not a secret in the
// usual sense, but it still must never be hardcoded/fabricated here — it
// only exists once someone completes GoatCounter's one-time manual account
// signup (https://www.goatcounter.com/signup). Until the
// `QUARTZ_GOATCOUNTER_SITE_CODE` env var is set (see
// `.github/workflows/deploy.yml`), this safely stays `null`, identical to
// the previous behaviour — the wiring is complete, activation is not.
const goatcounterSiteCode = process.env.QUARTZ_GOATCOUNTER_SITE_CODE?.trim()

const config: QuartzConfig = {
  configuration: {
    pageTitle: "Operational Excellence Wiki",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: goatcounterSiteCode
      ? { provider: "goatcounter", websiteId: goatcounterSiteCode }
      : null,
    locale: "en-US",
    baseUrl: "businessdatasolutions.github.io/oe-wiki",
    ignorePatterns: [
      "private",
      "templates",
      ".obsidian",
      "raw",
      "**/.DS_Store",
      "**/.graph.json",
    ],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Schibsted Grotesk",
        body: "Source Sans Pro",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#faf8f8",
          lightgray: "#e5e5e5",
          gray: "#b8b8b8",
          darkgray: "#4e4e4e",
          dark: "#2b2b2b",
          secondary: "#284b63",
          tertiary: "#84a59d",
          highlight: "rgba(143, 159, 169, 0.15)",
          textHighlight: "#fff23688",
        },
        darkMode: {
          light: "#161618",
          lightgray: "#393639",
          gray: "#646464",
          darkgray: "#d4d4d4",
          dark: "#ebebec",
          secondary: "#7b97aa",
          tertiary: "#84a59d",
          highlight: "rgba(143, 159, 169, 0.15)",
          textHighlight: "#b3aa0288",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      InjectTypeTags(),
      InjectStaleBanner(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: { light: "github-light", dark: "github-dark" },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      StripDataview(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      InjectConfidenceBadge(),
      InjectStageDiagram(),
      InjectAliases(),
      LatexNoSingleDollar(),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      Plugin.CustomOgImages(),
    ],
  },
}

export default config
