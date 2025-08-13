// const express = require('express');
// const fs = require('fs').promises;
// const path = require('path');
// const cheerio = require('cheerio');
// const fetch = require('node-fetch'); // You'll need to install this: npm install node-fetch@2

// const app = express();
// const PORT = 3000;

// // Middleware
// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ limit: '50mb', extended: true }));
// app.use(express.static('public'));

// // Add CORS headers
// app.use((req, res, next) => {
//     res.header('Access-Control-Allow-Origin', '*');
//     res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
//     next();
// });

// // Serve the main HTML page
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// // Migration endpoint with dual URL processing
// app.post('/migrate', async (req, res) => {
//     console.log('\n=== MIGRATION REQUEST RECEIVED ===');
//     console.log('Request body:', req.body);
    
//     const { htmlUrl, stylesUrl } = req.body;
    
//     if (!htmlUrl || !stylesUrl) {
//         console.error('❌ ERROR: Both HTML URL and Styles URL are required');
//         return res.status(400).json({ 
//             error: 'Both htmlUrl and stylesUrl are required',
//             received: { htmlUrl: !!htmlUrl, stylesUrl: !!stylesUrl }
//         });
//     }
    
//     console.log(`✅ Starting migration for:`);
//     console.log(`   HTML URL: ${htmlUrl}`);
//     console.log(`   Styles URL: ${stylesUrl}`);
//     console.log(`📊 Request timestamp: ${new Date().toISOString()}`);
    
//     try {
//         // Step 1: Fetch HTML content
//         console.log('🌐 Fetching HTML content...');
//         let htmlContent = '';
        
//         try {
//             const htmlResponse = await fetch(htmlUrl, {
//                 headers: {
//                     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
//                 },
//                 timeout: 30000
//             });
            
//             if (!htmlResponse.ok) {
//                 throw new Error(`HTML fetch failed: ${htmlResponse.status} ${htmlResponse.statusText}`);
//             }
            
//             htmlContent = await htmlResponse.text();
//             console.log(`✅ HTML content fetched (${htmlContent.length} characters)`);
//         } catch (htmlError) {
//             throw new Error(`Failed to fetch HTML from ${htmlUrl}: ${htmlError.message}`);
//         }
        
//         // Step 2: Fetch computed styles JSON
//         console.log('🎨 Fetching computed styles JSON...');
//         let computedStyles = {};
        
//         try {
//             const stylesResponse = await fetch(stylesUrl, {
//                 headers: {
//                     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
//                 },
//                 timeout: 30000
//             });
            
//             if (!stylesResponse.ok) {
//                 throw new Error(`Styles fetch failed: ${stylesResponse.status} ${stylesResponse.statusText}`);
//             }
            
//             computedStyles = await stylesResponse.json();
//             console.log(`✅ Computed styles fetched`);
//             console.log(`📊 Computed styles structure:`, Object.keys(computedStyles));
            
//             // Debug: Log first few entries to understand structure
//             const firstKeys = Object.keys(computedStyles).slice(0, 3);
//             firstKeys.forEach(key => {
//                 const item = computedStyles[key];
//                 console.log(`📝 Sample entry [${key}]:`, {
//                     hasStyles: !!(item && item.styles),
//                     stylesCount: item && item.styles ? Object.keys(item.styles).length : 0,
//                     hasChildren: !!(item && item.children),
//                     childrenCount: item && item.children ? item.children.length : 0
//                 });
//             });
            
//         } catch (stylesError) {
//             console.warn(`⚠️ Warning: Failed to fetch computed styles from ${stylesUrl}: ${stylesError.message}`);
//             console.log('🔄 Creating minimal computed styles structure...');
//             computedStyles = {
//                 metadata: {
//                     url: htmlUrl,
//                     title: 'Fetched Content',
//                     extractedAt: new Date().toISOString(),
//                     viewport: { width: 1920, height: 1080 },
//                     userAgent: 'Server Fetch'
//                 },
//                 elements: {},
//                 totalElements: 0
//             };
//         }
        
//         // Step 3: Extract body content only from HTML
//         console.log('🔄 Extracting body content from HTML...');
//         const $ = cheerio.load(htmlContent);
        
//         // Get only body content
//         let bodyContent = '';
//         if ($('body').length > 0) {
//             bodyContent = $('body').html() || '';
//         } else {
//             console.warn('⚠️ No body tag found, using entire HTML content');
//             bodyContent = htmlContent;
//         }
        
//         // Create full page HTML with body content
//         const fullPageHtml = `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Fetched Content</title>
// </head>
// <body>
// ${bodyContent}
// </body>
// </html>`;
        
//         console.log(`✅ Body content extracted (${bodyContent.length} characters)`);
        
//         // Step 4: Process HTML with EnhancedHtmlStyleProcessor before extraction
//         console.log('🎨 Applying styles with EnhancedHtmlStyleProcessor...');
//         const styleProcessor = new EnhancedHtmlStyleProcessor();
//         const processedHtml = await styleProcessor.processHtml(fullPageHtml, computedStyles, __dirname, 0);
//         console.log('✅ Styles applied to HTML');
        
