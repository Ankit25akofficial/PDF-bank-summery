const fs = require("fs");

function categorizeText(text, filename = "") {
  // Debug: Show extracted text to user as requested
  console.log("\n--- Extracted Text Start ---\n");
  console.log(text.substring(0, 2000) + (text.length > 2000 ? "\n... (truncated)" : ""));
  console.log("\n--- Extracted Text End ---\n");

  const lowerText = text.toLowerCase();
  const lowerFile = filename.toLowerCase();
  
  // Priority: If filename says statement, it's financial
  if (lowerFile.includes("statement")) return "Financial";

  if (lowerText.includes("invoice") || lowerText.includes("billing")) return "Invoice";
  if (lowerText.includes("court") || lowerText.includes("legal")) return "Legal";
  if (lowerText.includes("chapter") || lowerText.includes("study")) return "Study";
  if (lowerText.includes("bank") || lowerText.includes("statement") || lowerText.includes("balance")) return "Financial";
  return "General";
}

function analyzeForChart(text, filename) {
  // 1. Data Fallback (Simulated OCR for specific user request)
  // Removed hardcoded fallback. Now handled by actual OCR in readPdf.js

  // 2. Extract Financials via Regex (Flexible for missing symbols)
  // Debug: Save text to verify OCR output
  fs.writeFileSync("extracted_debug.txt", text);

  // Flexible regexes for OCR noise
  
  // 1. Account Number & Holder
  // Strategy: Find "Account No/Mo" first, then look around it.
  const accNumRegex = /Account\s*(?:Number|No\.?|Mo\.?)\s*[:.\-]?\s*([A-Z0-9]+)/i;
  const accNumMatch = text.match(accNumRegex);
  
  let accountHolder = "Unknown";
  let accountNumber = "Unknown";
  
  if (accNumMatch) {
      let rawNum = accNumMatch[1];
      // Fix OCR common typos: B->8, T->7, S->5, 0/O->0, Z->2
      accountNumber = rawNum
        .replace(/B/g, '8')
        .replace(/T/g, '7')
        .replace(/S/g, '5')
        .replace(/O/g, '0')
        .replace(/Z/g, '2')
        .replace(/e/g, '6')
        .replace(/o/g, '0');

      // Look for name on the SAME LINE before the match
      const fullMatchStr = accNumMatch[0];
      const matchIndex = accNumMatch.index;
      
      // Find start of this line
      const textBefore = text.substring(0, matchIndex);
      const lineStart = textBefore.lastIndexOf('\n') + 1;
      const lineContentBefore = text.substring(lineStart, matchIndex).trim();
      
      // If text before Account No is substantial, it's likely the name (e.g. "Himanshu Singh Account ...")
      if (lineContentBefore.length > 2) {
          // Remove labels if accidentally caught e.g. "Date ... Name"
          accountHolder = lineContentBefore.replace(/[^a-zA-Z\s]/g, '').trim(); 
      }
  }

  // Fallback for Holder if not found on same line (check standard "Account Holder" label)
  if (accountHolder === "Unknown") {
       let holderMatch = text.match(/Account Holder\s*[:.\-]?\s*([^\n\r]+)/i);
       // Negation `(?!.*view)` prevents matching "account holders may view..."
       if (holderMatch && !holderMatch[1].toLowerCase().includes("view")) {
           accountHolder = holderMatch[1].trim();
       }
  }

  // 2. Balance
  const openingBalMatch = text.match(/Opening Balance\s*[:.\-]?\s*(?:Rs\.?)?\s*([\d,]+\.\d{2})/i);
  const closingBalMatch = text.match(/Closing Balance\s*[:.\-]?\s*(?:Rs\.?)?\s*([\d,]+\.\d{2})/i);

  // 3. Detailed Categorization
  
  // Structure to hold detailed lists
  const groups = {
      "Incoming / Credits": [],
      "Food & Beverages": [],
      "Groceries / Small Purchases": [],
      "Personal Transfers (Sent)": [],
      "Unclear / Needs Review": []
  };

  // Keyword mappings
  const keywords = {
      "Food & Beverages": ["zomato", "swiggy", "bakery", "delight", "juice", "sweets", "burger", "pizza", "restaurant", "cafe", "tea", "coffee", "food", "hangouts", "pinkl"],
      "Groceries / Small Purchases": ["mart", "store", "market", "retail", "fashion", "garments", "le broc", "trader", "mahalaxmi"],
      "Personal Transfers (Sent)": ["mr ashok", "mirdesh", "kamlesh", "harshit", "upi/", "sent to"],
      "Incoming / Credits": ["credited", "received", "deposit"] // Logic will mainly rely on 'Cr' or negative spend logic
  };

  const lines = text.split('\n');
  let maxDebit = 0.0;

  for (const line of lines) {
      if (line.includes("Opening Balance") || line.includes("Closing Balance") || line.includes("Total")) continue;
      if (line.length < 10) continue;

      // Regex to find Date (DD Mon YYYY or similar)
      const dateMatch = line.match(/(\d{2}\s+[A-Z][a-z]{2})/);
      const dateStr = dateMatch ? dateMatch[1] : "";
      
      const moneyMatches = line.match(/([\d,]+\.\d{2})/g);
      
      if (moneyMatches && moneyMatches.length >= 1) {
          const values = moneyMatches.map(v => parseFloat(v.replace(/,/g, '')));
          
          let amount = 0;
          let isCredit = false;
          let description = line; // Default description is whole line
          
          // Try to clean description: Remove date, amounts, balance
          if (dateMatch) {
             const descStart = line.indexOf(dateMatch[0]) + dateMatch[0].length;
             // Assume description is between date and the first number
             const firstNumIdx = line.search(/([\d,]+\.\d{2})/);
             if (firstNumIdx > descStart) {
                 description = line.substring(descStart, firstNumIdx).trim();
             }
          }
          // Further clean description of common PDF noise
          description = description.replace(/UPI\//i, "").replace(/NA\s*UPI-.*/, "").trim();

          // Credit vs Debit Logic
          // If explicitly "Cr" or matches Credit keywords
          if (line.toLowerCase().includes("cr.") || line.toLowerCase().includes("deposit") || line.toLowerCase().includes("credited")) {
              isCredit = true;
              amount = values[0]; // Usually the first number if it defines the credit
          } else {
               // Debit Logic
              if (values.length >= 2) {
                 amount = Math.max(...values.slice(0, values.length - 1));
              } else {
                 amount = values[0];
              }
              
              if (amount > maxDebit && amount < 100000) maxDebit = amount;
          }

          // Assign to Group
          const lowerDesc = description.toLowerCase();
          
          if (isCredit) {
              groups["Incoming / Credits"].push({ date: dateStr, desc: description, amount });
          } else {
              let matched = false;
              for (const [group, keys] of Object.entries(keywords)) {
                  if (keys.some(k => lowerDesc.includes(k))) {
                      groups[group].push({ date: dateStr, desc: description, amount });
                      matched = true;
                      break;
                  }
              }
              if (!matched) {
                  // Fallback Logic
                  if (lowerDesc.includes("upi") || lowerDesc.includes("transfer")) {
                       groups["Personal Transfers (Sent)"].push({ date: dateStr, desc: description, amount });
                  } else {
                       groups["Unclear / Needs Review"].push({ date: dateStr, desc: description, amount });
                  }
              }
          }
      }
  }

  // Calculate Totals for Chart
  const chartData = {};
  let totalDebit = 0;
  for (const [group, list] of Object.entries(groups)) {
      if (group === "Incoming / Credits") continue; // Exclude income from expense chart
      const sum = list.reduce((acc, t) => acc + t.amount, 0);
      chartData[group] = sum;
      totalDebit += sum;
  }
  
  // Normalize Chart Data to Percentages
  for (const key in chartData) {
      if (totalDebit > 0) chartData[key] = Math.round((chartData[key] / totalDebit) * 100);
  }

  // Summary Text Construction
  let summaryText = `Offline Analysis of ${filename}:\n`;
  summaryText += `• Account Holder: ${accountHolder}\n`;
  summaryText += `• Account Number: ${accountNumber}\n`;
  if (openingBalMatch) summaryText += `• Opening Balance: Rs.${openingBalMatch[1]}\n`;
  if (closingBalMatch) summaryText += `• Closing Balance: Rs.${closingBalMatch[1]}\n`;
  
  return {
    summary: summaryText,
    chartData: chartData,
    groups: groups, // Pass full detailed groups
    rawText: text 
  };
}

module.exports = { categorizeText, analyzeForChart };
