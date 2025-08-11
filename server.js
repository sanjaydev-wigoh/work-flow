// const express = require('express');
// const puppeteer = require('puppeteer');
// const fs = require('fs').promises;
// const path = require('path');

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
        
//         // Get the clean HTML content with error handling
//         console.log('📄 Extracting HTML content...');
//         let htmlContent = '';
//         try {
//             htmlContent = await page.evaluate(() => {
//                 // Remove scripts and clean up the HTML
//                 const scripts = document.querySelectorAll('script');
//                 scripts.forEach(script => script.remove());
                
//                 return document.documentElement.outerHTML;
//             });
//             console.log(`✅ HTML extracted (${htmlContent.length} characters)`);
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
        
//         // Create clean filename
//         console.log('📁 Creating output files...');
//         const urlObj = new URL(url);
//         const cleanHostname = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
//         const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
//         const baseFileName = `${cleanHostname}_${timestamp}_${Date.now()}`;
//         console.log(`📂 Base filename: ${baseFileName}`);
        
//         // Save HTML file with proper formatting
//         const htmlFileName = `${baseFileName}.html`;
//         const formattedHtml = formatHTML(htmlContent);
//         await fs.writeFile(path.join(__dirname, htmlFileName), formattedHtml, 'utf8');
//         console.log(`✅ HTML file saved: ${htmlFileName}`);
        
//         // Save computed styles JSON with proper formatting
//         const stylesFileName = `${baseFileName}_computed-styles.json`;
//         await fs.writeFile(
//             path.join(__dirname, stylesFileName), 
//             JSON.stringify(computedStyles, null, 2), 
//             'utf8'
//         );
//         console.log(`✅ Styles JSON saved: ${stylesFileName}`);
        
//         // Generate CSS file from computed styles
//         const cssFileName = `${baseFileName}_extracted.css`;
//         const cssContent = generateCSSFromTree(computedStyles.domTree);
//         await fs.writeFile(path.join(__dirname, cssFileName), cssContent, 'utf8');
//         console.log(`✅ CSS file saved: ${cssFileName}`);
        
//         console.log('\n🎉 MIGRATION COMPLETED SUCCESSFULLY!');
//         console.log('📊 Final Statistics:');
//         console.log(`   - HTML file: ${htmlFileName}`);
//         console.log(`   - Styles JSON: ${stylesFileName}`);
//         console.log(`   - CSS file: ${cssFileName}`);
//         console.log(`   - Total elements: ${computedStyles.totalElements}`);
//         console.log(`   - Page title: ${computedStyles.metadata.title}`);
//         console.log(`   - Processing time: ${Date.now() - parseInt(baseFileName.split('_').pop())}ms\n`);
        
//         res.json({
//             success: true,
//             message: 'Migration completed successfully',
//             stats: {
//                 totalElements: computedStyles.totalElements,
//                 url: computedStyles.metadata.url,
//                 title: computedStyles.metadata.title,
//                 extractedAt: computedStyles.metadata.extractedAt
//             },
//             files: {
//                 html: htmlFileName,
//                 stylesJson: stylesFileName,
//                 css: cssFileName
//             }
//         });
        
//     } catch (error) {
//         console.error('\n❌ MIGRATION ERROR OCCURRED!');
//         console.error('📍 Error details:');
//         console.error(`   - Error type: ${error.name}`);
//         console.error(`   - Error message: ${error.message}`);
//         console.error(`   - Error stack: ${error.stack}`);
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
        
//         if (process.env.NODE_ENV === 'development') {
//             errorResponse.stack = error.stack;
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

// // Helper function to format HTML
// function formatHTML(html) {
//     return `<!DOCTYPE html>
// <!-- Extracted HTML - Generated by HTML Migrator -->
// <!-- Extraction Date: ${new Date().toISOString()} -->
// ${html}`;
// }

// // Helper function to generate CSS file from DOM tree
// function generateCSSFromTree(element, cssRules = new Set()) {
//     if (!element) return '';
    
//     // Generate CSS rule for current element
//     if (element.styles && Object.keys(element.styles).length > 0) {
//         let selector = element.tag.toLowerCase();
        
//         if (element.id) {
//             selector = `#${element.id}`;
//         } else if (element.className) {
//             const firstClass = element.className.trim().split(' ')[0];
//             if (firstClass) {
//                 selector = `.${firstClass}`;
//             }
//         }
        
//         const cssProperties = [];
//         for (const [property, value] of Object.entries(element.styles)) {
//             cssProperties.push(`  ${property}: ${value};`);
//         }
        
//         if (cssProperties.length > 0) {
//             const rule = `${selector} {\n${cssProperties.join('\n')}\n}`;
//             cssRules.add(rule);
//         }
//     }
    
//     // Process children recursively
//     if (element.children && Array.isArray(element.children)) {
//         element.children.forEach(child => {
//             generateCSSFromTree(child, cssRules);
//         });
//     }
    
//     return Array.from(cssRules).join('\n\n');
// }

// // Helper function to generate CSS file
// function generateCSSFile(elements) {
//     let css = `/* Extracted CSS Styles - Generated by HTML Migrator */\n`;
//     css += `/* Extraction Date: ${new Date().toISOString()} */\n\n`;
    
//     Object.values(elements).forEach(element => {
//         if (element.cssRule) {
//             css += `/* Element ${element.element}: ${element.tagName} */\n`;
//             css += `${element.cssRule}\n\n`;
//         }
//     });
    
//     return css;
// }

// // Health check endpoint
// app.get('/health', (req, res) => {
//     res.json({ 
//         status: 'OK', 
//         timestamp: new Date().toISOString(),
//         version: '2.0.0'
//     });
// });

// // Start server with detailed logging
// app.listen(PORT, () => {
//     console.log('\n🚀 HTML MIGRATOR V2.0 SERVER STARTED');
//     console.log('═══════════════════════════════════════');
//     console.log(`🌐 Server URL: http://localhost:${PORT}`);
//     console.log(`📅 Started at: ${new Date().toISOString()}`);
//     console.log(`🔧 Node.js version: ${process.version}`);
//     console.log(`📂 Working directory: ${__dirname}`);
//     console.log('\n✨ Features:');
//     console.log('   - Clean HTML extraction');
//     console.log('   - Proper CSS style formatting');
//     console.log('   - SVG element support');
//     console.log('   - Ready for rebuild use');
//     console.log('   - Detailed error logging');
//     console.log('\n📝 Endpoints:');
//     console.log('   - GET  / (Main UI)');
//     console.log('   - POST /migrate (Migration API)');
//     console.log('   - GET  /health (Health check)');
//     console.log('\n👉 Open your browser and navigate to the URL above to use the migrator');
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

// // RAG LLM Memory Storage for placeholders
// class RAGMemoryStore {
//     constructor() {
//         this.placeholderMemory = new Map();
//         this.sectionIndex = new Map();
//         this.reverseIndex = new Map();
//     }

//     storePlaceholder(placeholder, sectionIndex, sectionData) {
//         this.placeholderMemory.set(placeholder, {
//             sectionIndex,
//             sectionData,
//             timestamp: new Date().toISOString(),
//             id: `section_${sectionIndex}`,
//             placeholder
//         });
        
//         this.sectionIndex.set(sectionIndex, placeholder);
//         this.reverseIndex.set(placeholder, sectionIndex);
        
//         console.log(`🧠 RAG Memory: Stored ${placeholder} -> Section ${sectionIndex}`);
//     }

//     getByPlaceholder(placeholder) {
//         return this.placeholderMemory.get(placeholder);
//     }

//     getBySectionIndex(sectionIndex) {
//         const placeholder = this.sectionIndex.get(sectionIndex);
//         return placeholder ? this.placeholderMemory.get(placeholder) : null;
//     }

//     getAllPlaceholders() {
//         return Array.from(this.placeholderMemory.entries()).map(([placeholder, data]) => ({
//             placeholder,
//             ...data
//         }));
//     }

//     exportMemory() {
//         return {
//             placeholders: Object.fromEntries(this.placeholderMemory),
//             indexMaps: {
//                 sectionToPlaceholder: Object.fromEntries(this.sectionIndex),
//                 placeholderToSection: Object.fromEntries(this.reverseIndex)
//             },
//             exportedAt: new Date().toISOString(),
//             totalPlaceholders: this.placeholderMemory.size
//         };
//     }

//     importMemory(memoryData) {
//         if (memoryData.placeholders) {
//             this.placeholderMemory = new Map(Object.entries(memoryData.placeholders));
//         }
//         if (memoryData.indexMaps) {
//             this.sectionIndex = new Map(Object.entries(memoryData.indexMaps.sectionToPlaceholder));
//             this.reverseIndex = new Map(Object.entries(memoryData.indexMaps.placeholderToSection));
//         }
//     }

//     replacePlaceholdersInHtml(html) {
//         let processedHtml = html;
        
//         this.placeholderMemory.forEach((data, placeholder) => {
//             const regex = new RegExp(placeholder, 'g');
//             if (processedHtml.includes(placeholder)) {
//                 // Read the actual section content
//                 const sectionHtmlPath = `sections/section_${data.sectionIndex}.html`;
//                 processedHtml = processedHtml.replace(regex, `<!-- SECTION_${data.sectionIndex}_RESTORED -->\n${data.sectionData.originalHtml}\n<!-- END_SECTION_${data.sectionIndex} -->`);
//                 console.log(`🔄 RAG Memory: Restored ${placeholder} with Section ${data.sectionIndex}`);
//             }
//         });
        
