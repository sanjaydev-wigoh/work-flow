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
                
                // Extract styles for ALL elements
                const elementsWithStyles = {};
                
                // Get all elements in the document
                const allElements = document.querySelectorAll('*');
                allElements.forEach((element, index) => {
                    const elementData = extractElementWithStyles(element);
                    if (elementData) {
                        // Use ID if available, otherwise create a unique identifier
                        const key = elementData.id || `element_${index}`;
                        elementsWithStyles[key] = elementData;
                    }
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

// NEW: Process HTML and extract components with nested JSON structure and attribute placeholders
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
    
    // NEW: Function to create nested JSON structure with children
    function createNestedElementStructure(element, computedStyles) {
        const $element = $(element);
        const elementId = $element.attr('id') || '';
        const className = $element.attr('class') || '';
        const tagName = element.tagName.toLowerCase();
        
        // Get styles for this element
        const elementStyles = computedStyles.elements[elementId]?.styles || {};
        
        // Create base structure
        const elementStructure = {
            tag: tagName.toUpperCase(),
            id: elementId,
            className: className,
            html: $.html($element),
            styles: elementStyles,
            children: []
        };
        
        // Process direct children only (not all descendants)
        $element.children().each((index, child) => {
            const childStructure = createNestedElementStructure(child, computedStyles);
            elementStructure.children.push(childStructure);
        });
        
        return elementStructure;
    }
    
    // Process each target ID
    for (const targetId of targetIds) {
        const $element = $('#' + targetId);
        if ($element.length > 0) {
            console.log(`✅ Found target ID: ${targetId}`);
            
            // Generate placeholder ID
            const placeholderId = `wigoh-id-${String(placeholderCounter).padStart(3, '0')}`;
            placeholderCounter++;
            
            // NEW: Add placeholder attribute to the element in extracted HTML
            $element.attr('wig-id', `{{${placeholderId}}}`);
            
            // Extract the component HTML with placeholder attribute
            const componentHtml = $.html($element);
            
            // NEW: Create nested JSON structure
            const nestedStructure = createNestedElementStructure($element[0], computedStyles);
            
            // Save component HTML file
            const componentFilename = `${placeholderId}_${targetId}.html`;
            const componentPath = path.join(componentsDir, componentFilename);
            
            const cleanComponentHtml = createCleanComponentHTML(componentHtml, targetId, placeholderId);
            await fs.writeFile(componentPath, cleanComponentHtml, 'utf8');
            console.log(`📄 Component saved: components/${componentFilename}`);
            
            // NEW: Save nested JSON structure
            const jsonFilename = `${placeholderId}_${targetId}.json`;
            const jsonPath = path.join(componentsDir, jsonFilename);
            
            // Create the final JSON structure with the element ID as the key
            const finalJsonStructure = {};
            finalJsonStructure[targetId] = nestedStructure;
            
            await fs.writeFile(jsonPath, JSON.stringify(finalJsonStructure, null, 2), 'utf8');
            console.log(`📊 Nested JSON saved: components/${jsonFilename}`);
            
            // Replace element in original HTML with placeholder
            $element.replaceWith(`{{${placeholderId}}}`);
            console.log(`🔄 Replaced ${targetId} with {{${placeholderId}}} in original HTML`);
            
            extractedComponents.push({
                placeholderId: placeholderId,
                originalId: targetId,
                type: 'target-id',
                found: true,
                componentFile: `components/${componentFilename}`,
                jsonFile: `components/${jsonFilename}`,
                childrenCount: nestedStructure.children.length
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
            
            // Create empty JSON structure
            const jsonFilename = `${placeholderId}_${targetId}.json`;
            const jsonPath = path.join(componentsDir, jsonFilename);
            
            const emptyJsonStructure = {};
            emptyJsonStructure[targetId] = {
                tag: "DIV",
                id: targetId,
                className: "",
                html: `<div id="${targetId}" class="not-found-component" wig-id="{{${placeholderId}}}">Component not found</div>`,
                styles: {},
                children: []
            };
            
            await fs.writeFile(jsonPath, JSON.stringify(emptyJsonStructure, null, 2), 'utf8');
            console.log(`📊 Empty JSON saved: components/${jsonFilename}`);
            
            extractedComponents.push({
                placeholderId: placeholderId,
                originalId: targetId,
                type: 'target-id',
                found: false,
                componentFile: `components/${componentFilename}`,
                jsonFile: `components/${jsonFilename}`,
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
        
        // NEW: Add placeholder attribute to the section in extracted HTML
        $section.attr('wig-id', `{{${placeholderId}}}`);
        
        // Extract the section HTML (includes all nested content)
        const sectionHtml = $.html($section);
        
        // NEW: Create nested JSON structure for section
        const nestedStructure = createNestedElementStructure($section[0], computedStyles);
        
        // Save section HTML file
        const componentFilename = `${placeholderId}_${sectionId}.html`;
        const componentPath = path.join(componentsDir, componentFilename);
        
        const cleanSectionHtml = createCleanComponentHTML(sectionHtml, sectionId, placeholderId);
        await fs.writeFile(componentPath, cleanSectionHtml, 'utf8');
        console.log(`📄 Section saved: components/${componentFilename}`);
        
        // NEW: Save nested JSON structure for section
        const jsonFilename = `${placeholderId}_${sectionId}.json`;
        const jsonPath = path.join(componentsDir, jsonFilename);
        
        // Create the final JSON structure with the section ID as the key
        const finalJsonStructure = {};
        finalJsonStructure[sectionId] = nestedStructure;
        
        await fs.writeFile(jsonPath, JSON.stringify(finalJsonStructure, null, 2), 'utf8');
        console.log(`📊 Section nested JSON saved: components/${jsonFilename}`);
        
        // Replace section in original HTML with placeholder
        $section.replaceWith(`{{${placeholderId}}}`);
        console.log(`🔄 Replaced section ${sectionId} with {{${placeholderId}}} in original HTML`);
        
        extractedComponents.push({
            placeholderId: placeholderId,
            originalId: sectionId,
            type: 'section',
            found: true,
            componentFile: `components/${componentFilename}`,
            jsonFile: `components/${jsonFilename}`,
            childrenCount: nestedStructure.children.length
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
        /* Reference the ${placeholderId}_${originalId}.json for nested structure and styles */
        /* This file contains ALL nested elements with their styles and children */
    </style>
</head>
<body>
    <!-- Extracted Component: ${originalId} -->
    <!-- Placeholder ID: ${placeholderId} -->
    <!-- Replace {{${placeholderId}}} in original HTML with this component -->
    <!-- This component includes ALL nested elements with wig-id attribute -->
    
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '5.0.0-nested-json-with-attribute-placeholders'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n🚀 HTML COMPONENT EXTRACTOR V5.0 (NESTED JSON + ATTRIBUTE PLACEHOLDERS)');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log('\n✨ NEW FEATURES:');
    console.log('   ✅ Nested JSON structure with children array');
    console.log('   ✅ Attribute placeholders: wig-id="{{wigoh-id-001}}" inside parent tags');
    console.log('   ✅ Placeholders kept in original HTML file as {{wigoh-id-001}}');
    console.log('   ✅ Extracted HTML includes wig-id attribute in parent element');
    console.log('   ✅ JSON format matches your specification exactly');
    console.log('\n📁 OUTPUT FILES:');
    console.log('   - original_with_placeholders.html (with {{wigoh-id-001}} placeholders)');
    console.log('   - components/wigoh-id-001_BACKGROUND_GROUP.html (with wig-id attribute)');
    console.log('   - components/wigoh-id-001_BACKGROUND_GROUP.json (nested structure)');
    console.log('   - components/wigoh-id-002_section_1.html');
    console.log('   - components/wigoh-id-002_section_1.json');
    console.log('\n📊 JSON STRUCTURE:');
    console.log('   {');
    console.log('     "comp-lt8qhfae": {');
    console.log('       "tag": "SECTION",');
    console.log('       "id": "comp-lt8qhfae",');
    console.log('       "className": "Oqnisf comp-lt8qhfae wixui-section",');
    console.log('       "html": "<section wig-id=\\"{{wigoh-id-001}}\\"...",');
    console.log('       "styles": { ... },');
    console.log('       "children": [ ... ]');
    console.log('     }');
    console.log('   }');
    console.log('\n🎯 Targeting:');
    console.log('   - Specific IDs: BACKGROUND_GROUP, pinnedTopLeft, pinnedTopRight, pinnedBottomLeft');
    console.log('   - Top-level section elements only (includes all nested content)');
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