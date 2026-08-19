---
metadata:
  title: Test
  description: A page that mixes briks with a markdown body.
layout: Marketing
brix:
  - type: Test
    props:
      eyebrow: Gallery
      headline: A beautiful collection of images.
      description: Browse through this curated selection of visuals, each with its own
        title and caption.
      images:
        - img: /brix-builder-demo.gif
          title: Build better pages faster
          caption: Caption
        - img: ""
          title: Build better pages faster
          caption: Caption
        - img: ""
          title: Build better pages faster
          caption: Caption
  - type: Pricing
    props:
      eyebrow: Pricing
      headline: Simple pricing that scales with you.
      description: Click any plan card to edit just that plan in the inspector sidebar.
      plans:
        - badge: ""
          name: Starter
          price: $0
          period: /mo
          description: For trying things out on a single project.
          ctaLabel: Get started
          ctaHref: "#"
          accent: yellow
          featured: false
        - badge: Most popular
          name: Pro
          price: $29
          period: /mo
          description: For growing teams that ship every week.
          ctaLabel: Start free trial
          ctaHref: "#"
          accent: blue
          featured: true
        - badge: ""
          name: Scale
          price: $99
          period: /mo
          description: For high-volume sites that need more headroom.
          ctaLabel: Contact sales
          ctaHref: "#"
          accent: green
          featured: false
---

## Why this page has prose

Everything above comes from the `brix` list in this page's frontmatter. This
paragraph does not: it is the page's **markdown body**, compiled to HTML and
handed to the `Marketing` layout as its `content` prop.

That is the point of pages being `.md` — a layout can host editorial copy
without anyone having to build a brik for it first.
