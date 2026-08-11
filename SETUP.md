# SheetPilot AI — Setup & Run Instructions

Complete setup guide to get SheetPilot AI running on your machine.

---

## Prerequisites

Before you begin, ensure you have:

1. **Python 3.11** installed and available in your PATH
2. **Ollama** installed and running with the `llama3.1:8b` model pulled
3. **Google Chrome** (latest version)
4. **Windows PowerShell** (already available on your system)

---

## Step 1: Verify Ollama is Running

SheetPilot AI requires a local LLM. Make sure Ollama is running:

```powershell
# Check if Ollama is running (should return model list)
ollama list

# If llama3.1:8b is not listed, pull it:
ollama pull llama3.1:8b

# Verify Ollama is serving on the default port:
curl http://localhost:11434/api/tags
```

**Expected output:** JSON response listing available models.

If Ollama is not installed, download it from: https://ollama.ai/download

---

## Step 2: Install Python Dependencies

Navigate to the project root and install all required packages:

```powershell
cd "c:\Users\SohamVaghela\Downloads\L2_Project\sheetpilot-ai"

# Create a virtual environment (recommended)
python -m venv venv

# Activate it
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

**Installation time:** ~3-5 minutes (sentence-transformers downloads a 22MB model on first run).

---

## Step 3: Configure Environment

Copy the example `.env` file and set your paths:

```powershell
# Copy the template
Copy-Item .env.example .env

# Edit .env in your preferred editor (Notepad, VS Code, etc.)
notepad .env
```

**Required settings:**

```ini
# Default workbook path — update this to your actual file location
DEFAULT_WORKBOOK_PATH=./sample_data/vendor_invoice.xlsx

# Leave these defaults unless you have a custom setup
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
```

**Note:** The sample workbook `vendor_invoice.xlsx` is already generated in `sample_data/`.

---

## Step 4: Start the Backend Server

Run the FastAPI backend:

```powershell
cd "c:\Users\SohamVaghela\Downloads\L2_Project\sheetpilot-ai"

# Activate venv if not already active
.\venv\Scripts\Activate.ps1

# Start the server (runs on http://127.0.0.1:8000)
python -m backend.main
```

**Expected output:**

```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     SheetPilot AI backend starting up...
INFO:     Ollama: Model 'llama3.1:8b' is ready.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

**Keep this terminal open** — the backend must stay running while you use the extension.

### Health Check

Open a new PowerShell window and verify the backend is responding:

```powershell
curl http://127.0.0.1:8000/health
```

**Expected response:** JSON with `"status": "ok"` and `ollama.ok: true`.

---

## Step 5: Load the Chrome Extension

### 5.1 Enable Developer Mode

1. Open Chrome and navigate to: `chrome://extensions/`
2. Toggle **Developer mode** (top-right corner) to **ON**

### 5.2 Load Unpacked Extension

1. Click **Load unpacked**
2. Navigate to: `c:\Users\SohamVaghela\Downloads\L2_Project\sheetpilot-ai\extension`
3. Click **Select Folder**

The **SheetPilot AI** extension should now appear in your extensions list with a blue icon.

### 5.3 Pin the Extension (optional but recommended)

1. Click the **Extensions** puzzle icon in the Chrome toolbar
2. Find **SheetPilot AI** and click the **pin** icon

---

## Step 6: Test the Full Flow

### 6.1 Open a Test Webpage

Open any webpage with vendor/invoice information. For testing, you can use:

- https://www.example-vendor.com (any supplier webpage with company info)
- A PDF invoice opened in Chrome
- Any webpage with structured data (company names, GST numbers, addresses, etc.)

**Quick test page:** Open this data in a new tab (copy to address bar, then view source or paste into a local HTML file):

```html
<!DOCTYPE html>
<html>
<head><title>Test Vendor Page</title></head>
<body>
  <h1>Acme Supplies Ltd</h1>
  <p><strong>GST Number:</strong> 27AADCT1234F1Z5</p>
  <p><strong>Invoice Number:</strong> INV-2024-999</p>
  <p><strong>Invoice Date:</strong> 2024-03-15</p>
  <p><strong>Email:</strong> billing@acme-supplies.com</p>
  <p><strong>Phone:</strong> +91-22-40001234</p>
  <p><strong>Address:</strong> Plot 22, Industrial Estate, Mumbai 400001</p>
  <table>
    <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
    <tr><td>Steel Rods</td><td>100</td><td>50.00</td><td>5000.00</td></tr>
  </table>
  <p>Total Amount: ₹5000.00 INR</p>
  <p>Payment Terms: Net 30</p>
  <p>PO Number: PO-1234</p>
</body>
</html>
```

Save this as `test_page.html` and open it in Chrome.

### 6.2 Open the Side Panel

Click the **SheetPilot AI** icon in the toolbar → the side panel opens.

### 6.3 Configure Workbook Path

In the side panel:

1. **Excel Workbook Path:** Enter the full path to your workbook.
   - For the sample: `c:\Users\SohamVaghela\Downloads\L2_Project\sheetpilot-ai\sample_data\vendor_invoice.xlsx`
   - Or use your own `.xlsx` file with row 1 = headers, row 2+ = data rows.