//         // Step 5: Process HTML and extract components
//         console.log('🔄 STEP 5: Processing HTML and extracting components...');
//         const result = await processHtmlAndExtractComponents(processedHtml.styledHtml, computedStyles, __dirname);
        
//         console.log('\n🎉 COMPONENT EXTRACTION COMPLETED SUCCESSFULLY!');
//         console.log('📊 Final Statistics:');
//         console.log(`   - Components extracted: ${result.extractedComponents.length}`);
//         console.log(`   - Target IDs found: ${result.extractedComponents.filter(c => c.found).length}`);
//         console.log(`   - Original HTML with placeholders created`);
//         console.log(`   - HTML Source URL: ${htmlUrl}`);
//         console.log(`   - Styles Source URL: ${stylesUrl}\n`);
        
//         res.json({
//             success: true,
//             message: 'Component extraction completed successfully',
//             stats: {
//                 componentsExtracted: result.extractedComponents.length,
//                 targetIdsFound: result.extractedComponents.filter(c => c.found).length,
//                 htmlUrl: htmlUrl,
//                 stylesUrl: stylesUrl,
//                 extractedAt: new Date().toISOString(),
//                 originalHtmlFile: result.originalHtmlFile,
//                 styledHtmlFile: processedHtml.layoutInlineFile
//             },
//             components: result.extractedComponents,
//             originalHtmlFile: result.originalHtmlFile,
//             styledHtmlFile: processedHtml.layoutInlineFile
//         });
        
//     } catch (error) {
//         console.error('\n❌ MIGRATION ERROR OCCURRED!');
//         console.error('📍 Error details:');
//         console.error(`   - Error type: ${error.name}`);
//         console.error(`   - Error message: ${error.message}`);
//         console.error(`   - HTML URL: ${htmlUrl}`);
//         console.error(`   - Styles URL: ${stylesUrl}`);
//         console.error(`   - Timestamp: ${new Date().toISOString()}\n`);
        
//         let errorResponse = {
//             error: 'Migration failed',
//             message: error.message,
//             type: error.name,
//             timestamp: new Date().toISOString(),
//             urls: { htmlUrl, stylesUrl }
//         };
        
//         if (error.message.includes('fetch failed') || error.message.includes('ENOTFOUND')) {
//             errorResponse.message = 'Cannot access one or both URLs. Please check that they are accessible and correct.';
//             errorResponse.suggestion = 'Verify both URLs are correct and accessible from the server';
//         } else if (error.message.includes('timeout')) {
//             errorResponse.message = 'Request timed out. The URLs took too long to respond.';
//             errorResponse.suggestion = 'Try again or check if the URLs are responsive';
//         }
        
//         res.status(500).json(errorResponse);
//     }
// });

// class EnhancedHtmlStyleProcessor {
//     constructor() {
//         this.unmatchedElements = [];
//         this.elementIndex = 0;
//         this.processedElements = new Set();
//     }

//     camelToKebab(str) {
//         return str.replace(/([A-Z])/g, '-$1').toLowerCase();
//     }

//     styleObjectToString(styleObj) {
//         return Object.entries(styleObj)
//             .map(([key, value]) => {
//                 const cssKey = this.camelToKebab(key);
//                 let cssValue = String(value).trim();
//                 if (!isNaN(cssValue)) {
//                     if (['width','height','margin','padding','top','left','right','bottom','font-size','line-height','border-radius'].some(prop => cssKey.includes(prop))) {
//                         cssValue = cssValue + (cssValue.includes('%') ? '' : 'px');
//                     }
//                 }
//                 return `${cssKey}: ${cssValue}`;
//             })
//             .join('; ');
//     }

//     safeStringTrim(value) {
//         if (value === null || value === undefined) return '';
//         if (Array.isArray(value)) return value.join(' ').trim();
//         return String(value).trim();
//     }

//     extractAttributesFromHtml(htmlString) {
//         if (!htmlString) return {};
//         try {
//             const $ = cheerio.load(htmlString);
//             const element = $.root().children().first();
//             const attributes = {};
//             if (element.length > 0) {
//                 const attrs = element.get(0).attribs || {};
//                 if (attrs.id) attributes.id = attrs.id;
//                 if (attrs.class) attributes.className = attrs.class;
//                 if (attrs['data-mesh-id']) attributes.dataMeshId = attrs['data-mesh-id'];
//                 if (attrs['data-testid']) attributes.dataTestId = attrs['data-testid'];
//                 if (attrs['data-test-id']) attributes.dataTestId = attrs['data-test-id'];
//             }
//             if (Object.keys(attributes).length === 0) {
//                 const meshIdMatch = htmlString.match(/data-mesh-id=["']([^"']+)["']/);
//                 if (meshIdMatch) attributes.dataMeshId = meshIdMatch[1];
//                 const testIdMatch = htmlString.match(/data-testid=["']([^"']+)["']/);
//                 if (testIdMatch) attributes.dataTestId = testIdMatch[1];
//                 const idMatch = htmlString.match(/\sid=["']([^"']+)["']/);
//                 if (idMatch) attributes.id = idMatch[1];
//                 const classMatch = htmlString.match(/class=["']([^"']*)["']/);
//                 if (classMatch && classMatch[1].trim()) attributes.className = classMatch[1];
//             }
//             return attributes;
//         } catch (error) {
//             return {};
//         }
//     }