//         return processedHtml;
//     }
// }

// // Global RAG Memory instance
// const ragMemory = new RAGMemoryStore();

// // Serve the main HTML page
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// // Migration endpoint (Step 1)
// app.post('/migrate', async (req, res) => {
//     console.log('\n=== STEP 1: MIGRATION REQUEST RECEIVED ===');
//     console.log('Request body:', req.body);
    
//     const { url } = req.body;
    
//     if (!url) {
//         console.error('❌ ERROR: No URL provided in request body');
//         return res.status(400).json({ error: 'URL is required' });
//     }
    
//     console.log(`✅ Starting migration for: ${url}`);
    
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
        
//         // Navigate to the URL
//         await page.goto(url, { 
//             waitUntil: ['networkidle0', 'domcontentloaded'],
//             timeout: 60000 
//         });
        
//         // Wait for dynamic content to load
//         await page.waitForTimeout(3000);
        
//         // Get the clean HTML content
//         console.log('📄 Extracting HTML content...');
//         let htmlContent = await page.evaluate(() => {
//             const scripts = document.querySelectorAll('script');
//             scripts.forEach(script => script.remove());
//             return document.documentElement.outerHTML;
//         });
//         console.log(`✅ HTML extracted (${htmlContent.length} characters)`);
        
//         // Get computed styles with DOM tree
//         console.log('🎨 Extracting computed styles...');
//         let computedStyles = await page.evaluate(() => {
//             function extractElementTree(element, depth = 0) {
//                 if (!element || !element.tagName) return null;
                
//                 try {
//                     const computedStyle = window.getComputedStyle(element);
//                     const tagName = element.tagName;
//                     let elementId = element.id || '';
//                     let classNames = '';
                    
//                     if (element.className) {
//                         if (typeof element.className === 'string') {
//                             classNames = element.className;
//                         } else if (element.className.baseVal !== undefined) {
//                             classNames = element.className.baseVal || '';
//                         } else if (element.className.toString) {
//                             classNames = element.className.toString();
//                         }
//                     }
                    
//                     const cleanClassNames = classNames.trim().replace(/\s+/g, ' ');
//                     const styleObj = {};
                    
//                     for (let i = 0; i < computedStyle.length; i++) {
//                         const property = computedStyle[i];
//                         const value = computedStyle.getPropertyValue(property);
//                         if (value !== undefined && value !== null && value !== '') {
//                             styleObj[property] = value;
//                         }
//                     }
                    
//                     const tempElement = element.cloneNode(false);
//                     const elementHtml = tempElement.outerHTML;
                    
//                     const elementData = {
//                         tag: tagName,
//                         id: elementId,
//                         className: cleanClassNames,
//                         html: elementHtml,
//                         styles: styleObj
//                     };
                    
//                     const children = [];
//                     const directChildren = Array.from(element.children);
                    
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
            
//             const rootElement = document.body || document.documentElement;
//             const domTree = extractElementTree(rootElement);
            
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
        
//         // Create clean filename
//         console.log('📁 Creating output files...');
//         const urlObj = new URL(url);
//         const cleanHostname = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
//         const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
//         const baseFileName = `${cleanHostname}_${timestamp}_${Date.now()}`;
        
//         // Save HTML file
//         const htmlFileName = `${baseFileName}.html`;
//         const formattedHtml = formatHTML(htmlContent);
//         await fs.writeFile(path.join(__dirname, htmlFileName), formattedHtml, 'utf8');
//         console.log(`✅ HTML file saved: ${htmlFileName}`);
        
//         // Save computed styles JSON
//         const stylesFileName = `${baseFileName}_computed-styles.json`;
//         await fs.writeFile(
//             path.join(__dirname, stylesFileName), 
//             JSON.stringify(computedStyles, null, 2), 
//             'utf8'
//         );
//         console.log(`✅ Styles JSON saved: ${stylesFileName}`);
        
//         console.log('\n🎉 STEP 1 COMPLETED: Migration successful!');
        
//         res.json({
//             success: true,
//             message: 'Migration completed successfully',
//             files: {
//                 html: htmlFileName,
//                 stylesJson: stylesFileName
//             },
//             nextStep: {
//                 endpoint: '/extract-sections',
//                 description: 'Use these files for Step 2: Section Extraction'
//             }
//         });
        
//     } catch (error) {
//         console.error('\n❌ MIGRATION ERROR:', error.message);
//         res.status(500).json({
//             error: 'Migration failed',
//             message: error.message
//         });
//     } finally {
//         if (browser) {
//             await browser.close();
//         }
//     }
// });

// // Section extraction endpoint (Step 2)
// app.post('/extract-sections', async (req, res) => {
//     console.log('\n=== STEP 2: SECTION EXTRACTION REQUEST ===');
    
//     const { htmlFile, stylesFile, outputDir = __dirname } = req.body;
    
//     if (!htmlFile || !stylesFile) {
//         return res.status(400).json({ 
//             error: 'Both htmlFile and stylesFile are required',
//             example: {
//                 htmlFile: 'example_com_2024-01-01_1234567890.html',
//                 stylesFile: 'example_com_2024-01-01_1234567890_computed-styles.json'
//             }
//         });
//     }
    
//     try {
//         // Read files
//         const rawHtmlContent = await fs.readFile(path.join(__dirname, htmlFile), 'utf8');
//         const computedStylesContent = await fs.readFile(path.join(__dirname, stylesFile), 'utf8');
//         const computedStyles = JSON.parse(computedStylesContent);
        
//         console.log('✅ Files loaded successfully');
        
//         // Extract sections with placeholders and RAG memory
//         const sectionResults = await extractAndSaveSections(
//             rawHtmlContent, 
//             computedStyles, 
//             outputDir,
//             htmlFile
//         );
        
//         // Create HTML with placeholders
//         const htmlWithPlaceholders = await createHtmlWithPlaceholders(
//             rawHtmlContent,
//             sectionResults.sections,
//             path.join(outputDir, `${path.parse(htmlFile).name}_with_placeholders.html`)
//         );
        
//         // Export RAG memory
//         const ragMemoryExport = ragMemory.exportMemory();
//         await fs.writeFile(
//             path.join(outputDir, 'rag_memory.json'),
//             JSON.stringify(ragMemoryExport, null, 2)
//         );
        
//         console.log('\n🎉 STEP 2 COMPLETED: Section extraction successful!');
        
//         res.json({
//             success: true,
//             message: 'Section extraction completed successfully',
//             results: sectionResults,
//             placeholderFile: `${path.parse(htmlFile).name}_with_placeholders.html`,
//             ragMemoryFile: 'rag_memory.json',
//             ragMemory: {
//                 totalPlaceholders: ragMemoryExport.totalPlaceholders,
//                 placeholders: ragMemory.getAllPlaceholders()
//             },
//             nextStep: {
//                 endpoint: '/restore-sections',
//                 description: 'Use RAG memory to restore sections after processing'
//             }
//         });
        
//     } catch (error) {
//         console.error('\n❌ SECTION EXTRACTION ERROR:', error.message);
//         res.status(500).json({
//             error: 'Section extraction failed',
//             message: error.message
//         });
//     }
// });

// // Section restoration endpoint (Step 3)
// app.post('/restore-sections', async (req, res) => {
//     console.log('\n=== STEP 3: SECTION RESTORATION REQUEST ===');
    
//     const { htmlWithPlaceholders, ragMemoryFile, outputDir = __dirname } = req.body;
    
//     try {
//         // Load RAG memory
//         if (ragMemoryFile) {
//             const ragMemoryContent = await fs.readFile(path.join(__dirname, ragMemoryFile), 'utf8');
//             const ragMemoryData = JSON.parse(ragMemoryContent);
//             ragMemory.importMemory(ragMemoryData);
//             console.log(`✅ RAG Memory loaded: ${ragMemoryData.totalPlaceholders} placeholders`);
//         }
        
//         // Load HTML with placeholders
//         let htmlContent = await fs.readFile(path.join(__dirname, htmlWithPlaceholders), 'utf8');
        
//         // Restore sections using RAG memory
//         const restoredHtml = ragMemory.replacePlaceholdersInHtml(htmlContent);
        
//         // Save restored HTML
//         const restoredFileName = `${path.parse(htmlWithPlaceholders).name}_restored.html`;
//         await fs.writeFile(
//             path.join(outputDir, restoredFileName),
//             restoredHtml
//         );
        
//         console.log('\n🎉 STEP 3 COMPLETED: Section restoration successful!');
        
//         res.json({
//             success: true,
//             message: 'Section restoration completed successfully',
//             restoredFile: restoredFileName,
//             placeholdersRestored: ragMemory.placeholderMemory.size
//         });
        
//     } catch (error) {
//         console.error('\n❌ SECTION RESTORATION ERROR:', error.message);
//         res.status(500).json({
//             error: 'Section restoration failed',
//             message: error.message
//         });
//     }
// });

// // RAG Memory endpoints
// app.get('/rag-memory', (req, res) => {
//     res.json({
//         success: true,
//         memory: ragMemory.exportMemory()
//     });
// });

