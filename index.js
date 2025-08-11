// const express = require('express');
// const puppeteer = require('puppeteer');
// const fs = require('fs').promises;
// const path = require('path');
// const cheerio = require('cheerio');

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

// // Migration endpoint
// app.post('/migrate', async (req, res) => {
//     console.log('\n=== MIGRATION REQUEST RECEIVED ===');
//     console.log('Request body:', req.body);
//     console.log('Request headers:', req.headers);
    
//     const { url } = req.body;
    
//     if (!url) {
//         console.error('❌ ERROR: No URL provided in request body');
//         return res.status(400).json({ error: 'URL is required' });
//     }
    
//     console.log(`✅ Starting migration for: ${url}`);
//     console.log(`📊 Request timestamp: ${new Date().toISOString()}`);
    
//     let browser;
//     try {
        
//         // Launch Puppeteer with better settings
//         browser = await puppeteer.launch({
//             headless: 'new',
//             args: [
//                 '--no-sandbox', 
//                 '--disable-setuid-sandbox',
//                 '--disable-dev-shm-usage',
//                 '--disable-accelerated-2d-canvas',
//                 '--no-first-run',
//                 '--no-zygote',
//                 '--disable-gpu'
//             ]
//         });
        
//         const page = await browser.newPage();
        
//         // Set viewport and user agent
//         await page.setViewport({ width: 1920, height: 1080 });
//         await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
//         // Navigate to the URL with better error handling
//         await page.goto(url, { 
//             waitUntil: ['networkidle0', 'domcontentloaded'],
//             timeout: 60000 
//         });
        
//         // Wait for dynamic content to load
//         await page.waitForTimeout(3000);
        
//         // Get clean HTML content (body only, no scripts/styles)
//         console.log('📄 Extracting clean HTML content (body only)...');
//         let htmlContent = '';
//         try {
//             htmlContent = await page.evaluate(() => {
//                 // Remove all script and style tags
//                 const scripts = document.querySelectorAll('script');
//                 const styles = document.querySelectorAll('style');
//                 const links = document.querySelectorAll('link[rel="stylesheet"]');
                
//                 scripts.forEach(script => script.remove());
//                 styles.forEach(style => style.remove());
//                 links.forEach(link => link.remove());
                
//                 // Get only the body content
//                 const body = document.body;
//                 if (body) {
//                     return body.outerHTML;
//                 } else {
//                     // Fallback to documentElement if no body
//                     return document.documentElement.innerHTML;
//                 }
//             });
//             console.log(`✅ Clean HTML extracted (${htmlContent.length} characters, body only)`);
//         } catch (htmlError) {
//             console.warn('⚠️  HTML extraction had issues, getting basic HTML...');
//             htmlContent = await page.content();
//             console.log(`✅ Basic HTML extracted (${htmlContent.length} characters)`);
//         }
        
//         // Get computed styles with proper formatting and error handling
//         console.log('🎨 Extracting computed styles...');
//         let computedStyles;
//         try {
//             computedStyles = await page.evaluate(() => {
            
//             // Function to extract element tree with styles
//             function extractElementTree(element, depth = 0) {
//                 if (!element || !element.tagName) return null;
                
//                 try {
//                     const computedStyle = window.getComputedStyle(element);
                    
//                     // Get element information
//                     const tagName = element.tagName;
//                     let elementId = element.id || '';
//                     let classNames = '';
                    
//                     // Handle className for different element types
//                     if (element.className) {
//                         if (typeof element.className === 'string') {
//                             classNames = element.className;
//                         } else if (element.className.baseVal !== undefined) {
//                             // SVG elements
//                             classNames = element.className.baseVal || '';
//                         } else if (element.className.toString) {
//                             classNames = element.className.toString();
//                         }
//                     }
                    
//                     // Clean up class names
//                     const cleanClassNames = classNames.trim().replace(/\s+/g, ' ');
                    
//                     // Get ALL computed styles without any filtering
//                     const styleObj = {};
                    
//                     // Extract every single computed style property
//                     for (let i = 0; i < computedStyle.length; i++) {
//                         const property = computedStyle[i];
//                         const value = computedStyle.getPropertyValue(property);
//                         // Include ALL properties, even if they are initial, inherit, auto, none, normal
//                         if (value !== undefined && value !== null && value !== '') {
//                             styleObj[property] = value;
//                         }
//                     }
                    
//                     // Also get shorthand properties that might not be in the iteration
//                     const additionalProperties = [
//                         'all', 'animation', 'background', 'border', 'border-block', 'border-block-end',
//                         'border-block-start', 'border-bottom', 'border-color', 'border-image',
//                         'border-inline', 'border-inline-end', 'border-inline-start', 'border-left',
//                         'border-radius', 'border-right', 'border-style', 'border-top', 'border-width',
//                         'column-rule', 'columns', 'flex', 'flex-flow', 'font', 'gap', 'grid',
//                         'grid-area', 'grid-column', 'grid-row', 'grid-template', 'list-style',
//                         'margin', 'mask', 'offset', 'outline', 'overflow', 'padding', 'place-content',
//                         'place-items', 'place-self', 'scroll-margin', 'scroll-padding', 'text-decoration',
//                         'text-emphasis', 'transition', 'inset', 'inset-block', 'inset-inline'
//                     ];
                    
//                     additionalProperties.forEach(property => {
//                         try {
//                             const value = computedStyle.getPropertyValue(property);
//                             if (value !== undefined && value !== null && value !== '' && !styleObj[property]) {
//                                 styleObj[property] = value;
//                             }
//                         } catch (e) {
//                             // Some properties might not be supported in all browsers
//                         }
//                     });
                    
//                     // Get the element's HTML (outer HTML without children for clean structure)
//                     const tempElement = element.cloneNode(false);
//                     const elementHtml = tempElement.outerHTML;
                    
//                     // Create element object
//                     const elementData = {
//                         tag: tagName,
//                         id: elementId,
//                         className: cleanClassNames,
//                         html: elementHtml,
//                         styles: styleObj
//                     };
                    
//                     // Get children recursively (only direct children)
//                     const children = [];
//                     const directChildren = Array.from(element.children);
                    
//                     // Limit depth to prevent excessive nesting
//                     if (depth < 15 && directChildren.length > 0) {
//                         directChildren.forEach(child => {
//                             const childData = extractElementTree(child, depth + 1);
//                             if (childData) {
//                                 children.push(childData);
//                             }
//                         });
//                     }
                    
//                     if (children.length > 0) {
//                         elementData.children = children;
//                     }
                    
//                     return elementData;
                    
//                 } catch (error) {
//                     console.warn('Error processing element:', error.message);
//                     return null;
//                 }
//             }
            
//             // Start extraction from document.body or document.documentElement
//             const rootElement = document.body || document.documentElement;
//             const domTree = extractElementTree(rootElement);
            
//             // Get page metadata
//             const metadata = {
//                 url: window.location.href,
//                 title: document.title,
//                 extractedAt: new Date().toISOString(),
//                 viewport: {
//                     width: window.innerWidth,
//                     height: window.innerHeight
//                 },
//                 userAgent: navigator.userAgent
//             };
            
//             return {
//                 metadata: metadata,
//                 domTree: domTree,
//                 totalElements: document.querySelectorAll('*').length
//             };
//         });
//         console.log(`✅ DOM tree extracted with ${computedStyles.totalElements} total elements`);
//         } catch (styleError) {
//             console.warn('⚠️  Style extraction had issues, creating minimal structure...');
//             computedStyles = {
//                 metadata: {
//                     url: url,
//                     title: 'Extraction Error',
//                     extractedAt: new Date().toISOString(),
//                     viewport: { width: 1920, height: 1080 },
//                     userAgent: 'Chrome/120.0.0.0'
//                 },
//                 domTree: {
//                     tag: 'HTML',
//                     id: '',
//                     className: '',
//                     html: '<html></html>',
//                     styles: {},
//                     children: []
//                 },
//                 totalElements: 0
//             };
//             console.log('✅ Minimal structure created due to extraction issues');
//         }
        