//     enrichElementData(element, parentPath = '') {
//         const enriched = {
//             id: this.safeStringTrim(element.id || element.elementId || element.compId),
//             className: this.safeStringTrim(element.className || element.class || element.cssClass),
//             dataTestId: this.safeStringTrim(element.dataTestId || element['data-test-id'] || element.testId || element['data-testid']),
//             dataMeshId: this.safeStringTrim(element.dataMeshId || element['data-mesh-id'] || element.meshId),
//             styles: element.styles || element.style || element.css || {},
//             html: this.safeStringTrim(element.html || element.innerHTML || element.outerHTML),
//             path: element.path || parentPath,
//             parentId: element.parentId || '',
//             tagName: element.tagName || element.tag || '',
//             textContent: this.safeStringTrim(element.textContent || element.text || element.innerText || ''),
//             originalIndex: this.elementIndex++
//         };

//         if (enriched.html) {
//             const htmlAttrs = this.extractAttributesFromHtml(enriched.html);
//             if (!enriched.id && htmlAttrs.id) enriched.id = htmlAttrs.id;
//             if (!enriched.className && htmlAttrs.className) enriched.className = htmlAttrs.className;
//             if (!enriched.dataMeshId && htmlAttrs.dataMeshId) enriched.dataMeshId = htmlAttrs.dataMeshId;
//             if (!enriched.dataTestId && htmlAttrs.dataTestId) enriched.dataTestId = htmlAttrs.dataTestId;
//         }

//         return enriched;
//     }

//     createElementSignature(element) {
//         const parts = [];
//         if (element.id) parts.push(`id:${element.id}`);
//         if (element.dataMeshId) parts.push(`mesh:${element.dataMeshId}`);
//         if (element.dataTestId) parts.push(`test:${element.dataTestId}`);
//         if (element.className) parts.push(`class:${element.className}`);
//         if (element.textContent) parts.push(`text:${element.textContent.substring(0,20)}`);
//         if (element.tagName) parts.push(`tag:${element.tagName}`);
//         parts.push(`idx:${element.originalIndex}`);
//         return parts.join('|');
//     }

//     escapeCSSValue(value) {
//         if (!value || typeof value !== 'string') return '';
//         return value
//             .replace(/\\/g, '\\\\')
//             .replace(/"/g, '\\"')
//             .replace(/'/g, "\\'")
//             .replace(/\n/g, '\\n')
//             .replace(/\r/g, '\\r')
//             .replace(/\t/g, '\\t');
//     }

//     isValidCSSSelector(selector) {
//         if (!selector || typeof selector !== 'string' || selector.trim() === '') return false;
//         if (selector.includes('[]') || selector.includes('""') || selector.includes("''")) return false;
//         const openBrackets = (selector.match(/\[/g) || []).length;
//         const closeBrackets = (selector.match(/\]/g) || []).length;
//         if (openBrackets !== closeBrackets) return false;
//         try {
//             const testHtml = '<div></div>';
//             const testCheerio = require('cheerio').load(testHtml);
//             testCheerio(selector);
//             return true;
//         } catch (error) {
//             return false;
//         }
//     }

//     safeQuerySelector($, selector, description = '') {
//         if (!this.isValidCSSSelector(selector)) return $();
//         try {
//             return $(selector);
//         } catch (error) {
//             return $();
//         }
//     }

//     findPreciseMatch($, element) {
//         let candidates = [];
        
//         if (element.id && element.id.trim()) {
//             const escapedId = this.escapeCSSValue(element.id);
//             const idSelector = `#${escapedId}`;
//             const idMatches = this.safeQuerySelector($, idSelector, 'for ID');
//             if (idMatches.length === 1) {
//                 return { element: idMatches.first(), confidence: 100, method: 'unique-id' };
//             } else if (idMatches.length > 1) {
//                 candidates = candidates.concat(
//                     idMatches.toArray().map((el, idx) => ({
//                         element: $(el),
//                         confidence: 90 - idx,
//                         method: 'id-with-disambiguation'
//                     }))
//                 );
//             }
//         }
        
//         if (element.dataMeshId && element.dataMeshId.trim()) {
//             const escapedMeshId = this.escapeCSSValue(element.dataMeshId);
//             const meshSelector = `[data-mesh-id="${escapedMeshId}"]`;
//             const meshMatches = this.safeQuerySelector($, meshSelector, 'for data-mesh-id');
//             if (meshMatches.length === 1) {
//                 return { element: meshMatches.first(), confidence: 95, method: 'unique-mesh-id' };
//             } else if (meshMatches.length > 1) {
//                 candidates = candidates.concat(
//                     meshMatches.toArray().map((el, idx) => ({
//                         element: $(el),
//                         confidence: 85 - idx,
//                         method: 'mesh-id-with-disambiguation'
//                     }))
//                 );
//             }
//         }
        
