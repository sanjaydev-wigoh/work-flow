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
You are a CSS/HTML expert optimizing Wix bgLayers HTML. Your ONLY job is to convert 3 nested divs into 1 single div while maintaining PIXEL-PERFECT visual output.

🚨 CRITICAL BACKGROUND PRESERVATION RULES (NEVER IGNORE):
1. BACKGROUND-COLOR: If ANY div has background-color, it MUST appear in the final div
2. BACKGROUND-IMAGE: If ANY div has background-image, it MUST appear in the final div  
3. BACKGROUND-SIZE: If ANY div has background-size, it MUST appear in the final div
4. BACKGROUND-POSITION: If ANY div has background-position, it MUST appear in the final div
5. BACKGROUND-REPEAT: If ANY div has background-repeat, it MUST appear in the final div
6. BACKGROUND: If ANY div has shorthand background, it MUST be preserved or expanded

⚠️ BACKGROUND PROPERTY VALIDATION:
- Check EVERY div for background-related CSS properties
- Merge ALL background properties into the single output div
- Use exact RGB values: rgb(6, 21, 81) NOT simplified versions
- Preserve hex colors exactly: #061551 NOT converted versions
- If multiple background properties exist, combine them properly

🔧 MANDATORY TRANSFORMATION STEPS:
STEP 1: ANALYZE - Scan all 3 divs for ANY background properties
STEP 2: EXTRACT - List every background property found
STEP 3: MERGE - Combine all classes: class="MW5IWV LWbAav Kv1aVt VgO9Yg"
STEP 4: COMBINE - Merge all styles, ensuring ALL background properties are included
STEP 5: VALIDATE - Verify the output contains ALL original background properties

📐 POSITIONING & DIMENSION PRESERVATION:
- position: absolute/relative/fixed MUST be preserved
- top, left, right, bottom values MUST be exact
- width, height MUST match original
- z-index MUST be preserved
- transform MUST be preserved
- overflow MUST be preserved
- opacity MUST be preserved

🎯 OUTPUT FORMAT RULES:
- Output EXACTLY one <div> tag
- Merge ALL attributes (id, data-*, class)
- Merge ALL styles into single style attribute
- If bgMedia has {{widget-}} content, place it inside the div
- If bgMedia is empty, remove it completely

❌ COMMON MISTAKES TO AVOID:
- Losing background-color during merge
- Forgetting background-image properties  
- Missing positioning values (top: 0, left: 0, etc.)
- Not merging all class names
- Losing overflow: hidden
- Missing data attributes

✅ VALIDATION CHECKLIST:
□ Single div output
□ All background properties present
□ All positioning preserved  
□ All classes merged
□ All data attributes included
□ Widget content handled correctly

EXAMPLES:

INPUT (3 divs with background-color):
<div id="bgLayers_comp-irqduxf8" data-hook="bgLayers" data-motion-part="BG_LAYER comp-irqduxf8" class="MW5IWV" style="bottom: 0; height: 881px; left: 0; position: absolute; right: 0; top: 0; overflow: hidden;">
  <div data-testid="colorUnderlay" class="LWbAav Kv1aVt" style="background-color: rgb(6, 21, 81); bottom: 0; height: 881px; left: 0; position: absolute; right: 0; top: 0;"></div>
  <div id="bgMedia_comp-irqduxf8" data-motion-part="BG_MEDIA comp-irqduxf8" class="VgO9Yg" style="height: 881px;"></div>
</div>

CORRECT OUTPUT (notice background-color is preserved):
<div id="bgLayers_comp-irqduxf8" data-hook="bgLayers" data-motion-part="BG_LAYER comp-irqduxf8" data-testid="colorUnderlay" class="MW5IWV LWbAav Kv1aVt VgO9Yg" style="position:absolute;top:0;bottom:0;left:0;right:0;height:881px;background-color:rgb(6,21,81);overflow:hidden"></div>

