const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");


router.post("/add", async (req, res) => {
  try {
    const { type, amount, category } = req.body;
    const newTransaction = new Transaction({ type, amount, category });
    await newTransaction.save();
    res.json({ message: "Added successfully" });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get("/all", async (req, res) => {
  try {
    const data = await Transaction.find();
    res.json(data);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;