// app.post('/rag-memory/import', async (req, res) => {
//     try {
//         const { memoryData } = req.body;
//         ragMemory.importMemory(memoryData);
//         res.json({
//             success: true,
//             message: 'RAG memory imported successfully',
//             totalPlaceholders: ragMemory.placeholderMemory.size
//         });
//     } catch (error) {
//         res.status(500).json({
//             error: 'Failed to import RAG memory',
//             message: error.message
//         });
//     }
// });

// /**
//  * STEP 2: Extract and save sections with placeholder functionality
//  */
// async function extractAndSaveSections(rawHtmlContent, computedStyles, outputDir, originalFileName) {
//     console.log('\n🔍 STARTING RECURSIVE SECTION EXTRACTION WITH RAG PLACEHOLDERS');
//     console.log('═══════════════════════════════════════════════════════════════');
    
//     // Create sections directory
//     const sectionsDir = path.join(outputDir, 'sections');
//     await fs.mkdir(sectionsDir, { recursive: true });
//     console.log(`📁 Created sections directory: ${sectionsDir}`);
    
//     // Load HTML with cheerio
//     const $ = cheerio.load(rawHtmlContent);
//     console.log('✅ HTML loaded successfully');
    
//     // Find parent sections using recursive strategy
//     const parentSections = findParentSections($, computedStyles);
//     console.log(`🎯 Found ${parentSections.length} parent sections`);
    
//     const sectionFiles = [];
    
//     // Process each parent section
//     for (let i = 0; i < parentSections.length; i++) {
//         const sectionData = parentSections[i];
//         const sectionInfo = await processSectionRecursively(
//             sectionData, 
//             i, 
//             sectionsDir, 
//             computedStyles,
//             $,
//             originalFileName
//         );
        
//         sectionFiles.push(sectionInfo);
        
//         // Store in RAG memory
//         const placeholder = `{{section-${i}}}`;
//         ragMemory.storePlaceholder(placeholder, i, {
//             originalHtml: $.html(sectionData.element),
//             sectionInfo: sectionInfo,
//             extractedFrom: originalFileName
//         });
        
//         console.log(`✅ Processed section ${i}: ${sectionInfo.sectionId} -> ${placeholder}`);
//     }
    
//     // Create comprehensive index file
//     const indexData = {
//         extractedAt: new Date().toISOString(),
//         totalSections: sectionFiles.length,
//         sourceFile: originalFileName,
//         sections: sectionFiles,
//         placeholders: sectionFiles.map((section, index) => ({
//             placeholder: `{{section-${index}}}`,
//             sectionIndex: index,
//             sectionId: section.sectionId,
//             files: {
//                 html: section.htmlFile,
//                 computed: section.computedFile,
//                 css: section.cssFile
//             }
//         })),
//         metadata: {
//             sourceUrl: computedStyles.metadata?.url || 'unknown',
//             title: computedStyles.metadata?.title || 'unknown'
//         },
//         ragMemory: {
//             totalPlaceholders: ragMemory.placeholderMemory.size,
//             placeholderPattern: '{{section-N}}',
//             instructions: 'Use placeholders to replace sections in HTML, then use RAG memory to restore'
//         }
//     };
    
//     await fs.writeFile(
//         path.join(outputDir, 'sections_index.json'),
//         JSON.stringify(indexData, null, 2)
//     );
    
//     console.log('📋 Created comprehensive sections index file');
//     console.log(`🎉 Section extraction completed! Total: ${sectionFiles.length} sections`);
//     console.log('═══════════════════════════════════════════════════════════════\n');
    
//     return {
//         sections: sectionFiles,
//         totalSections: sectionFiles.length,
//         indexFile: 'sections_index.json',
//         ragPlaceholders: sectionFiles.length
//     };
// }

// /**
//  * Create HTML with placeholders replacing sections
//  */
// async function createHtmlWithPlaceholders(rawHtmlContent, sections, outputPath) {
//     console.log('🔄 Creating HTML with placeholders...');
    
//     let $ = cheerio.load(rawHtmlContent);
//     let processedHtml = rawHtmlContent;
    
//     // Replace sections with placeholders in reverse order to maintain positions
//     for (let i = sections.length - 1; i >= 0; i--) {
//         const section = sections[i];
//         const placeholder = `{{section-${i}}}`;
        
//         // Find the section element and replace with placeholder
//         const sectionSelector = getSectionSelector(section);
//         const $sectionElement = $(sectionSelector);
        
//         if ($sectionElement.length > 0) {
//             // Replace with placeholder comment
//             const placeholderComment = `<!-- ${placeholder} -->`;
//             $sectionElement.replaceWith(placeholderComment);
//             console.log(`🔄 Replaced section ${i} with ${placeholder}`);
//         } else {
//             console.warn(`⚠️ Could not find section ${i} for placeholder replacement`);
//         }
//     }
    
//     // Get the modified HTML
//     const htmlWithPlaceholders = $.html();
    
//     // Add metadata header
//     const finalHtml = `<!DOCTYPE html>
// <!-- HTML with RAG Placeholders -->
// <!-- Generated: ${new Date().toISOString()} -->
// <!-- Total Placeholders: ${sections.length} -->
// <!-- Placeholder Pattern: {{section-N}} -->
// <!-- Use RAG Memory to restore sections -->
// ${htmlWithPlaceholders}`;
    
//     // Save HTML with placeholders
//     await fs.writeFile(outputPath, finalHtml, 'utf8');
//     console.log(`✅ HTML with placeholders saved: ${path.basename(outputPath)}`);
    
//     return finalHtml;
// }

// /**
//  * Generate selector for section element
//  */
// function getSectionSelector(sectionInfo) {
//     if (sectionInfo.metadata.hasId) {
//         return `#${sectionInfo.sectionId}`;
//     } else if (sectionInfo.metadata.hasClasses) {
//         const className = sectionInfo.className || '';
//         const firstClass = className.trim().split(' ')[0];
//         return firstClass ? `.${firstClass}` : sectionInfo.tagName;
//     }
//     return sectionInfo.tagName;
// }

// /**
//  * Recursively finds parent sections from HTML and DOM tree
//  */
// function findParentSections($, computedStyles) {
//     console.log('🔍 Searching for parent sections...');
    
//     const parentSections = [];
//     const processedElements = new Set();
    
//     // Strategy 1: Look for HTML sections first
//     const htmlSections = $('body > section, html > section').toArray();
    
//     if (htmlSections.length > 0) {
//         console.log(`📍 Found ${htmlSections.length} direct body/html sections`);
//         htmlSections.forEach((section, index) => {
//             const $section = $(section);
//             const sectionData = createSectionData($section, index, 'html-section');
//             parentSections.push(sectionData);
//             processedElements.add(sectionData.uniqueId);
//         });
//     }
    
//     // Strategy 2: Look for standalone sections (no section parents)
//     const standaloneSections = $('section').filter((i, el) => {
//         const $el = $(el);
//         const hasParentSection = $el.parents('section').length > 0;
//         const uniqueId = generateUniqueId($el, i);
//         return !hasParentSection && !processedElements.has(uniqueId);
//     }).toArray();
    
//     if (standaloneSections.length > 0) {
//         console.log(`📍 Found ${standaloneSections.length} standalone sections`);
//         standaloneSections.forEach((section, index) => {
//             const $section = $(section);
//             const sectionData = createSectionData($section, parentSections.length + index, 'standalone-section');
//             parentSections.push(sectionData);
//             processedElements.add(sectionData.uniqueId);
//         });
//     }
    
//     // Strategy 3: Use DOM tree to find semantic parent containers
//     if (computedStyles.domTree && parentSections.length === 0) {
//         console.log('📍 Searching DOM tree for semantic parent containers');
//         const domSections = findSemanticSectionsFromDOMTree(computedStyles.domTree, $);
//         domSections.forEach((sectionData, index) => {
//             if (!processedElements.has(sectionData.uniqueId)) {
//                 parentSections.push({
//                     ...sectionData,
//                     index: parentSections.length + index,
//                     type: 'dom-semantic'
//                 });
//                 processedElements.add(sectionData.uniqueId);
//             }
//         });
//     }
    
//     // Strategy 4: Fallback to major containers if no sections found
//     if (parentSections.length === 0) {
//         console.log('📍 No sections found, falling back to major containers');
//         const fallbackContainers = $('main, article, div[class*="content"], div[class*="section"], div[class*="container"]')
//             .filter((i, el) => {
//                 const $el = $(el);
//                 return $el.children().length > 2; // Must have substantial content
//             }).toArray();
        
//         fallbackContainers.slice(0, 10).forEach((container, index) => { // Limit to 10
//             const $container = $(container);
//             const sectionData = createSectionData($container, index, 'fallback-container');
//             parentSections.push(sectionData);
//         });
//     }
    
//     return parentSections;
// }

// /**
//  * Creates standardized section data object
//  */
// function createSectionData($element, index, type) {
//     const id = $element.attr('id') || '';
//     const className = $element.attr('class') || '';
//     const tagName = $element.prop('tagName').toLowerCase();
//     const uniqueId = generateUniqueId($element, index);
    
//     return {
//         index,
//         type,
//         tagName,
//         id,
//         className,
//         uniqueId,
//         element: $element
//     };
// }

// /**
//  * Generates unique identifier for elements
//  */
// function generateUniqueId($element, index) {
//     const id = $element.attr('id') || '';
//     const className = $element.attr('class') || '';
//     const tagName = $element.prop('tagName').toLowerCase();
    
