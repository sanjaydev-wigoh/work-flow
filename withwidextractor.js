const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom'); // Added for widget extraction

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

// Migration endpoint with dual URL processing
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
        console.log('🔄 Extracting body content from HTML...');
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
        console.log('🔄 STEP 5: Processing HTML and extracting components...');
        const result = await processHtmlAndExtractComponents(processedHtml.styledHtml, __dirname);
        
        // NEW STEP: Extract widgets from each component
        console.log('\n🛠️ STEP 6: Extracting widgets from components...');
        const widgetExtractions = [];
        
        for (const component of result.extractedComponents) {
            if (component.found) {
                const componentPath = path.join(__dirname, component.componentFile);
                const componentHtml = await fs.readFile(componentPath, 'utf8');
                
                const widgetResult = await extractWidgetsFromHtml(
                    componentHtml, 
                    component.placeholderId, 
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
        
        console.log('\n🎉 COMPONENT AND WIDGET EXTRACTION COMPLETED SUCCESSFULLY!');
        console.log('📊 Final Statistics:');
        console.log(`   - Components extracted: ${result.extractedComponents.length}`);
        console.log(`   - Target IDs found: ${result.extractedComponents.filter(c => c.found).length}`);
        console.log(`   - Widgets extracted: ${widgetExtractions.reduce((sum, w) => sum + w.widgetCount, 0)}`);
        console.log(`   - Original HTML with placeholders created`);
        console.log(`   - HTML Source URL: ${htmlUrl}`);
        console.log(`   - Styles Source URL: ${stylesUrl || 'None'}\n`);
        
        res.json({
            success: true,
            message: 'Component and widget extraction completed successfully',
            stats: {
                componentsExtracted: result.extractedComponents.length,
                targetIdsFound: result.extractedComponents.filter(c => c.found).length,
                widgetsExtracted: widgetExtractions.reduce((sum, w) => sum + w.widgetCount, 0),
                htmlUrl: htmlUrl,
                stylesUrl: stylesUrl || null,
                extractedAt: new Date().toISOString(),
                originalHtmlFile: result.originalHtmlFile,
                styledHtmlFile: processedHtml.layoutInlineFile
            },
            components: result.extractedComponents,
            widgetExtractions: widgetExtractions,
            originalHtmlFile: result.originalHtmlFile,
            styledHtmlFile: processedHtml.layoutInlineFile
        });
        
    } catch (error) {
        console.error('\n❌ MIGRATION ERROR OCCURRED!');
        console.error('📍 Error details:');
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

// Widget elements to extract
const WIDGET_ELEMENTS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'svg', 'img', 'image', 
    'video', 'span', 'button', 'a', 'text', 'wow-image', 'wix-video', 
    'wow-svg', 'wow-icon', 'wow-canvas', 'iframe'
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

// [Rest of the original code remains unchanged...]
// This includes:
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
// - Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '6.0.0-html-components-only'
    });
});
// - Server startup and error handling

// Start server
app.listen(PORT, () => {
    console.log('\n🚀 HTML COMPONENT AND WIDGET EXTRACTOR V6.1');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log('\n✨ FEATURES:');
    console.log('   ✅ HTML URL input (required)');
    console.log('   ✅ Optional styles URL for style processing');
    console.log('   ✅ HTML component extraction');
    console.log('   ✅ Widget extraction from components');
    console.log('   ✅ Target ID components (BACKGROUND_GROUP, pinned elements)');
    console.log('   ✅ Top-level section components');
    console.log('   ✅ Placeholder replacement in original HTML');
    console.log('\n📁 OUTPUT:');
    console.log('   - original_with_placeholders.html');
    console.log('   - components/ (HTML component files)');
    console.log('   - widgets_*.json (extracted widgets for each component)');
    console.log('   - widgets_extracted_*.html (component HTML with widget placeholders)');
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