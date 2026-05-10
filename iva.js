const express = require("express");
const https   = require("https");
const zlib    = require("zlib");
const fetch   = require("node-fetch");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE_URL       = "https://www.ivasms.com";
const USER_AGENT     = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
const TELEGRAM_TOKEN = "8781757745:AAF5FojDwE2Gl4ISj9M9tyPK3gr7ewf_fs8";
const CHAT_ID        = "-1002295608331";

let sentMessages = new Set();
let isRunning = false; 

// শুধুমাত্র সেশন কুকি ব্যবহার করে দেখা (ক্লাউডফেয়ার ব্লক এড়াতে)
const COOKIES = {
  "XSRF-TOKEN": "eyJpdiI6IkpPVGhvN2RROHBSSDF6N3lKaWRZRGc9PSIsInZhbHVlIjoiYndMaDNpNnRxQWpjdS8vakxjcHNlcXlvUkZLbXVrSHY2VnhSeFJTYW1XTnhjYnFKb3Y0a3lwU2lwZjd3Y3BlcEVKR0sycjA2SGJwWHk0MElXSXIyZzhJbkp4a3RVbjFvYzZRRGIzbzUzTVFEMGJWVVg2a1JJdlZWRkRIMUx3d1kiLCJtYWMiOiIzYTJmMTNiNWY5YjViMjllMzc3MzkyZGFjN2I1ZGZhN2Y3YWYzMjc2YzgxM2UwNzQxN2Y2YzA0YmYzYmY3OGIyIiwidGFnIjoiIn0%3D",
  "ivas_sms_session": "eyJpdiI6Imw1N3pTaGZIeXQ1OUxIU1NHa2U1RlE9PSIsInZhbHVlIjoidStjOUZSem01YjJUWG1kNFhSMC9tcFpnRlJPNjhSLzBEbEF0Y0pSdW04QWFiR1NkRjBqMVFQVXB6VGZyTkdDeTJwRHROTjlEOEd3dDRpMWhhK0grK0FqbkdiK09rK1k0THNvbTVjS1NWU2dTdFhIUHVYYlJmemM0LzVLMVRoeVoiLCJtYWMiOiJlYmQzM2ZmY2E1ZWJmNmY4MTA2NjZmYWNjOTVlNGI0MGJiZmFjYjQ0ZGEyNDljMTQ4MDk1YWFhYTdlYzdlOTk2IiwidGFnIjoiIn0%3D"
};

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
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": USER_AGENT,
      "Cookie": Object.entries(COOKIES).map(([k,v]) => `${k}=${v}`).join("; "),
      "X-XSRF-TOKEN": decodeURIComponent(COOKIES["XSRF-TOKEN"] || ""),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": "https://www.ivasms.com/portal",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
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
    const portal = await makeRequest("GET", "/portal");
    if (portal.status === 200 && !portal.body.includes("login")) {
        res.json({ login: "SUCCESS", message: "Logged in without cf_clearance." });
    } else {
        res.json({ login: "FAILED", message: "Both methods failed." });
    }
});

router.get("/run-bot", (req, res) => { processBot(); res.send("SUCCESS"); });
router.get("/", (req, res) => res.json({ status: "alive" }));

setInterval(processBot, 10000);
setTimeout(processBot, 5000);

module.exports = router;
      
