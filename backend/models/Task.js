const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        minlength: [1, 'Title must not be empty'],
        maxlength: [500, 'Title must not exceed 500 characters']
    },
    completed: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
    user: {
        type: String,
        required: true,
        trim: true,
        minlength: [1, 'User must not be empty']
    },
});

// Compound index for efficient user-based queries (most common query pattern)
TaskSchema.index({ user: 1, createdAt: -1 });

// Index for chronos.js optimization
TaskSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Task', TaskSchema);