//         // STEP 2: Extract specific components only (no main HTML/JSON files)
//         console.log('🔄 STEP 2: Starting specific component extraction...');
//         const extractedComponents = await extractSpecificComponents(htmlContent, computedStyles, __dirname);
//         console.log(`✅ Component extraction completed: ${extractedComponents.length} components found`);
        
//         console.log('\n🎉 COMPONENT EXTRACTION COMPLETED SUCCESSFULLY!');
//         console.log('📊 Final Statistics:');
//         console.log(`   - Components extracted: ${extractedComponents.length}`);
//         console.log(`   - Target IDs found: ${extractedComponents.filter(c => c.isTargetId).length}`);
//         console.log(`   - Section elements found: ${extractedComponents.filter(c => c.isSection).length}`);
//         console.log(`   - Source URL: ${computedStyles.metadata.url}`);
//         console.log(`   - Page title: ${computedStyles.metadata.title}\n`);
        
//         res.json({
//             success: true,
//             message: 'Component extraction completed successfully',
//             stats: {
//                 componentsExtracted: extractedComponents.length,
//                 targetIds: extractedComponents.filter(c => c.isTargetId).length,
//                 sections: extractedComponents.filter(c => c.isSection).length,
//                 url: computedStyles.metadata.url,
//                 title: computedStyles.metadata.title,
//                 extractedAt: computedStyles.metadata.extractedAt
//             },
//             components: extractedComponents
//         });
        
//     } catch (error) {
//         console.error('\n❌ MIGRATION ERROR OCCURRED!');
//         console.error('📍 Error details:');
//         console.error(`   - Error type: ${error.name}`);
//         console.error(`   - Error message: ${error.message}`);
//         console.error(`   - URL being processed: ${url}`);
//         console.error(`   - Timestamp: ${new Date().toISOString()}\n`);
        
//         // More specific error handling
//         let errorResponse = {
//             error: 'Migration failed',
//             message: error.message,
//             type: error.name,
//             timestamp: new Date().toISOString()
//         };
        
//         if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
//             errorResponse.message = 'Cannot resolve domain name. Please check the URL.';
//             errorResponse.suggestion = 'Verify the URL is correct and accessible';
//         } else if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
//             errorResponse.message = 'Connection refused by the server.';
//             errorResponse.suggestion = 'Check if the website is online and accessible';
//         } else if (error.message.includes('Navigation timeout')) {
//             errorResponse.message = 'Page took too long to load (timeout after 60 seconds).';
//             errorResponse.suggestion = 'Try again or use a different URL';
//         } else if (error.message.includes('Protocol error')) {
//             errorResponse.message = 'Browser protocol error occurred.';
//             errorResponse.suggestion = 'The page might have issues with automation tools';
//         }
        
//         res.status(500).json(errorResponse);
//     } finally {
//         if (browser) {
//             console.log('🔄 Closing browser...');
//             await browser.close();
//             console.log('✅ Browser closed successfully');
//         }
//     }
// });

// // Extract specific components function
// async function extractSpecificComponents(rawHtmlContent, computedStyles, outputDir) {
//     console.log('📁 Creating components directory in root...');
//     const componentsDir = path.join(outputDir, 'components');
//     await fs.mkdir(componentsDir, { recursive: true });
    
//     const $ = cheerio.load(rawHtmlContent);
//     console.log('✅ HTML loaded into Cheerio for parsing');
    
//     // Remove header and footer elements permanently
//     console.log('🗑️ Removing header and footer elements...');
//     $('header').remove();
//     $('footer').remove();
//     console.log('✅ Header and footer elements removed');
    
//     const extractedComponents = [];
    
//     // Target IDs to extract - EXACT IDs ONLY
//     const targetIds = ['BACKGROUND_GROUP', 'pinnedTopLeft', 'pinnedTopRight', 'pinnedBottomLeft'];
    
//     console.log('🎯 Extracting specific target IDs...');
    
//     // Extract target IDs
//     for (const targetId of targetIds) {
//         const $element = $(`#${targetId}`);
//         if ($element.length > 0) {
//             console.log(`✅ Found target ID: ${targetId}`);
            
//             // Get clean component HTML (no scripts, styles, or wrapper divs)
//             const componentHtml = $.html($element);
            
//             // Find computed styles for this component
//             const computedData = findComputedStylesById(computedStyles.domTree, targetId);
            
//             // Save component HTML file
//             const htmlFilename = `${targetId}.html`;
//             const htmlFilePath = path.join(componentsDir, htmlFilename);
            
//             const cleanComponentHtml = createCleanComponentHTML(componentHtml, targetId);
//             await fs.writeFile(htmlFilePath, cleanComponentHtml, 'utf8');
//             console.log(`📄 Component HTML saved: components/${htmlFilename}`);
            
//             // Save computed styles
//             const stylesFilename = `${targetId}_computed-styles.json`;
//             const stylesFilePath = path.join(componentsDir, stylesFilename);
            
//             const componentData = {
//                 componentInfo: {
//                     id: targetId,
//                     type: 'target-id',
//                     extractedAt: new Date().toISOString(),
//                     sourceUrl: computedStyles.metadata?.url || 'Unknown'
//                 },
//                 computedStyles: computedData
//             };
            
//             await fs.writeFile(stylesFilePath, JSON.stringify(componentData, null, 2), 'utf8');
//             console.log(`📊 Computed styles saved: components/${stylesFilename}`);
            
//             // Create placeholder file (without header/footer)
//             const placeholderFilename = `${targetId}_placeholder.html`;
//             const placeholderPath = path.join(componentsDir, placeholderFilename);
//             const placeholderHtml = createPlaceholderHTML(targetId, 'target-id');
            
//             await fs.writeFile(placeholderPath, placeholderHtml, 'utf8');
//             console.log(`📝 Placeholder created: components/${placeholderFilename}`);
            
//             extractedComponents.push({
//                 id: targetId,
//                 type: 'target-id',
//                 isTargetId: true,
//                 isSection: false,
//                 htmlFile: `components/${htmlFilename}`,
//                 stylesFile: `components/${stylesFilename}`,
//                 placeholderFile: `components/${placeholderFilename}`,
//                 found: true
//             });
//         } else {
//             console.log(`❌ Target ID not found: ${targetId}`);
            
//             // Create placeholder even if not found (without header/footer)
//             const placeholderFilename = `${targetId}_placeholder.html`;
//             const placeholderPath = path.join(componentsDir, placeholderFilename);
//             const placeholderHtml = createNotFoundPlaceholderHTML(targetId, 'target-id');
            
//             await fs.writeFile(placeholderPath, placeholderHtml, 'utf8');
//             console.log(`📝 Not found placeholder created: components/${placeholderFilename}`);
            
//             extractedComponents.push({
//                 id: targetId,
//                 type: 'target-id',
//                 isTargetId: true,
//                 isSection: false,
//                 htmlFile: null,
//                 stylesFile: null,
//                 placeholderFile: `components/${placeholderFilename}`,
//                 found: false
//             });
//         }
//     }
    
//     console.log('🗂️ Extracting section elements...');
    
//     // Extract section elements (header and footer already removed)
//     const $sections = $('section');
//     $sections.each((index, element) => {
//         const $section = $(element);
//         const sectionId = $section.attr('id') || `section_${index + 1}`;
        
//         console.log(`✅ Found section: ${sectionId}`);
        
//         // Get clean section HTML
//         const sectionHtml = $.html($section);
        
//         // Find computed styles for this section
//         const computedData = findComputedStylesById(computedStyles.domTree, sectionId);
        
//         // Save section HTML file
//         const htmlFilename = `${sectionId}.html`;
//         const htmlFilePath = path.join(componentsDir, htmlFilename);
        
//         const cleanSectionHtml = createCleanComponentHTML(sectionHtml, sectionId);
//         fs.writeFile(htmlFilePath, cleanSectionHtml, 'utf8');
//         console.log(`📄 Section HTML saved: components/${htmlFilename}`);
        
//         // Save computed styles
//         const stylesFilename = `${sectionId}_computed-styles.json`;
//         const stylesFilePath = path.join(componentsDir, stylesFilename);
        
//         const sectionData = {
//             componentInfo: {
//                 id: sectionId,
//                 type: 'section',
//                 extractedAt: new Date().toISOString(),
//                 sourceUrl: computedStyles.metadata?.url || 'Unknown'
//             },
//             computedStyles: computedData
//         };
        
