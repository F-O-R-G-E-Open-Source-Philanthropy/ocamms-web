/**
 * Occam's Web Extension: Cloud Database Detector (Robust Edition)
 * 
 * Features:
 * - Code normalization: strips comments, compresses whitespace, standardizes quotes.
 * - Configuration‑driven rule set – easily extend for new DB engines or languages.
 * - Flexible regex patterns that ignore line breaks and quote variations.
 * - Automatically creates CloudDB nodes with a distinct `db-cloud` type.
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
    // 2. CONFIGURATION-DRIVEN RULE SET
    // ================================================================
    const RULES = [
        // Supabase / PostgreSQL / any .from() style
        { engine: 'Supabase', regex: /\.from\s*\(\s*'([^']+)'\s*\)/g, type: 'Relational Table' },
        // Firebase / Firestore .collection()
        { engine: 'Firebase', regex: /\.collection\s*\(\s*'([^']+)'\s*\)/g, type: 'NoSQL Collection' },
        // MongoDB .collection()
        { engine: 'MongoDB', regex: /\.collection\s*\(\s*'([^']+)'\s*\)/g, type: 'NoSQL Collection' },
        // Mongoose model('User')
        { engine: 'Mongoose', regex: /model\s*\(\s*'([^']+)'/g, type: 'ORM Model' },
        // Generic SQL keywords (FROM, JOIN, INTO, UPDATE) followed by table name
        { engine: 'GenericSQL', regex: /(?:from|join|into|update)\s+'?([a-zA-Z0-9_]+)'?/gi, type: 'SQL Table' },
        // AWS DynamoDB table references (e.g. new DynamoDB.DocumentClient() + .get({ TableName: '...' }))
        { engine: 'DynamoDB', regex: /TableName\s*:\s*'([^']+)'/g, type: 'NoSQL Table' },
        // Prisma model (model User { ... }) – used in schema files
        { engine: 'Prisma', regex: /model\s+([a-zA-Z0-9_]+)\s+{/g, type: 'ORM Model' },
    ];

    // ================================================================
    // 3. DETECTION LOGIC
    // ================================================================
    function detectCloudDBs(fileContent, fileName) {
        const detected = [];
        const clean = normalizeCodeString(fileContent);

        RULES.forEach(({ engine, regex, type }) => {
            // Reset regex state (global flag requires manual reset)
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(clean)) !== null) {
                const resourceName = match[1] || match[0]; // fallback
                detected.push({
                    engine,
                    resourceName,
                    type,
                    // build a unique node identifier
                    nodeId: `CloudDB - ${engine} (${resourceName})`
                });
            }
        });

        return detected;
    }

    // ================================================================
    // 4. PLUGIN HOOK – integrate with Occam's Web file parser
    // ================================================================
    window.OccamsAPI.hooks.onFileParse.push((context) => {
        const { fileName, content, deps } = context;

        // Run detection on the raw content (normalization happens inside)
        const detections = detectCloudDBs(content, fileName);

        detections.forEach(({ engine, resourceName, type, nodeId }) => {
            // Add dependency as structural (safe, non‑cyclic)
            deps.push({ target: nodeId, isStructural: true });

            // Create the Cloud DB node if it doesn't exist
            if (!window.OccamsAPI.state.nodes[nodeId]) {
                // Use type 'db-cloud' – the main UI will render a cloud badge
                window.OccamsAPI.addNode(nodeId, 'db-cloud', '', [], [], '');
            }
        });

        // Optional: log detection count for debugging
        if (detections.length) {
            console.log(`[CloudDB Detector] ${detections.length} cloud DB references found in ${fileName}`);
        }
    });

    console.log("✅ Occam's Web Extension Loaded: CloudDB Detector (Robust Edition)");
})();
