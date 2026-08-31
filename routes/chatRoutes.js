const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const auth = require("../middleware/auth");
const ChatMessage = require("../models/ChatMessage");
const Transaction = require("../models/Transaction");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Build a financial context summary from the user's transactions
 */
async function buildFinancialContext(userId) {
  const transactions = await Transaction.find({ userId }).sort({ date: -1 });

  if (transactions.length === 0) {
    return "The user has no transactions recorded yet. Encourage them to start tracking their income and expenses.";
  }

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((acc, t) => acc + t.amount, 0);

  const expense = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + t.amount, 0);

  const balance = income - expense;
  const savingsRate = income > 0 ? ((income - expense) / income * 100).toFixed(1) : 0;

  // Category breakdown
  const categoryMap = {};
  transactions.forEach((t) => {
    const cat = t.category || "General";
    if (!categoryMap[cat]) categoryMap[cat] = { income: 0, expense: 0 };
    categoryMap[cat][t.type] += t.amount;
  });

  const categoryBreakdown = Object.entries(categoryMap)
    .map(([cat, data]) => {
      const parts = [];
      if (data.income > 0) parts.push(`income ₹${data.income.toLocaleString()}`);
      if (data.expense > 0) parts.push(`expense ₹${data.expense.toLocaleString()}`);
      return `  - ${cat}: ${parts.join(", ")}`;
    })
    .join("\n");

  // Recent transactions (last 10)
  const recent = transactions.slice(0, 10).map((t) => {
    const date = new Date(t.date).toLocaleDateString("en-IN");
    const sign = t.type === "income" ? "+" : "-";
    return `  - ${date}: ${sign}₹${t.amount.toLocaleString()} (${t.category || "General"})`;
  }).join("\n");

  const status = expense >= income ? "IN THE RAT RACE (expenses ≥ income)" : "ESCAPING THE RAT RACE (income > expenses)";

  return `
USER'S FINANCIAL SNAPSHOT:
- Total Income: ₹${income.toLocaleString()}
- Total Expenses: ₹${expense.toLocaleString()}
- Net Balance: ₹${balance.toLocaleString()}
- Savings Rate: ${savingsRate}%
- Status: ${status}
- Total Transactions: ${transactions.length}

CATEGORY BREAKDOWN:
${categoryBreakdown}

RECENT TRANSACTIONS:
${recent}
`.trim();
}

const SYSTEM_PROMPT = `You are a friendly, knowledgeable AI Financial Mentor for the "Escape the Rat Race" app. Your personality is:
- Warm, encouraging, and motivating — like a supportive friend who's great with money
- You use simple language, avoid jargon, and explain concepts clearly
- You celebrate small wins and never shame users for bad spending habits
- You're practical and action-oriented — always give specific, doable advice
- You use Indian Rupee (₹) for all currency references
- Keep responses concise (2-4 paragraphs max) unless the user asks for a detailed breakdown
- Use emojis sparingly to keep things engaging 🎯

Your expertise includes:
- Personal budgeting and expense tracking
- The "rat race" concept (from Rich Dad Poor Dad) — helping users build passive income
- Savings strategies, emergency funds, and investment basics
- Indian financial context (PPF, mutual funds, SIPs, FDs, tax-saving instruments)
- Debt management and financial independence (FIRE movement)

When given the user's financial data, analyze it and provide personalized advice. If expenses exceed income, focus on practical cost-cutting. If they're saving, suggest optimization and investment paths.

IMPORTANT: You have access to the user's real financial data below. Use it to give personalized, specific advice — not generic tips.`;

// @route   POST /api/chat
// @desc    Send a message and get AI mentor response
router.post("/", auth, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ message: "AI service not configured. Please add GEMINI_API_KEY to your environment." });
    }

    // Save user message
    await ChatMessage.create({
      userId: req.user._id,
      role: "user",
      content: message.trim(),
    });

    // Build financial context
    const financialContext = await buildFinancialContext(req.user._id);

    // Load recent chat history for conversation continuity
    const recentHistory = await ChatMessage.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(20);

    // Reverse to chronological order and map roles
    let historyMessages = recentHistory.reverse().map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    // Remove the last message (the one we just saved) — we'll send it via sendMessage
    historyMessages = historyMessages.slice(0, -1);

    // Sanitize history: must start with 'user' and alternate roles (no consecutive same-role)
    const sanitized = [];
    for (const msg of historyMessages) {
      if (sanitized.length === 0 && msg.role !== "user") continue; // skip until first user msg
      if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) continue; // skip consecutive same role
      sanitized.push(msg);
    }
    // Ensure history ends with a 'model' message (Gemini expects user->model pairs before the new user msg)
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === "user") {
      sanitized.pop();
    }

    // Build the conversation with Gemini
    const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${financialContext}`;

    const model = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      systemInstruction: {
        role: "user",
        parts: [{ text: fullSystemPrompt }],
      },
    });

    const chat = model.startChat({
      history: sanitized,
    });

    const result = await chat.sendMessage(message.trim());
    const aiResponse = result.response.text();

    // Save AI response
    const savedMessage = await ChatMessage.create({
      userId: req.user._id,
      role: "assistant",
      content: aiResponse,
    });

    res.json({
      reply: aiResponse,
      timestamp: savedMessage.timestamp,
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ message: "Failed to get AI response. Please try again." });
  }
});

// @route   GET /api/chat/history
// @desc    Get chat history for the authenticated user
router.get("/history", auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const messages = await ChatMessage.find({ userId: req.user._id })
      .sort({ timestamp: 1 })
      .limit(limit);

    res.json(messages);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ message: "Failed to fetch chat history" });
  }
});

// @route   DELETE /api/chat/history
// @desc    Clear all chat history for the authenticated user
router.delete("/history", auth, async (req, res) => {
  try {
    await ChatMessage.deleteMany({ userId: req.user._id });
    res.json({ message: "Chat history cleared" });
  } catch (err) {
    console.error("History delete error:", err);
    res.status(500).json({ message: "Failed to clear chat history" });
  }
});

module.exports = router;