//         fs.writeFile(stylesFilePath, JSON.stringify(sectionData, null, 2), 'utf8');
//         console.log(`📊 Section styles saved: components/${stylesFilename}`);
        
//         // Create placeholder file (without header/footer)
//         const placeholderFilename = `${sectionId}_placeholder.html`;
//         const placeholderPath = path.join(componentsDir, placeholderFilename);
//         const placeholderHtml = createPlaceholderHTML(sectionId, 'section');
        
//         fs.writeFile(placeholderPath, placeholderHtml, 'utf8');
//         console.log(`📝 Section placeholder created: components/${placeholderFilename}`);
        
//         extractedComponents.push({
//             id: sectionId,
//             type: 'section',
//             isTargetId: false,
//             isSection: true,
//             htmlFile: `components/${htmlFilename}`,
//             stylesFile: `components/${stylesFilename}`,
//             placeholderFile: `components/${placeholderFilename}`,
//             found: true
//         });
//     });
    
//     console.log(`✅ Component extraction completed: ${extractedComponents.length} components`);
//     return extractedComponents;
// }

// // Helper function to find computed styles by ID
// function findComputedStylesById(domTree, targetId) {
//     if (!domTree) return null;
    
//     function searchTree(node) {
//         if (!node) return null;
        
//         if (node.id === targetId) {
//             return node;
//         }
        
//         if (node.children && Array.isArray(node.children)) {
//             for (const child of node.children) {
//                 const found = searchTree(child);
//                 if (found) return found;
//             }
//         }
        
//         return null;
//     }
    
//     return searchTree(domTree);
// }

// // Helper function to create clean component HTML (no scripts, styles, wrappers)
// function createCleanComponentHTML(componentHtml, componentId) {
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Component: ${componentId}</title>
// </head>
// <body>
// ${componentHtml}
// </body>
// </html>`;
// }

// // Helper function to create placeholder HTML (without header/footer)
// function createPlaceholderHTML(componentId, componentType) {
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Placeholder: ${componentId}</title>
// </head>
// <body>
//     <!-- PLACEHOLDER: ${componentType.toUpperCase()} ${componentId} -->
//     <!-- Use this as a template for your custom implementation -->
//     <!-- Header and Footer removed as per requirements -->
    
//     <div id="${componentId}" class="placeholder-component">
//         <h2>Placeholder for ${componentId}</h2>
//         <p>This is a placeholder for the ${componentId} ${componentType}.</p>
//         <p>Replace this content with your custom implementation.</p>
        
//         <!-- Add your custom content here -->
//         <div class="content-area">
//             <!-- Your content goes here -->
//         </div>
        
//     </div>
    
//     <!-- Reference the computed styles file: ${componentId}_computed-styles.json -->
// </body>
// </html>`;
// }

// // Helper function to create not found placeholder HTML (without header/footer)
// function createNotFoundPlaceholderHTML(componentId, componentType) {
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Not Found: ${componentId}</title>
// </head>
// <body>
//     <!-- PLACEHOLDER: ${componentType.toUpperCase()} ${componentId} (NOT FOUND) -->
//     <!-- This component was not found in the original page -->
//     <!-- Header and Footer removed as per requirements -->
    
//     <div id="${componentId}" class="not-found-placeholder">
//         <h2>Component Not Found: ${componentId}</h2>
//         <p>The ${componentType} "${componentId}" was not found in the original page.</p>
//         <p>You can create your own implementation here.</p>
        
//         <!-- Add your custom content here -->
//         <div class="content-area">
//             <!-- Create your ${componentId} content here -->
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
//         version: '3.0.0'
//     });
// });

// // Start server with detailed logging
// app.listen(PORT, () => {
//     console.log('\n🚀 HTML COMPONENT EXTRACTOR V3.0 SERVER STARTED');
//     console.log('═══════════════════════════════════════');
//     console.log(`🌐 Server URL: http://localhost:${PORT}`);
//     console.log(`📅 Started at: ${new Date().toISOString()}`);
//     console.log(`🔧 Node.js version: ${process.version}`);
//     console.log(`📂 Working directory: ${__dirname}`);
//     console.log('\n✨ Features:');
//     console.log('   - Extracts EXACT target IDs: BACKGROUND_GROUP, pinnedTopLeft, pinnedTopRight, pinnedBottomLeft');
//     console.log('   - Extracts section elements only');
//     console.log('   - Clean component HTML (no scripts/styles)');
//     console.log('   - Individual computed styles files');
//     console.log('   - Placeholder HTML files (header/footer removed)');
//     console.log('   - No duplicate or wrapper divs');
//     console.log('   - Permanently removes header and footer from extraction');
//     console.log('\n🎯 Target IDs:');
//     console.log('   - BACKGROUND_GROUP');
//     console.log('   - pinnedTopLeft');
//     console.log('   - pinnedTopRight');
//     console.log('   - pinnedBottomLeft');
//     console.log('\n📝 Endpoints:');
//     console.log('   - GET  / (Main UI)');
//     console.log('   - POST /migrate (Component Extraction API)');
//     console.log('   - GET  /health (Health check)');
//     console.log('\n👉 Open your browser and navigate to the URL above');
//     console.log('═══════════════════════════════════════\n');
// });

// // Add error handling for the server itself
// app.on('error', (error) => {
//     console.error('\n❌ SERVER ERROR:');
//     console.error(error);
// });

// process.on('uncaughtException', (error) => {
//     console.error('\n❌ UNCAUGHT EXCEPTION:');
//     console.error(error);
//     console.log('Server will continue running...\n');
// });

// process.on('unhandledRejection', (reason, promise) => {
//     console.error('\n❌ UNHANDLED PROMISE REJECTION:');
//     console.error('Promise:', promise);
//     console.error('Reason:', reason);
//     console.log('Server will continue running...\n');
// });

// // Handle graceful shutdown
// process.on('SIGINT', () => {
//     console.log('\nShutting down server gracefully...');
//     process.exit(0);
// });

// process.on('SIGTERM', () => {
//     console.log('\nShutting down server gracefully...');
//     process.exit(0);
// });

// ---------------

// const express = require('express');
// const puppeteer = require('puppeteer');
// const fs = require('fs').promises;
// const path = require('path');
// const cheerio = require('cheerio');

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

// // Migration endpoint with improved error handling and timeout strategies
// app.post('/migrate', async (req, res) => {
//     console.log('\n=== MIGRATION REQUEST RECEIVED ===');
//     console.log('Request body:', req.body);
    
//     const { url } = req.body;
    
//     if (!url) {
//         console.error('❌ ERROR: No URL provided in request body');
//         return res.status(400).json({ error: 'URL is required' });
//     }
    
//     console.log(`✅ Starting migration for: ${url}`);
//     console.log(`📊 Request timestamp: ${new Date().toISOString()}`);
    
//     let browser;
//     try {
//         // Launch Puppeteer with enhanced settings for Wix sites
//         browser = await puppeteer.launch({
//             headless: 'new',
//             args: [
//                 '--no-sandbox', 
//                 '--disable-setuid-sandbox',
//                 '--disable-dev-shm-usage',
//                 '--disable-accelerated-2d-canvas',
//                 '--no-first-run',
//                 '--no-zygote',
//                 '--disable-gpu',
//                 '--disable-web-security',
//                 '--disable-features=VizDisplayCompositor',
//                 '--disable-extensions',
//                 '--disable-plugins',
//                 '--disable-images', // Faster loading by skipping images
//                 '--disable-javascript-harmony-shipping',
//                 '--disable-background-timer-throttling',
//                 '--disable-renderer-backgrounding',
//                 '--disable-backgrounding-occluded-windows'
//             ],
//             timeout: 120000 // 2 minutes for browser launch
//         });
        
//         const page = await browser.newPage();
        
//         // Set enhanced viewport and user agent for Wix compatibility
//         await page.setViewport({ width: 1920, height: 1080 });
//         await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
//         // Set longer timeouts for Wix sites
//         page.setDefaultTimeout(120000); // 2 minutes
//         page.setDefaultNavigationTimeout(120000); // 2 minutes
        
