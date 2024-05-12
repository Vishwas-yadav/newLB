const http = require('http');
const Deque = require('double-ended-queue');

const servers = [
    { host: '54.208.139.171', port: 8080, IC:2.56 },
    { host: '44.222.156.160', port: 8080, IC:3.5 },
];

const metricQueues = {};
servers.forEach(server => {
    metricQueues[`${server.host}:${server.port}`] = new Deque();
});

function fetchMetrics(server) {
    http.get(`http://${server.host}:8000/get-metrics`, (res) => {
        let data = '';
        res.on('data', chunk => {
            data += chunk;
        });
        res.on('end', () => {
            const metrics = JSON.parse(data);
            const timestamp = Date.now();
            metricQueues[`${server.host}:${server.port}`].push({ timestamp, metrics });
            const threshold = timestamp - 3000;
            while (metricQueues[`${server.host}:${server.port}`].length > 0 && metricQueues[`${server.host}:${server.port}`].peekFront().timestamp < threshold) {
                metricQueues[`${server.host}:${server.port}`].shift(); // Remove the first element from the queue
            }
            // console.log(":::AFTER::::", metricQueues[`${server.host}:${server.port}`]);
        });
    }).on('error', (err) => {
        console.error(`Error fetching metrics from ${server.host}:${server.port}: ${err.message}`);
    });
}

function startFetching() {
    servers.forEach(server => {
        setInterval(() => fetchMetrics(server), 500); //half seconds..
    });
}

startFetching();

module.exports = metricQueues;
