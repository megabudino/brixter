---
metadata:
  title: Brixter CMS
  description: A visual CMS for SvelteKit, versioned in your repository.
  og:
    image: null
  jsonLd: {}
brix:
  - type: Hero
    props:
      eyebrow: Brixter CMS
      headline: The content is in your codebase.
      subtitle: Landing pages, content, and routes editable in preview. Code stays in
        the repo. Marketing stops waiting.
      cta:
        label: Prova contenteditable
        note: Visual editing, clean commits, SvelteKit-first.
        href: "#"
      screenshot: ""
  - type: CoreOffer
    props:
      eyebrow: Launch smarter
      headline: Build better pages faster
      description: A focused preview with realistic content so you can recognize this brik.
      cta:
        label: Get started
        href: "#"
      features:
        - icon: |
            <!-- @license lucide-static v0.477.0 - ISC -->
            <svg
              class="lucide lucide-alarm-clock-minus"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="13" r="8" />
              <path d="M5 3 2 6" />
              <path d="m22 6-3-3" />
              <path d="M6.38 18.7 4 21" />
              <path d="M17.64 18.67 20 21" />
              <path d="M9 13h6" />
            </svg>
          title: Build better pages faster
          text: A focused preview with realistic content so you can recognize this brik.
        - icon: >
            <!-- @license lucide-static v0.477.0 - ISC -->

            <svg
              class="lucide lucide-award"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" />
              <circle cx="12" cy="8" r="6" />
            </svg>
          title: Build better pages faster
          text: A focused preview with realistic content so you can recognize this brik.
        - icon: |
            <!-- @license lucide-static v0.477.0 - ISC -->
            <svg
              class="lucide lucide-alarm-clock-off"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M6.87 6.87a8 8 0 1 0 11.26 11.26" />
              <path d="M19.9 14.25a8 8 0 0 0-9.15-9.15" />
              <path d="m22 6-3-3" />
              <path d="M6.26 18.67 4 21" />
              <path d="m2 2 20 20" />
              <path d="M4 4 2 6" />
            </svg>
          title: Build better pages faster
          text: A focused preview with realistic content so you can recognize this brik.
  - type: PainPoints
    props:
      eyebrow: Why it exists
      headline: The hard part is not creating pages. It is keeping them alive.
      points:
        - title: Every change becomes a request
          text: "Headlines, sections, CTAs: small edits interrupt engineering work and
            slow the whole team down."
        - title: Traditional CMSs break the flow
          text: Too much abstraction, too many templates, not enough confidence in what
            actually ships.
        - title: Content loses version control
          text: When copy lives away from code, review, rollback, and history become
            favors instead of a system.
  - type: Bridge
    props:
      statement: Brixter treats pages like code, but makes them editable like content.
      note: No generic panels. Just Svelte briks, clear props, and an editable
        preview.
  - type: CoreOffer
    props:
      eyebrow: Core offer
      headline: A visual builder on top of real Svelte components.
      description: Define reusable sections, assemble them in .brix.yaml files, and
        let the dashboard handle editing, media, preview, and saving.
      cta:
        label: Try Brixter
        href: "#"
      features:
        - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9
            17l-5-5"/></svg>
          title: Componentized briks
          text: Every section is a Svelte component. Layout, style, and behavior stay
            readable.
        - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9
            17l-5-5"/></svg>
          title: Editable props
          text: Content flows through props and fields declared in markup. Less schema,
            more page.
        - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9
            17l-5-5"/></svg>
          title: Commits in the repository
          text: Changes become tracked files. Review, branches, and rollback stay in the
            natural workflow.
  - type: Reviews
    props:
      eyebrow: Social proof
      headline: Built for teams that refuse to choose between speed and control.
      reviews:
        - quote: I can finally update a landing page without opening an issue for every
            headline.
          author: Marketing Lead
          role: Growth team
        - quote: Content stays in git. That changes everything when you need review and
            rollback.
          author: Frontend Engineer
          role: SvelteKit
        - quote: It is not a CMS fighting the codebase. It is a layer on top of components
            we already understand.
          author: Product Builder
          role: Brixter user
  - type: Team
    props:
      eyebrow: Team
      headline: Built for people who live between product, code, and content.
      description: Brixter removes friction from marketing pages without turning your
        project into an opaque platform.
      members:
        - name: Developer
          role: Components and repository
          bio: Defines briks, maintains the design system, and reviews changes like
            regular code.
        - name: Editor
          role: Copy and content
          bio: Updates text, sections, and CTAs from the preview without touching Svelte
            files.
        - name: Founder
          role: Publishing speed
          bio: Launches pages, tests offers, and keeps the site aligned with the real
            product.
  - type: FinalCta
    props:
      headline: Give the site an editor. Not another system to govern.
      subtitle: Start from your Svelte components and create landing pages that are
        editable, versioned, and ready to grow.
      cta:
        label: Enter Brixter
        note: Homepage generated with reusable briks.
        href: "#"
  - type: Footer
    props:
      brand: Brixter
      claim: Visual CMS for SvelteKit. Versioned, composable, direct.
      links:
        - label: Dashboard
          href: "#"
        - label: Routes
          href: "#"
        - label: Settings
          href: "#"
---