//         // Add request interception to block unnecessary resources
//         await page.setRequestInterception(true);
//         page.on('request', (req) => {
//             const resourceType = req.resourceType();
//             const url = req.url();
            
//             // Block heavy resources that aren't needed for extraction
//             if (resourceType === 'image' || 
//                 resourceType === 'font' || 
//                 resourceType === 'media' ||
//                 url.includes('analytics') ||
//                 url.includes('tracking') ||
//                 url.includes('ads') ||
//                 url.includes('facebook') ||
//                 url.includes('google-analytics') ||
//                 url.includes('googletagmanager')) {
//                 req.abort();
//             } else {
//                 req.continue();
//             }
//         });
        
//         console.log('🌐 Attempting to navigate to URL with multiple strategies...');
        
//         // Strategy 1: Try with networkidle0 (wait for all network activity to stop)
//         let navigationSuccess = false;
//         let htmlContent = '';
//         let currentStrategy = 1;
        
//         try {
//             console.log(`📊 Strategy ${currentStrategy}: Using networkidle0 with 2-minute timeout...`);
//             await page.goto(url, { 
//                 waitUntil: 'networkidle0',
//                 timeout: 120000 // 2 minutes
//             });
//             navigationSuccess = true;
//             console.log('✅ Strategy 1 successful: Page loaded with networkidle0');
//         } catch (error) {
//             console.log(`❌ Strategy ${currentStrategy} failed:`, error.message);
//             currentStrategy++;
//         }
        
//         // Strategy 2: Try with domcontentloaded only
//         if (!navigationSuccess) {
//             try {
//                 console.log(`📊 Strategy ${currentStrategy}: Using domcontentloaded only...`);
//                 await page.goto(url, { 
//                     waitUntil: 'domcontentloaded',
//                     timeout: 120000
//                 });
//                 navigationSuccess = true;
//                 console.log('✅ Strategy 2 successful: Page loaded with domcontentloaded');
//             } catch (error) {
//                 console.log(`❌ Strategy ${currentStrategy} failed:`, error.message);
//                 currentStrategy++;
//             }
//         }
        
//         // Strategy 3: Try with load event
//         if (!navigationSuccess) {
//             try {
//                 console.log(`📊 Strategy ${currentStrategy}: Using load event...`);
//                 await page.goto(url, { 
//                     waitUntil: 'load',
//                     timeout: 120000
//                 });
//                 navigationSuccess = true;
//                 console.log('✅ Strategy 3 successful: Page loaded with load event');
//             } catch (error) {
//                 console.log(`❌ Strategy ${currentStrategy} failed:`, error.message);
//                 currentStrategy++;
//             }
//         }
        
//         // Strategy 4: Last resort - no wait condition
//         if (!navigationSuccess) {
//             try {
//                 console.log(`📊 Strategy ${currentStrategy}: Last resort - no wait condition...`);
//                 await page.goto(url, { 
//                     timeout: 120000
//                 });
//                 navigationSuccess = true;
//                 console.log('✅ Strategy 4 successful: Page loaded without wait conditions');
//             } catch (error) {
//                 console.log(`❌ All navigation strategies failed. Final error:`, error.message);
//                 throw new Error(`Failed to load page after trying all strategies. Last error: ${error.message}`);
//             }
//         }
        
//         // Wait for Wix-specific elements and content to load
//         console.log('⏳ Waiting for Wix content to fully render...');
//         try {
//             // Wait for common Wix elements
//             await page.waitForSelector('body', { timeout: 30000 });
            
//             // Give extra time for Wix's dynamic content loading
//             await page.waitForTimeout(10000); // 10 seconds
            
//             // Try to wait for specific Wix indicators
//             await Promise.race([
//                 page.waitForSelector('[data-mesh-id]', { timeout: 20000 }).catch(() => {}),
//                 page.waitForSelector('.wix-site', { timeout: 20000 }).catch(() => {}),
//                 page.waitForSelector('#SITE_CONTAINER', { timeout: 20000 }).catch(() => {}),
//                 page.waitForTimeout(20000) // Fallback timeout
//             ]);
            
//             console.log('✅ Wix content appears to be loaded');
//         } catch (waitError) {
//             console.log('⚠️ Warning: Wix-specific wait failed, but continuing:', waitError.message);
//         }
        
//         // Get clean HTML content with better error handling
//         console.log('📄 Extracting clean HTML content...');
//         try {
//             htmlContent = await page.evaluate(() => {
//                 // Remove all script and style tags
//                 const scripts = document.querySelectorAll('script');
//                 const styles = document.querySelectorAll('style');
//                 const links = document.querySelectorAll('link[rel="stylesheet"]');
                
//                 scripts.forEach(script => script.remove());
//                 styles.forEach(style => style.remove());
//                 links.forEach(link => link.remove());
                
//                 // Get body content or fallback to documentElement
//                 const body = document.body;
//                 if (body && body.innerHTML.trim().length > 0) {
//                     return body.outerHTML;
//                 } else {
//                     // Fallback to documentElement if body is empty
//                     return document.documentElement.innerHTML;
//                 }
//             });
            
//             if (!htmlContent || htmlContent.trim().length === 0) {
//                 throw new Error('Extracted HTML content is empty');
//             }
            
//             console.log(`✅ Clean HTML extracted (${htmlContent.length} characters)`);
//         } catch (htmlError) {
//             console.warn('⚠️ HTML extraction had issues, trying alternative method...');
//             try {
//                 htmlContent = await page.content();
//                 console.log(`✅ Fallback HTML extracted (${htmlContent.length} characters)`);
//             } catch (fallbackError) {
//                 throw new Error(`Failed to extract HTML content: ${fallbackError.message}`);
//             }
//         }
        
//         // Get computed styles with enhanced error handling
//         console.log('🎨 Extracting computed styles...');
//         let computedStyles;
//         try {
//             computedStyles = await page.evaluate(() => {
//                 // Enhanced element tree extraction for Wix sites
//                 function extractElementTree(element, depth = 0) {
//                     if (!element || !element.tagName) return null;
                    
//                     try {
//                         const computedStyle = window.getComputedStyle(element);
                        
//                         // Get element information
//                         const tagName = element.tagName.toLowerCase();
//                         let elementId = element.id || '';
//                         let classNames = '';
                        
//                         // Handle className for different element types
//                         if (element.className) {
//                             if (typeof element.className === 'string') {
//                                 classNames = element.className;
//                             } else if (element.className.baseVal !== undefined) {
//                                 classNames = element.className.baseVal || '';
//                             } else if (element.className.toString) {
//                                 classNames = element.className.toString();
//                             }
//                         }
                        
//                         // Clean up class names
//                         const cleanClassNames = classNames.trim().replace(/\s+/g, ' ');
                        
//                         // Extract computed styles more efficiently
//                         const styleObj = {};
//                         const importantProperties = [
//                             'display', 'position', 'top', 'left', 'right', 'bottom',
//                             'width', 'height', 'margin', 'padding', 'border',
//                             'background', 'color', 'font', 'text-align', 'z-index',
//                             'opacity', 'visibility', 'overflow', 'transform'
//                         ];
                        
//                         // Get essential styles first
//                         importantProperties.forEach(property => {
//                             try {
//                                 const value = computedStyle.getPropertyValue(property);
//                                 if (value && value !== 'initial' && value !== 'auto' && value !== 'none' && value !== 'normal') {
//                                     styleObj[property] = value;
//                                 }
//                             } catch (e) {
//                                 // Skip if property not supported
//                             }
//                         });
                        
//                         // Get the element's HTML (outer HTML without children)
//                         const tempElement = element.cloneNode(false);
//                         const elementHtml = tempElement.outerHTML;
                        
//                         // Create element object
//                         const elementData = {
//                             tag: tagName,
//                             id: elementId,
//                             className: cleanClassNames,
//                             html: elementHtml,
//                             styles: styleObj
//                         };
                        
//                         // Get children recursively (limited depth for performance)
//                         const children = [];
//                         const directChildren = Array.from(element.children);
                        
//                         if (depth < 10 && directChildren.length > 0) {
//                             directChildren.forEach(child => {
//                                 const childData = extractElementTree(child, depth + 1);
//                                 if (childData) {
//                                     children.push(childData);
//                                 }
//                             });
//                         }
                        
