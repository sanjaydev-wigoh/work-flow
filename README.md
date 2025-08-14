🏗️ Processing Pipeline
<!-- Step 1: HTML Fetching -->

Fetches HTML content from provided URL
Extracts body content
Optional: Applies computed styles from JSON

<!-- Step 2: Component Extraction -->

Target ID Components: BACKGROUND_GROUP, pinnedTopLeft, pinnedTopRight, pinnedBottomLeft
Section Components: All top-level <section> elements
Generates placeholder IDs: {{wigoh-id-001}}, {{wigoh-id-002}}, etc.

<!-- Step 3: Widget Extraction -->
For each component:

Extracts widgets: h1, h2, h3, h4, h5, h6, p, svg, img, video, span, button, a, etc.
Creates widget placeholders: {{widget-1}}, {{widget-2}}, etc.
Saves widget JSON and modified HTML

<!-- Step 4: Background Layers Optimization -->

Identifies bgLayers divs
Concurrent AI Processing with OpenAI GPT-4o-mini
Optimizes CSS while preserving visual properties
Creates background templates: {{bg-01}}, {{bg-02}}, etc.

<!-- Step 5: Flex/Grid Optimization -->

Identifies flex and grid containers
Concurrent AI Processing in batches
Reduces div count while maintaining layout
Creates component templates: {{template-2001}}, {{template-2002}}, etc.

<!-- Step 6: Bare Minimum HTML Generation -->

Combines optimized backgrounds and components
Multi-iteration placeholder replacement
Generates final minimal HTML structure

<!-- Step 7: Final Assembly -->

Reads original HTML with placeholders
Replaces all placeholders with optimized components
Creates final assembled website


<!-- Depencies -->
npm install express
npm install cheerio
npm install node-fetch
npm install jsdom
npm install openai
npm install dotenv

<!-- run script -->

node server.js








