const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Add CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Widget elements to extract
const WIDGET_ELEMENTS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'svg', 'img', 'image', 
    'video', 'span', 'button', 'a', 'text', 'wow-image', 'wix-video', 
    'wow-svg', 'wow-icon', 'wow-canvas', 'main'
];

// Extract widgets from HTML content
async function extractWidgetsFromHtml(htmlContent, sectionIndex, outputDir) {
    try {
        const dom = new JSDOM(htmlContent);
        const document = dom.window.document;
        const widgets = {};
        let widgetCounter = 1;

        function isInsideSection(element) {
            let parent = element.parentElement;
            while (parent) {
                if (parent.tagName && parent.tagName.toLowerCase() === 'section') {
                    return true;
                }
                parent = parent.parentElement;
            }
            return false;
        }

        function processElement(element) {
            if (element.nodeType === 1) { // Element node
                const tagName = element.tagName.toLowerCase();
                
                if (WIDGET_ELEMENTS.includes(tagName)) {
                    // Special handling for main tags - only extract if inside section
                    if (tagName === 'main') {
                        if (!isInsideSection(element)) {
                            // Don't extract main tag, but process its children
                            const children = Array.from(element.childNodes);
                            children.forEach(child => processElement(child));
                            return;
                        }
                    }
                    
                    const widgetKey = `{{widget-${widgetCounter}}}`;
                    widgets[widgetKey] = element.outerHTML;
                    
                    const placeholder = document.createTextNode(widgetKey);
                    element.parentNode.replaceChild(placeholder, element);
                    
                    widgetCounter++;
                } else {
                    const children = Array.from(element.childNodes);
                    children.forEach(child => processElement(child));
                }
            }
        }

        const body = document.body || document.documentElement;
        if (body) {
            const children = Array.from(body.childNodes);
            children.forEach(child => processElement(child));
        }

        const modifiedHtml = dom.serialize();
        const widgetsFile = `widgets_${sectionIndex}.json`;
        const htmlOutputFile = `widgets_extracted_${sectionIndex}.html`;

        await fs.writeFile(path.join(outputDir, widgetsFile), JSON.stringify(widgets, null, 2));
        await fs.writeFile(path.join(outputDir, htmlOutputFile), modifiedHtml);

        return {
            widgets,
            modifiedHtml,
            widgetsFile,
            htmlOutputFile
        };
    } catch (error) {
        console.error(`Error extracting widgets for section ${sectionIndex}:`, error);
        return {
            error: error.message,
            failed: true
        };
    }
}
// BgLayers optimization prompt
const BGLAYERS_OPTIMIZATION_PROMPT = `
You optimize Wix bgLayers HTML. Goal: **reduce the number of <div> elements** while preserving **pixel-perfect identical** rendering.

🚨 OUTPUT:
- OUTPUT ONLY the optimized HTML (no explanations, no comments).

✅ ALWAYS-REDUCE CONTRACT:
- You MUST reduce the total <div> count by at least 2 per bg-layer scope processed.
- If a specific merge is unsafe, you MUST find a different safe merge elsewhere in the same scope (e.g., remove empty wrappers, fold neutral wrappers, merge duplicated layers).
- Do not stop until the minimum reduction is achieved.

📌 DO-NOT-MERGE ACROSS THESE CONTEXTS (identify and respect as boundaries):
- Positioning contexts: position: relative|absolute|sticky|fixed
- Stacking/containing contexts: z-index (non-auto), isolation:isolate, transform/perspective, filter/backdrop-filter, mix-blend-mode, will-change
- Clipping/masking/scroll: overflow/overflow-*, clip-path, mask-*, background-attachment:fixed
- Media containers: <wow-image>, <img>, <video>, <canvas>, <svg>, <picture> (do NOT unwrap or reorder)
- Template markers: {{template-XXXX}} (preserve order and exact placement)

📌 MUST PRESERVE (verbatim):
- Background: background-color, background-image, background-size, background-position, background-repeat
- Positioning: position, top, left, right, bottom, inset-*, z-index, transform, transform-origin, perspective-origin
- Dimensions: width, height, min/max/inline/block sizes
- Visual/flow: opacity, visibility, overflow/overflow-*, object-fit, object-position, filter, backdrop-filter
- Attributes: main container id; ALL data-* attributes on kept nodes
- DOM order of visible nodes (no reordering)

⚡ PRIORITIZED REDUCTION STRATEGY (apply in this order until at least one reduction is achieved):
1) **Remove empty wrappers:** delete any <div> with no visible content and no computed effect (no styles that change layout/stacking/clipping/transform).
2) **Fold purely-neutral wrappers:** merge wrappers that only duplicate parent sizing/positioning with no unique effects. Move their classes/styles to the kept node.
3) **Merge color underlay:** if a sibling \`[data-testid="colorUnderlay"]\` has only background-* and the same full-bleed sizing/positioning, move its background-* onto the main bgLayer container and remove the underlay div. (Do NOT move opacity/filter/blend; if present, skip this step and continue with other reductions.)
4) **Eliminate duplicate style layers:** if parent and child have identical position/size and no conflicting context properties, move child styles/classes to parent and remove child.
5) **Prune duplicated CSS properties:** while merging, dedupe style keys; on conflicts, child value wins.

🧩 MERGING RULES:
- When keeping the parent: move ALL child classes into parent’s class attribute.
- Move ALL safe child styles into parent’s style.
- Never remove or unwrap <wow-image>/<img>/<video> or change their sticky/absolute context.
- Never change siblings' order; never change visibility.

🎯 FINAL CHECK (must pass):
- At least one <div> removed in this bg-layer scope.
- Visual output **pixel-perfect identical** to input.

👉 OUTPUT: ONLY the optimized HTML
`;
// Flex grid optimization prompt
const FLEXGRID_OPTIMIZATION_PROMPT = `
You are optimizing Wix Flex/Grid HTML. Your goal: **reduce div count** while preserving **pixel-perfect identical rendering**.

🚨 OUTPUT RULE:
- OUTPUT ONLY the optimized HTML (no explanations).

📌 STRICT PRESERVATION:
1. Layout properties → display, flex-direction, flex-wrap, justify-content, align-items, gap, grid-template-columns, grid-template-rows, grid-area, grid-gap
2. Positioning → position, top, left, right, bottom, transform, z-index
3. Spacing → margin (all sides), padding (all sides), border
4. Dimensions → width, height, min/max constraints
5. Visual → overflow, opacity, visibility, filter, backdrop-filter
6. Template placeholders (\`{{template-XXXX}}\`) → must stay in same position and order.
7. Merge classes + attributes safely, no loss.

⚡ DIV REDUCTION STRATEGY:
- Aggressively flatten unnecessary wrappers:
  - 2 divs → 1
  - 3 divs → 1
  - 5 divs → 2 maximum
- Merge parent-child divs ONLY if positioning/sizing remains identical.
- Move all wrapper properties into parent or child safely.
- Use shorthand CSS if possible but keep exact values.

📌 POSITIONING SAFETY:
- Parent’s positioning context MUST be preserved for absolute/fixed children.
- \`transform\`, \`transform-origin\` MUST be preserved (for animations).
- Any layout shift is forbidden.

✅ Example (3 → 2 divs):
INPUT:
<div id="parent" class="flex-container" style="display:flex;height:200px;width:400px;position:relative;">
  <div class="wrapper" style="position:relative;height:200px;width:400px;padding:20px;">
    <div id="child" class="content" style="height:100px;width:200px;position:absolute;top:50px;left:100px;margin:10px;">
      {{template-2001}}
    </div>
  </div>
</div>

OUTPUT:
<div id="parent" class="flex-container wrapper" style="display:flex;height:200px;width:400px;position:relative;padding:20px;">
  <div id="child" class="content" style="height:100px;width:200px;position:absolute;top:50px;left:100px;margin:10px;">{{template-2001}}</div>
</div>

🎯 Final check: Output must be **pixel-perfect identical** to input.

👉 OUTPUT: ONLY the optimized HTML
`;
async function optimizeWithAI(html, promptType, elementId, maxRetries = 2) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🤖 AI optimization attempt ${attempt}/${maxRetries} for ${elementId}`);
            
            return new Promise((resolve, reject) => {
                const worker = new Worker(__filename, {
                    workerData: { html, promptType, elementId }
                });
                
                // Set timeout for individual AI calls
                const timeout = setTimeout(() => {
                    worker.terminate();
                    reject(new Error(`AI optimization timeout for ${elementId}`));
                }, 60000); // 60 second timeout per element
                
                worker.on('message', (result) => {
                    clearTimeout(timeout);
                    worker.terminate();
                    resolve(result);
                });
                
                worker.on('error', (error) => {
                    clearTimeout(timeout);
                    worker.terminate();
                    reject(error);
                });
                
                worker.on('exit', (code) => {
                    clearTimeout(timeout);
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code} for ${elementId}`));
                    }
                });
            });
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ AI optimization attempt ${attempt} failed for ${elementId}: ${error.message}`);
            
            if (attempt === maxRetries) {
                console.error(`❌ All AI optimization attempts failed for ${elementId}`);
                return {
                    success: false,
                    html: html,
                    error: error.message
                };
            }
            
            // Brief delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    
    return {
        success: false,
        html: html,
        error: lastError?.message || 'Unknown error'
    };
}
// Check if element is a critical bgLayer div
function isCriticalBgLayerDiv(htmlString) {
    // Simple check for positioning or background properties
    const hasBackground = /background[^;]*:|rgba\(|rgb\(|#[0-9a-f]{3,6}/i.test(htmlString);
    const hasPositioning = /position\s*:\s*(absolute|fixed|relative)/i.test(htmlString);
    const hasTransform = /transform\s*:/i.test(htmlString);
    
    return hasBackground || hasPositioning || hasTransform;
}
// Process bgLayer div with conservative optimization
function processBgLayerDiv(divHtml, divId) {
    // Check if this is a critical bgLayer that should be preserved
    if (isCriticalBgLayerDiv(divHtml)) {
        console.log(`🛡️ ${divId} is critical bgLayer - using conservative optimization`);
        
        // For critical bgLayers, only do minimal optimization
        // Remove empty divs but preserve structure and all styling
        const minimalOptimization = divHtml
            .replace(/<div[^>]*>\s*<\/div>/g, '') // Remove truly empty divs
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        
        return {
            success: true,
            html: minimalOptimization,
            conservative: true
        };
    }
    
    return null; // Proceed with normal AI optimization
}
// Preserve critical bgLayer structure
function preserveCriticalBgLayerStructure(originalHtml, optimizedHtml) {
    const extractCSSProperties = (htmlString) => {
        const styleMatch = htmlString.match(/style="([^"]+)"/);
        if (!styleMatch) return {};
        
        const styleString = styleMatch[1];
        const properties = {};
        
        const cssRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);?/g;
        let match;
        
        while ((match = cssRegex.exec(styleString)) !== null) {
            const prop = match[1].replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            properties[prop] = match[2].trim();
        }
        
        return properties;
    };

    const originalProps = extractCSSProperties(originalHtml);
    const optimizedProps = extractCSSProperties(optimizedHtml);
    
    // If original has critical positioning, ensure optimized preserves it
    const criticalPositioningProps = ['position', 'top', 'left', 'right', 'bottom', 'zIndex'];
    const hasCriticalPositioning = criticalPositioningProps.some(prop => originalProps[prop]);
    
    if (hasCriticalPositioning) {
        const preservedPositioning = criticalPositioningProps.every(prop => 
            !originalProps[prop] || optimizedProps[prop] === originalProps[prop]
        );
        
        if (!preservedPositioning) {
            console.warn('⚠️ Critical positioning properties lost, using original HTML');
            return originalHtml;
        }
    }
    
    // Check background properties preservation
    const backgroundProps = ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition'];
    const hasBackground = backgroundProps.some(prop => originalProps[prop]);
    
    if (hasBackground) {
        const preservedBackground = backgroundProps.every(prop =>
            !originalProps[prop] || optimizedProps[prop] === originalProps[prop]
        );
        
        if (!preservedBackground) {
            console.warn('⚠️ Background properties lost, using original HTML');
            return originalHtml;
        }
    }
    
    return optimizedHtml;
}
// Generate bare minimum HTML
async function generateBareMinimumHtml(sectionIndex, outputDir) {
    console.log(`\n🚀 Starting bare minimum HTML generation for section ${sectionIndex}`);
    console.log('='.repeat(60));
    
    const widgetsHtmlPath = path.join(outputDir, `widgets_extracted_${sectionIndex}.html`);
    if (!await fs.access(widgetsHtmlPath).then(() => true).catch(() => false)) {
        throw new Error(`Widgets-extracted HTML file not found at ${widgetsHtmlPath}`);
    }

    const widgetsHtml = await fs.readFile(widgetsHtmlPath, 'utf8');
    console.log(`✅ Found widgets-extracted HTML (${widgetsHtml.length} bytes)`);

    // **STEP 1: Process bgLayers divs with AI CONCURRENTLY**
    console.log('\n🎨 Processing bgLayers divs with AI optimization (CONCURRENT MODE)...');
    const $ = cheerio.load(widgetsHtml);
    const bgLayerDivs = [];
    
    $('div[id^="bgLayers"]').each((index, element) => {
        const $element = $(element);
        bgLayerDivs.push({
            id: $element.attr('id'),
            element: element,
            html: $.html($element)
        });
    });

    console.log(`Found ${bgLayerDivs.length} bgLayers divs`);
    const bgTemplates = {};

    // Process all bgLayers CONCURRENTLY
    if (bgLayerDivs.length > 0) {
        console.log(`\n⚡ Processing ${bgLayerDivs.length} bgLayers divs concurrently...`);
        
        const bgPromises = bgLayerDivs.map(async (divData, index) => {
            const bgKey = `bg-${String(index + 1).padStart(2, '0')}`;
            
            // Check size before sending to AI
            const sizeInBytes = Buffer.byteLength(divData.html, 'utf8');
            if (sizeInBytes > 10000) {
                console.warn(`📏 Div ${divData.id} too large (${sizeInBytes} bytes), saving intact`);
                return {
                    bgKey,
                    html: divData.html,
                    element: divData.element,
                    optimized: false
                };
            }
            
            // Use AI optimization for bgLayers
            console.log(`🤖 Starting AI optimization for ${divData.id}...`);
            const result = await optimizeWithAI(divData.html, 'bgLayers', divData.id);
            
            if (result.success && result.html && result.html !== divData.html) {
                console.log(`✅ AI optimized ${divData.id}: ${result.originalLength} → ${result.optimizedLength} bytes`);
                return {
                    bgKey,
                    html: result.html,
                    element: divData.element,
                    optimized: true
                };
            } else {
                console.log(`🛡️ Using original ${divData.id}: ${result.error || 'No optimization'}`);
                return {
                    bgKey,
                    html: divData.html,
                    element: divData.element,
                    optimized: false
                };
            }
        });

        // Wait for all bgLayers to complete
        const bgResults = await Promise.all(bgPromises);
        
        // Apply results
        bgResults.forEach(result => {
            bgTemplates[`{{${result.bgKey}}}`] = result.html;
            $(result.element).replaceWith(`{{${result.bgKey}}}`);
        });

        console.log(`✅ Completed processing ${bgLayerDivs.length} bgLayers divs concurrently`);
    }

    // Save background templates
    const bgJsonFile = `bg_${sectionIndex}.json`;
    await fs.writeFile(path.join(outputDir, bgJsonFile), JSON.stringify(bgTemplates, null, 2));
    
    const htmlWithBgPlaceholders = $.html();
    const bgPlaceholderHtmlFile = `bg_placeholder_${sectionIndex}.html`;
    await fs.writeFile(path.join(outputDir, bgPlaceholderHtmlFile), htmlWithBgPlaceholders);

    // **STEP 2: Process flex/grid divs with AI CONCURRENTLY**
    console.log('\n📊 Processing flex/grid divs with AI optimization (CONCURRENT MODE)...');
    let $saved = cheerio.load(htmlWithBgPlaceholders);
    const componentTemplates = {};
    let templateCounter = 2001;
    
    let processedInThisRound = true;
    let totalProcessed = 0;
    const maxConcurrentBatch = 10; // Process up to 10 elements concurrently per batch
    
    while (processedInThisRound && totalProcessed < 50) { // Safety limit
        processedInThisRound = false;
        const flexGridDivs = [];
        
        $saved('div[id]').each((index, element) => {
            const $element = $saved(element);
            const id = $element.attr('id');
            
            // Skip bgLayers and already processed elements
            if (id && id.startsWith('bgLayers')) return;
            if ($saved.html($element).includes('{{template-')) return;
            
            if (id && hasFlexOrGridProperties(element, $saved)) {
                if (!containsOnlyWidgets(element, $saved)) {
                    flexGridDivs.push({
                        id: id,
                        element: element,
                        html: $saved.html($element),
                        depth: getNestingDepth(element, $saved)
                    });
                }
            }
        });

        if (flexGridDivs.length === 0) break;

        // Sort by depth (deepest first)
        flexGridDivs.sort((a, b) => b.depth - a.depth);
        
        const batchSize = Math.min(flexGridDivs.length, maxConcurrentBatch);
        const currentBatch = flexGridDivs.slice(0, batchSize);
        
        console.log(`\n⚡ Round ${Math.floor(totalProcessed/maxConcurrentBatch) + 1}: Processing ${currentBatch.length} flex/grid divs concurrently`);

        // Process flex/grid divs CONCURRENTLY
        const flexGridPromises = currentBatch.map(async (divData, index) => {
            const templateKey = `template-${String(templateCounter + index).padStart(4, '0')}`;
            
            // Check size
            const sizeInBytes = Buffer.byteLength(divData.html, 'utf8');
            if (sizeInBytes > 10000) {
                console.warn(`📏 Div ${divData.id} too large (${sizeInBytes} bytes), saving intact`);
                return {
                    templateKey,
                    html: divData.html,
                    element: divData.element,
                    optimized: false,
                    id: divData.id
                };
            }
            
            // Use AI optimization for flex/grid
            console.log(`🤖 Starting AI optimization for ${divData.id}...`);
            const result = await optimizeWithAI(divData.html, 'flexGrid', divData.id);
            
            if (result.success && result.html && result.html !== divData.html) {
                console.log(`✅ AI optimized ${divData.id}: ${result.originalLength} → ${result.optimizedLength} bytes`);
                return {
                    templateKey,
                    html: result.html,
                    element: divData.element,
                    optimized: true,
                    id: divData.id
                };
            } else {
                console.log(`🛡️ Using original ${divData.id}: ${result.error || 'No optimization'}`);
                return {
                    templateKey,
                    html: divData.html,
                    element: divData.element,
                    optimized: false,
                    id: divData.id
                };
            }
        });

        // Wait for all flex/grid elements in this batch to complete
        const flexGridResults = await Promise.all(flexGridPromises);
        
        // Apply results
        flexGridResults.forEach(result => {
            componentTemplates[`{{${result.templateKey}}}`] = result.html;
            $saved(result.element).replaceWith(`{{${result.templateKey}}}`);
        });

        processedInThisRound = true;
        totalProcessed += currentBatch.length;
        templateCounter += currentBatch.length;
        
        console.log(`✅ Completed batch of ${currentBatch.length} flex/grid divs concurrently`);
        
        if (processedInThisRound) {
            $saved = cheerio.load($saved.html());
        }
    }

    console.log(`\n🎯 Completed processing ${totalProcessed} flex/grid divs total (CONCURRENT MODE)`);

    // Save final output
    const finalBareHtml = $saved.html();
    const bareMinimumFile = `bareminimum_section_${sectionIndex}.html`;
    await fs.writeFile(path.join(outputDir, bareMinimumFile), finalBareHtml);
    
    const componentsJsonFile = `bareminimum_${sectionIndex}.json`;
    await fs.writeFile(path.join(outputDir, componentsJsonFile), JSON.stringify(componentTemplates, null, 2));

    console.log('\n🎉 Bare minimum HTML generation complete (CONCURRENT MODE)!');
    console.log('📊 Summary:');
    console.log(`   🎨 Background layers: ${bgLayerDivs.length} processed concurrently`);
    console.log(`   📊 Flex/Grid divs: ${totalProcessed} processed in concurrent batches`);
    console.log(`   📄 Files generated: ${bareMinimumFile}, ${bgJsonFile}, ${componentsJsonFile}`);
    console.log('='.repeat(60));

    return {
        bareHtml: finalBareHtml,
        bareMinimumFile,
        bgJsonFile,
        componentsJsonFile,
        bgPlaceholderHtmlFile,
        bgTemplates,
        componentTemplates
    };
}
// Helper functions for flex/grid processing
function hasFlexOrGridProperties(element, $) {
    const $element = $(element);
    const style = $element.attr('style') || '';
    const className = $element.attr('class') || '';
    
    const hasFlexInline = /display\s*:\s*(flex|inline-flex)/i.test(style) || 
                         /flex[\s-]/i.test(style);
    const hasGridInline = /display\s*:\s*(grid|inline-grid)/i.test(style) || 
                         /grid[\s-]/i.test(style);
    
    const hasFlexClass = /flex|d-flex|display-flex/i.test(className);
    const hasGridClass = /grid|d-grid|display-grid/i.test(className);
    
    return hasFlexInline || hasGridInline || hasFlexClass || hasGridClass;
}

function containsOnlyWidgets(element, $) {
    const $element = $(element);
    const childDivs = $element.find('div[id]');
    
    if (childDivs.length === 0) {
        const id = $element.attr('id');
        return id && (id.includes('widget') || id.includes('Widget'));
    }
    
    let allChildrenAreWidgets = true;
    childDivs.each((index, childElement) => {
        const childId = $(childElement).attr('id');
        if (!childId || (!childId.includes('widget') && !childId.includes('Widget'))) {
            allChildrenAreWidgets = false;
            return false;
        }
    });
    
    return allChildrenAreWidgets;
}

function getNestingDepth(element, $context) {
    let depth = 0;
    let current = $context(element);
    while (current.parent('div[id]').length > 0) {
        current = current.parent('div[id]').first();
        depth++;
    }
    return depth;
}
// Worker thread processing - CORRECTED VERSION
if (!isMainThread) {
    (async () => {
        try {
            const { html, promptType, elementId } = workerData;
            
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OpenAI API key not found');
            }

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            // Select correct prompt
            let systemPrompt;
            if (promptType === 'bgLayers') {
                systemPrompt = BGLAYERS_OPTIMIZATION_PROMPT;
            } else if (promptType === 'flexGrid') {
                systemPrompt = FLEXGRID_OPTIMIZATION_PROMPT;
            } else {
                throw new Error(`Unknown prompt type: ${promptType}`);
            }

            console.log(`🤖 AI processing ${promptType} for ${elementId}`);

            // Call OpenAI API
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: html }
                ],
                temperature: 0.3,
                max_tokens: 12288,
            });

            let optimizedHtml = response.choices[0].message.content.trim();
            
            // Clean up response - remove code blocks if present
            optimizedHtml = optimizedHtml
                .replace(/^```html\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            // Validate that we got HTML back
            if (!optimizedHtml.includes('<') || optimizedHtml.length < 10) {
                throw new Error('Invalid HTML response from AI');
            }

            console.log(`✅ AI optimized ${elementId} (${optimizedHtml.length} chars)`);
            
            parentPort.postMessage({ 
                success: true, 
                html: optimizedHtml,
                originalLength: html.length,
                optimizedLength: optimizedHtml.length
            });

        } catch (error) {
            console.error(`❌ AI worker failed for ${workerData.elementId}:`, error.message);
            parentPort.postMessage({ 
                success: false, 
                html: workerData.html,
                error: error.message 
            });
        }
    })();
    return;
}
app.post('/migrate', async (req, res) => {
    console.log('\n=== MIGRATION REQUEST RECEIVED ===');
    console.log('Request body:', req.body);
    
    const { htmlUrl, stylesUrl } = req.body;
    
    if (!htmlUrl) {
        console.error('❌ ERROR: HTML URL is required');
        return res.status(400).json({ 
            error: 'htmlUrl is required',
            received: { htmlUrl: !!htmlUrl, stylesUrl: !!stylesUrl }
        });
    }
    
    console.log(`✅ Starting migration for:`);
    console.log(`   HTML URL: ${htmlUrl}`);
    console.log(`   Styles URL: ${stylesUrl || 'None'}`);
    console.log(`📊 Request timestamp: ${new Date().toISOString()}`);
    
    try {
        // Step 1: Fetch HTML content
        console.log('🌐 Fetching HTML content...');
        let htmlContent = '';
        
        try {
            const htmlResponse = await fetch(htmlUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 30000
            });
            
            if (!htmlResponse.ok) {
                throw new Error(`HTML fetch failed: ${htmlResponse.status} ${htmlResponse.statusText}`);
            }
            
            htmlContent = await htmlResponse.text();
            console.log(`✅ HTML content fetched (${htmlContent.length} characters)`);
        } catch (htmlError) {
            throw new Error(`Failed to fetch HTML from ${htmlUrl}: ${htmlError.message}`);
        }
        
        // Step 2: Fetch computed styles JSON if provided
        let computedStyles = {};
        if (stylesUrl) {
            console.log('🎨 Fetching computed styles JSON...');
            try {
                const stylesResponse = await fetch(stylesUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 30000
                });
                
                if (!stylesResponse.ok) {
                    throw new Error(`Styles fetch failed: ${stylesResponse.status} ${stylesResponse.statusText}`);
                }
                
                computedStyles = await stylesResponse.json();
                console.log(`✅ Computed styles fetched`);
            } catch (stylesError) {
                console.warn(`⚠️ Warning: Failed to fetch computed styles from ${stylesUrl}: ${stylesError.message}`);
            }
        }
        
        // Step 3: Extract body content only from HTML
        console.log('📄 Extracting body content from HTML...');
        const $ = cheerio.load(htmlContent);
        
        // Get only body content
        let bodyContent = '';
        if ($('body').length > 0) {
            bodyContent = $('body').html() || '';
        } else {
            console.warn('⚠️ No body tag found, using entire HTML content');
            bodyContent = htmlContent;
        }
        
        // Create full page HTML with body content
        const fullPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fetched Content</title>
</head>
<body>
${bodyContent}
</body>
</html>`;
        
        console.log(`✅ Body content extracted (${bodyContent.length} characters)`);
        
        // Step 4: Process HTML with EnhancedHtmlStyleProcessor before extraction
        console.log('🎨 Applying styles with EnhancedHtmlStyleProcessor...');
        const styleProcessor = new EnhancedHtmlStyleProcessor();
        const processedHtml = await styleProcessor.processHtml(fullPageHtml, computedStyles, __dirname, 0);
        console.log('✅ Styles applied to HTML');
        
        // Step 5: Process HTML and extract components
        console.log('📄 STEP 5: Processing HTML and extracting components...');
        const result = await processHtmlAndExtractComponents(processedHtml.styledHtml, __dirname);
        
        // Step 6: Extract widgets from each component
        console.log('\n🛠️ STEP 6: Extracting widgets from components...');
        const widgetExtractions = [];
        
        for (const component of result.extractedComponents) {
            if (component.found) {
                const componentPath = path.join(__dirname, component.componentFile);
                const componentHtml = await fs.readFile(componentPath, 'utf8');
                
                const widgetResult = await extractWidgetsFromHtml(
                    componentHtml, 
                    component.placeholderId.replace('wigoh-id-', ''), // Extract just the number
                    path.join(__dirname, 'components')
                );
                
                if (!widgetResult.failed) {
                    widgetExtractions.push({
                        componentId: component.placeholderId,
                        widgetsFile: widgetResult.widgetsFile,
                        htmlOutputFile: widgetResult.htmlOutputFile,
                        widgetCount: Object.keys(widgetResult.widgets).length
                    });
                    
                    // Update the component file with widget-extracted version
                    await fs.writeFile(componentPath, widgetResult.modifiedHtml);
                }
            }
        }

        // Step 7: Generate bare minimum HTML
               console.log('\n🛠️ STEP 7: Generating bare minimum HTML for ALL components CONCURRENTLY...');
        
        const bareMinimumPromises = result.extractedComponents
            .filter(component => component.found)
            .map(async (component) => {
                const componentPath = path.join(__dirname, component.componentFile);
                const componentHtml = await fs.readFile(componentPath, 'utf8');
                
                console.log(`⚡ Starting bare minimum generation for component ${component.placeholderId}...`);
                
                try {
                    const bareMinimumResult = await generateBareMinimumHtml(
                        component.placeholderId.replace('wigoh-id-', ''), // Extract just the number
                        path.join(__dirname, 'components')
                    );
                    
                    console.log(`✅ Completed bare minimum generation for component ${component.placeholderId}`);
                    
                    return {
                        componentId: component.placeholderId,
                        bareMinimumFile: bareMinimumResult.bareMinimumFile,
                        bgJsonFile: bareMinimumResult.bgJsonFile,
                        componentsJsonFile: bareMinimumResult.componentsJsonFile,
                        success: true
                    };
                } catch (error) {
                    console.error(`❌ Failed bare minimum generation for component ${component.placeholderId}:`, error.message);
                    return {
                        componentId: component.placeholderId,
                        success: false,
                        error: error.message
                    };
                }
            });

        // Wait for ALL bare minimum generations to complete
        const bareMinimumResults = await Promise.all(bareMinimumPromises);
        const successfulBareMinimum = bareMinimumResults.filter(result => result.success);
        const failedBareMinimum = bareMinimumResults.filter(result => !result.success);
        
        console.log(`\n✅ Bare minimum generation completed:`);
        console.log(`   - Successful: ${successfulBareMinimum.length}`);
        console.log(`   - Failed: ${failedBareMinimum.length}`);
        
        if (failedBareMinimum.length > 0) {
            console.log(`⚠️ Failed components:`, failedBareMinimum.map(f => f.componentId));
        }
        
        // Step 8: Assemble final website
        console.log('\n🛠️ STEP 8: Assembling Final Website...');
        const finalAssemblyResult = await assembleFinalWebsite(__dirname);
        
        console.log('\n🎉 MIGRATION PROCESS COMPLETED SUCCESSFULLY WITH CONCURRENT PROCESSING!');
        console.log('📊 Final Statistics:');
        console.log(`   - Components extracted: ${result.extractedComponents.length}`);
        console.log(`   - Target IDs found: ${result.extractedComponents.filter(c => c.found).length}`);
        console.log(`   - Widgets extracted: ${widgetExtractions.reduce((sum, w) => sum + w.widgetCount, 0)}`);
        console.log(`   - Bare minimum HTML files generated: ${successfulBareMinimum.length}`);
        console.log(`   - Failed bare minimum generations: ${failedBareMinimum.length}`);
        console.log(`   - Final components assembled: ${finalAssemblyResult.componentsProcessed}/${finalAssemblyResult.totalPlaceholders}`);
        console.log(`   - Final website created: ${finalAssemblyResult.finalWebsitePath}`);
        console.log(`   - Processing mode: CONCURRENT ⚡`);
        
        res.json({
            success: true,
            message: 'Migration completed successfully with concurrent AI processing',
            stats: {
                componentsExtracted: result.extractedComponents.length,
                targetIdsFound: result.extractedComponents.filter(c => c.found).length,
                widgetsExtracted: widgetExtractions.reduce((sum, w) => sum + w.widgetCount, 0),
                bareMinimumFilesGenerated: successfulBareMinimum.length,
                failedBareMinimumFiles: failedBareMinimum.length,
                finalComponentsAssembled: finalAssemblyResult.componentsProcessed,
                totalPlaceholders: finalAssemblyResult.totalPlaceholders,
                finalWebsiteSize: finalAssemblyResult.finalHtml.length,
                processingMode: 'CONCURRENT',
                htmlUrl: htmlUrl,
                stylesUrl: stylesUrl || null,
                extractedAt: new Date().toISOString(),
                originalHtmlFile: result.originalHtmlFile,
                styledHtmlFile: processedHtml.layoutInlineFile,
                finalWebsiteFile: 'final_website.html'
            },
            components: result.extractedComponents,
            widgetExtractions: widgetExtractions,
            bareMinimumResults: successfulBareMinimum,
            failedBareMinimumResults: failedBareMinimum,
            finalAssembly: finalAssemblyResult,
            originalHtmlFile: result.originalHtmlFile,
            styledHtmlFile: processedHtml.layoutInlineFile
        });
        
    } catch (error) {
        console.error('\n❌ MIGRATION ERROR OCCURRED!');
        console.error('🔍 Error details:');
        console.error(`   - Error type: ${error.name}`);
        console.error(`   - Error message: ${error.message}`);
        console.error(`   - HTML URL: ${htmlUrl}`);
        console.error(`   - Styles URL: ${stylesUrl}`);
        console.error(`   - Timestamp: ${new Date().toISOString()}\n`);
        
        res.status(500).json({
            error: 'Migration failed',
            message: error.message,
            type: error.name,
            timestamp: new Date().toISOString(),
            urls: { htmlUrl, stylesUrl }
        });
    }
});

// Enhanced EnhancedHtmlStyleProcessor class with index-based matching
class EnhancedHtmlStyleProcessor {
    constructor() {
        this.unmatchedElements = [];
        this.elementIndex = 0;
        this.processedElements = new Set();
        this.excludedTags = ['html', 'head', 'meta', 'title', 'script', 'noscript', 'style', 'link'];
    }

    camelToKebab(str) {
        return str.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    styleObjectToString(styleObj) {
        return Object.entries(styleObj)
            .map(([key, value]) => {
                const cssKey = this.camelToKebab(key);
                let cssValue = String(value).trim();
                if (!isNaN(cssValue)) {
                    if (['width','height','margin','padding','top','left','right','bottom','font-size','line-height','border-radius'].some(prop => cssKey.includes(prop))) {
                        cssValue = cssValue + (cssValue.includes('%') ? '' : 'px');
                    }
                }
                return `${cssKey}: ${cssValue}`;
            })
            .join('; ');
    }

    safeStringTrim(value) {
        if (value === null || value === undefined) return '';
        if (Array.isArray(value)) return value.join(' ').trim();
        return String(value).trim();
    }

    // Flatten the nested JSON structure to get all elements with styles
    flattenElements(data, flatArray = []) {
        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                this.flattenElements(data[i], flatArray);
            }
        } else if (data && typeof data === 'object') {
            if (data.styles && typeof data.styles === 'object') {
                // SKIP SCRIPT TAGS IN JSON
                if (data.tag && data.tag.toLowerCase() === 'script') {
                    console.log(`⏭️  SKIPPING JSON: Script tag found in JSON - ignoring`);
                    return flatArray;
                }
                
                // SKIP if HTML contains script tag
                if (data.html && data.html.toLowerCase().includes('<script')) {
                    console.log(`⏭️  SKIPPING JSON: Script tag found in HTML string - ignoring`);
                    return flatArray;
                }
                
                flatArray.push({
                    tag: data.tag,
                    id: data.id,
                    className: data.className,
                    html: data.html,
                    styles: data.styles,
                    jsonIndex: flatArray.length
                });
            }
            
            if (data.children && Array.isArray(data.children)) {
                for (let i = 0; i < data.children.length; i++) {
                    this.flattenElements(data.children[i], flatArray);
                }
            }
        }
        return flatArray;
    }

    // Generate HTML string from DOM element (for logging purposes)
    getElementHtmlString(element, $) {
        const $el = $(element);
        const tag = element.tagName.toLowerCase();
        
        // ADDITIONAL SCRIPT CHECK: Skip if element is script tag
        if (tag === 'script') {
            console.log(`⏭️  SKIPPING HTML ELEMENT: Script tag detected during processing`);
            return null;
        }
        
        const id = $el.attr('id') || '';
        const className = $el.attr('class') || '';
        
        // Create HTML string exactly like in JSON (with closing tag)
        let htmlStr = `<${tag}`;
        if (id) htmlStr += ` id="${id}"`;
        if (className) htmlStr += ` class="${className}"`;
        htmlStr += `></${tag}>`;
        
        return htmlStr;
    }

    async processHtml(rawHtml, layoutJson, outputDir, sectionIndex) {
        console.log('🚀 Starting INDEX-BASED HTML Style Matching (Body Elements Only)...');
        console.log('🎯 Method: HTML[index] ↔ JSON[index] - Direct index correspondence');
        console.log('📍 Rule: HTML element at index N gets styles from JSON entry at index N');
        console.log('🔄 Rule: No string matching required - pure index-based assignment');
        console.log('⏭️  Rule: Ignores html, head, meta, title, script tags - processes body elements only');
        console.log('🛡️  Security: Script tags are completely skipped for safety');

        const $ = cheerio.load(rawHtml);
        
        // Get flattened array of all elements with styles from JSON
        const jsonStylesArray = this.flattenElements(layoutJson);
        
        // ENHANCED: Exclude script tags and other non-styleable elements
        const allHtmlElements = $('*').toArray().filter(element => {
            const tagName = element.tagName.toLowerCase();
            
            // Skip excluded tags (including script tags)
            if (this.excludedTags.includes(tagName)) {
                console.log(`⏭️  SKIPPING HTML TAG: <${tagName}> - excluded from processing`);
                return false;
            }
            
            // Only include elements that are inside body or are body itself
            const $element = $(element);
            const isInBody = $element.closest('body').length > 0 || tagName === 'body';
            
            if (!isInBody) {
                console.log(`⏭️  SKIPPING: <${tagName}> - not inside body`);
                return false;
            }
            
            return true;
        });

        console.log(`📄 Found ${allHtmlElements.length} HTML elements in body (after filtering)`);
        console.log(`📋 Found ${jsonStylesArray.length} style entries in JSON`);
        console.log(`⏭️  Excluded tags: ${this.excludedTags.join(', ')}`);
        console.log('─'.repeat(70));

        let totalMatches = 0;
        let skippedScriptElements = 0;
        let indexMismatches = 0;

        // MAIN LOOP: Process each HTML element using INDEX-BASED MATCHING
        for (let htmlIndex = 0; htmlIndex < allHtmlElements.length; htmlIndex++) {
            const htmlElement = allHtmlElements[htmlIndex];
            const $htmlElement = $(htmlElement);
            
            // ADDITIONAL SCRIPT CHECK: Skip script elements during processing
            if (htmlElement.tagName.toLowerCase() === 'script') {
                console.log(`⏭️  SKIPPING SCRIPT ELEMENT during main processing loop`);
                skippedScriptElements++;
                continue;
            }
            
            // Generate HTML string for this DOM element (for logging)
            const htmlElementString = this.getElementHtmlString(htmlElement, $);
            
            // Skip if getElementHtmlString returned null (script tag)
            if (htmlElementString === null) {
                skippedScriptElements++;
                continue;
            }
            
            console.log(`\n🔄 PROCESSING HTML[${htmlIndex}]:`);
            console.log(`   Element: ${htmlElementString}`);
            
            // INDEX-BASED MATCHING: Try to match with JSON entry at the same index
            if (htmlIndex < jsonStylesArray.length) {
                const jsonEntry = jsonStylesArray[htmlIndex];
                
                // ADDITIONAL SCRIPT CHECK: Skip JSON entries for script tags
                if (jsonEntry.tag && jsonEntry.tag.toLowerCase() === 'script') {
                    console.log(`   ⏭️  SKIPPING JSON[${htmlIndex}]: Script tag detected`);
                    indexMismatches++;
                    continue;
                }
                
                // SKIP if JSON HTML contains script tags
                if (jsonEntry.html && jsonEntry.html.toLowerCase().includes('<script')) {
                    console.log(`   ⏭️  SKIPPING JSON[${htmlIndex}]: Contains script tag in HTML`);
                    indexMismatches++;
                    continue;
                }
                
                console.log(`\n🎯 INDEX MATCHING: HTML[${htmlIndex}] ↔ JSON[${htmlIndex}]`);
                console.log(`   ✅ HTML Element: ${htmlElementString}`);
                console.log(`   ✅ JSON Entry: ${jsonEntry.html || 'No HTML string in JSON'}`);
                console.log(`   📍 Applying styles based on index position`);
                
                // Apply styles from this JSON entry
                let inlineStyleString = '';
                const styles = jsonEntry.styles;
                let validStyleCount = 0;
                
                console.log(`   📝 Processing ${Object.keys(styles).length} style properties:`);
                
                // Loop through all style properties
                for (const property in styles) {
                    if (styles.hasOwnProperty(property)) {
                        const value = styles[property];
                        
                        // Only add valid CSS values
                        if (value !== null && value !== undefined && value !== '' && 
                            (typeof value === 'string' || typeof value === 'number')) {
                            
                            inlineStyleString += `${property}: ${value}; `;
                            validStyleCount++;
                            console.log(`      ✅ ${property}: ${value}`);
                        } else {
                            console.log(`      ❌ SKIPPED ${property}: ${value} (invalid)`);
                        }
                    }
                }
                
                // Apply styles to the HTML element
                if (inlineStyleString.trim() !== '') {
                    const existingStyle = $htmlElement.attr('style') || '';
                    const finalStyle = existingStyle + (existingStyle ? '; ' : '') + inlineStyleString.trim();
                    
                    $htmlElement.attr('style', finalStyle);
                    
                    console.log(`   ✅ APPLIED ${validStyleCount} styles to HTML element`);
                    console.log(`   📄 Final style: ${finalStyle.substring(0, 100)}${finalStyle.length > 100 ? '...' : ''}`);
                } else {
                    console.log(`   ❌ NO VALID STYLES TO APPLY`);
                }
                
                totalMatches++;
                console.log(`   🔒 Index match successful (total matches: ${totalMatches})`);
                
            } else {
                // No corresponding JSON entry at this index
                console.log(`\n❌ NO JSON ENTRY: No JSON entry found at index ${htmlIndex}`);
                console.log(`   HTML Element: ${htmlElementString}`);
                console.log(`   JSON Array Length: ${jsonStylesArray.length}`);
                console.log(`   HTML elements exceed JSON entries`);
                indexMismatches++;
            }
            
            console.log(`${'─'.repeat(50)}`);
            
            // Show progress every 50 elements
            if ((htmlIndex + 1) % 50 === 0) {
                console.log(`📊 Progress: ${htmlIndex + 1}/${allHtmlElements.length} (${totalMatches} index matches applied)`);
            }
        }

        const styledHtml = this.formatCleanHtml($.html());
        const layoutInlineFile = `layout_inlineStyles_${sectionIndex}.html`;
        
        if (outputDir) {
            await fs.writeFile(path.join(outputDir, layoutInlineFile), styledHtml);
        }

        console.log('\n' + '═'.repeat(70));
        console.log('📊 FINAL RESULTS (INDEX-BASED MATCHING):');
        console.log(`✅ Index matches applied: ${totalMatches}`);
        console.log(`📊 HTML elements processed: ${allHtmlElements.length} (body elements only)`);
        console.log(`⏭️  Script elements skipped: ${skippedScriptElements}`);
        console.log(`❌ Index mismatches/skips: ${indexMismatches}`);
        console.log(`📊 JSON entries available: ${jsonStylesArray.length}`);
        console.log(`📈 Application rate: ${((totalMatches / allHtmlElements.length) * 100).toFixed(1)}%`);
        
        // Analysis
        if (totalMatches === 0) {
            console.log('\n🚨 WARNING: No styles applied!');
            console.log('   • Check if JSON file contains valid style entries');
            console.log('   • Verify both HTML and JSON have matching element counts');
        } else if (allHtmlElements.length > jsonStylesArray.length) {
            console.log(`\n⚠️  More HTML elements (${allHtmlElements.length}) than JSON entries (${jsonStylesArray.length})`);
            console.log(`   • ${allHtmlElements.length - jsonStylesArray.length} HTML elements have no corresponding JSON styles`);
            console.log('   • Consider generating JSON with complete element coverage');
        } else if (jsonStylesArray.length > allHtmlElements.length) {
            console.log(`\n⚠️  More JSON entries (${jsonStylesArray.length}) than HTML elements (${allHtmlElements.length})`);
            console.log(`   • ${jsonStylesArray.length - allHtmlElements.length} JSON entries were unused`);
            console.log('   • This is normal if JSON contains styles for elements not in current HTML');
        } else {
            console.log(`\n🎉 Perfect match: ${allHtmlElements.length} HTML elements = ${jsonStylesArray.length} JSON entries!`);
        }
        
        if (skippedScriptElements > 0) {
            console.log(`\n🛡️  Security: Skipped ${skippedScriptElements} script elements to prevent code injection`);
        }

        return {
            styledHtml,
            layoutInlineFile,
            stats: {
                totalMatches,
                totalHtmlElements: allHtmlElements.length,
                totalJsonEntries: jsonStylesArray.length,
                indexMismatches,
                skippedScriptElements,
                applicationRate: ((totalMatches / allHtmlElements.length) * 100).toFixed(1)
            }
        };
    }

    formatCleanHtml(html) {
    const $ = cheerio.load(html, {
        // Important: Don't decode entities automatically
        decodeEntities: false
    });
    
    $('style').remove();
    let cleanHtml = $.html();
    
    if (!cleanHtml.includes('<!DOCTYPE html>')) {
        cleanHtml = '<!DOCTYPE html>\n' + cleanHtml;
    }
    
    return cleanHtml
        .replace(/>\s*</g, '>\n<')
        .replace(/\n\s*\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
}
}
// - processHtmlAndExtractComponents function
async function processHtmlAndExtractComponents(fullPageHtml, outputDir) {
    console.log('📁 Creating components directory...');
    const componentsDir = path.join(outputDir, 'components');
    await fs.mkdir(componentsDir, { recursive: true });
    
    const $ = cheerio.load(fullPageHtml);
    console.log('✅ HTML loaded into Cheerio for processing');
    
    const extractedComponents = [];
    let placeholderCounter = 1;
    
    // Target IDs to extract
    const targetIds = ['BACKGROUND_GROUP', 'pinnedTopLeft', 'pinnedTopRight', 'pinnedBottomLeft'];
    
    console.log('🎯 Processing target IDs...');
    
    // Process each target ID
    for (const targetId of targetIds) {
        const $element = $('#' + targetId);
        if ($element.length > 0) {
            console.log(`✅ Found target ID: ${targetId}`);
            
            // Generate placeholder ID
            const placeholderId = `wigoh-id-${String(placeholderCounter).padStart(3, '0')}`;
            placeholderCounter++;
            
            // Add placeholder attribute to the element in extracted HTML
            $element.attr('wig-id', `{{${placeholderId}}}`);
            
            // Extract the component HTML with placeholder attribute
            const componentHtml = $.html($element);
            
            // Save component HTML file
            const componentFilename = `${placeholderId}_${targetId}.html`;
            const componentPath = path.join(componentsDir, componentFilename);
            
            const cleanComponentHtml = createCleanComponentHTML(componentHtml, targetId, placeholderId);
            await fs.writeFile(componentPath, cleanComponentHtml, 'utf8');
            console.log(`📄 Component saved: components/${componentFilename}`);
            
            // Replace element in original HTML with placeholder
            $element.replaceWith(`{{${placeholderId}}}`);
            console.log(`🔄 Replaced ${targetId} with {{${placeholderId}}} in original HTML`);
            
            extractedComponents.push({
                placeholderId: placeholderId,
                originalId: targetId,
                type: 'target-id',
                found: true,
                componentFile: `components/${componentFilename}`,
                childrenCount: $element.children().length
            });
            
        } else {
            console.log(`❌ Target ID not found: ${targetId}`);
            
            const placeholderId = `wigoh-id-${String(placeholderCounter).padStart(3, '0')}`;
            placeholderCounter++;
            
            // Create not found component file
            const componentFilename = `${placeholderId}_${targetId}_notfound.html`;
            const componentPath = path.join(componentsDir, componentFilename);
            
            const notFoundHtml = createNotFoundComponentHTML(targetId, placeholderId);
            await fs.writeFile(componentPath, notFoundHtml, 'utf8');
            console.log(`📄 Not found component created: components/${componentFilename}`);
            
            extractedComponents.push({
                placeholderId: placeholderId,
                originalId: targetId,
                type: 'target-id',
                found: false,
                componentFile: `components/${componentFilename}`,
                childrenCount: 0
            });
        }
    }
    
    console.log('🗂️ Processing section elements...');
    
    // Process only TOP-LEVEL sections (not nested ones)
    const processedSections = new Set();
    
    // Use a for loop instead of .each to allow async/await
    const sectionElements = $('section').toArray();
    for (let index = 0; index < sectionElements.length; index++) {
        const element = sectionElements[index];
        const $section = $(element);
        const sectionId = $section.attr('id') || `section_${index + 1}`;
        
        // Skip if this section is nested inside another section that we've already processed
        const isNested = $section.parents('section').length > 0;
        if (isNested) {
            console.log(`⏭️ Skipping nested section: ${sectionId} (will be included with parent)`);
            continue;
        }
        
        if (processedSections.has(sectionId)) {
            console.log(`⏭️ Skipping already processed section: ${sectionId}`);
            continue;
        }
        
        console.log(`✅ Found top-level section: ${sectionId}`);
        processedSections.add(sectionId);
        
        // Generate placeholder ID
        const placeholderId = `wigoh-id-${String(placeholderCounter).padStart(3, '0')}`;
        placeholderCounter++;
        
        // Add placeholder attribute to the section in extracted HTML
        $section.attr('wig-id', `{{${placeholderId}}}`);
        
        // Extract the section HTML (includes all nested content)
        const sectionHtml = $.html($section);
        
        // Save section HTML file
        const componentFilename = `${placeholderId}_${sectionId}.html`;
        const componentPath = path.join(componentsDir, componentFilename);
        
        const cleanSectionHtml = createCleanComponentHTML(sectionHtml, sectionId, placeholderId);
        await fs.writeFile(componentPath, cleanSectionHtml, 'utf8');
        console.log(`📄 Section saved: components/${componentFilename}`);
        
        // Replace section in original HTML with placeholder
        $section.replaceWith(`{{${placeholderId}}}`);
        console.log(`🔄 Replaced section ${sectionId} with {{${placeholderId}}} in original HTML`);
        
        extractedComponents.push({
            placeholderId: placeholderId,
            originalId: sectionId,
            type: 'section',
            found: true,
            componentFile: `components/${componentFilename}`,
            childrenCount: $section.children().length
        });
    }
    
    // Clean the HTML - remove scripts, styles, and keep only body content
    console.log('🧹 Cleaning HTML - removing scripts, styles, and non-body content...');
    
    // Remove all script tags
    $('script').remove();
    
    // Remove all style tags
    $('style').remove();
    
    // Remove link tags that reference stylesheets
    $('link[rel="stylesheet"]').remove();
    
    // Remove meta tags
    $('meta').remove();
    
    // Remove title tag
    $('title').remove();
    
    // Remove header and footer
    $('header').remove();
    $('footer').remove();

    $('#soapAfterPagesContainer').remove();
    
    // Get only body content
    let bodyContent = '';
    if ($('body').length > 0) {
        bodyContent = $('body').html() || '';
    } else {
        // If no body tag, get all remaining content
        bodyContent = $.html();
    }
    
    // Create clean HTML structure with only the body content and placeholders
    const cleanHtmlStructure = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Extracted Content with Placeholders</title>
</head>
<body>
${bodyContent}
</body>
</html>`;
    
    // Save the original HTML with placeholders
    const originalHtmlFilename = 'original_with_placeholders.html';
    const originalHtmlPath = path.join(outputDir, originalHtmlFilename);
    
    await fs.writeFile(originalHtmlPath, cleanHtmlStructure, 'utf8');
    console.log(`📄 Clean HTML with placeholders saved: ${originalHtmlFilename}`);
    
    return {
        extractedComponents: extractedComponents,
        originalHtmlFile: originalHtmlFilename
    };
}
// - createCleanComponentHTML function
function createCleanComponentHTML(componentHtml, originalId, placeholderId) {
    return `<!DOCTYPE html>
<html lang="en">

<body>

    
${componentHtml}

</body>
</html>`;
}
// - createNotFoundComponentHTML function
function createNotFoundComponentHTML(originalId, placeholderId) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Component Not Found: ${placeholderId} (${originalId})</title>
    <style>
        .not-found-component {
            padding: 20px;
            border: 2px dashed #ccc;
            margin: 10px;
            text-align: center;
            background-color: #f9f9f9;
        }
    </style>
