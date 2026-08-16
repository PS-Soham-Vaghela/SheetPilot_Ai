# 🚀 SheetPilot AI — Complete Setup & Run Instructions

Comprehensive setup guide to get SheetPilot AI running locally and in the cloud.

---

## 📋 Prerequisites

Before you begin, ensure you have:
1. **Python 3.11+** installed (`python --version`)
2. **Node.js 18+ and npm** installed (`node --version`)
3. **Google Chrome** (latest version for the Extension)
4. **Groq Cloud API Key** (Free from [console.groq.com](https://console.groq.com))
5. **MongoDB Atlas URI** (Free cluster from [mongodb.com](https://www.mongodb.com))

---

## ⚙️ Step 1: Clone & Configure Environment

Navigate to the project root and create your `.env` file:

```bash
cd sheetpilot-ai
cp .env.example .env
```

Open `.env` and fill in your credentials:

```ini
# Server Settings
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000

# Groq Cloud AI LLM
GROQ_API_KEY=gsk_your_actual_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant

# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sheetpilot?retryWrites=true&w=majority
MONGODB_DB_NAME=sheetpilot

# Defaults
DEFAULT_WORKBOOK_PATH=./sample_data/vendor_invoice.xlsx
```

---

## 🐍 Step 2: Python Backend Setup

```bash
# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server (runs on http://127.0.0.1:8000)
python -m backend.main
```

Verify the backend is running:
* Health Check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
* Interactive Swagger Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## ⚛️ Step 3: React Web Application Setup

In a new terminal window:

```bash
cd webapp

# Install dependencies
npm install

# Start Vite dev server (runs on http://localhost:5173)
npm run dev

# Or build production assets (served directly by FastAPI)
npm run build
```

Open your browser and visit: **[http://localhost:5173](http://localhost:5173)**

---

## 🧩 Step 4: Load the Chrome Extension

1. Open Google Chrome and visit `chrome://extensions/`.
2. Turn ON **Developer mode** (top-right toggle switch).
3. Click **Load unpacked**.
4. Select the `extension/` folder inside the `sheetpilot-ai` directory.
5. Pin **SheetPilot AI** to your Chrome toolbar.
6. Click the extension icon on any webpage to open the side panel.

---

## 🧪 Step 5: Run Automated Tests

To verify that the RAG retriever, Spreadsheet Editor CRUD engine, and semantic mapping are working:

```bash
python backend/tests/test_advanced_features.py
```

Expected result:
```text
--- Running SheetPilot AI Automated Test Suite ---
[PASS] Lexical RAG Search Test
[PASS] Spreadsheet Editor Full CRUD Test
[PASS] Semantic Heuristic Mapping Test
--- ALL TESTS PASSED SUCCESSFULLY! ---
```

---

## 🔍 How to Use SheetPilot AI

### 1. In-Browser Spreadsheet Editor
* Click **"Sheet Editor"** in the top navbar or left sidebar.
* Switch between workbooks or create a new one using presets (*Vendor Invoices*, *Leads*, *E-Commerce*, *Custom*).
* Double-click any cell to edit or use the top formula bar (`fx`).
* Use `Add Row`, `Add Column`, or `Delete Row` to manipulate structure.
* Click `⚡ AI Sync to Row N` to jump directly into extracting web data for that row.

### 2. Chrome Extension Web Sync
* Navigate to any website (e.g., an invoice, product page, or supplier portal).
* Open the SheetPilot side panel.
* Select target row and click **"🔍 Analyze This Page"**.
* Review proposed field mappings (color-coded by confidence).
* Click **"✓ Approve & Write to Excel"** to commit values directly into your `.xlsx` workbook.

### 3. Web URL & Text Analysis
* Navigate to **Analyze** in the web dashboard.
* Paste any URL (or paste raw page text) and click **"Analyze This Page"**.
* Review extracted values and approve to write to the spreadsheet.

### 4. Spreadsheet Chat Copilot
* On the **Dashboard**, switch to the **"Chat Copilot"** tab.
* Ask any question about your active spreadsheet data in natural language.

---

## ❓ Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **Backend unreachable in web app** | Ensure `python -m backend.main` is running on port 8000. In webapp Settings, verify API URL is set to `http://127.0.0.1:8000`. |
| **Groq API error** | Verify `GROQ_API_KEY` is set correctly in `.env` and has active credits at [console.groq.com](https://console.groq.com). |
| **Workbook file locked** | SheetPilot AI uses atomic writes to prevent file locking, but if Microsoft Excel has an exclusive write lock, save and close the file in desktop Excel. |
| **Render cloud deployment 404** | On free tier hosting, upload files via `/workbooks` or `/editor` so files are saved into `./uploads/`. |