//                         if (children.length > 0) {
//                             elementData.children = children;
//                         }
                        
//                         return elementData;
                        
//                     } catch (error) {
//                         console.warn('Error processing element:', error.message);
//                         return null;
//                     }
//                 }
                
//                 // Start extraction from document.body or document.documentElement
//                 const rootElement = document.body || document.documentElement;
//                 const domTree = extractElementTree(rootElement);
                
//                 // Get page metadata
//                 const metadata = {
//                     url: window.location.href,
//                     title: document.title || 'Untitled',
//                     extractedAt: new Date().toISOString(),
//                     viewport: {
//                         width: window.innerWidth,
//                         height: window.innerHeight
//                     },
//                     userAgent: navigator.userAgent
//                 };
                
//                 return {
//                     metadata: metadata,
//                     domTree: domTree,
//                     totalElements: document.querySelectorAll('*').length
//                 };
//             });
            
//             console.log(`✅ DOM tree extracted with ${computedStyles.totalElements} total elements`);
//         } catch (styleError) {
//             console.warn('⚠️ Style extraction had issues, creating minimal structure...');
//             computedStyles = {
//                 metadata: {
//                     url: url,
//                     title: 'Extraction with Issues',
//                     extractedAt: new Date().toISOString(),
//                     viewport: { width: 1920, height: 1080 },
//                     userAgent: 'Chrome/120.0.0.0'
//                 },
//                 domTree: {
//                     tag: 'body',
//                     id: '',
//                     className: '',
//                     html: '<body></body>',
//                     styles: {},
//                     children: []
//                 },
//                 totalElements: 0
//             };
//         }
        
//         // STEP 2: Extract specific components
//         console.log('🔄 STEP 2: Starting specific component extraction...');
//         const extractedComponents = await extractSpecificComponents(htmlContent, computedStyles, __dirname);
//         console.log(`✅ Component extraction completed: ${extractedComponents.length} components found`);
        
//         console.log('\n🎉 COMPONENT EXTRACTION COMPLETED SUCCESSFULLY!');
//         console.log('📊 Final Statistics:');
//         console.log(`   - Components extracted: ${extractedComponents.length}`);
//         console.log(`   - Target IDs found: ${extractedComponents.filter(c => c.isTargetId).length}`);
//         console.log(`   - Section elements found: ${extractedComponents.filter(c => c.isSection).length}`);
//         console.log(`   - Source URL: ${computedStyles.metadata.url}`);
//         console.log(`   - Page title: ${computedStyles.metadata.title}\n`);
        
//         res.json({
//             success: true,
//             message: 'Component extraction completed successfully',
//             navigationStrategy: `Strategy ${currentStrategy - 1} successful`,
//             stats: {
//                 componentsExtracted: extractedComponents.length,
//                 targetIds: extractedComponents.filter(c => c.isTargetId).length,
//                 sections: extractedComponents.filter(c => c.isSection).length,
//                 url: computedStyles.metadata.url,
//                 title: computedStyles.metadata.title,
//                 extractedAt: computedStyles.metadata.extractedAt,
//                 htmlContentLength: htmlContent.length
//             },
//             components: extractedComponents
//         });
        
//     } catch (error) {
//         console.error('\n❌ MIGRATION ERROR OCCURRED!');
//         console.error('📍 Error details:');
//         console.error(`   - Error type: ${error.name}`);
//         console.error(`   - Error message: ${error.message}`);
//         console.error(`   - URL being processed: ${url}`);
//         console.error(`   - Timestamp: ${new Date().toISOString()}\n`);
        
//         // Enhanced error responses with specific suggestions for Wix sites
//         let errorResponse = {
//             error: 'Migration failed',
//             message: error.message,
//             type: error.name,
//             timestamp: new Date().toISOString(),
//             isWixSite: url.includes('wixsite.com') || url.includes('wix.com')
//         };
        
//         if (error.message.includes('Navigation timeout') || error.message.includes('TimeoutError')) {
//             errorResponse.message = 'The website took too long to load (timeout after 2 minutes).';
//             errorResponse.suggestion = 'Wix sites can be slow to load. Try again, or check if the site is accessible.';
//             errorResponse.possibleCauses = [
//                 'Wix site is loading slowly due to heavy JavaScript',
//                 'Site has anti-bot protection',
//                 'Network connectivity issues',
//                 'Site is temporarily unavailable'
//             ];
//         } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
//             errorResponse.message = 'Cannot resolve domain name. Please check the URL.';
//             errorResponse.suggestion = 'Verify the URL is correct and accessible';
//         } else if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
//             errorResponse.message = 'Connection refused by the server.';
//             errorResponse.suggestion = 'Check if the website is online and accessible';
//         } else if (error.message.includes('Protocol error')) {
//             errorResponse.message = 'Browser protocol error occurred.';
//             errorResponse.suggestion = 'The Wix site might have issues with automation tools';
//         }
        
//         res.status(500).json(errorResponse);
//     } finally {
//         if (browser) {
//             console.log('🔄 Closing browser...');
//             try {
//                 await browser.close();
//                 console.log('✅ Browser closed successfully');
//             } catch (closeError) {
//                 console.log('⚠️ Warning: Error closing browser:', closeError.message);
//             }
//         }
//     }
// });

// // Extract specific components function (unchanged)
// async function extractSpecificComponents(rawHtmlContent, computedStyles, outputDir) {
//     console.log('📁 Creating components directory in root...');
//     const componentsDir = path.join(outputDir, 'components');
//     await fs.mkdir(componentsDir, { recursive: true });
    
//     const $ = cheerio.load(rawHtmlContent);
//     console.log('✅ HTML loaded into Cheerio for parsing');
    
//     // Remove header and footer elements permanently
//     console.log('🗑️ Removing header and footer elements...');
//     $('header').remove();
//     $('footer').remove();
//     console.log('✅ Header and footer elements removed');
    
//     const extractedComponents = [];
    
//     // Target IDs to extract - EXACT IDs ONLY
//     const targetIds = ['BACKGROUND_GROUP', 'pinnedTopLeft', 'pinnedTopRight', 'pinnedBottomLeft'];
    
//     console.log('🎯 Extracting specific target IDs...');
    
//     // Extract target IDs
//     for (const targetId of targetIds) {
//         const $element = $(`#${targetId}`);
//         if ($element.length > 0) {
//             console.log(`✅ Found target ID: ${targetId}`);
            
//             // Get clean component HTML
//             const componentHtml = $.html($element);
            
//             // Find computed styles for this component
//             const computedData = findComputedStylesById(computedStyles.domTree, targetId);
            
//             // Save component HTML file
//             const htmlFilename = `${targetId}.html`;
//             const htmlFilePath = path.join(componentsDir, htmlFilename);
            
//             const cleanComponentHtml = createCleanComponentHTML(componentHtml, targetId);
//             await fs.writeFile(htmlFilePath, cleanComponentHtml, 'utf8');
//             console.log(`📄 Component HTML saved: components/${htmlFilename}`);
            
//             // Save computed styles
//             const stylesFilename = `${targetId}_computed-styles.json`;
//             const stylesFilePath = path.join(componentsDir, stylesFilename);
            
//             const componentData = {
//                 componentInfo: {
//                     id: targetId,
//                     type: 'target-id',
//                     extractedAt: new Date().toISOString(),
//                     sourceUrl: computedStyles.metadata?.url || 'Unknown'
//                 },
//                 computedStyles: computedData
//             };
            
//             await fs.writeFile(stylesFilePath, JSON.stringify(componentData, null, 2), 'utf8');
//             console.log(`📊 Computed styles saved: components/${stylesFilename}`);
            
//             // Create placeholder file
//             const placeholderFilename = `${targetId}_placeholder.html`;
//             const placeholderPath = path.join(componentsDir, placeholderFilename);
//             const placeholderHtml = createPlaceholderHTML(targetId, 'target-id');
            
//             await fs.writeFile(placeholderPath, placeholderHtml, 'utf8');
//             console.log(`📝 Placeholder created: components/${placeholderFilename}`);
            
