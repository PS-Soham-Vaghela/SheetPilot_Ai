"""LLM layer: Ollama client + prompt templates."""
from .local_model import run, check_ollama_connection
from .prompt_templates import SYSTEM_PROMPT, build_user_message

__all__ = ["run", "check_ollama_connection", "SYSTEM_PROMPT", "build_user_message"]