INPUT (3 divs with background-image):
<div id="bgLayers_comp-abc123" data-hook="bgLayers" class="MW5IWV" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; height: 600px;">
  <div class="LWbAav" style="background-image: url('https://example.com/bg.jpg'); background-size: cover; background-position: center; position: absolute; top: 0; left: 0; right: 0; bottom: 0;"></div>
  <div id="bgMedia_comp-abc123" class="VgO9Yg" style="height: 600px;"></div>
</div>

CORRECT OUTPUT (notice ALL background properties preserved):
<div id="bgLayers_comp-abc123" data-hook="bgLayers" class="MW5IWV LWbAav VgO9Yg" style="position:absolute;top:0;left:0;right:0;bottom:0;height:600px;background-image:url('https://example.com/bg.jpg');background-size:cover;background-position:center"></div>

🚨 REMEMBER: If you lose ANY background property, the visual output will be broken!

NOW OPTIMIZE THIS HTML:
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

// Enhanced validation function to check background preservation
function validateBackgroundPreservation(originalHtml, optimizedHtml) {
    console.log('\n🔍 Validating background property preservation...');
    
    // Extract background properties from original HTML
    const extractBackgroundProps = (html) => {
        const backgroundProps = {};
        const styleRegex = /style="([^"]*)"/g;
        let match;
        
        while ((match = styleRegex.exec(html)) !== null) {
            const styleString = match[1];
            const bgColorMatch = styleString.match(/background-color:\s*([^;]+)/);
            const bgImageMatch = styleString.match(/background-image:\s*([^;]+)/);
            const bgSizeMatch = styleString.match(/background-size:\s*([^;]+)/);
            const bgPositionMatch = styleString.match(/background-position:\s*([^;]+)/);
            const bgRepeatMatch = styleString.match(/background-repeat:\s*([^;]+)/);
            const bgMatch = styleString.match(/background:\s*([^;]+)/);
            
            if (bgColorMatch) backgroundProps.backgroundColor = bgColorMatch[1].trim();
            if (bgImageMatch) backgroundProps.backgroundImage = bgImageMatch[1].trim();
            if (bgSizeMatch) backgroundProps.backgroundSize = bgSizeMatch[1].trim();
            if (bgPositionMatch) backgroundProps.backgroundPosition = bgPositionMatch[1].trim();
            if (bgRepeatMatch) backgroundProps.backgroundRepeat = bgRepeatMatch[1].trim();
            if (bgMatch) backgroundProps.background = bgMatch[1].trim();
        }
        
        return backgroundProps;
    };
    
    const originalBgProps = extractBackgroundProps(originalHtml);
    const optimizedBgProps = extractBackgroundProps(optimizedHtml);
    
    console.log('📊 Original background properties:', originalBgProps);
    console.log('📊 Optimized background properties:', optimizedBgProps);
    
    // Check if all original background properties are preserved
    const missingProps = [];
    for (const [prop, value] of Object.entries(originalBgProps)) {
        if (!optimizedBgProps[prop] || optimizedBgProps[prop] !== value) {
            missingProps.push(`${prop}: ${value}`);
        }
    }
    
    if (missingProps.length > 0) {
        console.error('❌ BACKGROUND VALIDATION FAILED! Missing properties:', missingProps);
        return false;
    }
    
    console.log('✅ Background validation passed - all properties preserved');
    return true;
}