//             extractedComponents.push({
//                 id: targetId,
//                 type: 'target-id',
//                 isTargetId: true,
//                 isSection: false,
//                 htmlFile: `components/${htmlFilename}`,
//                 stylesFile: `components/${stylesFilename}`,
//                 placeholderFile: `components/${placeholderFilename}`,
//                 found: true
//             });
//         } else {
//             console.log(`❌ Target ID not found: ${targetId}`);
            
//             // Create placeholder even if not found
//             const placeholderFilename = `${targetId}_placeholder.html`;
//             const placeholderPath = path.join(componentsDir, placeholderFilename);
//             const placeholderHtml = createNotFoundPlaceholderHTML(targetId, 'target-id');
            
//             await fs.writeFile(placeholderPath, placeholderHtml, 'utf8');
//             console.log(`📝 Not found placeholder created: components/${placeholderFilename}`);
            
//             extractedComponents.push({
//                 id: targetId,
//                 type: 'target-id',
//                 isTargetId: true,
//                 isSection: false,
//                 htmlFile: null,
//                 stylesFile: null,
//                 placeholderFile: `components/${placeholderFilename}`,
//                 found: false
//             });
//         }
//     }
    
//     console.log('🗂️ Extracting section elements...');
    
//     // Extract section elements
//     const $sections = $('section');
//     $sections.each(async (index, element) => {
//         const $section = $(element);
//         const sectionId = $section.attr('id') || `section_${index + 1}`;
        
//         console.log(`✅ Found section: ${sectionId}`);
        
//         // Get clean section HTML
//         const sectionHtml = $.html($section);
        
//         // Find computed styles for this section
//         const computedData = findComputedStylesById(computedStyles.domTree, sectionId);
        
//         // Save section HTML file
//         const htmlFilename = `${sectionId}.html`;
//         const htmlFilePath = path.join(componentsDir, htmlFilename);
        
//         const cleanSectionHtml = createCleanComponentHTML(sectionHtml, sectionId);
//         await fs.writeFile(htmlFilePath, cleanSectionHtml, 'utf8');
//         console.log(`📄 Section HTML saved: components/${htmlFilename}`);
        
//         // Save computed styles
//         const stylesFilename = `${sectionId}_computed-styles.json`;
//         const stylesFilePath = path.join(componentsDir, stylesFilename);
        
//         const sectionData = {
//             componentInfo: {
//                 id: sectionId,
//                 type: 'section',
//                 extractedAt: new Date().toISOString(),
//                 sourceUrl: computedStyles.metadata?.url || 'Unknown'
//             },
//             computedStyles: computedData
//         };
        
//         await fs.writeFile(stylesFilePath, JSON.stringify(sectionData, null, 2), 'utf8');
//         console.log(`📊 Section styles saved: components/${stylesFilename}`);
        
//         // Create placeholder file
//         const placeholderFilename = `${sectionId}_placeholder.html`;
//         const placeholderPath = path.join(componentsDir, placeholderFilename);
//         const placeholderHtml = createPlaceholderHTML(sectionId, 'section');
        
//         await fs.writeFile(placeholderPath, placeholderHtml, 'utf8');
//         console.log(`📝 Section placeholder created: components/${placeholderFilename}`);
        
//         extractedComponents.push({
//             id: sectionId,
//             type: 'section',
//             isTargetId: false,
//             isSection: true,
//             htmlFile: `components/${htmlFilename}`,
//             stylesFile: `components/${stylesFilename}`,
//             placeholderFile: `components/${placeholderFilename}`,
//             found: true
//         });
//     });
    
//     console.log(`✅ Component extraction completed: ${extractedComponents.length} components`);
//     return extractedComponents;
// }

// // Helper functions remain the same
// function findComputedStylesById(domTree, targetId) {
//     if (!domTree) return null;
    
//     function searchTree(node) {
//         if (!node) return null;
        
//         if (node.id === targetId) {
//             return node;
//         }
        
//         if (node.children && Array.isArray(node.children)) {
//             for (const child of node.children) {
//                 const found = searchTree(child);
//                 if (found) return found;
//             }
//         }
        
//         return null;
//     }
    
//     return searchTree(domTree);
// }

// function createCleanComponentHTML(componentHtml, componentId) {
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Component: ${componentId}</title>
// </head>
// <body>
// ${componentHtml}
// </body>
// </html>`;
// }

// function createPlaceholderHTML(componentId, componentType) {
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Placeholder: ${componentId}</title>
// </head>
// <body>
//     <!-- PLACEHOLDER: ${componentType.toUpperCase()} ${componentId} -->
//     <div id="${componentId}" class="placeholder-component">
//         <h2>Placeholder for ${componentId}</h2>
//         <p>This is a placeholder for the ${componentId} ${componentType}.</p>
//         <p>Replace this content with your custom implementation.</p>
        
//         <div class="content-area">
//             <!-- Your content goes here -->
//         </div>
//     </div>
// </body>
// </html>`;
// }

// function createNotFoundPlaceholderHTML(componentId, componentType) {
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Not Found: ${componentId}</title>
// </head>
// <body>
//     <!-- PLACEHOLDER: ${componentType.toUpperCase()} ${componentId} (NOT FOUND) -->
//     <div id="${componentId}" class="not-found-placeholder">
//         <h2>Component Not Found: ${componentId}</h2>
//         <p>The ${componentType} "${componentId}" was not found in the original page.</p>
//         <p>You can create your own implementation here.</p>
        
//         <div class="content-area">
//             <!-- Create your ${componentId} content here -->
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
//         version: '3.1.0-wix-optimized'
//     });
// });

// // Start server
// app.listen(PORT, () => {
//     console.log('\n🚀 HTML COMPONENT EXTRACTOR V3.1 (WIX-OPTIMIZED)');
//     console.log('═══════════════════════════════════════════════');
//     console.log(`🌐 Server URL: http://localhost:${PORT}`);
//     console.log(`📅 Started at: ${new Date().toISOString()}`);
//     console.log('\n✨ NEW WIX-SPECIFIC FEATURES:');
//     console.log('   - Multiple navigation strategies for slow-loading sites');
//     console.log('   - Extended 2-minute timeouts for Wix sites');
//     console.log('   - Request interception to block heavy resources');
//     console.log('   - Enhanced error handling with Wix-specific suggestions');
//     console.log('   - Improved detection of dynamic content loading');
//     console.log('\n🎯 Still targeting the same IDs:');
//     console.log('   - BACKGROUND_GROUP, pinnedTopLeft, pinnedTopRight, pinnedBottomLeft');
//     console.log('═══════════════════════════════════════════════\n');
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

const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

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

