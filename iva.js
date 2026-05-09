const express = require("express");
const https   = require("https");
const zlib    = require("zlib");
const fetch   = require("node-fetch");

const router = express.Router();

/* ================= CONFIG ================= */
const BASE_URL       = "https://www.ivasms.com";
const USER_AGENT     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";
const TELEGRAM_TOKEN = "8781757745:AAF5FojDwE2Gl4ISj9M9tyPK3gr7ewf_fs8";
const CHAT_ID        = "-1002295608331";
const ADMIN_ID       = "6781949890"; // এখানে তোমার এডমিন আইডি দেওয়া হয়েছে

// মেমোরি এবং লক সিস্টেম
let sentMessages = new Set();
let isRunning = false; 

/* ================= COOKIES ================= */
let COOKIES = {
  "XSRF-TOKEN":       "eyJpdiI6InFnTlo3VkszQ1ViOVN1a1ppQzVUMGc9PSIsInZhbHVlIjoiKzRTT3RQTjRML1VROEJ3Nkd2a1RRTVgxRlFGOUY4SEZpeGhzNEtDdERlcjRFSktyV2k4amM3ZkZSKzVKR2ppSGp5bEdxK0VGb2VFU0tZbjJraFcrdWxjKzIxdnJEazg5M3dDT0tDU3ZyaFR4NDNjd3JHVmZ0L0NGNm01dVJKQlAiLCJtYWMiOiIyZDFhNTZmM2U1NGZjNGFlMzg1YWMwYmMzMTg4OGZmZDI4MmVmY2EyMjQ5YjQyMTc1ZDdiNzcwNmQ1NjVmMzE5IiwidGFnIjoiIn0%3D",
  "ivas_sms_session": "eyJpdiI6IlMwRmliU1VLRjhwNWUrL0lZeGVYa3c9PSIsInZhbHVlIjoiczBVWHcybVFDbStpN2w2MnNNVHFFamFESXMxT24vMlliV1UxZkZmRmxrWi8rUXA3NE42ZTVqVmc2Y2xCYkF0cmRZSEFGYmNuVGNUYmEyTVZjWkluZUNpMjNLNGVTQnoxSlIrSHpvb1NrL1ltQmJ2L2tlT1dRcnhzek9LbnBVVHQiLCJtYWMiOiIyZDZkM2FjNjM0MTVkNGE0MWU1ZmMyY2FjYjdjNzFkYzFkMjk4ZjQ5MDE3NGIyMzcwNGE3ZmNkYzhjYTNjMDlmIiwidGFnIjoiIn0%3D"
};

/* ================= HELPERS ================= */
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function maskNumber(num) {
    if (num.length < 7) return num;
    return num.substring(0, 4) + "***" + num.substring(num.length - 4);
}

async function sendToTelegram(message, targetChat = CHAT_ID) {
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: targetChat, text: message, parse_mode: 'HTML' })
        });
    } catch (e) { console.error("TG Error"); }
}

/* ================= REQUEST CORE ================= */
function makeRequest(method, path, body, contentType) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": USER_AGENT,
      "Cookie": Object.entries(COOKIES).map(([k,v]) => `${k}=${v}`).join("; "),
      "X-XSRF-TOKEN": decodeURIComponent(COOKIES["XSRF-TOKEN"] || ""),
      "Accept-Encoding": "gzip, br"
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

/* ================= MAIN ENGINE ================= */
async function processBot() {
  if (isRunning) return; 
  isRunning = true;

  try {
    const today = getToday();
    const respPortal = await makeRequest("GET", "/portal");

    // কুকিজ এক্সপায়ার হয়েছে কি না চেক
    if (respPortal.status === 302 || respPortal.body.includes("login")) {
        await sendToTelegram("⚠️ <b>Alert:</b> আপনার ওটিপি কুকিজের মেয়াদ শেষ হয়ে গেছে! দয়া করে আপডেট করুন।", ADMIN_ID);
        isRunning = false;
        return;
    }

    const token = respPortal.body.match(/name="_token"\s+value="([^"]+)"/)?.[1];
    if (!token) throw new Error("No Token");

    const boundary = "----WebKitFormBoundary6I2Js7TBhcJuwIqw";
    const parts = [`--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${today}`, `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${today}`, `--${boundary}\r\nContent-Disposition: form-data; name="_token"\r\n\r\n${token}`, `--${boundary}--`].join("\r\n");

    const r1 = await makeRequest("POST", "/portal/sms/received/getsms", parts, `multipart/form-data; boundary=${boundary}`);
    const ranges = [...r1.body.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);

    for (const range of ranges) {
      const b2 = new URLSearchParams({ _token: token, start: today, end: today, range }).toString();
      const r2 = await makeRequest("POST", "/portal/sms/received/getsms/number", b2, "application/x-www-form-urlencoded");
      const numbers = [...r2.body.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);
      
      await Promise.all(numbers.map(async (number) => {
        const b3 = new URLSearchParams({ _token: token, start: today, end: today, Number: number, Range: range }).toString();
        const r3 = await makeRequest("POST", "/portal/sms/received/getsms/number/sms", b3, "application/x-www-form-urlencoded");
        const trAll = [...r3.body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
        
        for (const trM of trAll) {
          const msgM = trM[1].match(/class="msg-text"[^>]*>([\s\S]*?)<\/div>/i);
          if (msgM) {
            const message = msgM[1].replace(/<[^>]+>/g, "").trim();
            const timeM = trM[1].match(/class="time-cell"[^>]*>\s*([0-9:]+)\s*/);
            const msgId = `${number}_${message}_${timeM ? timeM[1] : ''}`;
            
            if (!sentMessages.has(msgId)) {
                await sendToTelegram(`<b>📩 New OTP</b>\n\n<b>Number:</b> <code>${maskNumber(number)}</code>\n<b>Message:</b> <code>${message}</code>`);
                sentMessages.add(msgId);
                if (sentMessages.size > 200) sentMessages.delete(Array.from(sentMessages)[0]);
            }
          }
        }
      }));
    }
  } catch (err) { console.log("Engine Error"); }
  isRunning = false;
}

/* ================= ROUTES ================= */

// ১. তোমার কাঙ্ক্ষিত run-bot লিঙ্ক যা শুধু SUCCESS দেখাবে
router.get("/run-bot", (req, res) => {
  processBot(); 
  res.send("SUCCESS"); 
});

// ২. টেস্ট লিঙ্ক যা গ্রুপে মেসেজ পাঠাবে
router.get("/test-bot", async (req, res) => {
    await sendToTelegram("🛠 <b>Bot Test:</b> আপনার ওটিপি বটটি বর্তমানে সচল আছে।");
    res.json({ success: true, message: "Test message sent to group" });
});

router.get("/", (req, res) => res.json({ status: "running" }));

// অটো-রান ইন্টারভ্যাল (7 সেকেন্ড পর পর)
setInterval(processBot, 7000);

module.exports = router;
    
