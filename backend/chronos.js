/* chronos.js */
const opentelemetry = require('@opentelemetry/api');
const crypto = require('crypto');
const Task = require('./models/Task');

function startTelemetryCron() {
    console.log('Starting Telemetry Cron Service (Lightweight Hash-Based Diff Detection)...');

    // Run every 10 seconds (checks for changes)
    const INTERVAL_MS = 10000;

    // Store the hash of the last sent snapshot
    let lastSnapshotHash = '';

    setInterval(async () => {
        try {
            // 1. Fetch only essential fields for diff detection
            // This is 90%+ smaller than fetching full documents
            const minimalTasks = await Task.find(
                {},
                '_id title completed user updatedAt'
            ).sort({ createdAt: -1 }).lean();

            // 2. Create a lightweight hash from minimal data
            const currentHash = crypto
                .createHash('sha256')
                .update(JSON.stringify(minimalTasks))
                .digest('hex');

            // 3. Diff Detection: Skip if data hasn't changed
            if (currentHash === lastSnapshotHash) {
                // console.log('No DB changes detected. Skipping telemetry.'); 
                return;
            }

            console.log(`DB Change Detected! Sending Telemetry (Total: ${minimalTasks.length})...`);

            // 4. Fetch full data only when change is detected
            const allTasks = await Task.find().sort({ createdAt: -1 }).lean();

            const tracer = opentelemetry.trace.getTracer('backend-service');
            const span = tracer.startSpan('db-snapshot-change', {
                kind: opentelemetry.SpanKind.INTERNAL,
            });

            try {
                // 1. Add Stats Attributes
                const totalTasks = allTasks.length;
                span.setAttribute('db.collection', 'tasks');
                span.setAttribute('db.count.total', totalTasks);

                // Aggregate stats manually since we have the full array
                const userCounts = allTasks.reduce((acc, task) => {
                    acc[task.user] = (acc[task.user] || 0) + 1;
                    return acc;
                }, {});
                span.setAttribute('db.stats.by_user', JSON.stringify(userCounts));

                // 2. Snapshot metadata as an Event
                span.addEvent('db-snapshot-change', {
                    'snapshot.hash': currentHash,
                    'task.count': allTasks.length
                });

                span.setStatus({ code: opentelemetry.SpanStatusCode.OK });

                // Update state
                lastSnapshotHash = currentHash;

            } catch (innerError) {
                console.error('Error recording span:', innerError);
                span.recordException(innerError);
            } finally {
                span.end();
            }

        } catch (error) {
            console.error('Error in Telemetry Cron:', error);
        }
    }, INTERVAL_MS);
}

module.exports = { startTelemetryCron };