// Migration endpoint with improved error handling and timeout strategies
app.post('/migrate', async (req, res) => {
    console.log('\n=== MIGRATION REQUEST RECEIVED ===');
    console.log('Request body:', req.body);
    
    const { url } = req.body;
    
    if (!url) {
        console.error('❌ ERROR: No URL provided in request body');
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log(`✅ Starting migration for: ${url}`);
    console.log(`📊 Request timestamp: ${new Date().toISOString()}`);
    
    let browser;
    try {
        // Launch Puppeteer with enhanced settings for Wix sites
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images',
                '--disable-javascript-harmony-shipping',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows'
            ],
            timeout: 120000
        });
        
        const page = await browser.newPage();
        
        // Set enhanced viewport and user agent for Wix compatibility
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Set longer timeouts for Wix sites
        page.setDefaultTimeout(120000);
        page.setDefaultNavigationTimeout(120000);
        
        // Add request interception to block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url();
            
            if (resourceType === 'image' || 
                resourceType === 'font' || 
                resourceType === 'media' ||
                url.includes('analytics') ||
                url.includes('tracking') ||
                url.includes('ads') ||
                url.includes('facebook') ||
                url.includes('google-analytics') ||
                url.includes('googletagmanager')) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        console.log('🌐 Attempting to navigate to URL with multiple strategies...');
        
        // Multiple navigation strategies
        let navigationSuccess = false;
        let currentStrategy = 1;
        
        const strategies = [
            { name: 'networkidle0', waitUntil: 'networkidle0' },
            { name: 'domcontentloaded', waitUntil: 'domcontentloaded' },
            { name: 'load', waitUntil: 'load' },
            { name: 'no-wait', waitUntil: undefined }
        ];
        
        for (const strategy of strategies) {
            if (navigationSuccess) break;
            
            try {
                console.log(`📊 Strategy ${currentStrategy}: Using ${strategy.name}...`);
                const gotoOptions = { timeout: 120000 };
                if (strategy.waitUntil) {
                    gotoOptions.waitUntil = strategy.waitUntil;
                }
                
                await page.goto(url, gotoOptions);
                navigationSuccess = true;
                console.log(`✅ Strategy ${currentStrategy} successful: Page loaded with ${strategy.name}`);
                break;
            } catch (error) {
                console.log(`❌ Strategy ${currentStrategy} failed:`, error.message);
                currentStrategy++;
            }
        }
        
        if (!navigationSuccess) {
            throw new Error(`Failed to load page after trying all navigation strategies`);
        }
        
        // Wait for Wix-specific elements and content to load
        console.log('⏳ Waiting for Wix content to fully render...');
        try {
            await page.waitForSelector('body', { timeout: 30000 });
            await page.waitForTimeout(10000);
            
            await Promise.race([
                page.waitForSelector('[data-mesh-id]', { timeout: 20000 }).catch(() => {}),
                page.waitForSelector('.wix-site', { timeout: 20000 }).catch(() => {}),
                page.waitForSelector('#SITE_CONTAINER', { timeout: 20000 }).catch(() => {}),
                page.waitForTimeout(20000)
            ]);
            
            console.log('✅ Wix content appears to be loaded');
        } catch (waitError) {
            console.log('⚠️ Warning: Wix-specific wait failed, but continuing:', waitError.message);
        }
        
        // Get full page HTML (before any modifications)
        console.log('📄 Extracting full page HTML...');
        let fullPageHtml = '';
        try {
            fullPageHtml = await page.content();
            console.log(`✅ Full page HTML extracted (${fullPageHtml.length} characters)`);
        } catch (htmlError) {
            throw new Error(`Failed to extract full page HTML: ${htmlError.message}`);
        }
        
        // Get computed styles from the page
        console.log('🎨 Extracting computed styles from page...');
        let computedStyles;
        try {
            computedStyles = await page.evaluate(() => {
                function extractElementWithStyles(element) {
                    if (!element || !element.tagName) return null;
                    
                    try {
                        const computedStyle = window.getComputedStyle(element);
                        const tagName = element.tagName.toLowerCase();
                        let elementId = element.id || '';
                        let classNames = '';
                        
                        if (element.className) {
                            if (typeof element.className === 'string') {
                                classNames = element.className;
                            } else if (element.className.baseVal !== undefined) {
                                classNames = element.className.baseVal || '';
                            } else if (element.className.toString) {
                                classNames = element.className.toString();
                            }
                        }
                        
                        const cleanClassNames = classNames.trim().replace(/\s+/g, ' ');
                        
                        // Extract all computed styles
                        const styleObj = {};
                        for (let i = 0; i < computedStyle.length; i++) {
                            const property = computedStyle[i];
                            const value = computedStyle.getPropertyValue(property);
                            if (value !== undefined && value !== null && value !== '') {
                                styleObj[property] = value;
                            }
                        }
                        
                        return {
                            tag: tagName,
                            id: elementId,
                            className: cleanClassNames,
                            styles: styleObj,
                            outerHTML: element.outerHTML
                        };
                        
                    } catch (error) {
                        console.warn('Error processing element:', error.message);
                        return null;
                    }
                }
                
                // Get metadata
                const metadata = {
                    url: window.location.href,
                    title: document.title || 'Untitled',
                    extractedAt: new Date().toISOString(),
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    },
                    userAgent: navigator.userAgent
                };
                
                // Extract styles for all elements with IDs
                const elementsWithStyles = {};
                document.querySelectorAll('[id]').forEach(element => {
                    const elementData = extractElementWithStyles(element);
                    if (elementData && elementData.id) {
                        elementsWithStyles[elementData.id] = elementData;
                    }
                });
                
                // Also extract styles for common class patterns
                const commonSelectors = [
                    'section', 'header', 'footer', 'nav', 'main', 'article', 'aside',
                    '.section', '.component', '.widget', '.container'
                ];
                
                commonSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach((element, index) => {
                        const elementData = extractElementWithStyles(element);
                        if (elementData) {
                            const key = elementData.id || `${selector.replace('.', '')}_${index}`;
                            if (!elementsWithStyles[key]) {
                                elementsWithStyles[key] = elementData;
                            }
                        }
                    });
                });
                
                return {
                    metadata: metadata,
                    elements: elementsWithStyles,
                    totalElements: Object.keys(elementsWithStyles).length
                };
            });
            
            console.log(`✅ Computed styles extracted for ${computedStyles.totalElements} elements`);
        } catch (styleError) {
            console.warn('⚠️ Style extraction had issues, creating minimal structure...');
            computedStyles = {
                metadata: {
                    url: url,
                    title: 'Extraction with Issues',
                    extractedAt: new Date().toISOString(),
                    viewport: { width: 1920, height: 1080 },
                    userAgent: 'Chrome/120.0.0.0'
                },
                elements: {},
                totalElements: 0
            };
        }
        
        // STEP 2: Process HTML and extract components
        console.log('🔄 STEP 2: Processing HTML and extracting components...');
        const result = await processHtmlAndExtractComponents(fullPageHtml, computedStyles, __dirname);
        
        console.log('\n🎉 COMPONENT EXTRACTION COMPLETED SUCCESSFULLY!');
        console.log('📊 Final Statistics:');
        console.log(`   - Components extracted: ${result.extractedComponents.length}`);
        console.log(`   - Target IDs found: ${result.extractedComponents.filter(c => c.found).length}`);
        console.log(`   - Original HTML with placeholders created`);
        console.log(`   - Source URL: ${computedStyles.metadata.url}`);
        console.log(`   - Page title: ${computedStyles.metadata.title}\n`);
        
        res.json({
            success: true,
            message: 'Component extraction completed successfully',
            navigationStrategy: `Strategy ${currentStrategy} successful`,
            stats: {
                componentsExtracted: result.extractedComponents.length,
                targetIdsFound: result.extractedComponents.filter(c => c.found).length,
                url: computedStyles.metadata.url,
                title: computedStyles.metadata.title,
                extractedAt: computedStyles.metadata.extractedAt,
                originalHtmlFile: result.originalHtmlFile
            },
            components: result.extractedComponents,
            originalHtmlFile: result.originalHtmlFile
        });
        
    } catch (error) {
        console.error('\n❌ MIGRATION ERROR OCCURRED!');
        console.error('📍 Error details:');
        console.error(`   - Error type: ${error.name}`);
        console.error(`   - Error message: ${error.message}`);
        console.error(`   - URL being processed: ${url}`);
        console.error(`   - Timestamp: ${new Date().toISOString()}\n`);
        
        let errorResponse = {
            error: 'Migration failed',
            message: error.message,
            type: error.name,
            timestamp: new Date().toISOString(),
            isWixSite: url.includes('wixsite.com') || url.includes('wix.com')
        };
        
        if (error.message.includes('Navigation timeout') || error.message.includes('TimeoutError')) {
            errorResponse.message = 'The website took too long to load (timeout after 2 minutes).';
            errorResponse.suggestion = 'Wix sites can be slow to load. Try again, or check if the site is accessible.';
        } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
            errorResponse.message = 'Cannot resolve domain name. Please check the URL.';
            errorResponse.suggestion = 'Verify the URL is correct and accessible';
        }
        
        res.status(500).json(errorResponse);
    } finally {
        if (browser) {
            console.log('🔄 Closing browser...');
            try {
                await browser.close();
                console.log('✅ Browser closed successfully');
            } catch (closeError) {
                console.log('⚠️ Warning: Error closing browser:', closeError.message);
            }
        }
    }
});

