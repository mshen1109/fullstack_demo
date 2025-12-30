const { parentPort, workerData } = require('worker_threads');

try {
    const start = Date.now();
    const result = JSON.parse(workerData);
    const duration = Date.now() - start;
    parentPort.postMessage({ success: true, data: result, duration });
} catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
}
