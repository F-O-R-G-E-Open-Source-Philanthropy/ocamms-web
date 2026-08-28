/**
 * Occam's Web Extension: Cloud Database Detector (Import-Aware Edition)
 * 
 * Features:
 * - Scans import/require statements to determine which DB engines are actually used.
 * - Only runs regex patterns for engines that are imported in the file.
 * - Prevents false positives (e.g., .collection() matched to both Firebase and MongoDB).
 * - Falls back to a generic SQL rule only when no specific DB import is found.
 * - Still normalises code to handle multi-line formatting and comments.
 */
(function() {
    if (!window.OccamsAPI) return;

    // ================================================================
    // 1. CODE PREPROCESSOR – eliminates structural fragility
    // ================================================================
    function normalizeCodeString(rawCode) {
        return rawCode
            // Strip multi‑line comments /* ... */
            .replace(/\/\*[\s\S]*?\*\//g, '')
            // Strip single‑line comments // ...
            .replace(/\/\/.*/g, '')
            // Strip Python/Ruby/Shell comments (# ...)
            .replace(/#.*/g, '')
            // Collapse all whitespace (including line breaks) into a single space
            .replace(/\s+/g, ' ')
            // Standardize on single quotes for easier regex matching
            .replace(/"/g, "'")
            .replace(/`/g, "'");
    }

    // ================================================================
    // 2. IMPORT DETECTOR – tells us which DBs are actually used in this file
    // ================================================================
    function detectImportedEngines(code) {
        const engines = {
            supabase: false,
            firebase: false,
            mongodb: false,
            mongoose: false,
            prisma: false,
            dynamodb: false,
        };

        // Supabase
        if (/from\s+['"]@supabase\/supabase-js['"]/.test(code) || /require\s*\(['"]@supabase\/supabase-js['"]\)/.test(code)) {
            engines.supabase = true;
        }
        // Firebase (v9 modular or v8/compat)
        if (/from\s+['"]firebase['"]/.test(code) || /from\s+['"]firebase-admin['"]/.test(code) || /require\s*\(['"]firebase['"]\)/.test(code)) {
            engines.firebase = true;
        }
        // MongoDB Native Driver
        if (/from\s+['"]mongodb['"]/.test(code) || /require\s*\(['"]mongodb['"]\)/.test(code)) {
            engines.mongodb = true;
        }
        // Mongoose
        if (/from\s+['"]mongoose['"]/.test(code) || /require\s*\(['"]mongoose['"]\)/.test(code)) {
            engines.mongoose = true;
        }
        // Prisma (usually `import { PrismaClient } from '@prisma/client'`)
        if (/from\s+['"]@prisma\/client['"]/.test(code)) {
            engines.prisma = true;
        }
        // DynamoDB (AWS SDK)
        if (/from\s+['"]@aws-sdk\/client-dynamodb['"]/.test(code) || /require\s*\(['"]@aws-sdk\/client-dynamodb['"]\)/.test(code)) {
            engines.dynamodb = true;
        }

        return engines;
    }

    // ================================================================
    // 3. DETECTION LOGIC – only runs rules for imported engines
    // ================================================================
    function detectCloudDBs(fileContent, fileName) {
        const clean = normalizeCodeString(fileContent);
        const imported = detectImportedEngines(clean); // <-- imports FIRST
        const detected = [];

        // Helper to add detections for a given engine and regex
        function addDetections(engineName, regex) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(clean)) !== null) {
                const resourceName = match[1] || match[0];
                detected.push({
                    engine: engineName,
                    resourceName,
                    nodeId: `CloudDB - ${engineName} (${resourceName})`
                });
            }
        }

        // Only run rules for engines that were actually imported
        if (imported.supabase) {
            addDetections('Supabase', /\.from\s*\(\s*'([^']+)'\s*\)/g);
        }

        if (imported.firebase) {
            addDetections('Firebase', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
        }

        // MongoDB and Mongoose share the `.collection()` pattern – run if either is imported
        if (imported.mongodb) {
            addDetections('MongoDB', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
        } else if (imported.mongoose) {
            // Mongoose uses `model('User')` already captured separately; but also can use `.collection()` for the underlying driver
            addDetections('Mongoose', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
        }

        if (imported.prisma) {
            // Prisma model definitions – e.g., model User { ... }
            const regex = /model\s+([a-zA-Z0-9_]+)\s+{/g;
            addDetections('Prisma', regex);
        }

        if (imported.dynamodb) {
            // DynamoDB table names: TableName: 'Users'
            addDetections('DynamoDB', /TableName\s*:\s*'([^']+)'/g);
        }

        // Fallback: Generic SQL – only run if no specific DB import was detected,
        // to avoid false positives in files that just happen to use SQL keywords
        const anySpecific = Object.values(imported).some(v => v === true);
        if (!anySpecific) {
            // Use a more conservative regex to avoid matching random strings
            const genericRegex = /(?:from|join|into|update)\s+'?([a-zA-Z0-9_]+)'?/gi;
            let match;
            while ((match = genericRegex.exec(clean)) !== null) {
                const resourceName = match[1];
                // Avoid common false positives like 'from' as a word
                if (resourceName && resourceName.length > 1) {
                    detected.push({
                        engine: 'GenericSQL',
                        resourceName,
                        nodeId: `CloudDB - GenericSQL (${resourceName})`
                    });
                }
            }
        }

        return detected;
    }

    // ================================================================
    // 4. PLUGIN HOOK – integrate with Occam's Web file parser
    // ================================================================
    window.OccamsAPI.hooks.onFileParse.push((context) => {
        const { fileName, content, deps } = context;

        // Run detection on the raw content (normalization happens inside)
        const detections = detectCloudDBs(content, fileName);

        detections.forEach(({ engine, resourceName, nodeId }) => {
            // Add dependency as structural (safe, non‑cyclic)
            deps.push({ target: nodeId, isStructural: true });

            // Create the Cloud DB node if it doesn't exist
            if (!window.OccamsAPI.state.nodes[nodeId]) {
                // Use type 'db-cloud' – the main UI will render a cloud badge
                window.OccamsAPI.addNode(nodeId, 'db-cloud', '', [], [], '');
            }
        });

        if (detections.length) {
            console.log(`[CloudDB Detector] ${detections.length} cloud DB references found in ${fileName}`);
        }
    });

    console.log("✅ Occam's Web Extension Loaded: CloudDB Detector (Import-Aware Edition)");
})();
