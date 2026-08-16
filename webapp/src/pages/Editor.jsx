import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { editorApi, workbooksApi } from '../api.js'
import { useToast } from '../App.jsx'

export default function Editor() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef(null)
  const cellInputRef = useRef(null)

  // Query params
  const searchParams = new URLSearchParams(location.search)
  const initialWb = searchParams.get('wb') || localStorage.getItem('sp_cloud_wb') || localStorage.getItem('sp_default_wb') || './sample_data/vendor_invoice.xlsx'

  // State
  const [wbPath, setWbPath] = useState(initialWb)
  const [serverFiles, setServerFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sheetData, setSheetData] = useState(null)
  const [activeSheet, setActiveSheet] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Active selection & inline edit
  const [selectedCell, setSelectedCell] = useState({ row: 2, col: 1 }) // row is 1-indexed row number, col is 1-indexed
  const [editingCell, setEditingCell] = useState(null) // { row, col, value }
  const [formulaValue, setFormulaValue] = useState('')

  // Dirty tracking (local unsaved edits: { "row_col": { row, col, value, original } })
  const [dirtyCells, setDirtyCells] = useState({})
  const [autoSave, setAutoSave] = useState(true)

  // Modals & Popups
  const [showNewModal, setShowNewModal] = useState(false)
  const [newWbName, setNewWbName] = useState('')
  const [newWbTemplate, setNewWbTemplate] = useState('invoice')
  const [customColumns, setCustomColumns] = useState('Name, Description, Category, Price, Status')

  const [showAddColModal, setShowAddColModal] = useState(false)
  const [newColName, setNewColName] = useState('')

  const [showNewSheetModal, setShowNewSheetModal] = useState(false)
  const [newSheetName, setNewSheetName] = useState('')

  // Load available server files
  const loadFiles = useCallback(async () => {
    try {
      const res = await workbooksApi.listUploads()
      const files = res.files || []
      setServerFiles(files)
      return files
    } catch {
      return []
    }
  }, [])

  // Load Sheet Data
  const loadSheet = useCallback(async (path, sheet = '') => {
    if (!path) return
    setLoading(true)
    try {
      const data = await editorApi.getData(path, sheet)
      setSheetData(data)
      setActiveSheet(data.active_sheet || '')
      setDirtyCells({})
      // Set initial selected cell
      if (data.rows && data.rows.length > 0) {
        const firstRow = data.rows[0].row_index
        const initialVal = data.rows[0].values[0] || ''
        setSelectedCell({ row: firstRow, col: 1 })
        setFormulaValue(initialVal)
      } else {
        setSelectedCell({ row: 2, col: 1 })
        setFormulaValue('')
      }
    } catch (err) {
      toast.error(`Failed to load workbook: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadFiles()
    loadSheet(wbPath)
  }, [wbPath, loadFiles, loadSheet])

  // Helper: Get column letter from 1-indexed index (1 -> A, 2 -> B...)
  const getColLetter = (colIdx) => {
    let temp = ''
    let letter = ''
    let c = colIdx
    while (c > 0) {
      temp = (c - 1) % 26
      letter = String.fromCharCode(65 + temp) + letter
      c = Math.floor((c - temp - 1) / 26)
    }
    return letter || 'A'
  }

  // Cell key helper
  const cellKey = (r, c) => `${r}_${c}`

  // Get current display value of cell
  const getCellValue = (rowIndex, colIndex) => {
    const key = cellKey(rowIndex, colIndex)
    if (dirtyCells[key] !== undefined) {
      return dirtyCells[key].value
    }
    if (!sheetData || !sheetData.rows) return ''
    const rowObj = sheetData.rows.find(r => r.row_index === rowIndex)
    if (!rowObj || !rowObj.values) return ''
    return rowObj.values[colIndex - 1] ?? ''
  }

  // Handle cell selection
  const handleSelectCell = (row, col) => {
    setSelectedCell({ row, col })
    const val = getCellValue(row, col)
    setFormulaValue(val)
    if (editingCell && (editingCell.row !== row || editingCell.col !== col)) {
      commitCellEdit(editingCell.row, editingCell.col, editingCell.value)
      setEditingCell(null)
    }
  }

  // Double-click to start inline editing
  const handleStartEdit = (row, col) => {
    const currentVal = getCellValue(row, col)
    setEditingCell({ row, col, value: currentVal })
    setTimeout(() => {
      if (cellInputRef.current) {
        cellInputRef.current.focus()
        cellInputRef.current.select()
      }
    }, 20)
  }

  // Commit a single cell value
  const commitCellEdit = async (row, col, value) => {
    const key = cellKey(row, col)
    const originalVal = sheetData?.rows?.find(r => r.row_index === row)?.values?.[col - 1] ?? ''
    
    // Update local dirty state
    const newDirty = {
      ...dirtyCells,
      [key]: { row, col, value, original: originalVal }
    }
    setDirtyCells(newDirty)

    // Update in-memory sheetData
    setSheetData(prev => {
      if (!prev) return prev
      const nextRows = prev.rows.map(r => {
        if (r.row_index === row) {
          const nextVals = [...r.values]
          nextVals[col - 1] = value
          return { ...r, values: nextVals, is_empty: !nextVals.some(v => v !== '') }
        }
        return r
      })
      return { ...prev, rows: nextRows }
    })

    setFormulaValue(value)

    if (autoSave) {
      try {
        await editorApi.updateCell(wbPath, activeSheet, row, col, value)
        // Clean from dirty
        setDirtyCells(curr => {
          const copy = { ...curr }
          delete copy[key]
          return copy
        })
      } catch (err) {
        toast.error(`Auto-save failed: ${err.message}`)
      }
    }
  }

  // Save all dirty cells
  const handleSaveAll = async () => {
    const updates = Object.values(dirtyCells).map(d => ({
      row: d.row,
      col: d.col,
      value: d.value,
    }))

    if (updates.length === 0) {
      toast.info('No unsaved changes.')
      return
    }

    setSaving(true)
    try {
      await editorApi.updateBatch(wbPath, activeSheet, updates)
      setDirtyCells({})
      toast.success(`Saved ${updates.length} changes to Excel!`)
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Formula bar change
  const handleFormulaChange = (e) => {
    const val = e.target.value
    setFormulaValue(val)
    if (selectedCell) {
      commitCellEdit(selectedCell.row, selectedCell.col, val)
    }
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!selectedCell || editingCell) return

    const { row, col } = selectedCell
    const totalRows = sheetData?.rows ? sheetData.rows.length + 1 : 2
    const totalCols = sheetData?.headers ? sheetData.headers.length : 1

    if (e.key === 'ArrowUp' && row > 2) {
      e.preventDefault()
      handleSelectCell(row - 1, col)
    } else if (e.key === 'ArrowDown' && row <= totalRows) {
      e.preventDefault()
      handleSelectCell(row + 1, col)
    } else if (e.key === 'ArrowLeft' && col > 1) {
      e.preventDefault()
      handleSelectCell(row, col - 1)
    } else if (e.key === 'ArrowRight' && col < totalCols) {
      e.preventDefault()
      handleSelectCell(row, col + 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleStartEdit(row, col)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (col < totalCols) {
        handleSelectCell(row, col + 1)
      } else if (row <= totalRows) {
        handleSelectCell(row + 1, 1)
      }
    }
  }

  // Add new row
  const handleAddRow = async () => {
    try {
      const res = await editorApi.addRow(wbPath, activeSheet)
      toast.success('Row added successfully.')
      await loadSheet(wbPath, activeSheet)
      if (res.row_index) {
        handleSelectCell(res.row_index, 1)
      }
    } catch (err) {
      toast.error(`Failed to add row: ${err.message}`)
    }
  }

  // Delete selected row
  const handleDeleteRow = async (rowIdx) => {
    const target = rowIdx || selectedCell.row
    if (target < 2) {
      toast.error('Cannot delete header row.')
      return
    }
    if (!window.confirm(`Are you sure you want to delete Row ${target}?`)) return

    try {
      await editorApi.deleteRow(wbPath, activeSheet, target)
      toast.success(`Row ${target} deleted.`)
      await loadSheet(wbPath, activeSheet)
      setSelectedCell({ row: Math.max(2, target - 1), col: 1 })
    } catch (err) {
      toast.error(`Failed to delete row: ${err.message}`)
    }
  }

  // Add column
  const handleAddColumn = async (e) => {
    e.preventDefault()
    if (!newColName.trim()) return
    try {
      await editorApi.addColumn(wbPath, activeSheet, newColName.trim())
      toast.success(`Added column "${newColName.trim()}".`)
      setNewColName('')
      setShowAddColModal(false)
      await loadSheet(wbPath, activeSheet)
    } catch (err) {
      toast.error(`Failed to add column: ${err.message}`)
    }
  }

  // Create sheet
  const handleCreateSheet = async (e) => {
    e.preventDefault()
    if (!newSheetName.trim()) return
    try {
      await editorApi.createSheet(wbPath, newSheetName.trim())
      toast.success(`Created sheet "${newSheetName.trim()}".`)
      const created = newSheetName.trim()
      setNewSheetName('')
      setShowNewSheetModal(false)
      await loadSheet(wbPath, created)
    } catch (err) {
      toast.error(`Failed to create sheet: ${err.message}`)
    }
  }

  // Create new workbook
  const handleCreateWorkbook = async (e) => {
    e.preventDefault()
    let name = newWbName.trim()
    if (!name) name = 'New_Spreadsheet.xlsx'
    if (!name.endsWith('.xlsx')) name += '.xlsx'

    let headers = null
    if (newWbTemplate === 'invoice') {
      headers = ['Vendor Name', 'Vendor GST Number', 'Invoice Number', 'Invoice Date', 'Due Date', 'Item Description', 'Quantity', 'Unit Price', 'Total Amount', 'Currency', 'Payment Terms', 'Notes']
    } else if (newWbTemplate === 'leads') {
      headers = ['Company Name', 'Contact Person', 'Job Title', 'Email Address', 'Phone Number', 'Website URL', 'Industry', 'Lead Status', 'Notes']
    } else if (newWbTemplate === 'ecommerce') {
      headers = ['Product Title', 'SKU / Model', 'Category', 'Price', 'Original Price', 'Stock Status', 'Product URL', 'Rating', 'Supplier']
    } else if (newWbTemplate === 'custom') {
      headers = customColumns.split(',').map(c => c.trim()).filter(Boolean)
      if (headers.length === 0) headers = ['Column 1', 'Column 2', 'Column 3']
    }

    try {
      const res = await editorApi.createWorkbook(name, headers)
      toast.success(`Created ${res.filename}!`)
      setWbPath(res.workbook_path)
      localStorage.setItem('sp_cloud_wb', res.workbook_path)
      localStorage.setItem('sp_default_wb', res.workbook_path)
      setShowNewModal(false)
      setNewWbName('')
      await loadFiles()
      await loadSheet(res.workbook_path)
    } catch (err) {
      toast.error(`Failed to create workbook: ${err.message}`)
    }
  }

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await workbooksApi.upload(file)
      toast.success(`Uploaded ${file.name}!`)
      setWbPath(res.workbook_path)
      localStorage.setItem('sp_cloud_wb', res.workbook_path)
      localStorage.setItem('sp_default_wb', res.workbook_path)
      await loadFiles()
      await loadSheet(res.workbook_path)
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Filtered rows by search
  const filteredRows = (sheetData?.rows || []).filter(row => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return row.values.some(v => String(v).toLowerCase().includes(q))
  })

  const dirtyCount = Object.keys(dirtyCells).length
  const currentHeader = sheetData?.headers?.[selectedCell.col - 1] || `Col ${selectedCell.col}`

  return (
    <div className="editor-container" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* ── Top Header & Controls ──────────────────────────────────────────── */}
      <div className="editor-top-bar">
        <div className="editor-wb-picker">
          <div className="editor-title-group">
            <span className="editor-badge">LIVE SPREADSHEET</span>
            <div className="editor-wb-select-wrap">
              <select
                className="inp editor-wb-select"
                value={wbPath}
                onChange={e => {
                  setWbPath(e.target.value)
                  localStorage.setItem('sp_cloud_wb', e.target.value)
                  localStorage.setItem('sp_default_wb', e.target.value)
                }}
              >
                {serverFiles.map(f => (
                  <option key={f.workbook_path} value={f.workbook_path}>
                    {f.type === 'uploaded' ? '📁 ' : '📄 '} {f.filename}
                  </option>
                ))}
                {!serverFiles.some(f => f.workbook_path === wbPath) && (
                  <option value={wbPath}>{wbPath.split(/[\\/]/).pop() || wbPath}</option>
                )}
              </select>
            </div>
          </div>

          <div className="editor-quick-actions">
            <button className="btn btn-ghost btn-xs" onClick={() => setShowNewModal(true)}>
              + New Workbook
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.csv" style={{ display: 'none' }} />
            <button className="btn btn-ghost btn-xs" onClick={() => fileInputRef.current?.click()}>
              📁 Upload .xlsx
            </button>
            <a
              href={workbooksApi.downloadUrl(wbPath)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-xs"
            >
              📥 Download
            </a>
            <button
              className="btn btn-primary btn-xs"
              onClick={() => navigate(`/analyze?url=&row=${selectedCell.row}`)}
              title="Extract web data into the currently selected row"
            >
              ⚡ AI Sync to Row {selectedCell.row}
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="editor-toolbar">
          <div className="editor-toolbar-group">
            <button className="btn btn-ghost btn-sm" onClick={handleAddRow}>
              <svg className="icon icon-sm" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Row
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddColModal(true)}>
              <svg className="icon icon-sm" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              Add Column
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleDeleteRow(selectedCell.row)}
              style={{ color: 'var(--red, #ef4444)' }}
            >
              <svg className="icon icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete Row {selectedCell.row}
            </button>
          </div>

          <div className="editor-toolbar-group">
            <div className="search-pill">
              <svg className="icon icon-sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                placeholder="Search sheet data..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && <button onClick={() => setSearchQuery('')}>✕</button>}
            </div>

            <label className="auto-save-toggle" title="Save changes automatically to Excel file">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={e => setAutoSave(e.target.checked)}
              />
              <span>Auto-save</span>
            </label>

            <button
              className={`btn btn-sm ${dirtyCount > 0 ? 'btn-primary' : 'btn-ghost'}`}
              onClick={handleSaveAll}
              disabled={saving || dirtyCount === 0}
            >
              {saving ? 'Saving…' : dirtyCount > 0 ? `Save (${dirtyCount})` : 'Saved ✓'}
            </button>
          </div>
        </div>

        {/* Formula / Cell Bar */}
        <div className="editor-formula-bar">
          <div className="cell-address-badge">
            {getColLetter(selectedCell.col)}{selectedCell.row}
          </div>
          <div className="cell-header-badge">
            {currentHeader}
          </div>
          <div className="fx-symbol">fx</div>
          <input
            className="formula-input"
            type="text"
            placeholder="Edit cell value..."
            value={formulaValue}
            onChange={handleFormulaChange}
          />
        </div>
      </div>

      {/* ── Spreadsheet Grid ──────────────────────────────────────────────── */}
      <div className="editor-grid-wrapper">
        {loading ? (
          <div className="editor-loading">
            <div className="spinner" />
            <p>Loading spreadsheet...</p>
          </div>
        ) : !sheetData || !sheetData.headers || sheetData.headers.length === 0 ? (
          <div className="empty" style={{ padding: 40 }}>
            <p>Spreadsheet is empty or could not be loaded.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewModal(true)}>
              Create New Spreadsheet
            </button>
          </div>
        ) : (
          <div className="sheet-table-scroll">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="sheet-corner-cell">#</th>
                  {sheetData.headers.map((header, cIdx) => (
                    <th
                      key={cIdx}
                      className={`sheet-col-header ${selectedCell.col === cIdx + 1 ? 'selected-col' : ''}`}
                      onClick={() => handleSelectCell(selectedCell.row, cIdx + 1)}
                    >
                      <div className="col-letter">{getColLetter(cIdx + 1)}</div>
                      <div className="col-title" title={header}>{header}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const rIdx = row.row_index
                  const isSelectedRow = selectedCell.row === rIdx

                  return (
                    <tr key={rIdx} className={isSelectedRow ? 'selected-row' : ''}>
                      {/* Row Index Header */}
                      <td
                        className={`sheet-row-header ${isSelectedRow ? 'active' : ''}`}
                        onClick={() => handleSelectCell(rIdx, selectedCell.col)}
                      >
                        {rIdx}
                      </td>

                      {/* Data Cells */}
                      {sheetData.headers.map((_, cIdx) => {
                        const colNumber = cIdx + 1
                        const isSelected = selectedCell.row === rIdx && selectedCell.col === colNumber
                        const isEditing = editingCell?.row === rIdx && editingCell?.col === colNumber
                        const key = cellKey(rIdx, colNumber)
                        const isDirty = dirtyCells[key] !== undefined
                        const cellVal = getCellValue(rIdx, colNumber)

                        return (
                          <td
                            key={colNumber}
                            className={`sheet-cell ${isSelected ? 'cell-selected' : ''} ${isDirty ? 'cell-dirty' : ''} ${!cellVal ? 'cell-empty' : ''}`}
                            onClick={() => handleSelectCell(rIdx, colNumber)}
                            onDoubleClick={() => handleStartEdit(rIdx, colNumber)}
                          >
                            {isEditing ? (
                              <input
                                ref={cellInputRef}
                                className="sheet-inline-input"
                                value={editingCell.value}
                                onChange={e => setEditingCell(c => ({ ...c, value: e.target.value }))}
                                onBlur={() => {
                                  commitCellEdit(rIdx, colNumber, editingCell.value)
                                  setEditingCell(null)
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    commitCellEdit(rIdx, colNumber, editingCell.value)
                                    setEditingCell(null)
                                    if (rIdx < (sheetData.rows.length + 1)) {
                                      handleSelectCell(rIdx + 1, colNumber)
                                    }
                                  } else if (e.key === 'Escape') {
                                    setEditingCell(null)
                                  } else if (e.key === 'Tab') {
                                    e.preventDefault()
                                    commitCellEdit(rIdx, colNumber, editingCell.value)
                                    setEditingCell(null)
                                    if (colNumber < sheetData.headers.length) {
                                      handleSelectCell(rIdx, colNumber + 1)
                                    }
                                  }
                                }}
                              />
                            ) : (
                              <div className="cell-content-text">
                                {cellVal || <span className="cell-placeholder">&nbsp;</span>}
                              </div>
                            )}
                            {isDirty && <span className="dirty-indicator" title="Unsaved edit" />}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}

                {/* Quick Add Row Action Row */}
                <tr>
                  <td className="sheet-row-header add-row-indicator" onClick={handleAddRow}>+</td>
                  <td
                    colSpan={sheetData.headers.length}
                    className="sheet-add-row-cell"
                    onClick={handleAddRow}
                  >
                    + Click here to append a new row (Row {sheetData.rows ? sheetData.rows.length + 2 : 2})
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Bottom Sheet Tabs Bar ─────────────────────────────────────────── */}
      <div className="editor-footer-bar">
        <div className="sheet-tabs-container">
          {(sheetData?.sheet_names || ['Sheet1']).map(sheet => (
            <button
              key={sheet}
              className={`sheet-tab-btn ${sheet === activeSheet ? 'active' : ''}`}
              onClick={() => {
                if (sheet !== activeSheet) {
                  loadSheet(wbPath, sheet)
                }
              }}
            >
              📄 {sheet}
            </button>
          ))}
          <button className="sheet-tab-add" onClick={() => setShowNewSheetModal(true)} title="Add worksheet tab">
            +
          </button>
        </div>

        <div className="sheet-stats-info">
          <span>{sheetData?.rows?.length || 0} rows × {sheetData?.headers?.length || 0} columns</span>
          <span className="dot-sep">•</span>
          <span>{sheetData?.sheet_names?.length || 1} sheet(s)</span>
          {dirtyCount > 0 && (
            <>
              <span className="dot-sep">•</span>
              <span style={{ color: 'var(--yellow, #f59e0b)', fontWeight: 600 }}>{dirtyCount} unsaved</span>
            </>
          )}
        </div>
      </div>

      {/* ── Modal: New Workbook ────────────────────────────────────────────── */}
      {showNewModal && (
        <div className="modal-backdrop" onClick={() => setShowNewModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Workbook</h3>
              <button className="modal-close" onClick={() => setShowNewModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateWorkbook}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="inp-label">Workbook Name</label>
                <input
                  className="inp"
                  placeholder="e.g. quarterly_leads.xlsx"
                  value={newWbName}
                  onChange={e => setNewWbName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="inp-label">Template Preset</label>
                <div className="template-grid">
                  <div
                    className={`template-card ${newWbTemplate === 'invoice' ? 'selected' : ''}`}
                    onClick={() => setNewWbTemplate('invoice')}
                  >
                    <strong>🧾 Vendor Invoices</strong>
                    <p>GST, Invoice #, Date, Amount, Currency, Status</p>
                  </div>
                  <div
                    className={`template-card ${newWbTemplate === 'leads' ? 'selected' : ''}`}
                    onClick={() => setNewWbTemplate('leads')}
                  >
                    <strong>🎯 Lead Generation</strong>
                    <p>Company, Contact, Email, Phone, LinkedIn, Status</p>
                  </div>
                  <div
                    className={`template-card ${newWbTemplate === 'ecommerce' ? 'selected' : ''}`}
                    onClick={() => setNewWbTemplate('ecommerce')}
                  >
                    <strong>🛍️ E-Commerce Catalog</strong>
                    <p>Product, SKU, Category, Price, Stock, URL</p>
                  </div>
                  <div
                    className={`template-card ${newWbTemplate === 'custom' ? 'selected' : ''}`}
                    onClick={() => setNewWbTemplate('custom')}
                  >
                    <strong>✨ Custom Schema</strong>
                    <p>Define your own custom column headers</p>
                  </div>
                </div>
              </div>

              {newWbTemplate === 'custom' && (
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="inp-label">Columns (Comma-Separated)</label>
                  <input
                    className="inp"
                    value={customColumns}
                    onChange={e => setCustomColumns(e.target.value)}
                    placeholder="Name, Email, Status, Notes"
                  />
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Spreadsheet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Add Column ──────────────────────────────────────────────── */}
      {showAddColModal && (
        <div className="modal-backdrop" onClick={() => setShowAddColModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Add New Column</h3>
              <button className="modal-close" onClick={() => setShowAddColModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddColumn}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="inp-label">Column Header Name</label>
                <input
                  className="inp"
                  placeholder="e.g. LinkedIn Profile URL"
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddColModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Column</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Create Worksheet Tab ─────────────────────────────────────── */}
      {showNewSheetModal && (
        <div className="modal-backdrop" onClick={() => setShowNewSheetModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>New Worksheet Tab</h3>
              <button className="modal-close" onClick={() => setShowNewSheetModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateSheet}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="inp-label">Worksheet Name</label>
                <input
                  className="inp"
                  placeholder="e.g. Q3 Invoices"
                  value={newSheetName}
                  onChange={e => setNewSheetName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewSheetModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Tab</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
