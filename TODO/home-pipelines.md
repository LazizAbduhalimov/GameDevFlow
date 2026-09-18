# Home: ready-to-use pipelines

The current home screen manages real projects. A later iteration can offer connected
node templates, inspired by the pipeline-first home in the approved references.

- Add a searchable collection of supported workflows alongside a blank project.
- Describe each workflow with its actual input and resulting output, and show the
  connected operations before creating a project from the template.
- Reuse the existing recipe creators and node defaults; keep project persistence
  and project-specific asset ownership intact.
- Existing recipes require a source image. Ask the user to upload or choose a
  source image before running a recipe; do not silently create an incomplete
  pipeline or reuse an image from another project.
- Creating a project from a template should create the connected graph without
  automatically starting paid generation. The user reviews inputs and starts it.
- Include empty, loading and error states, keyboard access and responsive layouts.

Do not add template endpoints, demo workflows, profile data or pipeline execution
to the current frontend redesign.
