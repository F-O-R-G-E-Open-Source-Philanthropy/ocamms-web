/**
 * Occam's Web Extension: Cloud Database Detector
 * Hooks into the file parsing middleware to intercept external database integrations
 * (e.g., Firebase, Supabase, MongoDB, PostgreSQL, AWS).
 */
(function() {
    if (!window.OccamsAPI) return;

    window.OccamsAPI.hooks.onFileParse.push((context) => {
        const { content, deps } = context;

        let dbName = null;

        // 1. Firebase / Firestore
        if (content.match(/firebase\/firestore/i) || content.match(/getFirestore/i) || content.match(/initializeApp\s*\(/i)) {
            dbName = 'Firebase';
        }
        
        // 2. Supabase
        else if (content.match(/@supabase\/supabase-js/i) || content.match(/createClient\s*\(/i)) {
            dbName = 'Supabase';
        }
        
        // 3. MongoDB
        else if (content.match(/mongodb/i) || content.match(/MongoClient/i)) {
            dbName = 'MongoDB';
        }
        
        // 4. PostgreSQL / Generic SQL Drivers
        else if (content.match(/require\(['"]pg['"]\)/i) || content.match(/new Client\s*\(/i) || content.match(/new Pool\s*\(/i)) {
            dbName = 'PostgreSQL';
        }
        
        // 5. AWS DynamoDB
        else if (content.match(/@aws-sdk\/client-dynamodb/i) || content.match(/DynamoDBClient/i)) {
            dbName = 'DynamoDB';
        }

        if (dbName) {
            const dbNodeId = `CloudDB - ${dbName}`;
            
            // Inject the dependency into the file's structural array
            deps.push({ target: dbNodeId, isStructural: true });

            // Create the special Cloud DB node if it doesn't exist yet
            if (!window.OccamsAPI.state.nodes[dbNodeId]) {
                // Notice we pass 'db-cloud' as the node type.
                // The main Canvas uses this type to mount the glowing cyan cloud CSS badge.
                window.OccamsAPI.addNode(dbNodeId, 'db-cloud', '', [], [], '');
            }
        }
    });

    console.log("Occam's Web Extension Loaded: Cloud DB Detector");
})();
