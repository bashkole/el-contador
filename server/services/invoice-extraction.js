const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

// Invoice data extraction prompt
const INVOICE_EXTRACTION_PROMPT = `Extract the following information from this invoice/receipt image or PDF.
Return ONLY a JSON object with these exact fields (use null if not found):

{
  "vendor": "Company name of the seller/supplier",
  "vendorEmail": "Supplier email address from the invoice",
  "vendorAddress": "Full supplier address from the invoice",
  "vendorVatNumber": "Supplier VAT/BTW number",
  "vendorCompanyNumber": "Supplier chamber of commerce/KvK number",
  "invoiceNumber": "Invoice or receipt number",
  "date": "Invoice date in YYYY-MM-DD format",
  "totalAmount": "Total amount including VAT as a number",
  "vatAmount": "VAT amount as a number",
  "vatRate": "VAT percentage rate as a number (e.g., 21, 9, 0)",
  "currency": "Currency code (e.g., EUR, USD)",
  "description": "Brief description of what was purchased"
}

Important:
- Return ONLY valid JSON, no markdown, no explanations
- Use standard ISO date format (YYYY-MM-DD)
- All numeric values should be numbers, not strings
- If VAT rate is not explicitly shown, estimate based on total and VAT amount
- Default currency to EUR if not specified
- If no invoice number is visible, use null
- Extract vendor contact details (email, address, VAT number) if available on the invoice`;

/**
 * Extract invoice data from an image or PDF file using Gemini
 * @param {string} filePath - Path to the invoice file
 * @returns {Promise<Object>} Extracted invoice data
 */
async function extractInvoiceData(filePath) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable not set');
  }

  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  
  // Read file and convert to base64
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  
  // Determine mime type
  const ext = path.extname(filePath).toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === '.pdf') mimeType = 'application/pdf';
  else if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
  else if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.gif') mimeType = 'image/gif';

  try {
    const result = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: INVOICE_EXTRACTION_PROMPT },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ]
    });

    const responseText = result.text;
    
    // Extract JSON from response (handle potential markdown code blocks)
    let jsonText = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }
    
    // Clean up any non-JSON content
    jsonText = jsonText.trim();
    
    const extractedData = JSON.parse(jsonText);
    
    // Validate and normalize the extracted data
    return normalizeInvoiceData(extractedData);
  } catch (error) {
    console.error('Gemini extraction error:', error);
    throw new Error(`Failed to extract invoice data: ${error.message}`);
  }
}

/**
 * Normalize extracted invoice data to ensure consistent format
 * @param {Object} data - Raw extracted data
 * @returns {Object} Normalized data
 */
function normalizeInvoiceData(data) {
  const normalized = {
    vendor: data.vendor || null,
    vendorEmail: data.vendorEmail || data.vendor_email || null,
    vendorAddress: data.vendorAddress || data.vendor_address || null,
    vendorVatNumber: data.vendorVatNumber || data.vendor_vat_number || null,
    vendorCompanyNumber: data.vendorCompanyNumber || data.vendor_company_number || null,
    invoiceNumber: data.invoiceNumber || data.invoice_number || null,
    date: data.date || null,
    totalAmount: parseNumericValue(data.totalAmount),
    vatAmount: parseNumericValue(data.vatAmount),
    vatRate: parseNumericValue(data.vatRate),
    currency: data.currency || 'EUR',
    description: data.description || null
  };

  // Calculate VAT rate if not provided but we have amounts
  if (!normalized.vatRate && normalized.totalAmount && normalized.vatAmount) {
    const netAmount = normalized.totalAmount - normalized.vatAmount;
    if (netAmount > 0) {
      normalized.vatRate = Math.round((normalized.vatAmount / netAmount) * 100);
    }
  }

  // Calculate net amount (what we store as "amount" in expenses)
  normalized.netAmount = normalized.totalAmount && normalized.vatAmount 
    ? normalized.totalAmount - normalized.vatAmount 
    : normalized.totalAmount;

  return normalized;
}

/**
 * Parse a numeric value, handling various formats
 * @param {any} value - Value to parse
 * @returns {number|null} Parsed number or null
 */
function parseNumericValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove currency symbols and whitespace, replace comma with dot
    const cleaned = value.replace(/[^\d.,-]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

module.exports = {
  extractInvoiceData
};
