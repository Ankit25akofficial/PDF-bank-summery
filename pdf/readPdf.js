const { execFile } = require("child_process");
const path = require("path");

function readPdf(filePath) {
  return new Promise((resolve) => {
    const workerPath = path.join(__dirname, "parse_worker.js");
    const ocrWorkerPath = path.join(__dirname, "ocr_worker.js");
    
    // Spawn a new process to handle parsing
    execFile("node", [workerPath, filePath], (error, stdout, stderr) => {
      if (error) {
        console.error(`⚠️ PDF Parse Worker failed for: ${path.basename(filePath)}`);
        // console.error(stderr); // Optional debug
        return resolve(""); // Return empty string on failure (e.g. crash)
      }
      
      try {
        const result = JSON.parse(stdout);
        let text = result.text || "";

        // Check if text is sufficient, otherwise try OCR
        if (text.trim().length < 50) {
            console.log(`⚠️ Text extraction insufficient (${text.trim().length} chars). Attempting OCR...`);
            
            execFile("node", [ocrWorkerPath, filePath], (ocrError, ocrStdout, ocrStderr) => {
                if (ocrError) {
                    console.error(`❌ OCR Worker failed for: ${path.basename(filePath)}`, ocrError);
                    return resolve(text); // Return original weak text if OCR fails
                }
                try {
                    const ocrResult = JSON.parse(ocrStdout);
                    resolve(ocrResult.text || text);
                } catch(e) {
                     console.error("⚠️ Failed to parse OCR worker output");
                     resolve(text);
                }
            });
        } else {
            resolve(text);
        }

      } catch (e) {
        console.error("⚠️ Failed to parse worker output");
        resolve("");
      }
    });
  });
}

module.exports = readPdf;
