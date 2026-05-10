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
const ADMIN_ID       = "6781949890";

// মেমোরি এবং লক সিস্টেম
let sentMessages = new Set();
let isRunning = false; 

/* ================= NEW COOKIES UPDATED ================= */
let COOKIES = {
  "cf_clearance":     "iWggS0iwYtiI0NlHRXfMIfaiSBTZGMhgSB_oVu4cKsg-1778419602-1.2.1.1-AjIzy1t2xBiDQNya7uV._UktKNKK2Biw5qAcCHWNcboxOUKBNGfexXeo3LSUQNMf2mheLezZNj2DFbzP4LttzZJbfRG9O75J1MbUVuqQYc.arRv0XxUs7usRNKWVK8znrA4qf_qTLSva8oslclitV2vRY3BHJaiVa1E8IZmhW9TnsyO6woH6bknt4vmmZLghzYCSw6vD3yXBrQ1MozWhKELTLAGzcpO67NoNQWWy4aIDrbeh6zhvIRxOlDOrtVPPBH9X6zOKoEYT1c1Drbl4wD4.H3HfQ_zROrLsTiiaL8Bsn4mrCGvOH2DAkkfVobYBucqXLX9LSIo8NMG2Z3omew",
  "XSRF-TOKEN":       "eyJpdiI6ImtFZGtBOFhrVkpuN1VJT3lJdzJtNlE9PSIsInZhbHVlIjoiK1RteTVTQUcya1RqWGQzU20vdU9NNmtSclFrK3Avblhxb3J3UmFVTEdaaVlsUUliUXBycHdvMk9wZnBWQUNXaTRRUlZaQUZ5NENpdmh5U3p2ckpXRkc2c3lqa1B3T1kzRkMxOW1kcHFVTDNKZWhMUm5EK2IxdEZqckJoTHdmQ2QiLCJtYWMiOiI0MDZjYWQ1MDNiYmY5YzZiYjkwODNmOTFlOTA0ZmY2N2Q4YzkxZDk5OWViMWIzZTc2ZTJiZWVjZDM3ZWZlMzYzIiwidGFnIjoiIn0%3D",
  "ivas_sms_session": "eyJpdiI6IlVNZ1JuVXFqcHdVVXRRZDR0KzhqQ3c9PSIsInZhbHVlIjoiWjVxZWVpVWw2NUM5VGh2UHBJU0YweUZMWGRhV21PRUtkL2g1WE9WRnlqYlJ1cjF0Q3N2b0lwV1A2aWFkc1oxQkh5T2ZYZTVVNFZXOHJyQ0xHTTNmcTJTcnEreHVSSFM2TmI3WFVRMk9RVGZJeXhHcURIUXd6RFNxYjhJaStjM0kiLCJtYWMiOiI4Mzc5MTI0M2M3OTgwMzQ4NDE4NWNhYmVkMWFmMjNhZTVjYWVkM2Q2M2RjMWI1NzY2MTRkZGViN2U2OWY3MzFkIiwidGFnIjoiIn0%3D"
};

/* ================= HELPERS ================= */
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function maskNumber(num) {
    if (num.length < 7) return num;
    // ওটিপি গ্রুপে নাম্বার মাস্কিং (সুরক্ষার জন্য)
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
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Encoding": "gzip, br",
      "Origin": BASE_URL,
      "Referer": BASE_URL + "/portal"
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

    // সেশন চেক
    if (respPortal.status === 302 || respPortal.body.includes("login") || respPortal.status === 403) {
        // Cloudflare বা সেশন এক্সপায়ার হলে এডমিনকে জানাবে
        console.log("Session Expired or Forbidden");
        isRunning = false;
        return;
    }

    const token = respPortal.body.match(/name="_token"\s+value="([^"]+)"/)?.[1];
    if (!token) {
        isRunning = false;
        return;
    }

    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    const parts = [
        `--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\n${today}`,
        `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${today}`,
        `--${boundary}\r\nContent-Disposition: form-data; name="_token"\r\n\r\n${token}`,
        `--${boundary}--`
    ].join("\r\n");

    const r1 = await makeRequest("POST", "/portal/sms/received/getsms", parts, `multipart/form-data; boundary=${boundary}`);
    const ranges = [...r1.body.matchAll(/toggleRange\('([^']+)'/g)].map(m => m[1]);

    for (const range of ranges) {
      const b2 = new URLSearchParams({ _token: token, start: today, end: today, range }).toString();
      const r2 = await makeRequest("POST", "/portal/sms/received/getsms/number", b2, "application/x-www-form-urlencoded");
      const numbers = [...r2.body.matchAll(/toggleNum[^(]+\('(\d+)'/g)].map(m => m[1]);
      
      for (const number of numbers) {
        const b3 = new URLSearchParams({ _token: token, start: today, end: today, Number: number, Range: range }).toString();
        const r3 = await makeRequest("POST", "/portal/sms/received/getsms/number/sms", b3, "application/x-www-form-urlencoded");
        
        // SMS টেবিল থেকে মেসেজ এবং সময় বের করা
        const trAll = [...r3.body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
        
        for (const trM of trAll) {
          const msgM = trM[1].match(/class="msg-text"[^>]*>([\s\S]*?)<\/div>/i);
          if (msgM) {
            const message = msgM[1].replace(/<[^>]+>/g, "").trim();
            // সময় বের করা (ডুপ্লিকেট চেক করার জন্য)
            const timeM = trM[1].match(/class="time-cell"[^>]*>\s*([0-9:]+)\s*/);
            const timeStr = timeM ? timeM[1].trim() : '00:00';
            
            const msgId = `${number}_${message}_${timeStr}`;
            
            if (!sentMessages.has(msgId)) {
                await sendToTelegram(`<b>📩 New OTP</b>\n\n<b>Number:</b> <code>${maskNumber(number)}</code>\n<b>Message:</b> <code>${message}</code>\n<b>Time:</b> <code>${timeStr}</code>`);
                sentMessages.add(msgId);
                
                // মেমোরি ক্লিনআপ (৫০০ মেসেজ হলে পুরনো গুলো ডিলিট হবে)
                if (sentMessages.size > 500) {
                    const firstItem = sentMessages.values().next().value;
                    sentMessages.delete(firstItem);
                }
            }
          }
        }
      }
    }
  } catch (err) { 
    console.log("Engine Error:", err.message); 
  }
  isRunning = false;
}

/* ================= ROUTES ================= */

router.get("/run-bot", (req, res) => {
  processBot(); 
  res.send("SUCCESS"); 
});

router.get("/test-bot", async (req, res) => {
    await sendToTelegram("🛠 <b>Bot Test:</b> আপনার ওটিপি বটটি বর্তমানে সচল আছে এবং নতুন কুকিজ সেট করা হয়েছে।");
    res.json({ success: true, message: "Test message sent to group" });
});

router.get("/", (req, res) => res.json({ status: "running", active: isRunning }));

// অটো-রান ইন্টারভ্যাল (১০ সেকেন্ড পর পর - সার্ভার লোড কমানোর জন্য)
setInterval(processBot, 10000);

module.exports = router;
  
