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
let isInitialSyncDone = false; // শুরুতে সব মেসেজ পাঠানোর ট্র্যাকার

const COOKIES = {
  "cf_clearance": "iWggS0iwYtiI0NlHRXfMIfaiSBTZGMhgSB_oVu4cKsg-1778419602-1.2.1.1-AjIzy1t2xBiDQNya7uV._UktKNKK2Biw5qAcCHWNcboxOUKBNGfexXeo3LSUQNMf2mheLezZNj2DFbzP4LttzZJbfRG9O75J1MbUVuqQYc.arRv0XxUs7usRNKWVK8znrA4qf_qTLSva8oslclitV2vRY3BHJaiVa1E8IZmhW9TnsyO6woH6bknt4vmmZLghzYCSw6vD3yXBrQ1MozWhKELTLAGzcpO67NoNQWWy4aIDrbeh6zhvIRxOlDOrtVPPBH9X6zOKoEYT1c1Drbl4wD4.H3HfQ_zROrLsTiiaL8Bsn4mrCGvOH2DAkkfVobYBucqXLX9LSIo8NMG2Z3omew",
  "XSRF-TOKEN": "eyJpdiI6ImtFZGtBOFhrVkpuN1VJT3lJdzJtNlE9PSIsInZhbHVlIjoiK1RteTVTQUcya1RqWGQzU20vdU9NNmtSclFrK3Avblhxb3J3UmFVTEdaaVlsUUliUXBycHdvMk9wZnBWQUNXaTRRUlZaQUZ5NENpdmh5U3p2ckpXRkc2c3lqa1B3T1kzRkMxOW1kcHFVTDNKZWhMUm5EK2IxdEZqckJoTHdmQ2QiLCJtYWMiOiI0MDZjYWQ1MDNiYmY5YzZiYjkwODNmOTFlOTA0ZmY2N2Q4YzkxZDk5OWViMWIzZTc2ZTJiZWVjZDM3ZWZlMzYzIiwidGFnIjoiIn0%3D",
  "ivas_sms_session": "eyJpdiI6IlVNZ1JuVXFqcHdVVXRRZDR0KzhqQ3c9PSIsInZhbHVlIjoiWjVxZWVpVWw2NUM5VGh2UHBJU0YweUZMWGRhV21PRUtkL2g1WE9WRnlqYlJ1cjF0Q3N2b0lwV1A2aWFkc1oxQkh5T2ZYZTVVNFZXOHJyQ0xHTTNmcTJTcnEreHVSSFM2TmI3WFVRMk9RVGZJeXhHcURIUXd6RFNxYjhJaStjM0kiLCJtYWMiOiI4Mzc5MTI0M2M3OTgwMzQ4NDE4NWNhYmVkMWFmMjNhZTVjYWVkM2Q2M2RjMWI1NzY2MTRkZGViN2U2OWY3MzFkIiwidGFnIjoiIn0%3D"
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
    const d = new Date();
    // বাংলাদেশের টাইম ফরম্যাটে ডেট নেওয়া (সঠিক টাইমিং এর জন্য)
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

            // যদি এই আইডি আগে পাঠানো না হয়ে থাকে
            if (!sentMessages.has(msgId)) {
                await sendToTelegram(`<b>📩 New OTP</b>\n\n<b>Number:</b> <code>+${number}</code>\n<b>Message:</b> <code>${message}</code>\n<b>Time:</b> <code>${time}</code>`);
                sentMessages.add(msgId);
                // মেমোরি ক্লিয়ার রাখার জন্য ৫০০০ এর বেশি মেসেজ আইডি জমলে ডিলিট করবে
                if (sentMessages.size > 5000) {
                   const firstKey = sentMessages.values().next().value;
                   sentMessages.delete(firstKey);
                }
            }
          }
        }
      }
    }
    isInitialSyncDone = true; // প্রথমবার সব ডাটা চেক শেষ
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

// অটো-রান ইন্টারভ্যাল (১০ সেকেন্ড)
setInterval(processBot, 10000);

// প্রথমবার স্টার্ট হওয়ার ১০ সেকেন্ড পর অটোমেটিক একবার সব ডাটা চেক করবে (Initial Sync)
setTimeout(processBot, 10000);

module.exports = router;
