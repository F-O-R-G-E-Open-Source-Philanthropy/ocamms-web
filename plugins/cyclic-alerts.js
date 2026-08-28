/**
 * Occam's Web Extension: Directed Edges & Cyclic Dependency Alerts
 * Locates circular architecture paths and highlights them in pulsing red.
 */
(function() {
    // Ensure the core application API is available
    if (!window.OccamsAPI) return;

    /**
     * Depth-First Search to find cycles in a directed graph
     */
    function findCycles(edges) {
        const adj = {};
        edges.forEach(e => {
            if (!adj[e.source]) adj[e.source] = [];
            adj[e.source].push(e.target);
        });

        const visited = {};
        const recStack = {};
        const cycleEdges = new Set();
        const path = [];

        function dfs(node) {
            if (recStack[node]) {
                // Cycle detected. Backtrace the path to flag the specific edges.
                const cycleStart = path.indexOf(node);
                for (let i = cycleStart; i < path.length; i++) {
                    const from = path[i];
                    const to = path[(i + 1) % path.length] || node;
                    cycleEdges.add(`${from}->${to}`);
                }
                return;
            }
            
            if (visited[node]) return;

            visited[node] = true;
            recStack[node] = true;
            path.push(node);

            if (adj[node]) {
                adj[node].forEach(neighbor => dfs(neighbor));
            }

            recStack[node] = false;
            path.pop();
        }

        Object.keys(adj).forEach(node => {
            if (!visited[node]) dfs(node);
        });

        return cycleEdges;
    }

    // Hook into the render loop to analyze and style edges after they are drawn
    window.OccamsAPI.hooks.afterEdgesDrawn.push((svgGroup) => {
        const state = window.OccamsAPI.state;
        const cycles = findCycles(state.edges);

        if (cycles.size > 0) {
            const packets = svgGroup.querySelectorAll('.edge-packet');
            const glows = svgGroup.querySelectorAll('.edge-glow');

            packets.forEach((packet, index) => {
                const src = packet.getAttribute('data-source');
                const tgt = packet.getAttribute('data-target');
                
                // If this specific connection is part of a cycle, apply warning styles
                if (cycles.has(`${src}->${tgt}`)) {
                    packet.classList.add('cycle-warning');
                    packet.setAttribute('marker-end', 'url(#arrowhead-cycle)');
                    if (glows[index]) glows[index].classList.add('cycle-warning');
                }
            });

            // Throttle the warning toast so it doesn't spam the user 60 times a second while dragging
            if (!window._cycleToastShown) {
                window.OccamsAPI.showToast(`⚠️ Warning: ${cycles.size} cyclic dependencies detected!`);
                window._cycleToastShown = true;
                setTimeout(() => { window._cycleToastShown = false; }, 5000);
            }
        }
    });

    console.log("Occam's Web Extension Loaded: Cyclic Alerts");
})();
