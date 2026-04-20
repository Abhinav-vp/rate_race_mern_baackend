require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const transactionRoutes = require("./routes/transactionRoutes");
const authRoutes = require("./routes/authRoutes");
app.use("/api", transactionRoutes);
app.use("/api/auth", authRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));


const PORT = 7000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));