</head>
<body>
    <!-- Component Not Found: ${originalId} -->
    <!-- Placeholder ID: ${placeholderId} -->
    <!-- Create your custom implementation for this component -->
    
    <div id="${originalId}" class="not-found-component" wig-id="{{${placeholderId}}}">
        <h2>Component Not Found: ${originalId}</h2>
        <p>Placeholder ID: ${placeholderId}</p>
        <p>This component was not found in the original page.</p>
        <p>Create your custom implementation here.</p>
        
        <div class="content-area">
            <!-- Add your ${originalId} content here -->
        </div>
    </div>

</body>
</html>`;
}

// Global variables for tracking completed sections
const completedSections = new Map();
let browserProcess = null;

// WebsiteBuilder class adapted for your file structure
class WebsiteBuilder {
    constructor(outputDir, componentId) {
        this.outputDir = outputDir;
        this.componentsDir = path.join(outputDir, 'components');
        this.componentId = componentId; // e.g., "001" from wigoh-id-001
        this.templateFile = path.join(this.componentsDir, `bareminimum_section_${componentId}.html`);
        this.data1File = path.join(this.componentsDir, `bg_${componentId}.json`);
        this.data2File = path.join(this.componentsDir, `bareminimum_${componentId}.json`);
        this.data3File = path.join(this.componentsDir, `widgets_${componentId}.json`);
        this.currentHTML = '';
        this.data1 = {}; // Background data
        this.data2 = {}; // Bareminimum templates
        this.data3 = {}; // Widgets data
    }

    async loadData() {
        try {
            // Load data1 (background data - bg_*.json)
            if (await fs.access(this.data1File).then(() => true).catch(() => false)) {
                const data1Content = await fs.readFile(this.data1File, 'utf8');
                this.data1 = JSON.parse(data1Content);
            }

            // Load data2 (bareminimum templates - template-nnnn format)
            if (await fs.access(this.data2File).then(() => true).catch(() => false)) {
                const data2Content = await fs.readFile(this.data2File, 'utf8');
                this.data2 = JSON.parse(data2Content);
            }

            // Load data3 (widgets - {{widget-n}} format keys with HTML values)
            if (await fs.access(this.data3File).then(() => true).catch(() => false)) {
                const data3Content = await fs.readFile(this.data3File, 'utf8');
                this.data3 = JSON.parse(data3Content);
            }

            console.log(`📁 Data loaded for component ${this.componentId}:`);
            console.log(`   🎨 Background layers: ${Object.keys(this.data1).length}`);
            console.log(`   📐 Templates: ${Object.keys(this.data2).length}`);
            console.log(`   🔧 Widgets: ${Object.keys(this.data3).length}`);
        } catch (error) {
            console.error(`❌ Error loading data for component ${this.componentId}:`, error);
            throw error;
        }
    }

   processTemplates(content) {
    if (!content || typeof content !== 'string') return content;

    let processedContent = content;
    let hasReplacements = true;
    let iterations = 0;
    const maxIterations = 30;

    // Temporary storage for protected CSS values
    const protectedCSSValues = new Map();
    let protectCounter = 0;
    
    // Protect CSS values with entities before processing
    processedContent = processedContent.replace(/style="([^"]*&quot;[^"]*)"/g, (match, styleContent) => {
        const placeholder = `__CSS_PROTECT_${protectCounter++}__`;
        protectedCSSValues.set(placeholder, match);
        return placeholder;
    });

    while (hasReplacements && iterations < maxIterations) {
        hasReplacements = false;
        iterations++;

        // Process templates, widgets, and backgrounds as before
        const templateMatches = processedContent.match(/\{\{template-\d+\}\}/g);
        if (templateMatches) {
            for (const match of templateMatches) {
                if (this.data2[match]) {
                    processedContent = processedContent.replace(match, this.data2[match]);
                    hasReplacements = true;
                    console.log(`    📄 Replaced ${match} (template)`);
                }
            }
        }

        const widgetMatches = processedContent.match(/\{\{widget-\d+\}\}/g);
        if (widgetMatches) {
            for (const match of widgetMatches) {
                if (this.data3[match]) {
                    processedContent = processedContent.replace(match, this.data3[match]);
                    hasReplacements = true;
                    console.log(`    📄 Replaced ${match} (widget)`);
                }
            }
        }

        const bgMatches = processedContent.match(/\{\{bg-\d+\}\}/g);
        if (bgMatches) {
            for (const match of bgMatches) {
                if (this.data1[match]) {
                    processedContent = processedContent.replace(match, this.data1[match]);
                    hasReplacements = true;
                    console.log(`    📄 Replaced ${match} (background)`);
                }
            }
        }
    }
    
    // Restore protected CSS values
    for (const [placeholder, originalCSS] of protectedCSSValues) {
        processedContent = processedContent.replace(placeholder, originalCSS);
    }

    return processedContent;
}

    cleanupHTML(html) {
    let cleaned = html;
    
    // Fix unquoted attributes (but preserve existing quoted ones)
    cleaned = cleaned.replace(/(\w+)=([^"'\s>]+(?:\s+[^"'\s>]+)*)/g, (match, attr, value) => {
        // Don't quote if it's already quoted or contains quotes
        if (value.includes('"') || value.includes("'")) {
            return match;
        }
        return `${attr}="${value}"`;
    });
    
    // DO NOT convert &quot; to " - this breaks CSS font-family values
    // The browser will handle HTML entities correctly
    
    // Only fix malformed entities that are clearly broken
    cleaned = cleaned.replace(/&amp;quot;/g, '&quot;'); // Fix double-encoded quotes
    cleaned = cleaned.replace(/&amp;amp;/g, '&amp;'); // Fix double-encoded ampersands
    
    return cleaned;
}

cleanupHTMLWithFontFix(html) {
    let cleaned = html;
    
    // First, temporarily protect font-family values
    const fontFamilyProtected = new Map();
    let protectCounter = 0;
    
    // Find and protect font-family values with &quot;
    cleaned = cleaned.replace(/font-family:\s*&quot;([^&]+)&quot;/g, (match, fontName) => {
        const placeholder = `__FONT_PROTECT_${protectCounter++}__`;
        fontFamilyProtected.set(placeholder, `font-family: &quot;${fontName}&quot;`);
        return placeholder;
    });
    
    // Fix other unquoted attributes
    cleaned = cleaned.replace(/(\w+)=([^"'\s>]+)/g, '$1="$2"');
    
    // Restore protected font-family values
    for (const [placeholder, originalValue] of fontFamilyProtected) {
        cleaned = cleaned.replace(placeholder, originalValue);
    }
    
    return cleaned;
}

    validatePlaceholders(html) {
        const remainingPlaceholders = html.match(/\{\{[^}]+\}\}/g);
        if (remainingPlaceholders) {
            console.warn(`⚠️ Unresolved placeholders in component ${this.componentId}:`, remainingPlaceholders);
            return false;
        }
        return true;
    }

    async buildComponent() {
        try {
            await this.loadData();
            
            console.log(`📖 Reading template: bareminimum_section_${this.componentId}.html`);
            const templateContent = await fs.readFile(this.templateFile, 'utf8');
            
            console.log(`🔄 Processing templates for component ${this.componentId}...`);
            let finalHtml = this.processTemplates(templateContent);
            finalHtml = this.cleanupHTML(finalHtml);
            
            const isValid = this.validatePlaceholders(finalHtml);
            if (!isValid) {
                console.warn(`⚠️ Some placeholders remain in component ${this.componentId}`);
            }
            
            this.currentHTML = finalHtml;
            console.log(`✅ Component ${this.componentId} built (${finalHtml.length} bytes)`);
            
            return finalHtml;
        } catch (error) {
            console.error(`❌ Build failed for component ${this.componentId}:`, error);
            throw error;
        }
    }

    getStats() {
        return {
            componentId: this.componentId,
            backgroundLayers: Object.keys(this.data1).length,
            templates: Object.keys(this.data2).length,
            widgets: Object.keys(this.data3).length,
            finalHTMLLength: this.currentHTML.length,
            hasUnresolvedPlaceholders: !this.validatePlaceholders(this.currentHTML)
        };
    }
}
// Process individual component
async function assembleFinalComponent(componentId, outputDir) {
    console.log(`\n🏗️ Assembling component: wigoh-id-${componentId}`);
    
    try {
        const builder = new WebsiteBuilder(outputDir, componentId);
        const finalHtml = await builder.buildComponent();
        
        // Store the completed component
        completedSections.set(componentId, {
            id: componentId,
            html: finalHtml,
            completed: true,
            stats: builder.getStats()
        });
        
        console.log(`✅ Component wigoh-id-${componentId} assembled successfully`);
        return finalHtml;
        
    } catch (error) {
        console.error(`❌ Failed to assemble component ${componentId}:`, error.message);
        completedSections.set(componentId, {
            id: componentId,
            error: error.message,
            failed: true
        });
        throw error;
    }
}
// Assemble final website from original HTML with placeholders
async function assembleFinalWebsite(outputDir) {
    console.log('\n🌐 STEP 8: Assembling Final Website with Entity Preservation');
    console.log('='.repeat(60));
    
    try {
        const originalHtmlPath = path.join(outputDir, 'original_with_placeholders.html');
        if (!await fs.access(originalHtmlPath).then(() => true).catch(() => false)) {
            throw new Error('Original HTML with placeholders not found');
        }
        
        const originalHtml = await fs.readFile(originalHtmlPath, 'utf8');
        console.log(`📄 Loaded original HTML (${originalHtml.length} bytes)`);
        
        // Use cheerio with entity preservation
        const $ = cheerio.load(originalHtml, { decodeEntities: false });
        let bodyContent = $('body').html() || '';
        
        console.log('🔍 Found placeholders in original HTML:');
        const placeholders = bodyContent.match(/\{\{wigoh-id-\d+\}\}/g) || [];
        placeholders.forEach(placeholder => {
            console.log(`   🔹 ${placeholder}`);
        });
        
        if (placeholders.length === 0) {
            console.log('⚠️ No component placeholders found in original HTML');
            return { finalHtml: originalHtml, componentsProcessed: 0 };
        }
        
        let processedContent = bodyContent;
        let componentsProcessed = 0;
        
        for (const placeholder of placeholders) {
            const componentIdMatch = placeholder.match(/wigoh-id-(\d+)/);
            if (!componentIdMatch) continue;
            
            const componentId = componentIdMatch[1];
            console.log(`\n📄 Processing placeholder: ${placeholder} (component ${componentId})`);
            
            try {
                if (!completedSections.has(componentId)) {
                    await assembleFinalComponent(componentId, outputDir);
                }
                
                const componentData = completedSections.get(componentId);
                if (componentData && componentData.html && !componentData.failed) {
                    // Replace placeholder while preserving entities
                    processedContent = processedContent.replace(placeholder, componentData.html);
                    componentsProcessed++;
                    console.log(`   ✅ Replaced ${placeholder} with assembled component`);
                } else {
                    console.warn(`   ⚠️ Component ${componentId} failed or has no HTML`);
                }
            } catch (error) {
                console.error(`   ❌ Error processing component ${componentId}: ${error.message}`);
            }
        }
        
        // Create final HTML with proper entity preservation
        const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Final Assembled Website</title>
</head>
<body>
${processedContent}
</body>
</html>`;
        
        // Save final website
        const finalWebsitePath = path.join(outputDir, 'final_website.html');
        await fs.writeFile(finalWebsitePath, finalHtml, 'utf8');
        
        console.log('\n🎉 Final Website Assembly Complete with Entity Preservation!');
        console.log(`📄 Final HTML: ${finalWebsitePath}`);
        console.log(`📊 Components processed: ${componentsProcessed}/${placeholders.length}`);
        console.log(`📏 Final size: ${finalHtml.length} bytes`);

        await updateBrowserDisplay(outputDir, true);
        
        return {
            finalHtml,
            finalWebsitePath,
            componentsProcessed,
            totalPlaceholders: placeholders.length
        };
        
    } catch (error) {
        console.error('❌ Final website assembly failed:', error);
        throw error;
    }
}
// Update browser display function
async function updateBrowserDisplay(outputDir, shouldOpenBrowser = false) {
    try {
        const finalHtmlPath = path.join(outputDir, 'final_website.html');
        if (!await fs.access(finalHtmlPath).then(() => true).catch(() => false)) {
            console.log('⏳ Final HTML not ready for display');
            return;
        }

        const finalHtml = await fs.readFile(finalHtmlPath, 'utf8');
        const tempFile = path.join(outputDir, 'browser_preview.html');
        await fs.writeFile(tempFile, finalHtml);
        
        const fullPath = path.resolve(tempFile);
        const fileUrl = `file://${fullPath}`;
        
        if (shouldOpenBrowser) {
            const platform = process.platform;
            let command;
            
            if (platform === 'win32') {
                command = `start "" "${fileUrl}"`;
            } else if (platform === 'darwin') {
                command = `open "${fileUrl}"`;
            } else {
                command = `xdg-open "${fileUrl}"`;
            }
            
            try {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execPromise = promisify(exec);
                
                await execPromise(command);
                console.log('🌐 Browser opened with final website');
                console.log(`🔗 URL: ${fileUrl}`);
            } catch (error) {
                console.log(`🔗 Final website available at: ${fileUrl}`);
            }
        } else {
            console.log(`🔗 Browser preview updated: ${fileUrl}`);
        }
    } catch (error) {
        console.error('❌ Error updating browser display:', error);
    }
}
// - Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '6.0.0-html-components-only'
    });
});
// Start server
app.listen(PORT, () => {
    console.log('\n🚀 HTML COMPONENT EXTRACTOR V7.0 (FULL PROCESSING PIPELINE)');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log('\n✨ FEATURES:');
    console.log('   ✅ HTML URL input (required)');
    console.log('   ✅ Optional styles URL for style processing');
    console.log('   ✅ HTML component extraction');
    console.log('   ✅ Widget extraction from components');
    console.log('   ✅ Background layers optimization');
    console.log('   ✅ Flex/Grid div optimization');
    console.log('   ✅ Bare minimum HTML generation');
    console.log('   ✅ Target ID components (BACKGROUND_GROUP, pinned elements)');
    console.log('   ✅ Top-level section components');
    console.log('   ✅ Placeholder replacement in original HTML');
    console.log('\n📁 OUTPUT:');
    console.log('   - original_with_placeholders.html');
    console.log('   - components/ (HTML component files)');
    console.log('   - widgets_*.json (extracted widgets for each component)');
    console.log('   - widgets_extracted_*.html (component HTML with widget placeholders)');
    console.log('   - bg_*.json (optimized background layers)');
    console.log('   - bareminimum_*.json (optimized flex/grid components)');
    console.log('   - bareminimum_section_*.html (final optimized HTML)');
    console.log('   - layout_inlineStyles_0.html (with styles applied if styles URL provided)');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
});
// Error handling
app.on('error', (error) => {
    console.error('\n❌ SERVER ERROR:', error);
});
process.on('uncaughtException', (error) => {
    console.error('\n❌ UNCAUGHT EXCEPTION:', error);
    console.log('Server will continue running...\n');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('\n❌ UNHANDLED PROMISE REJECTION:', reason);
    console.log('Server will continue running...\n');
});
process.on('SIGINT', () => {
    console.log('\nShutting down server gracefully...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('\nShutting down server gracefully...');
    process.exit(0);
});