//     if (id) return `${tagName}#${id}`;
//     if (className) {
//         const firstClass = className.trim().split(' ')[0];
//         return `${tagName}.${firstClass}_${index}`;
//     }
//     return `${tagName}_${index}`;
// }

// /**
//  * Recursively searches DOM tree for semantic sections
//  */
// function findSemanticSectionsFromDOMTree(domTree, $) {
//     const semanticSections = [];
//     const semanticTags = ['section', 'article', 'main', 'header', 'footer', 'nav', 'aside'];
    
//     function traverseTree(node, depth = 0) {
//         if (!node || depth > 10) return;
        
//         if (semanticTags.includes(node.tag.toLowerCase())) {
//             let $element = null;
            
//             if (node.id) {
//                 $element = $(`${node.tag.toLowerCase()}#${node.id}`);
//             } else if (node.className) {
//                 const firstClass = node.className.trim().split(' ')[0];
//                 $element = $(`${node.tag.toLowerCase()}.${firstClass}`).first();
//             } else {
//                 $element = $(node.tag.toLowerCase()).first();
//             }
            
//             if ($element && $element.length > 0) {
//                 semanticSections.push({
//                     tagName: node.tag.toLowerCase(),
//                     id: node.id || '',
//                     className: node.className || '',
//                     uniqueId: node.id ? `${node.tag.toLowerCase()}#${node.id}` : 
//                              node.className ? `${node.tag.toLowerCase()}.${node.className.trim().split(' ')[0]}_${semanticSections.length}` :
//                              `${node.tag.toLowerCase()}_${semanticSections.length}`,
//                     element: $element,
//                     domNode: node
//                 });
//             }
//         }
        
//         if (node.children && Array.isArray(node.children)) {
//             node.children.forEach(child => traverseTree(child, depth + 1));
//         }
//     }
    
//     traverseTree(domTree);
//     return semanticSections;
// }

// /**
//  * Processes individual section recursively and saves files
//  */
// async function processSectionRecursively(sectionData, index, sectionsDir, computedStyles, $, originalFileName) {
//     const sectionId = sectionData.id || `section_${index}`;
//     const $section = sectionData.element;
    
//     // Extract HTML content
//     const sectionHtml = formatSectionHtml($.html($section), sectionData, index);
    
//     // Find matching computed styles recursively
//     const matchedStyles = findMatchingStylesRecursively(sectionData, computedStyles);
    
//     // Create file paths
//     const htmlFilename = `section_${index}.html`;
//     const computedFilename = `section_${index}_computed.json`;
//     const stylesFilename = `section_${index}_styles.css`;
    
//     // Save HTML file
//     await fs.writeFile(
//         path.join(sectionsDir, htmlFilename),
//         sectionHtml
//     );
    
//     // Save computed styles JSON
//     const computedData = {
//         sectionInfo: {
//             index,
//             sectionId,
//             type: sectionData.type,
//             tagName: sectionData.tagName,
//             uniqueId: sectionData.uniqueId,
//             extractedAt: new Date().toISOString(),
//             placeholder: `{{section-${index}}}`,
//             originalFile: originalFileName
//         },
//         styles: matchedStyles,
//         metadata: {
//             hasId: !!sectionData.id,
//             hasClasses: !!sectionData.className,
//             childElements: countChildElements($section)
//         }
//     };
    
//     await fs.writeFile(
//         path.join(sectionsDir, computedFilename),
//         JSON.stringify(computedData, null, 2)
//     );
    
//     // Generate and save CSS
//     const cssContent = generateSectionCSS(matchedStyles, sectionData);
//     await fs.writeFile(
//         path.join(sectionsDir, stylesFilename),
//         cssContent
//     );
    
//             return {
//         index,
//         sectionId,
//         type: sectionData.type,
//         tagName: sectionData.tagName,
//         uniqueId: sectionData.uniqueId,
//         placeholder: `{{section-${index}}}`,
//         htmlFile: htmlFilename,
//         computedFile: computedFilename,
//         cssFile: stylesFilename,
//         metadata: {
//             hasId: !!sectionData.id,
//             hasClasses: !!sectionData.className,
//             childElements: countChildElements($section)
//         }
//     };
// }

// /**
//  * Recursively finds matching styles for a section
//  */
// function findMatchingStylesRecursively(sectionData, computedStyles) {
//     const matchedStyles = {};
    
//     // Search in DOM tree recursively
//     function searchInDOMTree(node, targetData) {
//         if (!node) return null;
        
//         // Check if current node matches
//         const matches = (
//             (targetData.id && node.id === targetData.id) ||
//             (targetData.className && node.className && 
//              node.className.includes(targetData.className.split(' ')[0])) ||
//             (node.tag && node.tag.toLowerCase() === targetData.tagName)
//         );
        
//         if (matches) {
//             return node;
//         }
        
//         // Search children recursively
//         if (node.children && Array.isArray(node.children)) {
//             for (const child of node.children) {
//                 const result = searchInDOMTree(child, targetData);
//                 if (result) return result;
//             }
//         }
        
//         return null;
//     }
    
//     // Find matching node in DOM tree
//     const matchingNode = searchInDOMTree(computedStyles.domTree, sectionData);
    
//     if (matchingNode) {
//         matchedStyles.primary = matchingNode.styles || {};
//         matchedStyles.element = {
//             tag: matchingNode.tag,
//             id: matchingNode.id,
//             className: matchingNode.className,
//             html: matchingNode.html
//         };
        
//         // Also include children styles if needed
//         if (matchingNode.children) {
//             matchedStyles.children = collectChildrenStyles(matchingNode.children);
//         }
//     }
    
//     return matchedStyles;
// }

// /**
//  * Recursively collects styles from children elements
//  */
// function collectChildrenStyles(children) {
//     if (!children || !Array.isArray(children)) return [];
    
//     const childStyles = [];
    
//     children.forEach((child, index) => {
//         if (child.styles && Object.keys(child.styles).length > 0) {
//             childStyles.push({
//                 index,
//                 tag: child.tag,
//                 id: child.id,
//                 className: child.className,
//                 styles: child.styles
//             });
//         }
        
//         // Recurse into grandchildren
//         if (child.children) {
//             const grandchildStyles = collectChildrenStyles(child.children);
//             childStyles.push(...grandchildStyles);
//         }
//     });
    
//     return childStyles;
// }

// /**
//  * Formats section HTML with metadata
//  */
// function formatSectionHtml(html, sectionData, index) {
//     return `<!DOCTYPE html>
// <!-- Extracted Section ${index} -->
// <!-- Placeholder: {{section-${index}}} -->
// <!-- Section Type: ${sectionData.type} -->
// <!-- Section ID: ${sectionData.id || 'none'} -->
// <!-- Section Classes: ${sectionData.className || 'none'} -->
// <!-- Extracted At: ${new Date().toISOString()} -->
// <html>
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Section ${index} - ${sectionData.uniqueId}</title>
//     <link rel="stylesheet" href="section_${index}_styles.css">
// </head>
// <body>
// ${html}
// </body>
// </html>`;
// }

// /**
//  * Generates CSS content for a section
//  */
// function generateSectionCSS(matchedStyles, sectionData) {
//     let css = `/* Section ${sectionData.index} Styles */\n`;
//     css += `/* Placeholder: {{section-${sectionData.index}}} */\n`;
//     css += `/* Section Type: ${sectionData.type} */\n`;
//     css += `/* Unique ID: ${sectionData.uniqueId} */\n`;
//     css += `/* Generated: ${new Date().toISOString()} */\n\n`;
    
//     // Main section styles
//     if (matchedStyles.primary) {
//         let selector = sectionData.tagName;
//         if (sectionData.id) {
//             selector = `#${sectionData.id}`;
//         } else if (sectionData.className) {
//             const firstClass = sectionData.className.trim().split(' ')[0];
//             selector = `.${firstClass}`;
//         }
        
//         css += `/* Main Section Styles */\n`;
//         css += `${selector} {\n`;
//         Object.entries(matchedStyles.primary).forEach(([property, value]) => {
//             css += `  ${property}: ${value};\n`;
//         });
//         css += `}\n\n`;
//     }
    
//     // Children styles
//     if (matchedStyles.children && matchedStyles.children.length > 0) {
//         css += `/* Children Element Styles */\n`;
//         matchedStyles.children.forEach((child, index) => {
//             if (child.styles && Object.keys(child.styles).length > 0) {
//                 let childSelector = child.tag?.toLowerCase() || `element-${index}`;
//                 if (child.id) {
//                     childSelector = `#${child.id}`;
//                 } else if (child.className) {
//                     const firstClass = child.className.trim().split(' ')[0];
//                     childSelector = `.${firstClass}`;
//                 }
                
//                 css += `${childSelector} {\n`;
//                 Object.entries(child.styles).forEach(([property, value]) => {
//                     css += `  ${property}: ${value};\n`;
//                 });
//                 css += `}\n\n`;
//             }
//         });
//     }
    
//     return css;
// }

// /**
//  * Counts child elements recursively
//  */
// function countChildElements($element) {
//     return $element.find('*').length;
// }

// // Helper function to format HTML
// function formatHTML(html) {
//     return `<!DOCTYPE html>
// <!-- Extracted HTML - Generated by HTML Migrator -->
// <!-- Extraction Date: ${new Date().toISOString()} -->
// ${html}`;
// }

