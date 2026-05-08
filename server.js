const express = require("express");
const ivaRouter = require("./iva.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api/ivasms", ivaRouter);

app.get("/", (req, res) => {
  res.json({ status: "running", auto_bot: "active" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
