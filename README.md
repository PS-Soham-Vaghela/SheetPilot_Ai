# 📊 SheetPilot AI — Intelligent Web-to-Excel Copilot & In-Browser Spreadsheet Studio

> **Transform unstructured web data into structured Excel spreadsheets with zero copy-pasting.**  
> Powered by Fast RAG embeddings, Groq LLM inference, Model Context Protocol (MCP), and an interactive in-browser spreadsheet editor.

---

## 📑 Table of Contents
1. [Problem Statement](#-problem-statement)
2. [Proposed Solution](#-proposed-solution)
3. [Key Features Overview](#-key-features-overview)
4. [System Architecture & Workflow](#-system-architecture--workflow)
5. [Technology Stack](#-technology-stack)
6. [Complete Codebase File Map](#-complete-codebase-file-map)
7. [How Everything Works: Detailed Workflows](#-how-everything-works-detailed-workflows)
8. [Installation & Setup Guide](#-installation--setup-guide)
9. [REST API Reference](#-rest-api-reference)
10. [Chrome Extension Setup](#-chrome-extension-setup)
11. [Testing & Verification](#-testing--verification)
12. [Deployment Guide](#-deployment-guide)

---

## 📌 Problem Statement

In logistics, procurement, e-commerce, recruitment, and accounting, professionals waste hundreds of hours manually transferring data from supplier portals, invoices, product listings, and digital receipts into Excel spreadsheets:
* **Time-Consuming & Repetitive**: Copying multi-field records from web pages one-by-one is tedious and slow.
* **Prone to Human Error**: Typos, swapped tax IDs, missed columns, and misaligned numbers lead to costly financial discrepancies.
* **Spreadsheet Disconnect**: Traditional browser extensions require opening desktop Excel software to verify or correct cell data.
* **Fragile Web Scraping**: Standard DOM scrapers break whenever a website alters its HTML class names or layout.

---

## 💡 Proposed Solution

**SheetPilot AI** bridges the gap between the live web and Excel spreadsheets through an autonomous AI-driven pipeline:
1. **Intelligent Semantic Understanding**: Rather than relying on fragile CSS selectors, SheetPilot uses a **Retrieval-Augmented Generation (RAG)** pipeline + **Groq Llama 3.1** to read any page semantically and match relevant facts to target Excel column headers.
2. **Dual Entry Modes**:
   * **Chrome Extension (Manifest V3)**: Real-time side panel that extracts data directly from active browser tabs (including login-protected portals).
   * **Web App URL / Text Analysis**: Server-side URL scraper and fallback text parser that requires no extension installed.
3. **In-Browser Interactive Spreadsheet Studio**: A full-featured data grid that lets users view, double-click to edit cells, add/delete rows and columns, switch worksheet tabs, and auto-save changes directly into `.xlsx` files without needing Microsoft Excel desktop.
4. **Human-in-the-Loop Review**: Color-coded confidence badges (High / Medium / Low) and source citations let users review and tweak proposed values before committing.
5. **Full Audit Trail & 1-Click Rollback**: Every synced row is logged to MongoDB Atlas with field-level diffs, enabling instant 1-click restore/undo.
6. **Chat Copilot with Spreadsheets**: Ask natural language questions (e.g., *"Which vendor has the highest invoice total?"*) and receive immediate answers grounded in your spreadsheet data.
<img width="1913" height="954" alt="image" src="https://github.com/user-attachments/assets/1668339d-c3e3-4e08-8d96-d15e4ac7cc32" />

---

## 🚀 Key Features Overview
<img width="1616" height="973" alt="ChatGPT Image Aug 17, 2026, 01_04_51 PM" src="https://github.com/user-attachments/assets/ead7400f-2943-451d-88cb-957ee90ef936" />


---

## 🛠 System Architecture & Workflow<img width="1024" height="1536" alt="ChatGPT Image Aug 17, 2026, 12_59_23 PM" src="https://github.com/user-attachments/assets/5ae237a8-c0d9-4c8e-9384-3022b5798f72" />


```mermaid
flowchart TB
    subgraph Clients ["User Interfaces"]
        Ext["Chrome Extension (MV3)<br>• content_script.js<br>• Side Panel UI"]
        Web["Web Dashboard (React + Vite)<br>• In-Browser Sheet Editor<br>• URL / Text Analyzer<br>• History & Chat Copilot"]
    end

    subgraph Backend ["FastAPI Application (Port 8000)"]
        API["FastAPI Routing Engine"]
        Orch["Agent Orchestrator"]
        
        subgraph RAG_Pipeline ["RAG & AI Engine"]
            Chunker["Text Chunker (Sliding Window)"]
            Embedder["Embedder (all-MiniLM-L6-v2)"]
            Retriever["Hybrid Vector + Lexical Retriever"]
            LLM["Groq Cloud LLM (llama-3.1-8b)"]
        end
        
        subgraph MCP_Layer ["Excel & File Engine"]
            Editor["excel_editor.py<br>(CRUD & Data Grid)"]
            Writer["excel_server.py<br>(Atomic File-Lock Writes)"]
        end
        
        subgraph Storage ["Database & Storage"]
            Mongo[("MongoDB Atlas<br>(Sync History & Stats)")]
            Files[("Excel Files (.xlsx / .csv)<br>• uploads/<br>• sample_data/")]
        end
    end

    Ext -->|"POST /analyze<br>POST /commit"| API
    Web -->|"GET /workbook/data<br>POST /analyze-url<br>POST /chat/workbook"| API
    API --> Orch
    Orch --> Chunker --> Embedder --> Retriever --> LLM
    Orch --> Writer --> Files
    API --> Editor --> Files
    API --> Mongo
```

---

## 🧰 Technology Stack

### Backend
* **FastAPI (Python 3.11+)**: Async high-performance REST API with CORS and SSE streaming.
* **Groq API (`groq`)**: Ultra-fast LLM inference using `llama-3.1-8b-instant`.
* **Sentence-Transformers & PyTorch**: Lightweight local embeddings (`all-MiniLM-L6-v2`).
* **OpenPyXL**: Advanced Excel manipulation with atomic write protection and multi-sheet support.
* **PyMongo / Motor**: Persistent sync audit logging and analytics on MongoDB Atlas.
* **BeautifulSoup4 & HTTPX**: Server-side webpage scraping and clean HTML text normalization.

### Frontend (Web Dashboard)
* **React 18 & Vite**: Ultra-fast single-page application.
* **React Router DOM v6**: Client-side SPA routing.
* **Pure Modern CSS**: Custom design system featuring dark/light tokens, floating glassmorphic navbars, and interactive spreadsheet tables.

### Chrome Extension
* **Manifest V3**: Modern background service worker and Chrome Side Panel API.
* **DOM Extractor**: Traverses text nodes, meta tags, and structured headers on active tabs.

---

## 📁 Complete Codebase File Map

```
sheetpilot-ai/
│
├── backend/                              # FastAPI Backend Source
│   ├── agent/
│   │   ├── __init__.py                   # Agent package initializer
│   │   └── orchestrator.py               # Coordinates RAG retrieval, LLM prompt assembly, validation & confidence scoring
│   ├── db/
│   │   ├── __init__.py                   # DB package initializer
│   │   ├── history.py                    # Sync history queries, stats aggregation, and undo state tracking
│   │   └── mongodb.py                    # MongoDB Atlas client connection and collection initialization
│   ├── llm/
│   │   ├── __init__.py                   # LLM package initializer
│   │   ├── local_model.py                # Groq API client with fallback diagnostics
│   │   └── prompt_templates.py           # Structured extraction prompts and JSON schema instructions
│   ├── mcp/
│   │   ├── __init__.py                   # MCP package initializer
│   │   ├── agent_client.py               # In-process bridge for Model Context Protocol tools
│   │   ├── csv_handler.py                # CSV spreadsheet fallback reader and writer
│   │   ├── excel_editor.py               # High-performance in-browser spreadsheet CRUD engine
│   │   └── excel_server.py               # MCP Excel tool definitions and atomic file-lock safe writer
│   ├── models/
│   │   ├── __init__.py                   # Schemas package initializer
│   │   └── schemas.py                    # Pydantic models for API requests, mappings, and commit responses
│   ├── rag/
│   │   ├── __init__.py                   # RAG package initializer
│   │   ├── chunker.py                    # Recursive text chunker with paragraph and sentence boundaries
│   │   ├── embedder.py                   # Sentence-Transformers vector embedding generation
│   │   └── retriever.py                  # Hybrid dense-vector and BM25-style lexical search engine
│   ├── tests/
│   │   └── test_advanced_features.py     # Automated unit & integration test suite
│   ├── auth.py                           # Authentication token generation and user verification
│   └── main.py                           # Primary FastAPI application entrypoint with all API endpoints
│
├── extension/                            # Chrome Browser Extension (Manifest V3)
│   ├── icons/                            # Extension toolbar icons (16px, 48px, 128px)
│   ├── background.js                     # Extension service worker managing side panel toggle
│   ├── content_script.js                 # Content script extracting structured text from webpage DOM
│   ├── manifest.json                     # Chrome Extension Manifest V3 configuration
│   ├── panel.html                        # Side panel UI layout
│   └── panel.js                          # Side panel state management, backend communication & review UI
│
├── webapp/                               # React + Vite Web Application
│   ├── dist/                             # Compiled production build artifacts
│   ├── src/
│   │   ├── components/
│   │   │   ├── ActivityChart.jsx         # 30-day sync volume visualizer
│   │   │   ├── FieldBadge.jsx            # Confidence score badge (High, Medium, Low)
│   │   │   ├── Layout.jsx                # App shell with navbar and sidebar
│   │   │   ├── Navbar.jsx                # Floating glassmorphic top navigation bar
│   │   │   ├── Sidebar.jsx               # Left navigation with system status & pipeline tracker
│   │   │   ├── StatCard.jsx              # Summary metric card
│   │   │   ├── SyncRow.jsx               # History table row with field inspector and undo button
│   │   │   ├── Toast.jsx                 # Notification toast provider
│   │   │   └── WorkbookCard.jsx          # Workbook card with stats & direct editor launcher
│   │   ├── pages/
│   │   │   ├── Analyze.jsx               # Web page URL / text analyzer with review & approve workflow
│   │   │   ├── Dashboard.jsx             # Overview hero, quick action chips, recent syncs, and Chat Copilot
│   │   │   ├── Editor.jsx                # Live in-browser interactive spreadsheet studio
│   │   │   ├── History.jsx               # Advanced sync history with filtering, search, and CSV export
│   │   │   ├── Settings.jsx              # API URL configuration, default workbook path, and diagnostics
│   │   │   └── Workbooks.jsx             # Workbook management, upload, download, and sync inspection
│   │   ├── api.js                        # Unified HTTP client for all backend REST API endpoints
│   │   ├── App.jsx                       # Route registry and Toast context
│   │   ├── index.css                     # Design system CSS styles, table grid styles, and animations
│   │   └── main.jsx                      # React DOM root entrypoint
│   ├── package.json                      # Webapp dependencies and build scripts
│   └── vite.config.js                    # Vite configuration
│
├── sample_data/                          # Ready-to-use sample spreadsheets
│   └── vendor_invoice.xlsx               # Standardized vendor invoice workbook template
│
├── uploads/                              # User-uploaded spreadsheets storage directory
├── requirements.txt                      # Python dependencies specification
├── mcp_config.json                       # Model Context Protocol server configuration
├── .env.example                          # Environment configuration template
├── SETUP.md                              # Detailed step-by-step setup and troubleshooting guide
└── README.md                             # Project overview and documentation (this file)
```

---

## 🔄 How Everything Works: Detailed Workflows

### Workflow 1: Live In-Browser Spreadsheet Editor
1. Navigate to **Sheet Editor** in the web dashboard.
2. Select any uploaded workbook or sample file from the dropdown (or click `+ New Workbook` to create one from a template like *Vendor Invoices* or *Leads*).
3. **Inspect & Navigate**: Use Arrow keys, Tab, and Enter to move across cells. The formula bar (`fx`) displays active cell coordinates (e.g. `B3`) and current column header.
4. **Edit Cells**: Double-click any cell or edit in the formula bar. Changes are immediately saved to the underlying `.xlsx` file via atomic writes.
5. **Manage Dimensions**: Click `Add Row` or `Add Column` to expand your sheet, or switch between worksheet tabs at the bottom.
6. **Direct AI Sync**: Click `⚡ AI Sync to Row N` to jump directly into the extraction pipeline targeting that specific row.

### Workflow 2: Web-to-Excel AI Extraction Pipeline
1. **Web Scrape**: Enter a URL on `/analyze` or click **"Analyze This Page"** in the Chrome extension.
2. **Normalization & RAG**: The page text is cleaned, split into overlapping chunks, and indexed into vector memory.
3. **Schema Mapping**: The orchestrator reads your target workbook's column headers and queries the RAG engine for the most relevant text passages.
4. **LLM Extraction**: Groq Llama 3.1 extracts clean values for each column and assigns confidence scores.
5. **Review & Approve**: The user reviews the staged values in the side panel or web UI. Any edits made in the review card take precedence.
6. **Atomic Commit**: Clicking **"Approve & Write to Excel"** writes the values directly into the `.xlsx` file and logs the action to MongoDB.

### Workflow 3: Conversational Spreadsheet Chat Copilot
1. Open the **Dashboard** and switch to the **Chat Copilot** tab.
2. Select your active workbook.
3. Ask questions in plain English (e.g., *"What is the total invoice amount for TechParts India?"* or *"List all unpaid invoices"*).
4. The backend retrieves the relevant rows, feeds them to Groq LLM, and provides a clear, accurate answer.

---

## 💻 Installation & Setup Guide

### 1. Prerequisites
* **Python 3.11+** installed
* **Node.js 18+ & npm** installed
* **Groq Cloud API Key** (Free from [console.groq.com](https://console.groq.com))
* **MongoDB Atlas URI** (Free cluster from [mongodb.com](https://www.mongodb.com))

### 2. Environment Configuration
Create a `.env` file in the project root:
```env
# Backend Server
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000

# Groq Cloud LLM
GROQ_API_KEY=gsk_your_actual_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant

# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sheetpilot?retryWrites=true&w=majority
MONGODB_DB_NAME=sheetpilot

# Defaults
DEFAULT_WORKBOOK_PATH=./sample_data/vendor_invoice.xlsx
```

### 3. Backend Setup
```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
python -m backend.main
```
The API server will start at `http://127.0.0.1:8000`.

### 4. Frontend Setup
```bash
cd webapp
npm install
npm run dev
```
The web application will be accessible at `http://localhost:5173`.

---

## 🔌 Chrome Extension Setup

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` folder located inside the SheetPilot AI directory.
5. Pin **SheetPilot AI** to your Chrome toolbar and click the icon to open the side panel on any website.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Backend and Groq LLM liveness check |
| `GET` | `/workbook/data` | Retrieves sheet structure, headers, rows, and dimensions |
| `POST` | `/workbook/update-cell` | Updates a single cell value |
| `POST` | `/workbook/update-batch` | Updates multiple cells in a single atomic write |
| `POST` | `/workbook/add-row` | Appends or inserts a new row |
| `POST` | `/workbook/delete-row` | Deletes a specified row |
| `POST` | `/workbook/add-column` | Appends a new column header to row 1 |
| `POST` | `/workbook/create-sheet` | Creates a new worksheet tab |
| `POST` | `/workbook/create` | Creates a new `.xlsx` workbook from a template |
| `POST` | `/upload-workbook` | Uploads an `.xlsx` / `.csv` file to `./uploads/` |
| `GET` | `/download-workbook` | Downloads the updated spreadsheet file |
| `GET` | `/schema` | Returns column headers and active row data |
| `POST` | `/analyze` | Extracts field mappings from provided page text |
| `POST` | `/analyze-url` | Server-side URL fetch + AI extraction |
| `POST` | `/commit` | Writes approved mappings to the Excel workbook |
| `POST` | `/undo` | Restores previous values for a synced row |
| `POST` | `/chat/workbook` | Natural language Q&A about spreadsheet contents |
| `GET` | `/dashboard/stats` | Aggregate counts for dashboard summary cards |
| `GET` | `/history/search` | Filtered sync history with pagination |

---

## 🧪 Testing & Verification

Run the automated test suite to verify RAG search, spreadsheet CRUD, and semantic mapping:
```bash
python backend/tests/test_advanced_features.py
```

Expected output:
```text
--- Running SheetPilot AI Automated Test Suite ---
[PASS] Lexical RAG Search Test
[PASS] Spreadsheet Editor Full CRUD Test
[PASS] Semantic Heuristic Mapping Test
--- ALL TESTS PASSED SUCCESSFULLY! ---
```

---

## 🚢 Deployment Guide

### Deploying Backend on Render / Railway
1. Set the build command: `pip install -r requirements.txt && cd webapp && npm install && npm run build && cd ..`
2. Set the start command: `python -m backend.main`
3. Add environment variables: `GROQ_API_KEY`, `MONGODB_URI`, `BACKEND_PORT=8000`.

### Deploying Frontend on Vercel / Netlify
1. Set the root directory to `webapp`.
2. Set build command: `npm run build`.
3. Set output directory: `dist`.
4. Set environment variable: `VITE_API_BASE=https://your-backend-service.onrender.com`.

---

## 📄 License
MIT License. Built with ❤️ for intelligent data automation.
