const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const DRIVE_FOLDER =
  "https://drive.google.com/drive/folders/1k8WPTuh_KRABkUW2GLYM14Lkd2Kr-H5c";

const DOWNLOAD_DIR = path.resolve(__dirname, "../downloads");

async function downloadPDFs(folderUrl) {
  const targetUrl = folderUrl || DRIVE_FOLDER;
  console.log("🚀 Starting Google Drive Downloader...");

  // Ensure download directory exists
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    console.log(`📂 Creating download folder: ${DOWNLOAD_DIR}`);
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: false, // Must be false for manual login visibility
    userDataDir: "./chrome-session", // Persist login session
    args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const pages = await browser.pages();
  if (pages.length > 1) await pages[0].close(); // Close empty tab

  // Enable downloads
  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_DIR,
  });

  console.log(`🔗 Navigating to Drive: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "networkidle2" });

  // Check if we are logged in (look for "Sign in" or similar, or just wait for user)
  console.log("👉 Please LOG IN if needed. The script will wait for PDF files to appear or for you to press ENTER in terminal if stuck.");
  
  // Wait for user to ensure they are logged in and see the files
  console.log("⏳ Waiting 15 seconds for page load / manual login... (Make sure files are visible!)");
  await new Promise(r => setTimeout(r, 15000));

  // Retry Loop: Try to download until a file appears
  const maxLoops = 5; // Try 5 times
  const checkInterval = 10; // Check every 10 seconds (Total ~50s)
  
  for (let loop = 1; loop <= maxLoops; loop++) {
    // Check if file already exists
    const existing = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith(".pdf"));
    if (existing.length > 0) {
        console.log(`✅ Detected ${existing.length} PDF(s). Download successful.`);
        break;
    }

    if (loop > 1) {
        console.log(`🔄 Retry attempt ${loop}/${maxLoops}...`);
    }

    try {
      console.log("⌨️ Action: Select All -> Download");
      
      // Ensure focus
      await page.click('body').catch(() => {}); 
      await new Promise(r => setTimeout(r, 500));

      // CTRL+A
      await page.keyboard.down("Control");
      await page.keyboard.press("a");
      await page.keyboard.up("Control");
      await new Promise(r => setTimeout(r, 800));

      // Open Context Menu
      await page.keyboard.down("Shift");
      await page.keyboard.press("F10");
      await page.keyboard.up("Shift");
      await new Promise(r => setTimeout(r, 1000));

      // Press 'd'
      await page.keyboard.press("d");
      
    } catch (err) {
      console.error("⚠️ Interaction error:", err.message);
    }

    // Wait for potential download to start/finish
    console.log(`⏳ Waiting ${checkInterval}s for file to appear...`);
    
    // Check periodically within this interval
    let fileFound = false;
    for (let w = 0; w < checkInterval; w++) {
        if (fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith(".pdf")).length > 0) {
            fileFound = true;
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    
    if (fileFound) break;
  }
  
  // Final check
  const finalCheck = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith(".pdf"));
  if (finalCheck.length === 0) {
    console.error("❌ Failed to download automatically after multiple attempts.");
  } else {
    // Wait for download to finish writing (simple heuristic)
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log("🔒 Closing browser...");
  await browser.close();
}

module.exports = downloadPDFs;