// Enhanced bgLayer processing with strict background validation
function processEnhancedBgLayerDiv(divHtml, divId) {
    console.log(`\n🔧 Enhanced processing for ${divId}...`);
    
    // Check if this div has any background properties
    const hasBackgroundProps = /background-color|background-image|background-size|background-position|background-repeat|background:/.test(divHtml);
    
    if (hasBackgroundProps) {
        console.log(`🎨 ${divId} has background properties - requires careful preservation`);
        
        // Extract all background properties for validation
        const bgPropsRegex = /(background-color|background-image|background-size|background-position|background-repeat|background):\s*([^;]+)/g;
        const backgroundProps = [];
        let match;
        
        while ((match = bgPropsRegex.exec(divHtml)) !== null) {
            backgroundProps.push(`${match[1]}: ${match[2]}`);
        }
        
        console.log(`🎯 Found background properties: ${backgroundProps.join(', ')}`);
        
        return {
            hasBackground: true,
            backgroundProps: backgroundProps,
            requiresValidation: true
        };
    }
    
    console.log(`📝 ${divId} has no background properties - standard processing`);
    return {
        hasBackground: false,
        requiresValidation: false
    };
}

// Enhanced worker processing with background validation
async function processEnhancedBgLayerWithAI(divData) {
    console.log(`\n🤖 Processing ${divData.id} with enhanced AI validation...`);
    
    const analysis = processEnhancedBgLayerDiv(divData.html, divData.id);
    
    return new Promise((resolve) => {
        const worker = new Worker(__filename, {
            workerData: {
                html: divData.html,
                id: divData.id,
                promptType: 'enhancedBgLayers',
                requiresBackgroundValidation: analysis.requiresValidation,
                originalBackgroundProps: analysis.backgroundProps
            },
            resourceLimits: {
                maxOldGenerationSizeMb: 256,
                maxYoungGenerationSizeMb: 256
            }
        });

        const timeout = setTimeout(() => {
            worker.terminate();
            console.error(`⌛ Timeout processing ${divData.id} - using original`);
            resolve({
                id: divData.id,
                success: true,
                html: divData.html,
                error: 'Timeout - used original',
                usedOriginal: true
            });
        }, 180000);

        worker.on('message', (message) => {
            clearTimeout(timeout);
            
            // If background validation is required, perform it
            if (analysis.requiresValidation && message.success) {
                const isValid = validateBackgroundPreservation(divData.html, message.optimizedHtml);
                if (!isValid) {
                    console.warn(`⚠️ Background validation failed for ${divData.id} - using original`);
                    resolve({
                        id: divData.id,
                        success: true,
                        html: divData.html,
                        error: 'Background validation failed - used original',
                        usedOriginal: true
                    });
                    return;
                }
            }
            
            resolve({
                id: divData.id,
                success: message.success,
                html: message.optimizedHtml || divData.html,
                error: message.error,
                backgroundValidated: analysis.requiresValidation
            });
        });

        worker.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`❌ Worker error for ${divData.id}: ${error.message} - using original`);
            resolve({
                id: divData.id,
                success: true,
                html: divData.html,
                error: error.message,
                usedOriginal: true
            });
        });
    });
}

module.exports = {
    BGLAYERS_OPTIMIZATION_PROMPT,
    validateBackgroundPreservation,
    processEnhancedBgLayerDiv,
    processEnhancedBgLayerWithAI
};


