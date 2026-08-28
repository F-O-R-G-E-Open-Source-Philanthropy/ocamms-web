/**
 * Occam's Web Extension: Directed Edges & Cyclic Dependency Alerts (Decoupled State Edition)
 * 
 * Features:
 * - Reads the full edge list from the main application state (both logic and optional structural edges).
 * - Uses an efficient DFS with path tracking to report each cycle explicitly.
 * - Shows a detailed toast with the list of cycle paths (limited to first 5 cycles to avoid spam).
 * - Exposes cycle detection results via OccamsAPI for use by other plugins.
 * - Styles cyclic edges with pulsing red glow and arrowheads.
 */
(function() {
    if (!window.OccamsAPI) return;

    /**
     * Detect cycles in a directed graph.
     * Returns an array of cycle paths (each path is an array of node IDs).
     */
    function findCycles(edges) {
        // Build adjacency list
        const adj = {};
        edges.forEach(e => {
            if (!adj[e.source]) adj[e.source] = [];
            adj[e.source].push(e.target);
        });

        const visited = {};
        const recStack = {};
        const cycles = [];

        function dfs(node, path) {
            if (recStack[node]) {
                // Cycle found – extract the cycle from the path
                const cycleStart = path.indexOf(node);
                const cyclePath = path.slice(cycleStart);
                cycles.push(cyclePath);
                return;
            }
            if (visited[node]) return;

            visited[node] = true;
            recStack[node] = true;
            path.push(node);

            const neighbors = adj[node] || [];
            for (let neighbor of neighbors) {
                dfs(neighbor, path);
            }

            recStack[node] = false;
            path.pop();
        }

        // Start DFS from every unvisited node
        Object.keys(adj).forEach(node => {
            if (!visited[node]) dfs(node, []);
        });

        return cycles;
    }

    // Hook into the rendering pipeline to style edges and show alerts
    window.OccamsAPI.hooks.afterEdgesDrawn.push((svgGroup) => {
        const state = window.OccamsAPI.state;

        // Choose which edges to analyze: logic edges only (state.edges) or include structural edges (state.structuralEdges)
        // For this version, we analyze only logic edges to avoid false positives from harmless config loading.
        const edgeList = state.edges; 
        const cycles = findCycles(edgeList);

        // Clear previous cycle-warning classes (to avoid stale styling)
        svgGroup.querySelectorAll('.cycle-warning').forEach(el => el.classList.remove('cycle-warning'));
        svgGroup.querySelectorAll('[marker-end="url(#arrowhead-cycle)"]').forEach(el => el.removeAttribute('marker-end'));

        if (cycles.length > 0) {
            // Collect all edges that are part of any cycle
            const cycleEdgeSet = new Set();
            cycles.forEach(path => {
                for (let i = 0; i < path.length; i++) {
                    const from = path[i];
                    const to = path[(i + 1) % path.length];
                    cycleEdgeSet.add(`${from}->${to}`);
                }
            });

            // Highlight the edges that belong to cycles
            const packets = svgGroup.querySelectorAll('.edge-packet');
            const glows = svgGroup.querySelectorAll('.edge-glow');

            packets.forEach((packet, index) => {
                const src = packet.getAttribute('data-source');
                const tgt = packet.getAttribute('data-target');
                const key = `${src}->${tgt}`;
                if (cycleEdgeSet.has(key)) {
                    packet.classList.add('cycle-warning');
                    packet.setAttribute('marker-end', 'url(#arrowhead-cycle)');
                    if (glows[index]) glows[index].classList.add('cycle-warning');
                }
            });

            // Show a toast with the cycle details (limit to 5 cycles to avoid overflow)
            const cycleMessages = cycles.slice(0, 5).map(path => path.join(' → '));
            const extra = cycles.length > 5 ? ` (and ${cycles.length - 5} more)` : '';
            const message = `⚠️ ${cycles.length} cyclic dependency${cycles.length > 1 ? 'ies' : ''} detected! ${cycleMessages.join('; ')}${extra}`;
            
            // Throttle to avoid spamming during drag operations
            if (!window._cycleToastShown) {
                window.OccamsAPI.showToast(message);
                window._cycleToastShown = true;
                setTimeout(() => { window._cycleToastShown = false; }, 5000);
            }

            // Expose cycle data for other plugins
            window.OccamsAPI._cycleData = { cycles, cycleEdgeSet };
        } else {
            // No cycles – clear any stored data
            delete window.OccamsAPI._cycleData;
        }
    });

    console.log("✅ Occam's Web Extension Loaded: Cyclic Alerts (Decoupled Edition)");
})();
