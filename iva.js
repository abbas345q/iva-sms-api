const express = require("express");
const https   = require("https");
const zlib    = require("zlib");
const fetch   = require("node-fetch");
const fs      = require("fs");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE_URL       = "https://www.ivasms.com";
const USER_AGENT     = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
const TELEGRAM_TOKEN = "8781757745:AAF5FojDwE2Gl4ISj9M9tyPK3gr7ewf_fs8";
const CHAT_ID        = "-1002295608331";

let sentMessages = new Set();
let isRunning = false; 

// ফাইল থেকে কুকি পড়ার ফাংশন
function getLiveCookies() {
    try {
        const data = fs.readFileSync("./cookies.json", "utf8");
        const cookieArray = JSON.parse(data);
        let cookieMap = {};
        cookieArray.forEach(c => {
            cookieMap[c.name] = c.value;
        });
        return cookieMap;
    } catch (e) {
        console.error("❌ cookies.json ফাইল পাওয়া যায়নি বা ফরম্যাট ভুল!");
        return null;
    }
}

async function sendToTelegram(message) {
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'HTML' })
        });
    } catch (e) { console.error("TG Error"); }
}

function makeRequest(method, path, body, contentType) {
  const currentCookies = getLiveCookies();
  if (!currentCookies) return Promise.reject("No Cookies Found");

  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": USER_AGENT,
      "Cookie": Object.entries(currentCookies).map(([k,v]) => `${k}=${v}`).join("; "),
      "X-XSRF-TOKEN": decodeURIComponent(currentCookies["XSRF-TOKEN"] || ""),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": "https://www.ivasms.com/portal",
      "Upgrade-Insecure-Requests": "1",
      "Connection": "keep-alive"
    };
    if (method === "POST") headers["Content-Type"] = contentType;

    const req = https.request(BASE_URL + path, { method, headers }, res => {
      let chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        try {
          if (res.headers["content-encoding"] === "gzip") buf = zlib.gunzipSync(buf);
          else if (res.headers["content-encoding"] === "br") buf = zlib.brotliDecompressSync(buf);
        } catch {}
        resolve({ status: res.statusCode, body: buf.toString("utf-8") });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function processBot() {
  if (isRunning) return; 
  isRunning = true;
  try {
    const today = new Date().toLocaleString("en-ZA", {timeZone: "Asia/Dhaka"}).split(',')[0];
    const portal = await makeRequest("GET", "/portal");
    
    if (portal.body.includes("login") || portal.status !== 200) {
        isRunning = false; return;
    }

    const token = portal.body.match(/name="_token"\s+value="([^"]+)"/)?.[1];
    if (!token) { isRunning = false; return; }

    const b1 = `_token=${token}&from=${today}&to=${today}`;
    const r1 = await makeRequest("POST", "/portal/sms/received/getsms", b1, "application/x-www-form-urlencoded");
    const ranges = [...r1.body.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);

    for (const range of ranges) {
      const b2 = `_token=${token}&start=${today}&end=${today}&range=${range}`;
      const r2 = await makeRequest("POST", "/portal/sms/received/getsms/number", b2, "application/x-www-form-urlencoded");
      const numbers = [...r2.body.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);

      for (const number of numbers) {
        const b3 = `_token=${token}&start=${today}&end=${today}&Number=${number}&Range=${range}`;
        const r3 = await makeRequest("POST", "/portal/sms/received/getsms/number/sms", b3, "application/x-www-form-urlencoded");
        const trAll = [...r3.body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
        
        for (const tr of trAll) {
          const msgM = tr[1].match(/class="msg-text"[^>]*>([\s\S]*?)<\/div>/i);
          if (msgM) {
            const message = msgM[1].replace(/<[^>]+>/g, "").trim();
            const timeM = tr[1].match(/class="time-cell"[^>]*>\s*([0-9:]+)\s*/);
            const time = timeM ? timeM[1].trim() : "00:00";
            const msgId = `${number}_${message}_${time}`;

            if (!sentMessages.has(msgId)) {
                await sendToTelegram(`<b>📩 New OTP</b>\n\n<b>Number:</b> <code>+${number}</code>\n<b>Message:</b> <code>${message}</code>\n<b>Time:</b> <code>${time}</code>`);
                sentMessages.add(msgId);
                if (sentMessages.size > 5000) {
                   const firstKey = sentMessages.values().next().value;
                   sentMessages.delete(firstKey);
                }
            }
          }
        }
      }
    }
  } catch (err) { console.log("Error:", err.message); }
  finally { isRunning = false; }
}

router.get("/check-login", async (req, res) => {
    try {
        const portal = await makeRequest("GET", "/portal");
        if (portal.status === 200 && !portal.body.includes("login")) {
            res.json({ login: "SUCCESS", message: "Cookies are working correctly!" });
        } else {
            res.json({ login: "FAILED", message: "Cookies expired or invalid." });
        }
    } catch (e) { res.json({ login: "ERROR", message: e.toString() }); }
});

router.get("/run-bot", (req, res) => { processBot(); res.send("SUCCESS"); });
router.get("/", (req, res) => res.json({ status: "alive" }));

setInterval(processBot, 10000);
setTimeout(processBot, 5000);

module.exports = router;
  
