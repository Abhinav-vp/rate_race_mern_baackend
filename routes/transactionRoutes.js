const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const auth = require("../middleware/auth");

// @route   POST /api/add
// @desc    Add a new transaction
router.post("/add", auth, async (req, res) => {
  try {
    const { type, amount, category } = req.body;
    const newTransaction = new Transaction({
      type,
      amount,
      category,
      userId: req.user._id,
    });
    await newTransaction.save();
    res.json({ message: "Added successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/all
// @desc    Get all transactions for a user
router.get("/all", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user._id }).sort({ date: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;