//         if (element.dataTestId && element.dataTestId.trim()) {
//             const escapedTestId = this.escapeCSSValue(element.dataTestId);
//             const testIdSelectors = [
//                 `[data-testid="${escapedTestId}"]`,
//                 `[data-test-id="${escapedTestId}"]`
//             ];
//             for (const selector of testIdSelectors) {
//                 const testMatches = this.safeQuerySelector($, selector, 'for data-testid');
//                 if (testMatches.length === 1) {
//                     return { element: testMatches.first(), confidence: 80, method: 'unique-test-id' };
//                 } else if (testMatches.length > 1) {
//                     candidates = candidates.concat(
//                         testMatches.toArray().map((el, idx) => ({
//                             element: $(el),
//                             confidence: 70 - idx,
//                             method: 'test-id-with-disambiguation'
//                         }))
//                     );
//                 }
//             }
//         }
        
//         if (element.className && element.className.trim()) {
//             const classes = element.className.split(' ').filter(c => c.trim());
//             for (const className of classes) {
//                 if (!className.match(/^[a-zA-Z_-][a-zA-Z0-9_-]*$/)) continue;
//                 const classSelector = `.${className}`;
//                 const classMatches = this.safeQuerySelector($, classSelector, `for class ${className}`);
//                 if (classMatches.length > 0) {
//                     classMatches.each((idx, el) => {
//                         const $el = $(el);
//                         let contextScore = 0;
//                         if (element.textContent && $el.text().trim() === element.textContent) contextScore += 30;
//                         if (element.tagName && $el.get(0).tagName.toLowerCase() === element.tagName.toLowerCase()) contextScore += 20;
//                         if (element.parentId && element.parentId.trim()) {
//                             const escapedParentId = this.escapeCSSValue(element.parentId);
//                             const parentSelector = `#${escapedParentId}`;
//                             if (this.isValidCSSSelector(parentSelector)) {
//                                 const parent = $el.closest(parentSelector);
//                                 if (parent.length > 0) contextScore += 25;
//                             }
//                         }
//                         candidates.push({
//                             element: $el,
//                             confidence: 40 + contextScore - idx,
//                             method: `class-context-${className}`
//                         });
//                       });
//                 }
//             }
//         }
        
//         candidates.sort((a, b) => b.confidence - a.confidence);
//         if (candidates.length > 0) return candidates[0];
//         return null;
//     }

//     applyStylesToElement($, element, styleString) {
//         const elementSignature = this.createElementSignature(element);
//         if (this.processedElements.has(elementSignature)) {
//             return { success: false, reason: 'already-processed' };
//         }
//         const match = this.findPreciseMatch($, element);
//         if (!match) return { success: false, reason: 'no-match-found' };
//         const $targetElement = match.element;
//         if ($targetElement.get(0).tagName && $targetElement.get(0).tagName.toLowerCase() === 'html') {
//             return { success: false, reason: 'html-element-skipped' };
//         }
//         const existingStyle = $targetElement.attr('style') || '';
//         const existingStyles = existingStyle ? existingStyle.split(';').map(s => s.trim()).filter(s => s) : [];
//         const newStyles = styleString.split(';').map(s => s.trim()).filter(s => s);
//         const styleMap = new Map();
//         existingStyles.forEach(style => {
//             const [prop, value] = style.split(':').map(s => s.trim());
//             if (prop && value) styleMap.set(prop, value);
//         });
//         newStyles.forEach(style => {
//             const [prop, value] = style.split(':').map(s => s.trim());
//             if (prop && value) styleMap.set(prop, value);
//         });
//         const finalStyle = Array.from(styleMap.entries())
//             .map(([prop, value]) => `${prop}: ${value}`)
//             .join('; ');
//         $targetElement.attr('style', finalStyle);
//         this.processedElements.add(elementSignature);
//         return { success: true, method: match.method, confidence: match.confidence };
//     }

//     extractElements(layoutData) {
//         let elements = [];
//         const findElements = (obj, path = '', parentId = '') => {
//             if (obj === null || typeof obj !== 'object') return;
//             if (Array.isArray(obj)) {
//                 obj.forEach((item, index) => {
//                     findElements(item, `${path}[${index}]`, parentId);
//                 });
//                 return;
//             }
//             const hasStyleInfo = obj.styles || obj.className || obj.id || obj.dataTestId || obj['data-test-id'];
//             const hasLayoutInfo = obj.type || obj.tag || obj.tagName || obj.element || obj.component || obj.html;
//             if (hasStyleInfo || hasLayoutInfo) {
//                 const element = this.enrichElementData({
//                     ...obj,
//                     path: path,
//                     parentId: parentId
//                 });
//                 if (element.styles && Object.keys(element.styles).length > 0 &&
//                     (element.id || element.className || element.dataTestId || element.dataMeshId || element.html)) {
//                     elements.push(element);
//                 }
//             }
//             const currentId = obj.id || obj.elementId || obj.compId || parentId;
//             for (const [key, value] of Object.entries(obj)) {
//                 if (typeof value === 'object' && value !== null) {
//                     findElements(value, `${path}.${key}`, currentId);
//                 }
//             }
//         };
//         findElements(layoutData);
//         return elements;
//     }