// // Health check endpoint
// app.get('/health', (req, res) => {
//     res.json({ 
//         status: 'OK', 
//         timestamp: new Date().toISOString(),
//         version: '3.0.0-RAG',
//         features: [
//             'HTML Migration',
//             'Section Extraction with Placeholders',
//             'RAG LLM Memory Integration',
//             'Section Restoration'
//         ]
//     });
// });

// // Documentation endpoint
// app.get('/docs', (req, res) => {
//     res.json({
//         title: 'HTML Migrator with RAG LLM Integration',
//         version: '3.0.0-RAG',
//         endpoints: {
//             'POST /migrate': {
//                 description: 'Step 1: Migrate website to HTML and computed styles',
//                 body: { url: 'string (required)' },
//                 output: 'HTML file and computed styles JSON'
//             },
//             'POST /extract-sections': {
//                 description: 'Step 2: Extract sections with RAG placeholders',
//                 body: { 
//                     htmlFile: 'string (required)', 
//                     stylesFile: 'string (required)',
//                     outputDir: 'string (optional)'
//                 },
//                 output: 'Individual section files, HTML with placeholders, RAG memory'
//             },
//             'POST /restore-sections': {
//                 description: 'Step 3: Restore sections using RAG memory',
//                 body: {
//                     htmlWithPlaceholders: 'string (required)',
//                     ragMemoryFile: 'string (required)',
//                     outputDir: 'string (optional)'
//                 },
//                 output: 'Restored HTML file'
//             },
//             'GET /rag-memory': {
//                 description: 'Get current RAG memory state',
//                 output: 'RAG memory export'
//             },
//             'POST /rag-memory/import': {
//                 description: 'Import RAG memory data',
//                 body: { memoryData: 'object (required)' }
//             }
//         },
//         workflow: [
//             '1. POST /migrate - Extract website',
//             '2. POST /extract-sections - Create sections with placeholders',
//             '3. Process HTML with placeholders (external LLM)',
//             '4. POST /restore-sections - Restore original sections'
//         ],
//         placeholderFormat: '{{section-N}}',
//         ragMemoryFeatures: [
//             'Automatic placeholder generation',
//             'Section index mapping',
//             'Original HTML preservation',
//             'Restoration capability',
//             'Memory import/export'
//         ]
//     });
// });


// // Example usage endpoint
// app.get('/example', (req, res) => {
//     res.json({
//         title: 'Example Usage Flow',
//         steps: [
//             {
//                 step: 1,
//                 description: 'Migrate website',
//                 endpoint: 'POST /migrate',
//                 example: {
//                     url: 'https://example.com'
//                 },
//                 result: 'Creates: example_com_2024-01-01_123456.html and example_com_2024-01-01_123456_computed-styles.json'
//             },
//             {
//                 step: 2,
//                 description: 'Extract sections with placeholders',
//                 endpoint: 'POST /extract-sections',
//                 example: {
//                     htmlFile: 'example_com_2024-01-01_123456.html',
//                     stylesFile: 'example_com_2024-01-01_123456_computed-styles.json'
//                 },
//                 result: 'Creates: sections/ folder, HTML with placeholders, rag_memory.json'
//             },
//             {
//                 step: 3,
//                 description: 'Process HTML with LLM (external)',
//                 note: 'Use the HTML file with {{section-N}} placeholders for LLM processing'
//             },
//             {
//                 step: 4,
//                 description: 'Restore sections',
//                 endpoint: 'POST /restore-sections',
//                 example: {
//                     htmlWithPlaceholders: 'example_com_2024-01-01_123456_with_placeholders.html',
//                     ragMemoryFile: 'rag_memory.json'
//                 },
//                 result: 'Creates: restored HTML with original sections'
//             }
//         ],
//         placeholderExamples: [
//             '{{section-0}} - First extracted section',
//             '{{section-1}} - Second extracted section',
//             '{{section-N}} - Nth extracted section'
//         ],
//         ragMemoryStructure: {
//             placeholders: 'Map of placeholders to section data',
//             indexMaps: 'Bidirectional mapping between indices and placeholders',
//             exportedAt: 'Timestamp of export',
//             totalPlaceholders: 'Number of stored placeholders'
//         }
//     });
// });

// // Start server with detailed logging
// app.listen(PORT, () => {
//     console.log('\n🚀 HTML MIGRATOR V3.0 WITH RAG LLM INTEGRATION');
//     console.log('═══════════════════════════════════════════════════════');
//     console.log(`🌐 Server URL: http://localhost:${PORT}`);
//     console.log(`📅 Started at: ${new Date().toISOString()}`);
//     console.log(`🔧 Node.js version: ${process.version}`);
//     console.log(`📂 Working directory: ${__dirname}`);
//     console.log('\n✨ NEW RAG LLM Features:');
//     console.log('   - {{section-N}} placeholder generation');
//     console.log('   - RAG memory storage and retrieval');
//     console.log('   - Section extraction with placeholders');
//     console.log('   - Automatic section restoration');
//     console.log('   - Memory import/export capability');
//     console.log('\n🔄 Complete Workflow:');
//     console.log('   1. POST /migrate (Extract website)');
//     console.log('   2. POST /extract-sections (Create placeholders)');
//     console.log('   3. Process HTML with LLM (External)');
//     console.log('   4. POST /restore-sections (Restore content)');
//     console.log('\n📝 Endpoints:');
//     console.log('   - GET  / (Main UI)');
//     console.log('   - POST /migrate (Step 1: Website migration)');
//     console.log('   - POST /extract-sections (Step 2: Section extraction)');
//     console.log('   - POST /restore-sections (Step 3: Section restoration)');
//     console.log('   - GET  /rag-memory (View RAG memory)');
//     console.log('   - POST /rag-memory/import (Import RAG memory)');
//     console.log('   - GET  /health (Health check)');
//     console.log('   - GET  /docs (API documentation)');
//     console.log('   - GET  /example (Usage examples)');
//     console.log('\n🧠 RAG Memory Features:');
//     console.log('   - Placeholder pattern: {{section-N}}');
//     console.log('   - Bidirectional index mapping');
//     console.log('   - Original HTML preservation');
//     console.log('   - Automatic restoration capability');
//     console.log('\n👉 Visit http://localhost:3000/docs for complete API documentation');
//     console.log('═══════════════════════════════════════════════════════\n');
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

// // Graceful shutdown
// process.on('SIGINT', () => {
//     console.log('\n🛑 Shutting down server gracefully...');
//     console.log('💾 Saving RAG memory state...');
    
//     // Auto-save RAG memory on shutdown
//     if (ragMemory.placeholderMemory.size > 0) {
//         const memoryExport = ragMemory.exportMemory();
//         fs.writeFile('rag_memory_backup.json', JSON.stringify(memoryExport, null, 2))
//             .then(() => console.log('✅ RAG memory backup saved'))
//             .catch(err => console.error('❌ Failed to save RAG memory:', err.message))
//             .finally(() => process.exit(0));
//     } else {
//         process.exit(0);
//     }
// });

// process.on('SIGTERM', () => {
//     console.log('\n🛑 Shutting down server gracefully...');
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