// Check if element is a critical bgLayer div
function isCriticalBgLayerDiv(htmlString) {
    const styleMatch = htmlString.match(/style="([^"]+)"/);
    if (!styleMatch) return false;
    
    const styleString = styleMatch[1];
    const properties = {};
    
    const cssRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);?/g;
    let match;
    
    while ((match = cssRegex.exec(styleString)) !== null) {
        const prop = match[1].replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        properties[prop] = match[2].trim();
    }
    
    // Check if this div has background or positioning properties
    const hasBackground = properties.backgroundColor || properties.backgroundImage || properties.background;
    const hasPositioning = properties.position && (properties.position !== 'static');
    const hasTransform = properties.transform;
    const hasZIndex = properties.zIndex;
    
    return hasBackground || hasPositioning || hasTransform || hasZIndex;
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

    console.log('\n🎨 Processing bgLayers divs with enhanced preservation...');
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

    const bgLayerResults = await Promise.all(bgLayerDivs.map((divData, i) => {
        console.log(`\n🔧 Processing bgLayers ${i + 1}/${bgLayerDivs.length}: ${divData.id}`);
        
        // Check size before sending to AI
        const sizeInBytes = Buffer.byteLength(divData.html, 'utf8');
        if (sizeInBytes > 12000) {
            console.warn(`📏 Div ${divData.id} is too large (${sizeInBytes} bytes > 12000), saving intact`);
            return Promise.resolve({
                id: divData.id,
                success: true,
                html: divData.html,
                error: null,
                skippedDueToSize: true
            });
        }
        
        // Check if this is a critical bgLayer
        if (isCriticalBgLayerDiv(divData.html)) {
            console.log(`🛡️ ${divData.id} identified as critical - applying minimal optimization only`);
            const conservativeResult = processBgLayerDiv(divData.html, divData.id);
            return Promise.resolve({
                id: divData.id,
                success: true,
                html: conservativeResult.html,
                error: null,
                conservative: true
            });
        }
        
        return new Promise((resolve) => {
            const worker = new Worker(__filename, {
                workerData: {
                    html: divData.html,
                    id: divData.id,
                    promptType: 'bgLayers'
                },
                resourceLimits: {
                    maxOldGenerationSizeMb: 256,
                    maxYoungGenerationSizeMb: 256
                }
            });

            const timeout = setTimeout(() => {
                worker.terminate();
                console.error(`⌛ Timeout processing ${divData.id} - using original`);
                resolve({
                    id: divData.id,
                    success: true,
                    html: divData.html, // Use original on timeout
                    error: 'Timeout - used original'
                });
            }, 180000); // 3 minute timeout

            worker.on('message', (message) => {
                clearTimeout(timeout);
                resolve({
                    id: divData.id,
                    success: message.success,
                    html: message.optimizedHtml || divData.html,
                    error: message.error,
                    conservative: message.conservative
                });
            });

            worker.on('error', (error) => {
                clearTimeout(timeout);
                console.error(`❌ Worker error for ${divData.id}: ${error.message} - using original`);
                resolve({
                    id: divData.id,
                    success: true,
                    html: divData.html, // Use original on error
                    error: error.message
                });
            });

            worker.on('exit', (code) => {
                clearTimeout(timeout);
                if (code !== 0) {
                    console.error(`❌ Worker stopped with exit code ${code} for ${divData.id} - using original`);
                }
            });
        });
    }));

    // Process bgLayer results with enhanced validation
    bgLayerResults.forEach((result, i) => {
        const bgKey = `bg-${String(i + 1).padStart(2, '0')}`;
        
        if (result.skippedDueToSize || result.conservative) {
            bgTemplates[`{{${bgKey}}}`] = result.html;
            $(bgLayerDivs[i].element).replaceWith(`{{${bgKey}}}`);
            const reason = result.skippedDueToSize ? 'large size' : 'critical structure';
            console.log(`🛡️ Protected ${result.id} due to ${reason} (${Buffer.byteLength(result.html, 'utf8')} bytes)`);
            return;
        }
        
        const enhancedResult = {
            ...result,
            originalDivCount: 3, // Always 3 nested divs in bgLayers
            optimizedDivCount: result.html ? (result.html.match(/<div/g) || []).length : 0,
            hasBackgroundLayers: result.html.includes('background')
        };
        
        // Use the enhanced preservation function
        const finalHtml = preserveCriticalBgLayerStructure(bgLayerDivs[i].html, enhancedResult.html);
        
        if (finalHtml === bgLayerDivs[i].html) {
            console.log(`🛡️ Used original HTML for ${enhancedResult.id} due to critical property preservation`);
        } else {
            console.log(`✅ Safely optimized ${enhancedResult.id} (${finalHtml.length} bytes)`);
        }
        
        bgTemplates[`{{${bgKey}}}`] = finalHtml;
        $(bgLayerDivs[i].element).replaceWith(`{{${bgKey}}}`);
    });

    const bgJsonFile = `bg_${sectionIndex}.json`;
    await fs.writeFile(path.join(outputDir, bgJsonFile), JSON.stringify(bgTemplates, null, 2));
    
    const htmlWithBgPlaceholders = $.html();
    const bgPlaceholderHtmlFile = `bg_placeholder_${sectionIndex}.html`;
    await fs.writeFile(path.join(outputDir, bgPlaceholderHtmlFile), htmlWithBgPlaceholders);

    // Process flex/grid divs
    console.log('\n📊 Processing flex/grid divs (innermost first)...');
    let $saved = cheerio.load(htmlWithBgPlaceholders);
    const componentTemplates = {};
    let templateCounter = 2001;
    
    let processedInThisRound = true;
    let totalProcessed = 0;
    
    while (processedInThisRound) {
        processedInThisRound = false;
        const flexGridDivs = [];
        
        $saved('div[id]').each((index, element) => {
            const $element = $saved(element);
            const id = $element.attr('id');
            
            if (id && id.startsWith('bgLayers')) {
                return;
            }
            
            if ($saved.html($element).includes('{{template-')) {
                return;
            }
            
            if (id && hasFlexOrGridProperties(element, $saved)) {
                if (!containsOnlyWidgets(element, $saved)) {
                    flexGridDivs.push({
                        id: id,
                        element: element,
                        html: $saved.html($element),
                        depth: getNestingDepth(element, $saved)
                    });
                } else {
                    console.log(`🚫 Skipping widget-only flex/grid div: ${id}`);
                }
            }
        });

        if (flexGridDivs.length === 0) {
            break;
        }

        flexGridDivs.sort((a, b) => b.depth - a.depth);
        
        console.log(`\n🔄 Round ${totalProcessed > 0 ? Math.floor(totalProcessed/10) + 1 : 1}: Found ${flexGridDivs.length} flex/grid divs`);
        flexGridDivs.forEach(div => {
            console.log(`   📐 ${div.id} (depth: ${div.depth})`);
        });

        const flexGridResults = await Promise.all(flexGridDivs.map(async (divData, i) => {
            console.log(`\n🔧 Processing flex/grid div ${i + 1}/${flexGridDivs.length}: ${divData.id} (depth: ${divData.depth})`);
            
            // Check size before sending to AI
            const sizeInBytes = Buffer.byteLength(divData.html, 'utf8');
            if (sizeInBytes > 12000) {
                console.warn(`📏 Div ${divData.id} is too large (${sizeInBytes} bytes > 12000), saving intact`);
                return Promise.resolve({
                    id: divData.id,
                    success: true,
                    html: divData.html,
                    error: null,
                    skippedDueToSize: true
                });
            }
            
            return new Promise((resolve) => {
                const worker = new Worker(__filename, {
                    workerData: {
                        html: divData.html,
                        id: divData.id,
                        promptType: 'flexGrid'
                    },
                    resourceLimits: {
                        maxOldGenerationSizeMb: 512,
                        maxYoungGenerationSizeMb: 512,
                        codeRangeSizeMb: 16,
                        stackSizeMb: 4
                    }
                });

                const timeout = setTimeout(() => {
                    worker.terminate();
                    console.error(`⌛ Timeout processing ${divData.id}`);
                    resolve({
                        id: divData.id,
                        success: false,
                        error: 'Timeout',
                        html: ''
                    });
                }, 300000); // 5 minute timeout

                worker.on('message', (message) => {
                    clearTimeout(timeout);
                    resolve({
                        id: divData.id,
                        success: message.success,
                        html: message.optimizedHtml || '',
                        error: message.error
                    });
                });

                worker.on('error', (error) => {
                    clearTimeout(timeout);
                    console.error(`❌ Worker error for ${divData.id}: ${error.message}`);
                    resolve({
                        id: divData.id,
                        success: false,
                        error: error.message,
                        html: ''
                    });
                });

                worker.on('exit', (code) => {
                    clearTimeout(timeout);
                    if (code !== 0) {
                        console.error(`❌ Worker stopped with exit code ${code} for ${divData.id}`);
                    }
                });
            });
        }));

        // Process flexGrid results
        flexGridResults.forEach((result, i) => {
            const templateKey = `template-${String(templateCounter).padStart(4, '0')}`;
            const originalHtml = flexGridDivs[i].html;
            
            if (result.skippedDueToSize) {
                componentTemplates[`{{${templateKey}}}`] = result.html;
                $saved(flexGridDivs[i].element).replaceWith(`{{${templateKey}}}`);
                console.log(`📦 Saved large div ${result.id} → {{${templateKey}}} intact (${Buffer.byteLength(result.html, 'utf8')} bytes)`);
                processedInThisRound = true;
                totalProcessed++;
                templateCounter++;
                return;
            }
            
            if (result.success && result.html) {
                componentTemplates[`{{${templateKey}}}`] = result.html;
                $saved(flexGridDivs[i].element).replaceWith(`{{${templateKey}}}`);
                console.log(`✅ Optimized ${result.id} → {{${templateKey}}} (${result.html.length} bytes)`);
                processedInThisRound = true;
                totalProcessed++;
            } else {
                componentTemplates[`{{${templateKey}}}`] = originalHtml;
                $saved(flexGridDivs[i].element).replaceWith(`{{${templateKey}}}`);
                console.error(`❌ Failed ${result.id}: ${result.error} - Using original HTML`);
            }
            
            templateCounter++;
        });
        
        if (processedInThisRound) {
            $saved = cheerio.load($saved.html());
        }
    }

    console.log(`\n🎯 Completed processing ${totalProcessed} flex/grid divs in total`);

    // Save final output
    const finalBareHtml = $saved.html();
    const bareMinimumFile = `bareminimum_section_${sectionIndex}.html`;
    await fs.writeFile(path.join(outputDir, bareMinimumFile), finalBareHtml);
    
    const componentsJsonFile = `bareminimum_${sectionIndex}.json`;
    await fs.writeFile(path.join(outputDir, componentsJsonFile), JSON.stringify(componentTemplates, null, 2));

    console.log('\n🏁 Bare minimum HTML generation complete!');
    console.log('📊 Summary:');
    console.log(`   🎨 Background layers: ${bgLayerDivs.length} processed`);
    console.log(`   📐 Flex/Grid divs: ${totalProcessed} processed`);
    console.log(`   📁 Files generated: ${bareMinimumFile}, ${bgJsonFile}, ${componentsJsonFile}`);
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
// Worker thread processing
if (!isMainThread) {
    (async () => {
        try {
            Object.keys(require.cache).forEach(key => {
                delete require.cache[key];
            });

            const { html, id, promptType } = workerData;
            
            // For bgLayers, try conservative approach first
            if (promptType === 'bgLayers') {
                const conservativeResult = processBgLayerDiv(html, id);
                if (conservativeResult) {
                    parentPort.postMessage({ 
                        success: true, 
                        optimizedHtml: conservativeResult.html, 
                        id,
                        conservative: true
                    });
                    return;
                }
            }
            
            const workerOpenAI = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            const prompt = promptType === 'bgLayers' ? BGLAYERS_OPTIMIZATION_PROMPT : FLEXGRID_OPTIMIZATION_PROMPT;
            const response = await workerOpenAI.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: `${prompt}\n${html}` }],
                temperature: promptType === 'bgLayers' ? 0.05 : 0.1,
                max_tokens: 12288,
            });

            const optimizedHtml = response.choices[0].message.content
                .replace(/^```html\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            parentPort.postMessage({ 
                success: true, 
                optimizedHtml, 
                id 
            });
        } catch (error) {
            parentPort.postMessage({ 
                success: false, 
                error: error.message, 
                id: workerData.id 
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