//     async processHtml(rawHtml, layoutJson, outputDir, sectionIndex) {
//         const $ = cheerio.load(rawHtml);
//         const elements = this.extractElements(layoutJson);
//         if (elements.length === 0) {
//             return {
//                 styledHtml: this.formatCleanHtml(rawHtml),
//                 layoutInlineFile: null
//             };
//         }
//         let successCount = 0;
//         let failureCount = 0;
//         elements.sort((a, b) => {
//             let scoreA = 0, scoreB = 0;
//             if (a.id) scoreA += 100;
//             if (b.id) scoreB += 100;
//             if (a.dataMeshId) scoreA += 50;
//             if (b.dataMeshId) scoreB += 50;
//             if (a.dataTestId) scoreA += 30;
//             if (b.dataTestId) scoreB += 30;
//             return scoreA === scoreB ? a.originalIndex - b.originalIndex : scoreB - scoreA;
//         });
//         elements.forEach((element) => {
//             if (!element.styles || Object.keys(element.styles).length === 0) return;
//             const styleString = this.styleObjectToString(element.styles);
//             const result = this.applyStylesToElement($, element, styleString);
//             result.success ? successCount++ : failureCount++;
//         });
//         const styledHtml = this.formatCleanHtml($.html());
//         const layoutInlineFile = `layout_inlineStyles_${sectionIndex}.html`;
//         await fs.writeFile(path.join(outputDir, layoutInlineFile), styledHtml);
//         return {
//             styledHtml,
//             layoutInlineFile
//         };
//     }

//     formatCleanHtml(html) {
//         const $ = cheerio.load(html);
//         $('style').remove();
//         let cleanHtml = $.html();
//         if (!cleanHtml.includes('<!DOCTYPE html>')) {
//             cleanHtml = '<!DOCTYPE html>\n' + cleanHtml;
//         }
//         return cleanHtml
//             .replace(/>\s*</g, '>\n<')
//             .replace(/\n\s*\n/g, '\n')
//             .split('\n')
//             .map(line => line.trim())
//             .filter(line => line.length > 0)
//             .join('\n');
//     }
// }

// // Process HTML and extract components with nested JSON structure and attribute placeholders
// async function processHtmlAndExtractComponents(fullPageHtml, computedStyles, outputDir) {
//     console.log('📁 Creating components directory...');
//     const componentsDir = path.join(outputDir, 'components');
//     await fs.mkdir(componentsDir, { recursive: true });
    
//     const $ = cheerio.load(fullPageHtml);
//     console.log('✅ HTML loaded into Cheerio for processing');
    
//     const extractedComponents = [];
//     let placeholderCounter = 1;
    
//     // Target IDs to extract
//     const targetIds = ['BACKGROUND_GROUP', 'pinnedTopLeft', 'pinnedTopRight', 'pinnedBottomLeft'];
    
//     console.log('🎯 Processing target IDs...');
    
//     // Function to create nested JSON structure with children
//     function createNestedElementStructure(element, computedStyles) {
//         const $element = $(element);
//         const elementId = $element.attr('id') || '';
//         const className = $element.attr('class') || '';
//         const tagName = element.tagName.toLowerCase();
        
//         // Get styles for this element from the computed styles data
//         console.log(`🎯 Processing element: ${tagName}${elementId ? '#' + elementId : ''}`);
//         const elementStyles = getElementStyles(elementId, computedStyles);
//         console.log(`📊 Styles found: ${Object.keys(elementStyles).length} properties`);
        
//         // Create base structure
//         const elementStructure = {
//             tag: tagName.toUpperCase(),
//             id: elementId,
//             className: className,
//             html: $.html($element),
//             styles: elementStyles,
//             children: []
//         };
        
//         // Process direct children only (not all descendants)
//         $element.children().each((index, child) => {
//             const childStructure = createNestedElementStructure(child, computedStyles);
//             elementStructure.children.push(childStructure);
//         });
        
//         console.log(`✅ Element processed: ${elementId || 'unnamed'} - ${elementStructure.children.length} children, ${Object.keys(elementStyles).length} styles`);
//         return elementStructure;
//     }
    
//     // Helper function to extract styles from computed styles data
//     function getElementStyles(elementId, computedStyles) {
//         console.log(`🔍 Looking for styles for element: ${elementId}`);
        
//         // Strategy 1: Direct key match (your JSON structure)
//         if (computedStyles[elementId] && computedStyles[elementId].styles) {
//             console.log(`✅ Found styles for ${elementId} via direct key match`);
//             return computedStyles[elementId].styles;
//         }
        
//         // Strategy 2: Check if it's wrapped in elements object
//         if (computedStyles.elements && computedStyles.elements[elementId]) {
//             console.log(`✅ Found styles for ${elementId} via elements wrapper`);
//             return computedStyles.elements[elementId].styles || {};
//         }
        
//         // Strategy 3: Recursive search through nested structure
//         function searchNested(obj, targetId) {
//             if (!obj || typeof obj !== 'object') return null;
            