// Migration endpoint
app.post('/migrate', async (req, res) => {
    console.log('\n=== MIGRATION REQUEST RECEIVED ===');
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    
    const { url } = req.body;
    
    if (!url) {
        console.error('❌ ERROR: No URL provided in request body');
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log(`✅ Starting migration for: ${url}`);
    console.log(`📊 Request timestamp: ${new Date().toISOString()}`);
    
    let browser;
    try {
        
        // Launch Puppeteer with better settings
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set viewport and user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Navigate to the URL with better error handling
        await page.goto(url, { 
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 60000 
        });
        
        // Wait for dynamic content to load
        await page.waitForTimeout(3000);
        
        // Get clean HTML content (body only, no scripts/styles)
        console.log('📄 Extracting clean HTML content (body only)...');
        let htmlContent = '';
        try {
            htmlContent = await page.evaluate(() => {
                // Remove all script and style tags
                const scripts = document.querySelectorAll('script');
                const styles = document.querySelectorAll('style');
                const links = document.querySelectorAll('link[rel="stylesheet"]');
                
                scripts.forEach(script => script.remove());
                styles.forEach(style => style.remove());
                links.forEach(link => link.remove());
                
                // Get only the body content
                const body = document.body;
                if (body) {
                    return body.outerHTML;
                } else {
                    // Fallback to documentElement if no body
                    return document.documentElement.innerHTML;
                }
            });
            console.log(`✅ Clean HTML extracted (${htmlContent.length} characters, body only)`);
        } catch (htmlError) {
            console.warn('⚠️  HTML extraction had issues, getting basic HTML...');
            htmlContent = await page.content();
            console.log(`✅ Basic HTML extracted (${htmlContent.length} characters)`);
        }
        
        // Get computed styles with proper formatting and error handling
        console.log('🎨 Extracting computed styles...');
        let computedStyles;
        try {
            computedStyles = await page.evaluate(() => {
            
            // Function to extract element tree with styles
            function extractElementTree(element, depth = 0) {
                if (!element || !element.tagName) return null;
                
                try {
                    const computedStyle = window.getComputedStyle(element);
                    
                    // Get element information
                    const tagName = element.tagName;
                    let elementId = element.id || '';
                    let classNames = '';
                    
                    // Handle className for different element types
                    if (element.className) {
                        if (typeof element.className === 'string') {
                            classNames = element.className;
                        } else if (element.className.baseVal !== undefined) {
                            // SVG elements
                            classNames = element.className.baseVal || '';
                        } else if (element.className.toString) {
                            classNames = element.className.toString();
                        }
                    }
                    
                    // Clean up class names
                    const cleanClassNames = classNames.trim().replace(/\s+/g, ' ');
                    
                    // Get ALL computed styles without any filtering
                    const styleObj = {};
                    
                    // Extract every single computed style property
                    for (let i = 0; i < computedStyle.length; i++) {
                        const property = computedStyle[i];
                        const value = computedStyle.getPropertyValue(property);
                        // Include ALL properties, even if they are initial, inherit, auto, none, normal
                        if (value !== undefined && value !== null && value !== '') {
                            styleObj[property] = value;
                        }
                    }
                    
                    // Also get shorthand properties that might not be in the iteration
                    const additionalProperties = [
                        'all', 'animation', 'background', 'border', 'border-block', 'border-block-end',
                        'border-block-start', 'border-bottom', 'border-color', 'border-image',
                        'border-inline', 'border-inline-end', 'border-inline-start', 'border-left',
                        'border-radius', 'border-right', 'border-style', 'border-top', 'border-width',
                        'column-rule', 'columns', 'flex', 'flex-flow', 'font', 'gap', 'grid',
                        'grid-area', 'grid-column', 'grid-row', 'grid-template', 'list-style',
                        'margin', 'mask', 'offset', 'outline', 'overflow', 'padding', 'place-content',
                        'place-items', 'place-self', 'scroll-margin', 'scroll-padding', 'text-decoration',
                        'text-emphasis', 'transition', 'inset', 'inset-block', 'inset-inline'
                    ];
                    
                    additionalProperties.forEach(property => {
                        try {
                            const value = computedStyle.getPropertyValue(property);
                            if (value !== undefined && value !== null && value !== '' && !styleObj[property]) {
                                styleObj[property] = value;
                            }
                        } catch (e) {
                            // Some properties might not be supported in all browsers
                        }
                    });
                    
                    // Get the element's HTML (outer HTML without children for clean structure)
                    const tempElement = element.cloneNode(false);
                    const elementHtml = tempElement.outerHTML;
                    
                    // Create element object
                    const elementData = {
                        tag: tagName,
                        id: elementId,
                        className: cleanClassNames,
                        html: elementHtml,
                        styles: styleObj
                    };
                    
                    // Get children recursively (only direct children)
                    const children = [];
                    const directChildren = Array.from(element.children);
                    
                    // Limit depth to prevent excessive nesting
                    if (depth < 15 && directChildren.length > 0) {
                        directChildren.forEach(child => {
                            const childData = extractElementTree(child, depth + 1);
                            if (childData) {
                                children.push(childData);
                            }
                        });
                    }
                    
                    if (children.length > 0) {
                        elementData.children = children;
                    }
                    
                    return elementData;
                    
                } catch (error) {
                    console.warn('Error processing element:', error.message);
                    return null;
                }
            }
            
            // Start extraction from document.body or document.documentElement
            const rootElement = document.body || document.documentElement;
            const domTree = extractElementTree(rootElement);
            
            // Get page metadata
            const metadata = {
                url: window.location.href,
                title: document.title,
                extractedAt: new Date().toISOString(),
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                userAgent: navigator.userAgent
            };
            
            return {
                metadata: metadata,
                domTree: domTree,
                totalElements: document.querySelectorAll('*').length
            };
        });
        console.log(`✅ DOM tree extracted with ${computedStyles.totalElements} total elements`);
        } catch (styleError) {
            console.warn('⚠️  Style extraction had issues, creating minimal structure...');
            computedStyles = {
                metadata: {
                    url: url,
                    title: 'Extraction Error',
                    extractedAt: new Date().toISOString(),
                    viewport: { width: 1920, height: 1080 },
                    userAgent: 'Chrome/120.0.0.0'
                },
                domTree: {
                    tag: 'HTML',
                    id: '',
                    className: '',
                    html: '<html></html>',
                    styles: {},
                    children: []
                },
                totalElements: 0
            };
            console.log('✅ Minimal structure created due to extraction issues');
        }
        
        // Create clean filename
        console.log('📁 Creating output files...');
        const urlObj = new URL(url);
        const cleanHostname = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const baseFileName = `${cleanHostname}_${timestamp}_${Date.now()}`;
        console.log(`📂 Base filename: ${baseFileName}`);
        
        // Save clean HTML file (body content only)
        const htmlFileName = `${baseFileName}.html`;
        const cleanHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Extracted Content</title>
    <!-- Extracted from: ${computedStyles.metadata.url} -->
    <!-- Extraction Date: ${computedStyles.metadata.extractedAt} -->
</head>
${htmlContent}
</html>`;
        await fs.writeFile(path.join(__dirname, htmlFileName), cleanHtml, 'utf8');
        console.log(`✅ Clean HTML file saved: ${htmlFileName}`);
        
        // Save computed styles JSON with tree structure
        const stylesFileName = `${baseFileName}_computed-styles.json`;
        await fs.writeFile(
            path.join(__dirname, stylesFileName), 
            JSON.stringify(computedStyles, null, 2), 
            'utf8'
        );
        console.log(`✅ Styles JSON saved: ${stylesFileName}`);
        
        // STEP 2: Extract and save sections using recursive method
        console.log('🔄 STEP 2: Starting section extraction...');
        const sectionFiles = await extractAndSaveSections(htmlContent, computedStyles, __dirname);
        console.log(`✅ Section extraction completed: ${sectionFiles.length} sections found`);
        
        // Generate CSS file from computed styles
        const cssFileName = `${baseFileName}_extracted.css`;
        const cssContent = generateCSSFromTree(computedStyles.domTree);
        await fs.writeFile(path.join(__dirname, cssFileName), cssContent, 'utf8');
        console.log(`✅ CSS file saved: ${cssFileName}`);
        
        console.log('\n🎉 MIGRATION COMPLETED SUCCESSFULLY!');
        console.log('📊 Final Statistics:');
        console.log(`   - Clean HTML file: ${htmlFileName}`);
        console.log(`   - Styles JSON: ${stylesFileName}`);
        console.log(`   - CSS file: ${cssFileName}`);
        console.log(`   - Sections extracted: ${sectionFiles.length}`);
        console.log(`   - Total elements: ${computedStyles.totalElements}`);
        console.log(`   - Page title: ${computedStyles.metadata.title}`);
        console.log(`   - Processing time: ${Date.now() - parseInt(baseFileName.split('_').pop())}ms\n`);
        
        res.json({
            success: true,
            message: 'Migration completed successfully',
            stats: {
                totalElements: computedStyles.totalElements,
                sectionsExtracted: sectionFiles.length,
                url: computedStyles.metadata.url,
                title: computedStyles.metadata.title,
                extractedAt: computedStyles.metadata.extractedAt
            },
            files: {
                html: htmlFileName,
                stylesJson: stylesFileName,
                css: cssFileName,
                sections: sectionFiles
            }
        });
        
    } catch (error) {
        console.error('\n❌ MIGRATION ERROR OCCURRED!');
        console.error('📍 Error details:');
        console.error(`   - Error type: ${error.name}`);
        console.error(`   - Error message: ${error.message}`);
        console.error(`   - Error stack: ${error.stack}`);
        console.error(`   - URL being processed: ${url}`);
        console.error(`   - Timestamp: ${new Date().toISOString()}\n`);
        
        // More specific error handling
        let errorResponse = {
            error: 'Migration failed',
            message: error.message,
            type: error.name,
            timestamp: new Date().toISOString()
        };
        
        if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
            errorResponse.message = 'Cannot resolve domain name. Please check the URL.';
            errorResponse.suggestion = 'Verify the URL is correct and accessible';
        } else if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
            errorResponse.message = 'Connection refused by the server.';
            errorResponse.suggestion = 'Check if the website is online and accessible';
        } else if (error.message.includes('Navigation timeout')) {
            errorResponse.message = 'Page took too long to load (timeout after 60 seconds).';
            errorResponse.suggestion = 'Try again or use a different URL';
        } else if (error.message.includes('Protocol error')) {
            errorResponse.message = 'Browser protocol error occurred.';
            errorResponse.suggestion = 'The page might have issues with automation tools';
        }
        
        if (process.env.NODE_ENV === 'development') {
            errorResponse.stack = error.stack;
        }
        
        res.status(500).json(errorResponse);
    } finally {
        if (browser) {
            console.log('🔄 Closing browser...');
            await browser.close();
            console.log('✅ Browser closed successfully');
        }
    }
});

// Helper function to format HTML
function formatHTML(html) {
    return `<!DOCTYPE html>
<!-- Extracted HTML - Generated by HTML Migrator -->
<!-- Extraction Date: ${new Date().toISOString()} -->
${html}`;
}

// STEP 2: Recursive section extraction function
async function extractAndSaveSections(rawHtmlContent, computedStyles, outputDir) {
    console.log('📁 Creating sections directory...');
    await fs.mkdir(path.join(outputDir, 'sections'), { recursive: true });
    
    const $ = cheerio.load(rawHtmlContent);
    console.log('✅ HTML loaded into Cheerio for parsing');
    
    // Find all top-level sections (parent sections only)
    console.log('🔍 Looking for parent sections...');
    const htmlSections = $('body > section, html > section').toArray();
    const sections = htmlSections.length > 0 
        ? htmlSections 
        : $('section').filter((i, el) => $(el).parents('section').length === 0).toArray();
    
    console.log(`📊 Found ${sections.length} parent sections`);
    
    // Also look for specific IDs: BACKGROUND_GROUP, pinnedTopLeft, pinnedTopRight, pinnedBottomLeft
    const targetIds = ['BACKGROUND_GROUP', 'pinnedTopLeft', 'pinnedTopRight', 'pinnedBottomLeft'];
    const targetElements = [];
    
    targetIds.forEach(targetId => {
        const element = $(`#${targetId}`);
        if (element.length > 0) {
            console.log(`🎯 Found target element: ${targetId}`);
            targetElements.push({
                element: element.get(0),
                id: targetId,
                isTarget: true
            });
        } else {
            console.log(`⚠️  Target element not found: ${targetId}`);
        }
    });
    
    // Combine sections and target elements
    const allSections = [
        ...sections.map(section => ({ element: section, id: $(section).attr('id') || 'section', isTarget: false })),
        ...targetElements
    ];
    
    console.log(`📋 Total sections to process: ${allSections.length}`);
    
    const sectionFiles = [];
    
    // Process each section
    for (let i = 0; i < allSections.length; i++) {
        const { element, id, isTarget } = allSections[i];
        const $section = $(element);
        
        console.log(`🔄 Processing section ${i + 1}/${allSections.length}: ${id}`);
        
        // Extract clean HTML for this section
        const sectionHtml = $.html($section);
        const sectionId = id || `section_${i}`;
        
        // Find matching computed styles for this section
        let computedSection = null;
        
        // Recursive function to find styles in the domTree
        function findStylesInTree(treeNode, targetId) {
            if (!treeNode) return null;
            
            // Check if this node matches our target
            if (treeNode.id === targetId) {
                return treeNode;
            }
            
            // Recursively search in children
            if (treeNode.children && Array.isArray(treeNode.children)) {
                for (const child of treeNode.children) {
                    const found = findStylesInTree(child, targetId);
                    if (found) return found;
                }
            }
            
            return null;
        }
        
        // Try to find the section in the computed styles tree
        if (computedStyles.domTree) {
            computedSection = findStylesInTree(computedStyles.domTree, sectionId);
        }
        
        // If not found, create a basic structure
        if (!computedSection) {
            console.log(`⚠️  No computed styles found for section: ${sectionId}, creating basic structure`);
            computedSection = {
                tag: $section.prop('tagName') || 'DIV',
                id: sectionId,
                className: $section.attr('class') || '',
                html: `<${$section.prop('tagName').toLowerCase()}${sectionId ? ` id="${sectionId}"` : ''}${$section.attr('class') ? ` class="${$section.attr('class')}"` : ''}></${$section.prop('tagName').toLowerCase()}>`,
                styles: {},
                children: []
            };
        }
        
        // Save section HTML file
        const htmlFilename = `sections/section_${i}_${sectionId}.html`;
        const cleanSectionHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Section ${i} - ${sectionId}</title>
    <!-- Extracted section from: ${computedStyles.metadata?.url || 'Unknown'} -->
    <!-- Section ID: ${sectionId} -->
    <!-- Target Element: ${isTarget ? 'Yes' : 'No'} -->
</head>
<body>
${sectionHtml}
</body>
</html>`;
        
        await fs.writeFile(path.join(outputDir, htmlFilename), cleanSectionHtml, 'utf8');
        console.log(`✅ Section HTML saved: ${htmlFilename}`);
        
        // Save section computed styles
        const computedFilename = `sections/section_${i}_${sectionId}_computed.json`;
        const sectionData = {
            sectionInfo: {
                index: i,
                sectionId: sectionId,
                isTargetElement: isTarget,
                extractedAt: new Date().toISOString(),
                sourceUrl: computedStyles.metadata?.url || 'Unknown'
            },
            sectionStyles: computedSection
        };
        
        await fs.writeFile(
            path.join(outputDir, computedFilename),
            JSON.stringify(sectionData, null, 2),
            'utf8'
        );
        console.log(`✅ Section computed styles saved: ${computedFilename}`);
        
        sectionFiles.push({
            index: i,
            sectionId: sectionId,
            htmlFile: htmlFilename,
            computedFile: computedFilename,
            isTarget: isTarget,
            tagName: $section.prop('tagName') || 'DIV'
        });
    }
    
    // Create index file for all sections
    const indexFilename = 'sections/sections_index.json';
    const indexData = {
        totalSections: sectionFiles.length,
        extractedAt: new Date().toISOString(),
        sourceUrl: computedStyles.metadata?.url || 'Unknown',
        targetElementsFound: sectionFiles.filter(s => s.isTarget).length,
        sections: sectionFiles
    };
    
    await fs.writeFile(
        path.join(outputDir, indexFilename),
        JSON.stringify(indexData, null, 2),
        'utf8'
    );
    console.log(`✅ Section index saved: ${indexFilename}`);
    
    return sectionFiles;
}

// Helper function to generate CSS file from DOM tree
function generateCSSFromTree(element, cssRules = new Set()) {
    if (!element) return '';
    
    // Generate CSS rule for current element
    if (element.styles && Object.keys(element.styles).length > 0) {
        let selector = element.tag ? element.tag.toLowerCase() : 'div';
        
        if (element.id) {
            selector = `#${element.id}`;
        } else if (element.className) {
            const firstClass = element.className.trim().split(' ')[0];
            if (firstClass) {
                selector = `.${firstClass}`;
            }
        }
        
        const cssProperties = [];
        for (const [property, value] of Object.entries(element.styles)) {
            cssProperties.push(`  ${property}: ${value};`);
        }
        
        if (cssProperties.length > 0) {
            const rule = `${selector} {\n${cssProperties.join('\n')}\n}`;
            cssRules.add(rule);
        }
    }
    
    // Process children recursively
    if (element.children && Array.isArray(element.children)) {
        element.children.forEach(child => {
            generateCSSFromTree(child, cssRules);
        });
    }
    
    return Array.from(cssRules).join('\n\n');
}