// Process HTML and extract components with placeholders
async function processHtmlAndExtractComponents(fullPageHtml, computedStyles, outputDir) {
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
            const placeholderId = `wigoh-${placeholderCounter}`;
            placeholderCounter++;
            
            // Extract the component HTML
            const componentHtml = $.html($element);
            
            // Get computed styles for this element
            const elementStyles = computedStyles.elements[targetId] || null;
            
            // Save component HTML file
            const componentFilename = `${placeholderId}_${targetId}.html`;
            const componentPath = path.join(componentsDir, componentFilename);
            
            const cleanComponentHtml = createCleanComponentHTML(componentHtml, targetId, placeholderId);
            await fs.writeFile(componentPath, cleanComponentHtml, 'utf8');
            console.log(`📄 Component saved: components/${componentFilename}`);
            
            // Save computed styles JSON
            const stylesFilename = `${placeholderId}_${targetId}_styles.json`;
            const stylesPath = path.join(componentsDir, stylesFilename);
            
            const stylesData = {
                placeholderId: placeholderId,
                originalId: targetId,
                type: 'target-id',
                extractedAt: new Date().toISOString(),
                sourceUrl: computedStyles.metadata?.url || 'Unknown',
                computedStyles: elementStyles ? elementStyles.styles : {},
                elementInfo: elementStyles ? {
                    tag: elementStyles.tag,
                    id: elementStyles.id,
                    className: elementStyles.className
                } : null
            };
            
            await fs.writeFile(stylesPath, JSON.stringify(stylesData, null, 2), 'utf8');
            console.log(`📊 Styles saved: components/${stylesFilename}`);
            
            // Replace element in original HTML with placeholder
            $element.replaceWith(`{{${placeholderId}}}`);
            console.log(`🔄 Replaced ${targetId} with {{${placeholderId}}} in original HTML`);
            
            extractedComponents.push({
                placeholderId: placeholderId,
                originalId: targetId,
                type: 'target-id',
                found: true,
                componentFile: `components/${componentFilename}`,
                stylesFile: `components/${stylesFilename}`
            });
            
        } else {
            console.log(`❌ Target ID not found: ${targetId}`);
            
            const placeholderId = `wigoh-${placeholderCounter}`;
            placeholderCounter++;
            
            // Create not found component file
            const componentFilename = `${placeholderId}_${targetId}_notfound.html`;
            const componentPath = path.join(componentsDir, componentFilename);
            
            const notFoundHtml = createNotFoundComponentHTML(targetId, placeholderId);
            await fs.writeFile(componentPath, notFoundHtml, 'utf8');
            console.log(`📄 Not found component created: components/${componentFilename}`);
            
            // Create empty styles file
            const stylesFilename = `${placeholderId}_${targetId}_styles.json`;
            const stylesPath = path.join(componentsDir, stylesFilename);
            
            const stylesData = {
                placeholderId: placeholderId,
                originalId: targetId,
                type: 'target-id',
                found: false,
                extractedAt: new Date().toISOString(),
                sourceUrl: computedStyles.metadata?.url || 'Unknown',
                computedStyles: {},
                elementInfo: null
            };
            
            await fs.writeFile(stylesPath, JSON.stringify(stylesData, null, 2), 'utf8');
            console.log(`📊 Empty styles saved: components/${stylesFilename}`);
            
            extractedComponents.push({
                placeholderId: placeholderId,
                originalId: targetId,
                type: 'target-id',
                found: false,
                componentFile: `components/${componentFilename}`,
                stylesFile: `components/${stylesFilename}`
            });
        }
    }
    
    console.log('🗂️ Processing section elements...');
    
    // Process section elements
    $('section').each(async (index, element) => {
        const $section = $(element);
        const sectionId = $section.attr('id') || `section_${index + 1}`;
        
        console.log(`✅ Found section: ${sectionId}`);
        
        // Generate placeholder ID
        const placeholderId = `wigoh-${placeholderCounter}`;
        placeholderCounter++;
        
        // Extract the section HTML
        const sectionHtml = $.html($section);
        
        // Get computed styles for this section
        const elementStyles = computedStyles.elements[sectionId] || 
                            computedStyles.elements[`section_${index}`] || null;
        
        // Save section HTML file
        const componentFilename = `${placeholderId}_${sectionId}.html`;
        const componentPath = path.join(componentsDir, componentFilename);
        
        const cleanSectionHtml = createCleanComponentHTML(sectionHtml, sectionId, placeholderId);
        await fs.writeFile(componentPath, cleanSectionHtml, 'utf8');
        console.log(`📄 Section saved: components/${componentFilename}`);
        
        // Save computed styles JSON
        const stylesFilename = `${placeholderId}_${sectionId}_styles.json`;
        const stylesPath = path.join(componentsDir, stylesFilename);
        
        const stylesData = {
            placeholderId: placeholderId,
            originalId: sectionId,
            type: 'section',
            extractedAt: new Date().toISOString(),
            sourceUrl: computedStyles.metadata?.url || 'Unknown',
            computedStyles: elementStyles ? elementStyles.styles : {},
            elementInfo: elementStyles ? {
                tag: elementStyles.tag,
                id: elementStyles.id,
                className: elementStyles.className
            } : null
        };
        
        await fs.writeFile(stylesPath, JSON.stringify(stylesData, null, 2), 'utf8');
        console.log(`📊 Section styles saved: components/${stylesFilename}`);
        
        // Replace section in original HTML with placeholder
        $section.replaceWith(`{{${placeholderId}}}`);
        console.log(`🔄 Replaced section ${sectionId} with {{${placeholderId}}} in original HTML`);
        
        extractedComponents.push({
            placeholderId: placeholderId,
            originalId: sectionId,
            type: 'section',
            found: true,
            componentFile: `components/${componentFilename}`,
            stylesFile: `components/${stylesFilename}`
        });
    });
    
    // Remove header and footer from the modified HTML
    console.log('🗑️ Removing header and footer from original HTML...');
    $('header').remove();
    $('footer').remove();
    
    // Save the original HTML with placeholders
    const originalHtmlFilename = 'original_with_placeholders.html';
    const originalHtmlPath = path.join(outputDir, originalHtmlFilename);
    const modifiedHtml = $.html();
    
    await fs.writeFile(originalHtmlPath, modifiedHtml, 'utf8');
    console.log(`📄 Original HTML with placeholders saved: ${originalHtmlFilename}`);
    
    return {
        extractedComponents: extractedComponents,
        originalHtmlFile: originalHtmlFilename
    };
}

// Create clean component HTML
function createCleanComponentHTML(componentHtml, originalId, placeholderId) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Component: ${placeholderId} (${originalId})</title>
    <style>
        /* Add your custom styles here */
        /* Reference the ${placeholderId}_${originalId}_styles.json for computed styles */
    </style>
</head>
<body>
    <!-- Extracted Component: ${originalId} -->
    <!-- Placeholder ID: ${placeholderId} -->
    <!-- Replace {{${placeholderId}}} in original HTML with this component -->
    
${componentHtml}

</body>
</html>`;
}

// Create not found component HTML
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
    
    <div id="${originalId}" class="not-found-component">
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '4.0.0-placeholder-system'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n🚀 HTML COMPONENT EXTRACTOR V4.0 (PLACEHOLDER SYSTEM)');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log('\n✨ NEW PLACEHOLDER SYSTEM FEATURES:');
    console.log('   - Replaces components with {{wigoh-1}}, {{wigoh-2}}, etc.');
    console.log('   - Saves original HTML with placeholders');
    console.log('   - Extracts actual components to separate files');
    console.log('   - Computed styles properly identified by ID/class');
    console.log('   - Component files named with placeholder IDs');
    console.log('\n📁 OUTPUT FILES:');
    console.log('   - original_with_placeholders.html (main HTML with {{wigoh-X}})');
    console.log('   - components/wigoh-1_BACKGROUND_GROUP.html');
    console.log('   - components/wigoh-1_BACKGROUND_GROUP_styles.json');
    console.log('   - components/wigoh-2_pinnedTopLeft.html');
    console.log('   - components/wigoh-2_pinnedTopLeft_styles.json');
    console.log('   - etc...');
    console.log('\n🎯 Still targeting the same IDs:');
    console.log('   - BACKGROUND_GROUP, pinnedTopLeft, pinnedTopRight, pinnedBottomLeft');
    console.log('   - All section elements');
    console.log('═══════════════════════════════════════════════════════\n');
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