//             // Check current level
//             if (obj.id === targetId && obj.styles) {
//                 return obj.styles;
//             }
            
//             // Check children array
//             if (obj.children && Array.isArray(obj.children)) {
//                 for (const child of obj.children) {
//                     const found = searchNested(child, targetId);
//                     if (found) return found;
//                 }
//             }
            
//             // Check all object properties
//             for (const key in obj) {
//                 if (key !== 'children' && typeof obj[key] === 'object') {
//                     const found = searchNested(obj[key], targetId);
//                     if (found) return found;
//                 }
//             }
            
//             return null;
//         }
        
//         const nestedResult = searchNested(computedStyles, elementId);
//         if (nestedResult) {
//             console.log(`✅ Found styles for ${elementId} via nested search`);
//             return nestedResult;
//         }
        
//         // Strategy 4: Search by any key that contains the element
//         for (const key in computedStyles) {
//             const item = computedStyles[key];
//             if (item && typeof item === 'object') {
//                 if (item.id === elementId && item.styles) {
//                     console.log(`✅ Found styles for ${elementId} via ID property match`);
//                     return item.styles;
//                 }
//             }
//         }
        
//         console.log(`❌ No styles found for element: ${elementId}`);
//         return {};
//     }
    
//     // Process each target ID
//     for (const targetId of targetIds) {
//         const $element = $('#' + targetId);
//         if ($element.length > 0) {
//             console.log(`✅ Found target ID: ${targetId}`);
            
//             // Generate placeholder ID
//             const placeholderId = `wigoh-id-${String(placeholderCounter).padStart(3, '0')}`;
//             placeholderCounter++;
            
//             // Add placeholder attribute to the element in extracted HTML
//             $element.attr('wig-id', `{{${placeholderId}}}`);
            
//             // Extract the component HTML with placeholder attribute
//             const componentHtml = $.html($element);
            
//             // Create nested JSON structure
//             const nestedStructure = createNestedElementStructure($element[0], computedStyles);
            
//             // Save component HTML file
//             const componentFilename = `${placeholderId}_${targetId}.html`;
//             const componentPath = path.join(componentsDir, componentFilename);
            
//             const cleanComponentHtml = createCleanComponentHTML(componentHtml, targetId, placeholderId);
//             await fs.writeFile(componentPath, cleanComponentHtml, 'utf8');
//             console.log(`📄 Component saved: components/${componentFilename}`);
            
//             // Save nested JSON structure
//             const jsonFilename = `${placeholderId}_${targetId}.json`;
//             const jsonPath = path.join(componentsDir, jsonFilename);
            
//             // Create the final JSON structure with the element ID as the key
//             const finalJsonStructure = {};
//             finalJsonStructure[targetId] = nestedStructure;
            
//             await fs.writeFile(jsonPath, JSON.stringify(finalJsonStructure, null, 2), 'utf8');
//             console.log(`📊 Nested JSON saved: components/${jsonFilename}`);
            
//             // Replace element in original HTML with placeholder
//             $element.replaceWith(`{{${placeholderId}}}`);
//             console.log(`🔄 Replaced ${targetId} with {{${placeholderId}}} in original HTML`);
            
//             extractedComponents.push({
//                 placeholderId: placeholderId,
//                 originalId: targetId,
//                 type: 'target-id',
//                 found: true,
//                 componentFile: `components/${componentFilename}`,
//                 jsonFile: `components/${jsonFilename}`,
//                 childrenCount: nestedStructure.children.length
//             });
            
//         } else {
//             console.log(`❌ Target ID not found: ${targetId}`);
            
//             const placeholderId = `wigoh-id-${String(placeholderCounter).padStart(3, '0')}`;
//             placeholderCounter++;
            
//             // Create not found component file
//             const componentFilename = `${placeholderId}_${targetId}_notfound.html`;
//             const componentPath = path.join(componentsDir, componentFilename);
            
//             const notFoundHtml = createNotFoundComponentHTML(targetId, placeholderId);
//             await fs.writeFile(componentPath, notFoundHtml, 'utf8');
//             console.log(`📄 Not found component created: components/${componentFilename}`);
            
//             // Create empty JSON structure
//             const jsonFilename = `${placeholderId}_${targetId}.json`;
//             const jsonPath = path.join(componentsDir, jsonFilename);
            
//             const emptyJsonStructure = {};
//             emptyJsonStructure[targetId] = {
//                 tag: "DIV",
//                 id: targetId,
//                 className: "",
//                 html: `<div id="${targetId}" class="not-found-component" wig-id="{{${placeholderId}}}">Component not found</div>`,
//                 styles: {},
//                 children: []
//             };
            
//             await fs.writeFile(jsonPath, JSON.stringify(emptyJsonStructure, null, 2), 'utf8');
//             console.log(`📊 Empty JSON saved: components/${jsonFilename}`);
            
//             extractedComponents.push({
//                 placeholderId: placeholderId,
//                 originalId: targetId,
//                 type: 'target-id',
//                 found: false,
//                 componentFile: `components/${componentFilename}`,
//                 jsonFile: `components/${jsonFilename}`,
//                 childrenCount: 0
//             });
//         }
//     }
    
