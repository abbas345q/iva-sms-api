const express = require("express");
const ivaRouter = require("./iva.js"); // .js যোগ করা হয়েছে

const app = express();
const PORT = process.env.PORT || 3000;

// JSON ডাটা পড়ার জন্য এটি প্রয়োজন
app.use(express.json());

// API রুট সেটআপ
app.use("/api/ivasms", ivaRouter);

// হোম পেজ বা মেইন লিঙ্ক চেক করার জন্য
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "IVA SMS Server is Running!",
    usage: "Go to /api/ivasms/run-bot to start the bot" 
  });
});

// সার্ভার স্টার্ট
app.listen(PORT, "0.0.0.0", () => {
  console.log(`iva-sms-api listening on port ${PORT}`);
});