// Helper function to extract and save sections
// async function extractAndSaveSections(rawHtmlContent, computedStyles, outputDir) {
//     console.log('📁 Creating sections directory...');
//     await fs.mkdir(path.join(outputDir, 'sections'), { recursive: true });
    
//     const $ = cheerio.load(rawHtmlContent);
//     console.log('✅ HTML loaded into Cheerio for parsing');
    
//     // Find all top-level sections (parent sections only)
//     console.log('🔍 Looking for parent sections...');
//     const htmlSections = $('body > section, html > section').toArray();
//     const sections = htmlSections.length > 0 
//         ? htmlSections 
//         : $('section').filter((i, el) => $(el).parents('section').length === 0).toArray();
    
//     console.log(`📊 Found ${sections.length} parent sections`);
    
//     // Also look for specific target IDs
//     const targetIds = ['BACKGROUND_GROUP', 'pinnedTopLeft', 'pinnedTopRight', 'pinnedBottomLeft'];
//     const targetElements = [];
    
//     targetIds.forEach(targetId => {
//         const element = $(`#${targetId}`);
//         if (element.length > 0) {
//             console.log(`🎯 Found target element: ${targetId}`);
//             targetElements.push({
//                 element: element.get(0),
//                 id: targetId,
//                 isTarget: true
//             });
//         } else {
//             console.log(`⚠️  Target element not found: ${targetId}`);
//         }
//     });
    
//     // Combine sections and target elements
//     const allSections = [
//         ...sections.map(section => ({ element: section, id: $(section).attr('id') || 'section', isTarget: false })),
//         ...targetElements
//     ];
    
//     console.log(`📋 Total sections to process: ${allSections.length}`);
    
//     const sectionFiles = [];
    
//     // Recursive function to find styles in domTree
//     function findStylesInTree(treeNode, targetId) {
//         if (!treeNode) return null;
        
//         // Check if this node matches our target
//         if (treeNode.id === targetId) {
//             return treeNode;
//         }
        
//         // Recursively search in children
//         if (treeNode.children && Array.isArray(treeNode.children)) {
//             for (const child of treeNode.children) {
//                 const found = findStylesInTree(child, targetId);
//                 if (found) return found;
//             }
//         }
        
//         return null;
//     }
    
//     // Process each section
//     for (let i = 0; i < allSections.length; i++) {
//         const { element, id, isTarget } = allSections[i];
//         const $section = $(element);
        
//         console.log(`🔄 Processing section ${i + 1}/${allSections.length}: ${id}`);
        
//         // Extract clean HTML for this section
//         const sectionHtml = $.html($section);
//         const sectionId = id || `section_${i}`;
        
//         // Find matching computed styles for this section
//         let computedSection = null;
        
//         if (computedStyles.domTree) {
//             computedSection = findStylesInTree(computedStyles.domTree, sectionId);
//         }
        