//     console.log('🗂️ Processing section elements...');
    
//     // Process only TOP-LEVEL sections (not nested ones)
//     const processedSections = new Set();
    
//     // Use a for loop instead of .each to allow async/await
//     const sectionElements = $('section').toArray();
//     for (let index = 0; index < sectionElements.length; index++) {
//         const element = sectionElements[index];
//         const $section = $(element);
//         const sectionId = $section.attr('id') || `section_${index + 1}`;
        
//         // Skip if this section is nested inside another section that we've already processed
//         const isNested = $section.parents('section').length > 0;
//         if (isNested) {
//             console.log(`⏭️ Skipping nested section: ${sectionId} (will be included with parent)`);
//             continue;
//         }
        
//         if (processedSections.has(sectionId)) {
//             console.log(`⏭️ Skipping already processed section: ${sectionId}`);
//             continue;
//         }
        
//         console.log(`✅ Found top-level section: ${sectionId}`);
//         processedSections.add(sectionId);
        
//         // Generate placeholder ID
//         const placeholderId = `wigoh-id-${String(placeholderCounter).padStart(3, '0')}`;
//         placeholderCounter++;
        
//         // Add placeholder attribute to the section in extracted HTML
//         $section.attr('wig-id', `{{${placeholderId}}}`);
        
//         // Extract the section HTML (includes all nested content)
//         const sectionHtml = $.html($section);
        
//         // Create nested JSON structure for section
//         const nestedStructure = createNestedElementStructure($section[0], computedStyles);
        
//         // Save section HTML file
//         const componentFilename = `${placeholderId}_${sectionId}.html`;
//         const componentPath = path.join(componentsDir, componentFilename);
        
//         const cleanSectionHtml = createCleanComponentHTML(sectionHtml, sectionId, placeholderId);
//         await fs.writeFile(componentPath, cleanSectionHtml, 'utf8');
//         console.log(`📄 Section saved: components/${componentFilename}`);
        
//         // Save nested JSON structure for section
//         const jsonFilename = `${placeholderId}_${sectionId}.json`;
//         const jsonPath = path.join(componentsDir, jsonFilename);
        
//         // Create the final JSON structure with the section ID as the key
//         const finalJsonStructure = {};
//         finalJsonStructure[sectionId] = nestedStructure;
        
//         await fs.writeFile(jsonPath, JSON.stringify(finalJsonStructure, null, 2), 'utf8');
//         console.log(`📊 Section nested JSON saved: components/${jsonFilename}`);
        
//         // Replace section in original HTML with placeholder
//         $section.replaceWith(`{{${placeholderId}}}`);
//         console.log(`🔄 Replaced section ${sectionId} with {{${placeholderId}}} in original HTML`);
        
//         extractedComponents.push({
//             placeholderId: placeholderId,
//             originalId: sectionId,
//             type: 'section',
//             found: true,
//             componentFile: `components/${componentFilename}`,
//             jsonFile: `components/${jsonFilename}`,
//             childrenCount: nestedStructure.children.length
//         });
//     }
    
//     // Clean the HTML - remove scripts, styles, and keep only body content
//     console.log('🧹 Cleaning HTML - removing scripts, styles, and non-body content...');
    
//     // Remove all script tags
//     $('script').remove();
    
//     // Remove all style tags
//     $('style').remove();
    
//     // Remove link tags that reference stylesheets
//     $('link[rel="stylesheet"]').remove();
    
//     // Remove meta tags
//     $('meta').remove();
    
//     // Remove title tag
//     $('title').remove();
    
//     // Remove header and footer
//     $('header').remove();
//     $('footer').remove();

//     $('#soapAfterPagesContainer').remove();
    
//     // Get only body content
//     let bodyContent = '';
//     if ($('body').length > 0) {
//         bodyContent = $('body').html() || '';
//     } else {
//         // If no body tag, get all remaining content
//         bodyContent = $.html();
//     }
    
//     // Create clean HTML structure with only the body content and placeholders
//     const cleanHtmlStructure = `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Extracted Content with Placeholders</title>
// </head>
// <body>
// ${bodyContent}
// </body>
// </html>`;
    
//     // Save the original HTML with placeholders
//     const originalHtmlFilename = 'original_with_placeholders.html';
//     const originalHtmlPath = path.join(outputDir, originalHtmlFilename);
    
//     await fs.writeFile(originalHtmlPath, cleanHtmlStructure, 'utf8');
//     console.log(`📄 Clean HTML with placeholders saved: ${originalHtmlFilename}`);
    
//     return {
//         extractedComponents: extractedComponents,
//         originalHtmlFile: originalHtmlFilename
//     };
// }

// // Create clean component HTML
// function createCleanComponentHTML(componentHtml, originalId, placeholderId) {
//     return `<!DOCTYPE html>
// <html lang="en">

// <body>

    
// ${componentHtml}

// </body>
// </html>`;
// }

