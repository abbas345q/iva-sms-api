const express = require("express");
const https   = require("https");
const zlib    = require("zlib");
const fetch   = require("node-fetch");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE_URL       = "https://www.ivasms.com";
const USER_AGENT     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TELEGRAM_TOKEN = "8781757745:AAF5FojDwE2Gl4ISj9M9tyPK3gr7ewf_fs8";
const CHAT_ID        = "-1002295608331";

let sentMessages = new Set();
let isRunning = false; 

// নতুন আপডেট করা কুকিজ
const COOKIES = {
  "cf_clearance": "E8tIxDZuuuRcb7hWBrtPDqCSUKnGLOWj_rwZzxsp4tw-1778421819-1.2.1.1-.Fj8ulOJP2o.SanqYYdh6TtNaeIg4OnYCNxdak0xPBzVTxMuWdNThJbZ.KjHtN0aSOg_ee4kGcb5dWsZa4XHL.lybxYNVZCU9Y9Bylxl2d76Aps1tEP3ovfm.XCw8m6oY.7mKAa6.hazHggQkzFId0bakUyAYBta3weeIT7x9xRPr0ts53UGOLuoJvM9D_b5KSmuik.BwDYqd7oEYyXuTUK0rSLa8x03shRgXdFgll1RmWeglCeNymniTKV_ei1mLmmFJcCVzedifuyF0bbh7VWJs5gf_t18oURnXGCjYEMBDp6OLOe.dCsCDfDwzYyX6Ben0TUBgBCidJX3M0Hl8A",
  "XSRF-TOKEN": "eyJpdiI6IkExMTdPbG9IenRXZWpnMTNvZ001b0E9PSIsInZhbHVlIjoiOTNsb3hUdmk3MUg5cE41bXFKejRFeE1idEdZTGF6VnhmTXdsemRRcFVteXZJU3VMMWp1eGpBdlMva1V0S2o5amJyaENGN1piMTU4ekNFYk9pclM0bmsyRWVSUnptTnFaeTRVclZNbjJoc09kaFZHKzN1dWl5YzF0TC9DekZYMmoiLCJtYWMiOiJhMDJmYWM1MGQ0OTAzY2RlZTM4NjdmYjdmOWQxNTZiZDJhZDNkZTE4YjUxZDVjODA4NjZhYzg5OTY0MmQ4ODFmIiwidGFnIjoiIn0%3D",
  "ivas_sms_session": "eyJpdiI6IlU3Qmc2d3JRK293MUdpRlNBVGZkdGc9PSIsInZhbHVlIjoiak5NbFRudWwrampma0tPZnJIdlpwUis1OFJENjJNOGFWVDZ4cnArN0VRbWF5bnJ0WUVpMHFteVV0RGtEaGpZSW5wdUlvU2VVRzFGSlIxSC96WUp6MHVQb1ZQTmdOQ0pkUmJQc1czaHpXOWZpMk9iTGoxL3JSSmhOUHpvbHd1dHMiLCJtYWMiOiI0ZjkyMzc4ZDlkYWFhYzliM2Q1N2Q4MGMxMDBjOTU1MDlkMTA0MjIwYWU5NzA1YWQ3NWIwMzRhOGZkMjNhM2JmIiwidGFnIjoiIn0%3D"
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
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": "https://www.ivasms.com/portal",
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
        console.log("❌ Cookies Expired!");
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

/* ================= ROUTES ================= */

router.get("/check-login", async (req, res) => {
    const portal = await makeRequest("GET", "/portal");
    if (portal.status === 200 && !portal.body.includes("login")) {
        res.json({ login: "SUCCESS", message: "Bot is logged in." });
    } else {
        res.json({ login: "FAILED", message: "Cookies expired." });
    }
});

router.get("/run-bot", (req, res) => { 
    processBot(); 
    res.send("SUCCESS"); 
});

router.get("/", (req, res) => res.json({ status: "alive" }));

setInterval(processBot, 10000);
setTimeout(processBot, 5000); // ১০ সেকেন্ডের বদলে ৫ সেকেন্ড পর প্রথমবার রান হবে

module.exports = router;
