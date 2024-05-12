const express = require('express');
const httpProxy = require('http-proxy');
const metricQueues = require('./fetch'); // Import the metric queues from the fetching script

const app = express();
const proxy = httpProxy.createProxyServer({});
const actualQueue = metricQueues[`${server.host}:${server.port}`]
const servers = [
    { host: '54.208.139.171', port: 8080, IC:0.5 },
    { host: '44.222.156.160', port: 8080, IC:0.5 },
];

app.use(async (req, res) => {
    let minLoad = Infinity;
    let minLoadServer = null;

    let deltaCPUs = [];
    let deltaMemories = [];
    let deltaConnections = [];

    // Loop through each server to compute deltas
    let previousCPU = 0, previousMemory = 0, previousConnections = 0;

    for (const server of servers) {
        try {
            // Fetch metrics from the queue for the current server
            const queue = actualQueue;
            // Get the latest metric data from the queue
            const latestMetric = queue.peekBack(); // Assuming peek() function retrieves the latest item without removing it
            
            if (latestMetric) {
                const { timestamp } = latestMetric;
                let {cpuUsage, memoryUsage, activeConnections}=latestMetric.metrics;
                
                // const previousMetric = queue.items.find(item => item.timestamp <= timestamp - 2000);
                
                let previousMetric = null;
                for (let i = queue.length-1; i >=0 ; i--) {
                    if (queue.get(i).timestamp <= timestamp - 2000) {
                        previousMetric = queue.get(i);
                        break;
                    }
                }

                if (previousMetric) {
                    ({ cpuUsage: previousCPU, memoryUsage: previousMemory, activeConnections: previousConnections } = previousMetric.metrics);
                }else{
                    console.log("NO PREV METRIC FOUND:::");
                }

                // Calculate deltas
                previousCPU = parseFloat(previousCPU.replace('%', ''));
                previousMemory = parseFloat(previousMemory.replace('%', ''));
                cpuUsage = parseFloat(cpuUsage.replace('%', ''));
                memoryUsage = parseFloat(memoryUsage.replace('%', ''));

                const deltaCPU = Math.abs(previousCPU - cpuUsage);
                const deltaMemory = Math.abs(previousMemory - memoryUsage);
                const deltaConn = (Math.abs(previousConnections - activeConnections))*server.IC;

                // Push deltas to respective arrays
                deltaCPUs.push(deltaCPU);
                deltaMemories.push(deltaMemory);
                deltaConnections.push(deltaConn);
            } else {
                console.error(`No metrics found for server ${server.host}:${server.port}`);
            }
        } catch (error) {
            console.error(`Error fetching metrics from server ${server.host}:${server.port}: ${error.message}`);
        }
    }

    // Find max and min delta values across all servers
    const maxDeltaCPU = Math.max(...deltaCPUs);
    const minDeltaCPU = Math.min(...deltaCPUs);
    const maxDeltaMemory = Math.max(...deltaMemories);
    const minDeltaMemory = Math.min(...deltaMemories);
    const maxDeltaConnections = Math.max(...deltaConnections);
    const minDeltaConnections = Math.min(...deltaConnections);

    // Loop through each server to compute load
    for (const server of servers) {
        try {
            // Fetch metrics from the queue for the current server
            const queue = actualQueue;
            const latestMetric = queue.peekBack();
            
            if (latestMetric) {
                let { cpuUsage, memoryUsage, activeConnections } = latestMetric.metrics;
                cpuUsage = parseFloat(cpuUsage.replace('%', ''));
                memoryUsage = parseFloat(memoryUsage.replace('%', ''));

                // Calculate deltas for the current server
                const deltaCPU = Math.abs(previousCPU - cpuUsage);
                const deltaMemory = Math.abs(previousMemory - memoryUsage);
                const deltaConn = (Math.abs(previousConnections - activeConnections))*server.IC;

                // Normalize deltas using max/min values across all servers
                const normalizedDeltaCPU = (maxDeltaCPU - minDeltaCPU) >0 ?(deltaCPU - minDeltaCPU) / (maxDeltaCPU - minDeltaCPU):0;
                const normalizedDeltaMemory = (maxDeltaMemory - minDeltaMemory)>0 ? (deltaMemory - minDeltaMemory) / (maxDeltaMemory - minDeltaMemory):0;
                const normalizedDeltaConnections = (maxDeltaConnections - minDeltaConnections)>0? (deltaConn - minDeltaConnections) / (maxDeltaConnections - minDeltaConnections):0;
                


              
                    const weights = [
                        normalizedDeltaCPU / (normalizedDeltaCPU + normalizedDeltaMemory + normalizedDeltaConnections),
                        normalizedDeltaMemory / (normalizedDeltaCPU + normalizedDeltaMemory + normalizedDeltaConnections),
                        normalizedDeltaConnections / (normalizedDeltaCPU + normalizedDeltaMemory + normalizedDeltaConnections)
                    ];
                

                
    
                // Get current load
                const load = weights[0] * cpuUsage + weights[1] * memoryUsage + weights[2] * activeConnections;
               
                console.log("LOAD FOR----", server.host, "------load::>>", load);
                if (load < minLoad) {
                    minLoad = load;
                    minLoadServer = server;
                }
            } else {
                console.error(`No metrics found for server ${server.host}:${server.port}`);
            }
        } catch (error) {
            console.error(`Error fetching metrics from server ${server.host}:${server.port}: ${error.message}`);
        }
    }

    if (minLoadServer) {
        const { host, port } = minLoadServer;
        const target = `http://${host}:${port}`;
        proxy.web(req, res, { target });
        console.log(`Redirected to ${host}:${port}`);
        console.log("***************************************************************");
    } else {
        res.status(500).send('Unable to find a server to handle the request');
    }
});


const PORT = 6000;
app.listen(PORT, () => {
    console.log(`Load balancer listening on port ${PORT}`);
});
