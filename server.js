const express = require("express");
const ivaRouter = require("./iva");

const app = express();
const PORT = process.env.PORT || 3000;

app.use("/api/ivasms", ivaRouter);

app.get("/", (req, res) => {
  res.json({ status: "ok", usage: "GET /api/ivasms?type=numbers or ?type=sms" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`iva-sms-api listening on 0.0.0.0:${PORT}`);
});