2. **Active Row:** Leave as `2` (the empty row in the sample workbook).

3. **Status dot** (top-right): Should be **green** if backend is healthy.

### 6.4 Analyze the Page

1. Click **🔍 Analyze This Page**
2. Wait 5-15 seconds (progress indicator shows "Analyzing page with local AI…")

**What happens:**
- Content script extracts visible text from the page
- Backend runs: RAG indexing → passage retrieval → LLM reasoning → staging
- Side panel displays proposed mappings with confidence badges

### 6.5 Review Proposals

The panel now shows:

- **Green cards** = high confidence match (e.g., "Vendor Name" → "Acme Supplies Ltd")
- **Amber cards** = medium confidence
- **Red cards** = low confidence
- **Missing fields section** = fields not found on the page

Each card shows:
- The Excel field name
- The extracted value (editable)
- A source snippet showing where on the page the value came from

### 6.6 Edit Values (optional)

Click into any value field and edit if the extraction is wrong. Edited fields turn amber.

### 6.7 Approve & Sync

1. Click **✓ Approve & Sync**
2. Wait for the success screen: "X fields written to Excel"
3. Click **Analyze Another Page** to reset

### 6.8 Verify the Excel File

Open `vendor_invoice.xlsx` in Excel:

- Row 2 should now be populated with the approved values
- Only the fields you approved are written (never overwrites existing values unless explicitly approved)

---

## Troubleshooting

### Backend Issues

**"Backend offline" (red status dot)**

```powershell
# 1. Check if backend is running
curl http://127.0.0.1:8000/health

# 2. Check the backend terminal for errors

# 3. Restart the backend
cd "c:\Users\SohamVaghela\Downloads\L2_Project\sheetpilot-ai"
.\venv\Scripts\Activate.ps1
python -m backend.main
```

**"Cannot reach Ollama" error**

```powershell
# Verify Ollama is running and the model is available
ollama list
ollama run llama3.1:8b "test"

# If Ollama is not responding, restart it:
# (Close the Ollama app completely and reopen it)
```

**"Module not found" errors**

```powershell
# Re-install dependencies
pip install -r requirements.txt --force-reinstall
```

### Extension Issues

**Extension won't load**

- Ensure you selected the `extension/` folder, not the project root
- Check Chrome DevTools console (right-click extension icon → Inspect) for errors

**Side panel is blank**

- Open Chrome DevTools on the side panel (right-click inside panel → Inspect)
- Check Console tab for JavaScript errors
- Verify backend is responding: `curl http://127.0.0.1:8000/health`

**"No response from content script" error**

- Refresh the webpage you're trying to analyze
- Some pages (like `chrome://` URLs) block content scripts — use a regular HTTP/HTTPS page

### Excel Issues

**"Workbook not found" error**

- Use the **full absolute path** to the `.xlsx` file
- Ensure the file exists and is not open in Excel (openpyxl cannot write to open files on Windows)

**Values not appearing in Excel**

- Close the workbook in Excel and reopen it after clicking "Approve & Sync"
- Check the backend terminal logs for write errors

---

## Architecture Recap

```
Webpage (Chrome tab)
      ↓ (content_script.js extracts text)
Backend FastAPI
      ↓ (POST /analyze)
  1. RAG: chunk + embed + retrieve (ChromaDB)
  2. LLM: reason over passages (Ollama local)
  3. MCP: stage proposals (in-memory)
      ↓ (response)
Side Panel UI (proposals shown)
      ↓ (user clicks "Approve & Sync")
Backend FastAPI
      ↓ (POST /commit)
  4. MCP: write to Excel (openpyxl)
      ↓
Excel file updated ✓
```

---

## What's Next?

### Use Your Own Data

1. Create or open your own Excel workbook
2. Ensure row 1 has clear column headers (e.g., "Company Name", "Tax ID", "Email")
3. Set the path in the side panel config
4. Browse to any webpage with relevant data and analyze

### Customization

- **System prompt:** Edit `backend/llm/prompt_templates.py` to change extraction behavior
- **Chunk size:** Adjust `CHUNK_SIZE` and `CHUNK_OVERLAP` in `backend/rag/chunker.py`
- **Model:** Change `OLLAMA_MODEL` in `.env` to use a different local LLM
- **RAG top-k:** Set `RAG_TOP_K` in `.env` to retrieve more/fewer passages

### Production Deployment

For multi-user or production use:

- Deploy FastAPI with `gunicorn` or `uvicorn` behind nginx
- Use a persistent ChromaDB server instead of local PersistentClient
- Replace in-process MCP bridge with stdio transport for true agent isolation
- Add authentication to FastAPI endpoints
- Package the extension and publish to Chrome Web Store

---

## Support & Docs

- **Project structure:** See `README.md` (the spec document)
- **Logs:** Backend logs all operations to stdout with timestamps
- **MCP tools:** See `backend/mcp/excel_server.py` for tool signatures
- **Debugging:** Set `logging.DEBUG` in `backend/main.py` for verbose output

---

**You're all set! SheetPilot AI is ready to transfer webpage data into your Excel workbooks with local AI.**
