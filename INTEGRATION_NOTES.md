# SYNAPSE integration notes

The sign-up and sign-in screens retain the dark navy theme and blue/violet radial-gradient background. The dashboard uses the supplied animated Prompt Composer design.

The Prompt Composer passes real browser File objects to the frontend API. FastAPI accepts multipart uploads, validates supported extensions and size/count limits, reads content in memory, and forwards multimodal input to OpenRouter. Images use vision input; PDFs use native PDF input; TXT/MD/CSV/JSON and DOCX are extracted locally. Tavily results are combined with uploaded sources in the same research request.

The backend startup script explicitly creates its virtual environment with Python 3.11 (`py -3.11`) to avoid Windows selecting the newer broken interpreter that appeared in your Python Launcher list.

This is a local starter, not production-hardened. Before public deployment, add HTTPS, secure cookie sessions, CSRF protection, rate limiting, persistent database backups, and deployment-specific secrets. Do not upload confidential or personal information to a free model endpoint.
