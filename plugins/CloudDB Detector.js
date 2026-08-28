/**
 * Occam's Web Extension: Cloud Database Detector (Full Universal Edition)
 * 
 * Features:
 * - Detects static AND dynamic imports for ALL supported engines.
 * - Captures database/resource names from engine-specific calls:
 *   - Supabase: .from('table')
 *   - Firebase: .collection('collection')
 *   - MongoDB: .db('database') + .collection('collection')
 *   - Mongoose: .collection('collection') + model('User')
 *   - Prisma: model User { ... }
 *   - DynamoDB: TableName: 'table'
 * - Fallback detection for engines used globally (without imports) via constructor/usage patterns.
 * - Normalizes code to handle multi-line formatting, comments, and quote variations.
 * - Creates distinct `db-cloud` nodes for each unique database + resource.
 */
(function() {
    if (!window.OccamsAPI) return;

    // ================================================================
    // 1. CODE PREPROCESSOR
    // ================================================================
    function normalizeCodeString(rawCode) {
        return rawCode
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*/g, '')
            .replace(/#.*/g, '')
            .replace(/\s+/g, ' ')
            .replace(/"/g, "'")
            .replace(/`/g, "'");
    }

    // ================================================================
    // 2. IMPORT DETECTOR – static AND dynamic for all engines
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

        const testImport = (pattern) => new RegExp(pattern).test(code);

        // Static imports / requires
        if (testImport(`from\\s+['"]@supabase/supabase-js['"]`) || testImport(`require\\s*\\(['"]@supabase/supabase-js['"]\\)`)) {
            engines.supabase = true;
        }
        if (testImport(`from\\s+['"]firebase['"]`) || testImport(`from\\s+['"]firebase-admin['"]`) || testImport(`require\\s*\\(['"]firebase['"]\\)`)) {
            engines.firebase = true;
        }
        if (testImport(`from\\s+['"]mongodb['"]`) || testImport(`require\\s*\\(['"]mongodb['"]\\)`)) {
            engines.mongodb = true;
        }
        if (testImport(`from\\s+['"]mongoose['"]`) || testImport(`require\\s*\\(['"]mongoose['"]\\)`)) {
            engines.mongoose = true;
        }
        if (testImport(`from\\s+['"]@prisma/client['"]`)) {
            engines.prisma = true;
        }
        if (testImport(`from\\s+['"]@aws-sdk/client-dynamodb['"]`) || testImport(`require\\s*\\(['"]@aws-sdk/client-dynamodb['"]\\)`)) {
            engines.dynamodb = true;
        }

        // --- Dynamic imports (universal) ---
        if (testImport(`import\\s*\\(\\s*'@supabase/supabase-js'`)) engines.supabase = true;
        if (testImport(`import\\s*\\(\\s*'firebase'`) || testImport(`import\\s*\\(\\s*'firebase-admin'`)) engines.firebase = true;
        if (testImport(`import\\s*\\(\\s*'mongodb'`)) engines.mongodb = true;
        if (testImport(`import\\s*\\(\\s*'mongoose'`)) engines.mongoose = true;
        if (testImport(`import\\s*\\(\\s*'@prisma/client'`)) engines.prisma = true;
        if (testImport(`import\\s*\\(\\s*'@aws-sdk/client-dynamodb'`)) engines.dynamodb = true;

        return engines;
    }

    // ================================================================
    // 3. DETECTION LOGIC – with universal fallback for global usage
    // ================================================================
    function detectCloudDBs(fileContent, fileName) {
        const clean = normalizeCodeString(fileContent);
        const imported = detectImportedEngines(clean);
        const detected = [];

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

        // --- Run rules for imported engines ---
        if (imported.supabase) {
            addDetections('Supabase', /\.from\s*\(\s*'([^']+)'\s*\)/g);
        }
        if (imported.firebase) {
            addDetections('Firebase', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
        }
        if (imported.mongodb) {
            addDetections('MongoDB', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
            addDetections('MongoDB', /\.db\s*\(\s*'([^']+)'\s*\)/g);
        } else if (imported.mongoose) {
            addDetections('Mongoose', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
            addDetections('Mongoose', /model\s*\(\s*'([^']+)'/g);
        }
        if (imported.prisma) {
            addDetections('Prisma', /model\s+([a-zA-Z0-9_]+)\s+{/g);
        }
        if (imported.dynamodb) {
            addDetections('DynamoDB', /TableName\s*:\s*'([^']+)'/g);
        }

        // --- UNIVERSAL FALLBACK: detect global usage (without imports) ---
        // We run these only if the engine wasn't imported, to avoid duplication.
        if (!imported.supabase && /new\s+SupabaseClient/.test(clean)) {
            // Look for .from('table') calls
            addDetections('Supabase (global)', /\.from\s*\(\s*'([^']+)'\s*\)/g);
        }
        if (!imported.firebase && /new\s+Firebase/.test(clean)) {
            addDetections('Firebase (global)', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
        }
        if (!imported.mongodb && /new\s+MongoClient/.test(clean)) {
            addDetections('MongoDB (global)', /\.db\s*\(\s*'([^']+)'\s*\)/g);
            addDetections('MongoDB (global)', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
        }
        if (!imported.mongoose && /new\s+Mongoose/.test(clean)) {
            addDetections('Mongoose (global)', /\.collection\s*\(\s*'([^']+)'\s*\)/g);
        }
        if (!imported.prisma && /new\s+PrismaClient/.test(clean)) {
            addDetections('Prisma (global)', /model\s+([a-zA-Z0-9_]+)\s+{/g);
        }
        if (!imported.dynamodb && /new\s+DynamoDB/.test(clean)) {
            addDetections('DynamoDB (global)', /TableName\s*:\s*'([^']+)'/g);
        }

        // --- Fallback: Generic SQL – only if no specific DB import was detected ---
        const anySpecific = Object.values(imported).some(v => v === true);
        if (!anySpecific) {
            const genericRegex = /(?:from|join|into|update)\s+'?([a-zA-Z0-9_]+)'?/gi;
            let match;
            while ((match = genericRegex.exec(clean)) !== null) {
                const resourceName = match[1];
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
    // 4. PLUGIN HOOK
    // ================================================================
    window.OccamsAPI.hooks.onFileParse.push((context) => {
        const { fileName, content, deps } = context;
        const detections = detectCloudDBs(content, fileName);

        detections.forEach(({ engine, resourceName, nodeId }) => {
            deps.push({ target: nodeId, isStructural: true });
            if (!window.OccamsAPI.state.nodes[nodeId]) {
                window.OccamsAPI.addNode(nodeId, 'db-cloud', '', [], [], '');
            }
        });

        if (detections.length) {
            console.log(`[CloudDB Detector] ${detections.length} cloud DB references found in ${fileName}`);
        }
    });

    console.log("✅ Occam's Web Extension Loaded: CloudDB Detector (Full Universal Edition)");
})();