//         // If not found, create a basic structure
//         if (!computedSection) {
//             console.log(`⚠️  No computed styles found for section: ${sectionId}`);
//             computedSection = {
//                 tag: $section.prop('tagName') || 'DIV',
//                 id: sectionId,
//                 className: $section.attr('class') || '',
//                 html: `<${($section.prop('tagName') || 'div').toLowerCase()}${sectionId ? ` id="${sectionId}"` : ''}${$section.attr('class') ? ` class="${$section.attr('class')}"` : ''}></${($section.prop('tagName') || 'div').toLowerCase()}>`,
//                 styles: {},
//                 children: []
//             };
//         }
        
//         // Save section HTML file
//         const htmlFilename = `sections/section_${i}_${sectionId}.html`;
//         await fs.writeFile(path.join(outputDir, htmlFilename), sectionHtml, 'utf8');
//         console.log(`✅ Section HTML saved: ${htmlFilename}`);
        
//         // Save section computed styles
//         const computedFilename = `sections/section_${i}_${sectionId}_computed.json`;
//         await fs.writeFile(
//             path.join(outputDir, computedFilename),
//             JSON.stringify({ [sectionId]: computedSection }, null, 2),
//             'utf8'
//         );
//         console.log(`✅ Section computed styles saved: ${computedFilename}`);
        
//         sectionFiles.push({
//             index: i,
//             sectionId: sectionId,
//             htmlFile: htmlFilename,
//             computedFile: computedFilename,
//             isTarget: isTarget
//         });
//     }
    
//     return sectionFiles;
// }

// Updated STEP 2: Recursive section extraction function
async function extractAndSaveSections(rawHtmlContent, computedStyles, outputDir) {
    console.log('📁 Creating sections directory in root...');
    const sectionsDir = path.join(outputDir, 'sections');
    await fs.mkdir(sectionsDir, { recursive: true });
    
    const $ = cheerio.load(rawHtmlContent);
    console.log('✅ HTML loaded into Cheerio for parsing');
    
    // Find all top-level sections (parent sections only)
    console.log('🔍 Looking for parent sections...');
    const htmlSections = $('body > section, html > section').toArray();
    const sections = htmlSections.length > 0 
        ? htmlSections 
        : $('section').filter((i, el) => $(el).parents('section').length === 0).toArray();
    
    console.log(`📊 Found ${sections.length} parent sections`);
    
    // Also look for specific IDs: BACKGROUND_GROUP, pinnedTopLeft, pinnedTopRight, pinnedBottomLeft
    const targetIds = ['BACKGROUND_GROUP', 'pinnedTopLeft', 'pinnedTopRight', 'pinnedBottomLeft'];
    const targetElements = [];
    
    targetIds.forEach(targetId => {
        const element = $(`#${targetId}`);
        if (element.length > 0) {
            console.log(`🎯 Found target element: ${targetId}`);
            targetElements.push({
                element: element.get(0),
                id: targetId,
                isTarget: true
            });
        } else {
            console.log(`⚠️  Target element not found: ${targetId}`);
        }
    });
    
    // Combine sections and target elements
    const allSections = [
        ...sections.map(section => ({ element: section, id: $(section).attr('id') || 'section', isTarget: false })),
        ...targetElements
    ];
    
    console.log(`📋 Total sections to process: ${allSections.length}`);
    
    const sectionFiles = [];
    
    // Recursive function to find styles in the domTree
    function findStylesInTree(treeNode, targetId) {
        if (!treeNode) return null;
        
        // Check if this node matches our target
        if (treeNode.id === targetId) {
            return treeNode;
        }
        
        // Recursively search in children
        if (treeNode.children && Array.isArray(treeNode.children)) {
            for (const child of treeNode.children) {
                const found = findStylesInTree(child, targetId);
                if (found) return found;
            }
        }
        
        return null;
    }
    
    // Process each section
    for (let i = 0; i < allSections.length; i++) {
        const { element, id, isTarget } = allSections[i];
        const $section = $(element);
        
        console.log(`🔄 Processing section ${i + 1}/${allSections.length}: ${id}`);
        
        // Extract clean HTML for this section
        const sectionHtml = $.html($section);
        const sectionId = id || `section_${i}`;
        
        // Find matching computed styles for this section
        let computedSection = null;
        
        if (computedStyles.domTree) {
            computedSection = findStylesInTree(computedStyles.domTree, sectionId);
        }
        
        // If not found, create a basic structure
        if (!computedSection) {
            console.log(`⚠️  No computed styles found for section: ${sectionId}, creating basic structure`);
            computedSection = {
                tag: $section.prop('tagName') || 'DIV',
                id: sectionId,
                className: $section.attr('class') || '',
                html: `<${$section.prop('tagName')?.toLowerCase() || 'div'}${sectionId ? ` id="${sectionId}"` : ''}${$section.attr('class') ? ` class="${$section.attr('class')}"` : ''}></${$section.prop('tagName')?.toLowerCase() || 'div'}>`,
                styles: {},
                children: []
            };
        }
        
        // Create HTML with placeholders for extracted content
        const htmlWithPlaceholders = createHtmlWithPlaceholders(sectionHtml, sectionId, i);
        
        // Save section HTML file in sections directory
        const htmlFilename = `section_${i}_${sectionId}.html`;
        const htmlFilePath = path.join(sectionsDir, htmlFilename);
        
        await fs.writeFile(htmlFilePath, htmlWithPlaceholders, 'utf8');
        console.log(`✅ Section HTML saved: sections/${htmlFilename}`);
        
        // Save section computed styles in sections directory
        const computedFilename = `section_${i}_${sectionId}_computed-styles.json`;
        const computedFilePath = path.join(sectionsDir, computedFilename);
        
        const sectionData = {
            sectionInfo: {
                index: i,
                sectionId: sectionId,
                isTargetElement: isTarget,
                extractedAt: new Date().toISOString(),
                sourceUrl: computedStyles.metadata?.url || 'Unknown',
                tagName: $section.prop('tagName') || 'DIV'
            },
            sectionStyles: computedSection
        };
        
        await fs.writeFile(
            computedFilePath,
            JSON.stringify(sectionData, null, 2),
            'utf8'
        );
        console.log(`✅ Section computed styles saved: sections/${computedFilename}`);
        
        sectionFiles.push({
            index: i,
            sectionId: sectionId,
            htmlFile: `sections/${htmlFilename}`,
            computedFile: `sections/${computedFilename}`,
            isTarget: isTarget,
            tagName: $section.prop('tagName') || 'DIV'
        });
    }
    
    console.log(`✅ All sections saved in root/sections directory`);
    return sectionFiles;
}

// Helper function to create HTML with placeholders
function createHtmlWithPlaceholders(sectionHtml, sectionId, index) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Section ${index} - ${sectionId}</title>
    <!-- PLACEHOLDER: Add your CSS links here -->
    <!-- <link rel="stylesheet" href="your-styles.css"> -->
    
    <!-- PLACEHOLDER: Add your custom styles here -->
    <style>
        /* Add your custom CSS for this section */
        
        /* PLACEHOLDER: Import computed styles from JSON file */
        /* Check: section_${index}_${sectionId}_computed-styles.json */
        
    </style>
</head>
<body>
    <!-- PLACEHOLDER: Section ${index} - ID: ${sectionId} -->
    <!-- Extracted from original page -->
    <!-- Use computed-styles.json for styling information -->
    
${sectionHtml}

    <!-- PLACEHOLDER: Add your JavaScript here -->
    <script>
        // Add your custom JavaScript for this section
        
        // PLACEHOLDER: Initialize any interactive components
        console.log('Section ${sectionId} loaded');
        
    </script>
</body>
</html>`;
}

// Helper function to generate CSS file
function generateCSSFile(elements) {
    let css = `/* Extracted CSS Styles - Generated by HTML Migrator */\n`;
    css += `/* Extraction Date: ${new Date().toISOString()} */\n\n`;
    
    Object.values(elements).forEach(element => {
        if (element.cssRule) {
            css += `/* Element ${element.element}: ${element.tagName} */\n`;
            css += `${element.cssRule}\n\n`;
        }
    });
    
    return css;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

// Start server with detailed logging
app.listen(PORT, () => {
    console.log('\n🚀 HTML MIGRATOR V2.0 SERVER STARTED');
    console.log('═══════════════════════════════════════');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log(`🔧 Node.js version: ${process.version}`);
    console.log(`📂 Working directory: ${__dirname}`);
    console.log('\n✨ Features:');
    console.log('   - Clean HTML extraction');
    console.log('   - Proper CSS style formatting');
    console.log('   - SVG element support');
    console.log('   - Ready for rebuild use');
    console.log('   - Detailed error logging');
    console.log('\n📝 Endpoints:');
    console.log('   - GET  / (Main UI)');
    console.log('   - POST /migrate (Migration API)');
    console.log('   - GET  /health (Health check)');
    console.log('\n👉 Open your browser and navigate to the URL above to use the migrator');
    console.log('═══════════════════════════════════════\n');
});

// Add error handling for the server itself
app.on('error', (error) => {
    console.error('\n❌ SERVER ERROR:');
    console.error(error);
});

process.on('uncaughtException', (error) => {
    console.error('\n❌ UNCAUGHT EXCEPTION:');
    console.error(error);
    console.log('Server will continue running...\n');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n❌ UNHANDLED PROMISE REJECTION:');
    console.error('Promise:', promise);
    console.error('Reason:', reason);
    console.log('Server will continue running...\n');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server gracefully...');
    process.exit(0);
});