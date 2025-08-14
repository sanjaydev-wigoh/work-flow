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
    'wow-svg', 'wow-icon', 'wow-canvas'
];
// Extract widgets from HTML content
async function extractWidgetsFromHtml(htmlContent, sectionIndex, outputDir) {
    try {
        const dom = new JSDOM(htmlContent);
        const document = dom.window.document;
        const widgets = {};
        let widgetCounter = 1;

        function processElement(element) {
            if (element.nodeType === 1) { // Element node
                const tagName = element.tagName.toLowerCase();
                
                if (WIDGET_ELEMENTS.includes(tagName)) {
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
// Background layers optimization prompt
const BGLAYERS_OPTIMIZATION_PROMPT = `
You are optimizing Wix bgLayers HTML. Your goal is to reduce the number of divs while STRICTLY preserving ALL visual properties.

CRITICAL RULES:
1. OUTPUT ONLY THE OPTIMIZED HTML - NO EXPLANATIONS OR COMMENTS
2. ALWAYS merge ALL classes from child divs into the parent div's class attribute
3. ALWAYS merge ALL styles from child divs into the parent div's style attribute
4. When merging styles, if parent and child have the same CSS property, use the child's value (child overrides parent)
5. PRESERVE ALL BACKGROUND PROPERTIES: background-color, background-image, background-size, background-position, background-repeat
6. PRESERVE ALL POSITIONING: position, top, left, right, bottom, z-index, transform, inset-*
7. PRESERVE ALL DIMENSIONS: width, height, min-width, min-height, max-width, max-height, block-size, inline-size
8. PRESERVE ALL VISUAL EFFECTS: opacity, overflow, overflow-x, overflow-y, overflow-block, overflow-inline, mask-position, mask-repeat, mask-size, filter, perspective-origin, transform-origin
9. If bgMedia div is EMPTY (no content) or only contains empty divs, completely remove it
10. If colorUnderlay exists, merge its background-color and all other properties into the main div
11. Keep all data-* attributes on the main div

MERGING PROCESS:
- Collect ALL class names from parent and ALL children → combine into single class attribute
- Collect ALL style properties from parent and ALL children → combine into single style attribute  
- Remove duplicate CSS properties, keeping the most specific/last value
- Maintain the main div's data attributes and ID

The output must render PIXEL-PERFECT identical to the input.

OUTPUT ONLY THE OPTIMIZED HTML:
`;
// Flex grid optimization prompt
const FLEXGRID_OPTIMIZATION_PROMPT = `
You are a Wix HTML optimization expert. REDUCE div count while maintaining PIXEL-PERFECT IDENTICAL rendering.

ULTRA-STRICT PRESERVATION RULES:
1. OUTPUT ONLY THE OPTIMIZED HTML - NO EXPLANATIONS
2. PRESERVE ALL LAYOUT PROPERTIES: display, flex-direction, justify-content, align-items, gap
3. PRESERVE ALL POSITIONING: position, top, left, right, bottom, transform, z-index
4. PRESERVE ALL SPACING: margin, margin-top, margin-left, margin-right, margin-bottom, padding (all variants)
5. PRESERVE ALL DIMENSIONS: width, height, min/max constraints
6. PRESERVE ALL VISUAL: overflow, opacity, visibility, filter, backdrop-filter
7. PRESERVE ALL GRID: grid-template-columns, grid-template-rows, grid-gap, grid-area
8. Keep ALL template placeholders: {{template-XXXX}} in exact same positions
9. Merge classes and attributes safely without conflicts

CRITICAL FLEX/GRID SAFETY:
- display:flex MUST be preserved
- display:grid MUST be preserved  
- flex-direction MUST be preserved
- justify-content MUST be preserved
- align-items MUST be preserved
- grid-template-columns/rows MUST be preserved
- gap/grid-gap MUST be preserved
- flex-wrap MUST be preserved

CRITICAL SPACING SAFETY:
- margin properties affect other elements - MUST preserve
- padding affects inner content positioning - MUST preserve
- border affects dimensions - MUST preserve

AGGRESSIVE DIV REDUCTION: 2 divs → 1 div, 3 divs → 1 div, 5 divs → 2 divs maximum

DIV REDUCTION STRATEGIES (WITH POSITIONING SAFETY):
- Merge parent-child divs ONLY if all positioning/sizing properties are preserved
- Eliminate wrapper divs by moving ALL their properties to child or parent
- Combine properties without losing any layout information
- Use CSS shorthand but maintain exact values
- Flatten nesting while preserving exact positioning chain

EXAMPLE 1 - REDUCE 3 DIVS TO 2 DIVS (SAFE POSITIONING):
INPUT (3 divs):
<div id="parent" class="flex-container" style="display: flex; height: 200px; width: 400px; position: relative;">
  <div class="wrapper" style="position: relative; height: 200px; width: 400px; padding: 20px;">
    <div id="child" class="content" style="height: 100px; width: 200px; position: absolute; top: 50px; left: 100px; margin: 10px;">
      {{template-2001}}
    </div>
  </div>
</div>

OUTPUT (2 divs - ALL properties preserved):
<div id="parent" class="flex-container wrapper" style="display:flex;height:200px;width:400px;position:relative;padding:20px">
<div id="child" class="content" style="height:100px;width:200px;position:absolute;top:50px;left:100px;margin:10px">{{template-2001}}</div>
</div>

WIDGET POSITIONING PROTECTION:
- Template placeholders {{template-XXXX}} positioning MUST be identical
- Parent positioning context MUST be maintained for absolute children
- Transform and transform-origin MUST be kept for animations

The output must be VISUALLY IDENTICAL. Any layout shift is forbidden.

HTML TO OPTIMIZE:
`;
async function optimizeWithAI(html, promptType, elementId) {
    return new Promise((resolve) => {
        const worker = new Worker(__filename, {
            workerData: { html, promptType, elementId }
        });

        const timeout = setTimeout(() => {
            worker.terminate();
            console.warn(`⏱️ AI timeout for ${elementId} - using original HTML`);
            resolve({ success: false, html: html, error: 'Timeout' });
        }, 120000); // 2 minute timeout

        worker.on('message', (result) => {
            clearTimeout(timeout);
            resolve(result);
        });

        worker.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`❌ AI worker error for ${elementId}:`, error.message);
            resolve({ success: false, html: html, error: error.message });
        });
    });
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

    // **STEP 1: Process bgLayers divs with AI**
    console.log('\n🎨 Processing bgLayers divs with AI optimization...');
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

    // Process bgLayers with AI
    for (let i = 0; i < bgLayerDivs.length; i++) {
        const divData = bgLayerDivs[i];
        const bgKey = `bg-${String(i + 1).padStart(2, '0')}`;
        
        console.log(`\n🔧 Processing bgLayers ${i + 1}/${bgLayerDivs.length}: ${divData.id}`);
        
        // Check size before sending to AI
        const sizeInBytes = Buffer.byteLength(divData.html, 'utf8');
        if (sizeInBytes > 10000) {
            console.warn(`📏 Div ${divData.id} too large (${sizeInBytes} bytes), saving intact`);
            bgTemplates[`{{${bgKey}}}`] = divData.html;
            $(divData.element).replaceWith(`{{${bgKey}}}`);
            continue;
        }
        
        // Use AI optimization for bgLayers
        const result = await optimizeWithAI(divData.html, 'bgLayers', divData.id);
        
        if (result.success && result.html && result.html !== divData.html) {
            console.log(`✅ AI optimized ${divData.id}: ${result.originalLength} → ${result.optimizedLength} bytes`);
            bgTemplates[`{{${bgKey}}}`] = result.html;
        } else {
            console.log(`🛡️ Using original ${divData.id}: ${result.error || 'No optimization'}`);
            bgTemplates[`{{${bgKey}}}`] = divData.html;
        }
        
        $(divData.element).replaceWith(`{{${bgKey}}}`);
    }

    // Save background templates
    const bgJsonFile = `bg_${sectionIndex}.json`;
    await fs.writeFile(path.join(outputDir, bgJsonFile), JSON.stringify(bgTemplates, null, 2));
    
    const htmlWithBgPlaceholders = $.html();
    const bgPlaceholderHtmlFile = `bg_placeholder_${sectionIndex}.html`;
    await fs.writeFile(path.join(outputDir, bgPlaceholderHtmlFile), htmlWithBgPlaceholders);

    // **STEP 2: Process flex/grid divs with AI**
    console.log('\n📊 Processing flex/grid divs with AI optimization...');
    let $saved = cheerio.load(htmlWithBgPlaceholders);
    const componentTemplates = {};
    let templateCounter = 2001;
    
    let processedInThisRound = true;
    let totalProcessed = 0;
    
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
        
        console.log(`\n🔄 Round ${Math.floor(totalProcessed/10) + 1}: Processing ${flexGridDivs.length} flex/grid divs`);

        // Process flex/grid divs with AI
        for (let i = 0; i < flexGridDivs.length && i < 10; i++) { // Limit per round
            const divData = flexGridDivs[i];
            const templateKey = `template-${String(templateCounter).padStart(4, '0')}`;
            
            console.log(`\n🔧 Processing flex/grid ${i + 1}/${Math.min(flexGridDivs.length, 10)}: ${divData.id}`);
            
            // Check size
            const sizeInBytes = Buffer.byteLength(divData.html, 'utf8');
            if (sizeInBytes > 10000) {
                console.warn(`📏 Div ${divData.id} too large (${sizeInBytes} bytes), saving intact`);
                componentTemplates[`{{${templateKey}}}`] = divData.html;
                $saved(divData.element).replaceWith(`{{${templateKey}}}`);
                processedInThisRound = true;
                totalProcessed++;
                templateCounter++;
                continue;
            }
            
            // Use AI optimization for flex/grid
            const result = await optimizeWithAI(divData.html, 'flexGrid', divData.id);
            
            if (result.success && result.html && result.html !== divData.html) {
                console.log(`✅ AI optimized ${divData.id}: ${result.originalLength} → ${result.optimizedLength} bytes`);
                componentTemplates[`{{${templateKey}}}`] = result.html;
            } else {
                console.log(`🛡️ Using original ${divData.id}: ${result.error || 'No optimization'}`);
                componentTemplates[`{{${templateKey}}}`] = divData.html;
            }
            
            $saved(divData.element).replaceWith(`{{${templateKey}}}`);
            processedInThisRound = true;
            totalProcessed++;
            templateCounter++;
        }
        
        if (processedInThisRound) {
            $saved = cheerio.load($saved.html());
        }
    }

    console.log(`\n🎯 Completed processing ${totalProcessed} flex/grid divs total`);

    // Save final output
    const finalBareHtml = $saved.html();
    const bareMinimumFile = `bareminimum_section_${sectionIndex}.html`;
    await fs.writeFile(path.join(outputDir, bareMinimumFile), finalBareHtml);
    
    const componentsJsonFile = `bareminimum_${sectionIndex}.json`;
    await fs.writeFile(path.join(outputDir, componentsJsonFile), JSON.stringify(componentTemplates, null, 2));

    console.log('\n🎉 Bare minimum HTML generation complete!');
    console.log('📊 Summary:');
    console.log(`   🎨 Background layers: ${bgLayerDivs.length} processed`);
    console.log(`   📊 Flex/Grid divs: ${totalProcessed} processed`);
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
                temperature: 0,
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
        console.log('\n🛠️ STEP 7: Generating bare minimum HTML for components...');
        const bareMinimumResults = [];
        
        for (const component of result.extractedComponents) {
            if (component.found) {
                const componentPath = path.join(__dirname, component.componentFile);
                const componentHtml = await fs.readFile(componentPath, 'utf8');
                
                const bareMinimumResult = await generateBareMinimumHtml(
                    component.placeholderId.replace('wigoh-id-', ''), // Extract just the number
                    path.join(__dirname, 'components')
                );
                
                bareMinimumResults.push({
                    componentId: component.placeholderId,
                    bareMinimumFile: bareMinimumResult.bareMinimumFile,
                    bgJsonFile: bareMinimumResult.bgJsonFile,
                    componentsJsonFile: bareMinimumResult.componentsJsonFile
                });
            }
        }
        
        // 🚀 NEW RECURSIVE STEP 8: Assemble final website
        console.log('\n🛠️ STEP 8: Assembling Final Website...');
        const finalAssemblyResult = await assembleFinalWebsite(__dirname);
        
        console.log('\n🎉 MIGRATION PROCESS COMPLETED SUCCESSFULLY!');
        console.log('📊 Final Statistics:');
        console.log(`   - Components extracted: ${result.extractedComponents.length}`);
        console.log(`   - Target IDs found: ${result.extractedComponents.filter(c => c.found).length}`);
        console.log(`   - Widgets extracted: ${widgetExtractions.reduce((sum, w) => sum + w.widgetCount, 0)}`);
        console.log(`   - Bare minimum HTML files generated: ${bareMinimumResults.length}`);
        console.log(`   - Final components assembled: ${finalAssemblyResult.componentsProcessed}/${finalAssemblyResult.totalPlaceholders}`);
        console.log(`   - Final website created: ${finalAssemblyResult.finalWebsitePath}`);
        console.log(`   - Original HTML with placeholders created`);
        console.log(`   - HTML Source URL: ${htmlUrl}`);
        console.log(`   - Styles Source URL: ${stylesUrl || 'None'}\n`);
        
        res.json({
            success: true,
            message: 'Migration completed successfully with final website assembly',
            stats: {
                componentsExtracted: result.extractedComponents.length,
                targetIdsFound: result.extractedComponents.filter(c => c.found).length,
                widgetsExtracted: widgetExtractions.reduce((sum, w) => sum + w.widgetCount, 0),
                bareMinimumFilesGenerated: bareMinimumResults.length,
                finalComponentsAssembled: finalAssemblyResult.componentsProcessed,
                totalPlaceholders: finalAssemblyResult.totalPlaceholders,
                finalWebsiteSize: finalAssemblyResult.finalHtml.length,
                htmlUrl: htmlUrl,
                stylesUrl: stylesUrl || null,
                extractedAt: new Date().toISOString(),
                originalHtmlFile: result.originalHtmlFile,
                styledHtmlFile: processedHtml.layoutInlineFile,
                finalWebsiteFile: 'final_website.html'
            },
            components: result.extractedComponents,
            widgetExtractions: widgetExtractions,
            bareMinimumResults: bareMinimumResults,
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
        
        let errorResponse = {
            error: 'Migration failed',
            message: error.message,
            type: error.name,
            timestamp: new Date().toISOString(),
            urls: { htmlUrl, stylesUrl }
        };
        
        if (error.message.includes('fetch failed') || error.message.includes('ENOTFOUND')) {
            errorResponse.message = 'Cannot access one or both URLs. Please check that they are accessible and correct.';
            errorResponse.suggestion = 'Verify both URLs are correct and accessible from the server';
        } else if (error.message.includes('timeout')) {
            errorResponse.message = 'Request timed out. The URLs took too long to respond.';
            errorResponse.suggestion = 'Try again or check if the URLs are responsive';
        }
        
        res.status(500).json(errorResponse);
    }
});
// - EnhancedHtmlStyleProcessor class
class EnhancedHtmlStyleProcessor {
    constructor() {
        this.unmatchedElements = [];
        this.elementIndex = 0;
        this.processedElements = new Set();
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

    extractAttributesFromHtml(htmlString) {
        if (!htmlString) return {};
        try {
            const $ = cheerio.load(htmlString);
            const element = $.root().children().first();
            const attributes = {};
            if (element.length > 0) {
                const attrs = element.get(0).attribs || {};
                if (attrs.id) attributes.id = attrs.id;
                if (attrs.class) attributes.className = attrs.class;
                if (attrs['data-mesh-id']) attributes.dataMeshId = attrs['data-mesh-id'];
                if (attrs['data-testid']) attributes.dataTestId = attrs['data-testid'];
                if (attrs['data-test-id']) attributes.dataTestId = attrs['data-test-id'];
            }
            if (Object.keys(attributes).length === 0) {
                const meshIdMatch = htmlString.match(/data-mesh-id=["']([^"']+)["']/);
                if (meshIdMatch) attributes.dataMeshId = meshIdMatch[1];
                const testIdMatch = htmlString.match(/data-testid=["']([^"']+)["']/);
                if (testIdMatch) attributes.dataTestId = testIdMatch[1];
                const idMatch = htmlString.match(/\sid=["']([^"']+)["']/);
                if (idMatch) attributes.id = idMatch[1];
                const classMatch = htmlString.match(/class=["']([^"']*)["']/);
                if (classMatch && classMatch[1].trim()) attributes.className = classMatch[1];
            }
            return attributes;
        } catch (error) {
            return {};
        }
    }

    enrichElementData(element, parentPath = '') {
        const enriched = {
            id: this.safeStringTrim(element.id || element.elementId || element.compId),
            className: this.safeStringTrim(element.className || element.class || element.cssClass),
            dataTestId: this.safeStringTrim(element.dataTestId || element['data-test-id'] || element.testId || element['data-testid']),
            dataMeshId: this.safeStringTrim(element.dataMeshId || element['data-mesh-id'] || element.meshId),
            styles: element.styles || element.style || element.css || {},
            html: this.safeStringTrim(element.html || element.innerHTML || element.outerHTML),
            path: element.path || parentPath,
            parentId: element.parentId || '',
            tagName: element.tagName || element.tag || '',
            textContent: this.safeStringTrim(element.textContent || element.text || element.innerText || ''),
            originalIndex: this.elementIndex++
        };

        if (enriched.html) {
            const htmlAttrs = this.extractAttributesFromHtml(enriched.html);
            if (!enriched.id && htmlAttrs.id) enriched.id = htmlAttrs.id;
            if (!enriched.className && htmlAttrs.className) enriched.className = htmlAttrs.className;
            if (!enriched.dataMeshId && htmlAttrs.dataMeshId) enriched.dataMeshId = htmlAttrs.dataMeshId;
            if (!enriched.dataTestId && htmlAttrs.dataTestId) enriched.dataTestId = htmlAttrs.dataTestId;
        }

        return enriched;
    }

    createElementSignature(element) {
        const parts = [];
        if (element.id) parts.push(`id:${element.id}`);
        if (element.dataMeshId) parts.push(`mesh:${element.dataMeshId}`);
        if (element.dataTestId) parts.push(`test:${element.dataTestId}`);
        if (element.className) parts.push(`class:${element.className}`);
        if (element.textContent) parts.push(`text:${element.textContent.substring(0,20)}`);
        if (element.tagName) parts.push(`tag:${element.tagName}`);
        parts.push(`idx:${element.originalIndex}`);
        return parts.join('|');
    }

    escapeCSSValue(value) {
        if (!value || typeof value !== 'string') return '';
        return value
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    isValidCSSSelector(selector) {
        if (!selector || typeof selector !== 'string' || selector.trim() === '') return false;
        if (selector.includes('[]') || selector.includes('""') || selector.includes("''")) return false;
        const openBrackets = (selector.match(/\[/g) || []).length;
        const closeBrackets = (selector.match(/\]/g) || []).length;
        if (openBrackets !== closeBrackets) return false;
        try {
            const testHtml = '<div></div>';
            const testCheerio = require('cheerio').load(testHtml);
            testCheerio(selector);
            return true;
        } catch (error) {
            return false;
        }
    }

    safeQuerySelector($, selector, description = '') {
        if (!this.isValidCSSSelector(selector)) return $();
        try {
            return $(selector);
        } catch (error) {
            return $();
        }
    }

    findPreciseMatch($, element) {
        let candidates = [];
        
        if (element.id && element.id.trim()) {
            const escapedId = this.escapeCSSValue(element.id);
            const idSelector = `#${escapedId}`;
            const idMatches = this.safeQuerySelector($, idSelector, 'for ID');
            if (idMatches.length === 1) {
                return { element: idMatches.first(), confidence: 100, method: 'unique-id' };
            } else if (idMatches.length > 1) {
                candidates = candidates.concat(
                    idMatches.toArray().map((el, idx) => ({
                        element: $(el),
                        confidence: 90 - idx,
                        method: 'id-with-disambiguation'
                    }))
                );
            }
        }
        
        if (element.dataMeshId && element.dataMeshId.trim()) {
            const escapedMeshId = this.escapeCSSValue(element.dataMeshId);
            const meshSelector = `[data-mesh-id="${escapedMeshId}"]`;
            const meshMatches = this.safeQuerySelector($, meshSelector, 'for data-mesh-id');
            if (meshMatches.length === 1) {
                return { element: meshMatches.first(), confidence: 95, method: 'unique-mesh-id' };
            } else if (meshMatches.length > 1) {
                candidates = candidates.concat(
                    meshMatches.toArray().map((el, idx) => ({
                        element: $(el),
                        confidence: 85 - idx,
                        method: 'mesh-id-with-disambiguation'
                    }))
                );
            }
        }
        
        if (element.dataTestId && element.dataTestId.trim()) {
            const escapedTestId = this.escapeCSSValue(element.dataTestId);
            const testIdSelectors = [
                `[data-testid="${escapedTestId}"]`,
                `[data-test-id="${escapedTestId}"]`
            ];
            for (const selector of testIdSelectors) {
                const testMatches = this.safeQuerySelector($, selector, 'for data-testid');
                if (testMatches.length === 1) {
                    return { element: testMatches.first(), confidence: 80, method: 'unique-test-id' };
                } else if (testMatches.length > 1) {
                    candidates = candidates.concat(
                        testMatches.toArray().map((el, idx) => ({
                            element: $(el),
                            confidence: 70 - idx,
                            method: 'test-id-with-disambiguation'
                        }))
                    );
                }
            }
        }
        
        if (element.className && element.className.trim()) {
            const classes = element.className.split(' ').filter(c => c.trim());
            for (const className of classes) {
                if (!className.match(/^[a-zA-Z_-][a-zA-Z0-9_-]*$/)) continue;
                const classSelector = `.${className}`;
                const classMatches = this.safeQuerySelector($, classSelector, `for class ${className}`);
                if (classMatches.length > 0) {
                    classMatches.each((idx, el) => {
                        const $el = $(el);
                        let contextScore = 0;
                        if (element.textContent && $el.text().trim() === element.textContent) contextScore += 30;
                        if (element.tagName && $el.get(0).tagName.toLowerCase() === element.tagName.toLowerCase()) contextScore += 20;
                        if (element.parentId && element.parentId.trim()) {
                            const escapedParentId = this.escapeCSSValue(element.parentId);
                            const parentSelector = `#${escapedParentId}`;
                            if (this.isValidCSSSelector(parentSelector)) {
                                const parent = $el.closest(parentSelector);
                                if (parent.length > 0) contextScore += 25;
                            }
                        }
                        candidates.push({
                            element: $el,
                            confidence: 40 + contextScore - idx,
                            method: `class-context-${className}`
                        });
                      });
                }
            }
        }
        
        candidates.sort((a, b) => b.confidence - a.confidence);
        if (candidates.length > 0) return candidates[0];
        return null;
    }

    applyStylesToElement($, element, styleString) {
        const elementSignature = this.createElementSignature(element);
        if (this.processedElements.has(elementSignature)) {
            return { success: false, reason: 'already-processed' };
        }
        const match = this.findPreciseMatch($, element);
        if (!match) return { success: false, reason: 'no-match-found' };
        const $targetElement = match.element;
        if ($targetElement.get(0).tagName && $targetElement.get(0).tagName.toLowerCase() === 'html') {
            return { success: false, reason: 'html-element-skipped' };
        }
        const existingStyle = $targetElement.attr('style') || '';
        const existingStyles = existingStyle ? existingStyle.split(';').map(s => s.trim()).filter(s => s) : [];
        const newStyles = styleString.split(';').map(s => s.trim()).filter(s => s);
        const styleMap = new Map();
        existingStyles.forEach(style => {
            const [prop, value] = style.split(':').map(s => s.trim());
            if (prop && value) styleMap.set(prop, value);
        });
        newStyles.forEach(style => {
            const [prop, value] = style.split(':').map(s => s.trim());
            if (prop && value) styleMap.set(prop, value);
        });
        const finalStyle = Array.from(styleMap.entries())
            .map(([prop, value]) => `${prop}: ${value}`)
            .join('; ');
        $targetElement.attr('style', finalStyle);
        this.processedElements.add(elementSignature);
        return { success: true, method: match.method, confidence: match.confidence };
    }

    extractElements(layoutData) {
        let elements = [];
        const findElements = (obj, path = '', parentId = '') => {
            if (obj === null || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    findElements(item, `${path}[${index}]`, parentId);
                });
                return;
            }
            const hasStyleInfo = obj.styles || obj.className || obj.id || obj.dataTestId || obj['data-test-id'];
            const hasLayoutInfo = obj.type || obj.tag || obj.tagName || obj.element || obj.component || obj.html;
            if (hasStyleInfo || hasLayoutInfo) {
                const element = this.enrichElementData({
                    ...obj,
                    path: path,
                    parentId: parentId
                });
                if (element.styles && Object.keys(element.styles).length > 0 &&
                    (element.id || element.className || element.dataTestId || element.dataMeshId || element.html)) {
                    elements.push(element);
                }
            }
            const currentId = obj.id || obj.elementId || obj.compId || parentId;
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                    findElements(value, `${path}.${key}`, currentId);
                }
            }
        };
        findElements(layoutData);
        return elements;
    }

    async processHtml(rawHtml, layoutJson, outputDir, sectionIndex) {
        const $ = cheerio.load(rawHtml);
        const elements = this.extractElements(layoutJson);
        if (elements.length === 0) {
            return {
                styledHtml: this.formatCleanHtml(rawHtml),
                layoutInlineFile: null
            };
        }
        let successCount = 0;
        let failureCount = 0;
        elements.sort((a, b) => {
            let scoreA = 0, scoreB = 0;
            if (a.id) scoreA += 100;
            if (b.id) scoreB += 100;
            if (a.dataMeshId) scoreA += 50;
            if (b.dataMeshId) scoreB += 50;
            if (a.dataTestId) scoreA += 30;
            if (b.dataTestId) scoreB += 30;
            return scoreA === scoreB ? a.originalIndex - b.originalIndex : scoreB - scoreA;
        });
        elements.forEach((element) => {
            if (!element.styles || Object.keys(element.styles).length === 0) return;
            const styleString = this.styleObjectToString(element.styles);
            const result = this.applyStylesToElement($, element, styleString);
            result.success ? successCount++ : failureCount++;
        });
        const styledHtml = this.formatCleanHtml($.html());
        const layoutInlineFile = `layout_inlineStyles_${sectionIndex}.html`;
        await fs.writeFile(path.join(outputDir, layoutInlineFile), styledHtml);
        return {
            styledHtml,
            layoutInlineFile
        };
    }

    formatCleanHtml(html) {
        const $ = cheerio.load(html);
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

// Add after the existing generateBareMinimumHtml function and before the migration endpoint

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

        while (hasReplacements && iterations < maxIterations) {
            hasReplacements = false;
            iterations++;

            // First pass: Replace {{template-nnnn}} patterns with data2 (bareminimum) content
            const templateMatches = processedContent.match(/\{\{template-\d+\}\}/g);
            if (templateMatches) {
                for (const match of templateMatches) {
                    if (this.data2[match]) {
                        processedContent = processedContent.replace(match, this.data2[match]);
                        hasReplacements = true;
                        console.log(`    🔄 Replaced ${match} (template)`);
                    } else {
                        const templateId = match.replace(/[{}]/g, '');
                        if (this.data2[templateId]) {
                            processedContent = processedContent.replace(match, this.data2[templateId]);
                            hasReplacements = true;
                            console.log(`    🔄 Replaced ${match} -> ${templateId} (template)`);
                        }
                    }
                }
            }

            // Second pass: Replace {{widget-n}} patterns with data3 (widgets) content
            const widgetMatches = processedContent.match(/\{\{widget-\d+\}\}/g);
            if (widgetMatches) {
                for (const match of widgetMatches) {
                    if (this.data3[match]) {
                        processedContent = processedContent.replace(match, this.data3[match]);
                        hasReplacements = true;
                        console.log(`    🔄 Replaced ${match} (widget)`);
                    } else {
                        const widgetId = match.replace(/[{}]/g, '');
                        if (this.data3[widgetId]) {
                            processedContent = processedContent.replace(match, this.data3[widgetId]);
                            hasReplacements = true;
                            console.log(`    🔄 Replaced ${match} -> ${widgetId} (widget)`);
                        }
                    }
                }
            }

            // Third pass: Replace {{bg-nn}} background patterns with data1 content
            const bgMatches = processedContent.match(/\{\{bg-\d+\}\}/g);
            if (bgMatches) {
                for (const match of bgMatches) {
                    if (this.data1[match]) {
                        processedContent = processedContent.replace(match, this.data1[match]);
                        hasReplacements = true;
                        console.log(`    🔄 Replaced ${match} (background)`);
                    } else {
                        const bgId = match.replace(/[{}]/g, '');
                        if (this.data1[bgId]) {
                            processedContent = processedContent.replace(match, this.data1[bgId]);
                            hasReplacements = true;
                            console.log(`    🔄 Replaced ${match} -> ${bgId} (background)`);
                        }
                    }
                }
            }

            // Fourth pass: Handle any other placeholder patterns
            const otherMatches = processedContent.match(/\{\{[^}]+\}\}/g);
            if (otherMatches) {
                for (const match of otherMatches) {
                    let replaced = false;
                    
                    // Check all data sources
                    [this.data1, this.data2, this.data3].forEach((dataSource, index) => {
                        if (!replaced && dataSource[match]) {
                            processedContent = processedContent.replace(match, dataSource[match]);
                            hasReplacements = true;
                            replaced = true;
                            console.log(`    🔄 Replaced ${match} (data${index + 1})`);
                        }
                        
                        if (!replaced) {
                            const withoutBraces = match.replace(/[{}]/g, '');
                            if (dataSource[withoutBraces]) {
                                processedContent = processedContent.replace(match, dataSource[withoutBraces]);
                                hasReplacements = true;
                                replaced = true;
                                console.log(`    🔄 Replaced ${match} -> ${withoutBraces} (data${index + 1})`);
                            }
                        }
                    });
                }
            }
        }

        if (iterations >= maxIterations) {
            console.warn(`⚠️ Maximum iterations reached for component ${this.componentId}`);
        }

        return processedContent;
    }

    cleanupHTML(html) {
        let cleaned = html;
        cleaned = cleaned.replace(/(\w+)=([^"'\s>]+)/g, '$1="$2"');
        cleaned = cleaned.replace(/&quot;/g, '"');
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
    console.log('\n🌐 STEP 8: Assembling Final Website');
    console.log('='.repeat(60));
    
    try {
        // Read the original HTML with placeholders
        const originalHtmlPath = path.join(outputDir, 'original_with_placeholders.html');
        if (!await fs.access(originalHtmlPath).then(() => true).catch(() => false)) {
            throw new Error('Original HTML with placeholders not found');
        }
        
        const originalHtml = await fs.readFile(originalHtmlPath, 'utf8');
        console.log(`📄 Loaded original HTML (${originalHtml.length} bytes)`);
        
        // Extract body content
        const $ = cheerio.load(originalHtml);
        let bodyContent = $('body').html() || '';
        
        console.log('🔍 Found placeholders in original HTML:');
        const placeholders = bodyContent.match(/\{\{wigoh-id-\d+\}\}/g) || [];
        placeholders.forEach(placeholder => {
            console.log(`   📍 ${placeholder}`);
        });
        
        if (placeholders.length === 0) {
            console.log('⚠️ No component placeholders found in original HTML');
            return {
                finalHtml: originalHtml,
                componentsProcessed: 0
            };
        }
        
        // Process each component placeholder
        let processedContent = bodyContent;
        let componentsProcessed = 0;
        
        for (const placeholder of placeholders) {
            const componentIdMatch = placeholder.match(/wigoh-id-(\d+)/);
            if (!componentIdMatch) continue;
            
            const componentId = componentIdMatch[1];
            console.log(`\n🔄 Processing placeholder: ${placeholder} (component ${componentId})`);
            
            try {
                // Check if component was already processed
                if (!completedSections.has(componentId)) {
                    await assembleFinalComponent(componentId, outputDir);
                }
                
                const componentData = completedSections.get(componentId);
                if (componentData && componentData.html && !componentData.failed) {
                    // Replace placeholder with processed component HTML
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
        
        // Create final HTML structure
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
        
        console.log('\n🎉 Final Website Assembly Complete!');
        console.log(`📄 Final HTML: ${finalWebsitePath}`);
        console.log(`📊 Components processed: ${componentsProcessed}/${placeholders.length}`);
        console.log(`📏 Final size: ${finalHtml.length} bytes`);
        
        // Update browser display
        await updateBrowserDisplay(outputDir, true);
        
        return {
            finalHtml,
            finalWebsitePath,
            componentsProcessed,
            totalPlaceholders: placeholders.length,
            componentStats: Array.from(completedSections.values())
                .filter(comp => comp.completed && comp.stats)
                .map(comp => comp.stats)
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