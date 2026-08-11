"""
Pydantic schemas for SheetPilot AI JSON contracts.
"""
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── RAG Schemas ──────────────────────────────────────────────────────────────

class RetrievedPassage(BaseModel):
    """A chunk of text retrieved from the webpage via RAG."""
    text: str = Field(..., description="The passage text")
    score: float = Field(..., ge=0.0, le=1.0, description="Relevance score")
    chunk_id: str = Field(..., description="Unique chunk identifier")


# ── Excel Schemas ────────────────────────────────────────────────────────────

class ExcelSchema(BaseModel):
    """Metadata about the Excel sheet structure."""
    workbook_path: str
    worksheet_name: str
    columns: list[str] = Field(..., description="Column headers")
    active_row: int = Field(..., ge=1, description="Current row to fill (1-indexed)")


class FieldMapping(BaseModel):
    """A proposed field→value mapping from webpage to Excel."""
    field: str = Field(..., description="Excel column header")
    value: str = Field(..., description="Extracted value from webpage")
    confidence: Literal["high", "medium", "low"] = Field(..., description="Extraction confidence")
    source: str = Field(..., description="Short quote from page showing where value came from")


class LLMOutput(BaseModel):
    """Structured output from the LLM reasoning layer."""
    row: int = Field(..., ge=1)
    mappings: list[FieldMapping] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list, description="Fields not found on page")


class StagedMapping(BaseModel):
    """Staged mappings awaiting user approval."""
    row: int
    mappings: list[FieldMapping]
    missing_fields: list[str]
    all_columns: list[str] = Field(default_factory=list, description="All Excel column headers")
    staged_at: str = Field(..., description="ISO timestamp")


class ApprovedMapping(BaseModel):
    """User-approved mapping ready to commit to Excel."""
    field: str
    value: str
    edited: bool = Field(default=False, description="True if user edited before approving")


class CommitRequest(BaseModel):
    """Request to write approved values to Excel."""
    row: int
    approved_mappings: list[ApprovedMapping]


# ── API Schemas ──────────────────────────────────────────────────────────────

class PageContentRequest(BaseModel):
    """Request from browser extension with scraped page content."""
    page_text: str = Field(..., min_length=1)
    page_url: str
    workbook_path: str
    active_row: int = Field(..., ge=1)


class ProposalResponse(BaseModel):
    """Response to extension with proposed mappings for user review."""
    success: bool
    staged_mapping: Optional[StagedMapping] = None
    error: Optional[str] = None


class CommitResponse(BaseModel):
    """Response after writing to Excel."""
    success: bool
    rows_written: int = Field(default=0)
    error: Optional[str] = None
