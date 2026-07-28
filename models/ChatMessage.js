const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ["user", "assistant"],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Index for efficient history queries
chatMessageSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