// // Create not found component HTML
// function createNotFoundComponentHTML(originalId, placeholderId) {
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Component Not Found: ${placeholderId} (${originalId})</title>
//     <style>
//         .not-found-component {
//             padding: 20px;
//             border: 2px dashed #ccc;
//             margin: 10px;
//             text-align: center;
//             background-color: #f9f9f9;
//         }
//     </style>
// </head>
// <body>
//     <!-- Component Not Found: ${originalId} -->
//     <!-- Placeholder ID: ${placeholderId} -->
//     <!-- Create your custom implementation for this component -->
    
//     <div id="${originalId}" class="not-found-component" wig-id="{{${placeholderId}}}">
//         <h2>Component Not Found: ${originalId}</h2>
//         <p>Placeholder ID: ${placeholderId}</p>
//         <p>This component was not found in the original page.</p>
//         <p>Create your custom implementation here.</p>
        
//         <div class="content-area">
//             <!-- Add your ${originalId} content here -->
//         </div>
//     </div>

// </body>
// </html>`;
// }

// // Health check endpoint
// app.get('/health', (req, res) => {
//     res.json({ 
//         status: 'OK', 
//         timestamp: new Date().toISOString(),
//         version: '6.0.0-dual-url-fetch'
//     });
// });

// // Start server
// app.listen(PORT, () => {
//     console.log('\n🚀 HTML COMPONENT EXTRACTOR V6.0 (DUAL URL FETCH)');
//     console.log('═══════════════════════════════════════════════════════════════════════════');
//     console.log(`🌐 Server URL: http://localhost:${PORT}`);
//     console.log(`📅 Started at: ${new Date().toISOString()}`);
//     console.log('\n✨ NEW FEATURES:');
//     console.log('   ✅ Dual URL input: separate HTML and computed styles sources');
//     console.log('   ✅ Body content only extraction from HTML URL');
//     console.log('   ✅ Computed styles from dedicated JSON URL');
//     console.log('   ✅ Nested JSON structure with children array');
//     console.log('   ✅ Attribute placeholders: wig-id="{{wigoh-id-001}}" inside parent tags');
//     console.log('   ✅ Flexible computed styles structure support');
//     console.log('   ✅ Enhanced HTML Style Processor for better style matching');
//     console.log('\n📁 INPUT REQUIREMENTS:');
//     console.log('   - HTML URL: Any URL returning HTML content (body elements will be extracted)');
//     console.log('   - Styles JSON URL: URL returning computed styles in JSON format');
//     console.log('\n📁 OUTPUT FILES:');
//     console.log('   - original_with_placeholders.html (with {{wigoh-id-001}} placeholders)');
//     console.log('   - components/wigoh-id-001_BACKGROUND_GROUP.html (with wig-id attribute)');
//     console.log('   - components/wigoh-id-001_BACKGROUND_GROUP.json (nested structure)');
//     console.log('   - components/wigoh-id-002_section_1.html');
//     console.log('   - components/wigoh-id-002_section_1.json');
//     console.log('   - layout_inlineStyles_0.html (with styles applied)');
//     console.log('\n📊 JSON STRUCTURE:');
//     console.log('   {');
//     console.log('     "SITE_CONTAINER": {');
//     console.log('       "tag": "DIV",');
//     console.log('       "id": "SITE_CONTAINER",');
//     console.log('       "className": "",');
//     console.log('       "html": "<div id=\\"SITE_CONTAINER\\" wig-id=\\"{{wigoh-id-001}}\\"...",');
//     console.log('       "styles": {');
//     console.log('         "block-size": "5188px",');
//     console.log('         "height": "5188px",');
//     console.log('         "position": "relative"');
//     console.log('       },');
//     console.log('       "children": [');
//     console.log('         {');
//     console.log('           "tag": "DIV",');
//     console.log('           "id": "main_MF",');
//     console.log('           "className": "main_MF",');
//     console.log('           "styles": { ... },');
//     console.log('           "children": [ ... ]');
//     console.log('         }');
//     console.log('       ]');
//     console.log('     }');
//     console.log('   }');
//     console.log('\n🎯 Targeting:');
//     console.log('   - Specific IDs: BACKGROUND_GROUP, pinnedTopLeft, pinnedTopRight, pinnedBottomLeft');
//     console.log('   - Top-level section elements only (includes all nested content)');
//     console.log('═══════════════════════════════════════════════════════════════════════════\n');
// });

// // Error handling
// app.on('error', (error) => {
//     console.error('\n❌ SERVER ERROR:', error);
// });

// process.on('uncaughtException', (error) => {
//     console.error('\n❌ UNCAUGHT EXCEPTION:', error);
//     console.log('Server will continue running...\n');
// });

// process.on('unhandledRejection', (reason, promise) => {
//     console.error('\n❌ UNHANDLED PROMISE REJECTION:', reason);
//     console.log('Server will continue running...\n');
// });

// process.on('SIGINT', () => {
//     console.log('\nShutting down server gracefully...');
//     process.exit(0);
// });

// process.on('SIGTERM', () => {
//     console.log('\nShutting down server gracefully...');
//     process.exit(0);
// });