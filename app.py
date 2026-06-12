import os
import re
import json
import time
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
import pymysql
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load environment variables
load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "nex-agi/nex-n2-pro:free")

# Default env fallback settings
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "ai_sql_assistant")

app = FastAPI(title="Dynamic AI SQL Assistant API")

# Allow CORS for all origins (useful for local development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores
# session_id -> list of messages: {"role": "user"|"assistant", "content": str}
sessions_db: Dict[str, List[Dict[str, str]]] = {}

# session_id -> {host, port, user, password, database}
db_credentials: Dict[str, Dict[str, Any]] = {}

# Schema cache: session_id -> {"schema": ..., "cached_at": timestamp}
SCHEMA_CACHE: Dict[str, Dict[str, Any]] = {}
SCHEMA_CACHE_TTL = 60  # seconds

LOG_FILE = "query_logs.json"

# --- Models ---
class QueryRequest(BaseModel):
    question: str
    session_id: Optional[str] = "default"

class QueryResponse(BaseModel):
    sql: str
    results: List[Dict[str, Any]]
    explanation: str
    chart_recommendation: Dict[str, Any]
    sql_explanation: str
    safety_passed: bool
    execution_time_ms: float

class ConnectRequest(BaseModel):
    host: str
    port: int
    user: str
    password: str
    database: str
    session_id: Optional[str] = "default"

# --- DB Connection & Schema Discovery Helpers ---

def get_session_db_connection(session_id: str):
    """Establish connection to the active session database, falling back to default."""
    creds = db_credentials.get(session_id, {
        "host": DB_HOST,
        "port": DB_PORT,
        "user": DB_USER,
        "password": DB_PASSWORD,
        "database": DB_NAME
    })
    try:
        return pymysql.connect(
            host=creds["host"],
            port=creds["port"],
            user=creds["user"],
            password=creds["password"],
            database=creds["database"],
            cursorclass=pymysql.cursors.DictCursor
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed to database '{creds.get('database')}': {str(e)}"
        )

def _fetch_db_schema_sync(session_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """Retrieve all tables, columns, data types, and primary key constraints dynamically from MySQL."""
    connection = get_session_db_connection(session_id)
    creds = db_credentials.get(session_id, {"database": DB_NAME})
    db_name = creds["database"]
    
    schema = {}
    try:
        with connection:
            with connection.cursor() as cursor:
                # Query information_schema for the requested database
                query = """
                    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY
                    FROM information_schema.columns
                    WHERE TABLE_SCHEMA = %s
                    ORDER BY TABLE_NAME, ORDINAL_POSITION;
                """
                cursor.execute(query, (db_name,))
                columns = cursor.fetchall()
                
                # Format into tables tree structure
                for col in columns:
                    table_name = col["TABLE_NAME"]
                    if table_name not in schema:
                        schema[table_name] = []
                    schema[table_name].append({
                        "name": col["COLUMN_NAME"],
                        "type": col["DATA_TYPE"],
                        "is_primary": col["COLUMN_KEY"] == "PRI"
                    })
        return schema
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch database schema metadata: {str(e)}")

def fetch_db_schema(session_id: str, bypass_cache: bool = False) -> Dict[str, List[Dict[str, Any]]]:
    """Cached wrapper around _fetch_db_schema_sync. Returns cached schema if within TTL."""
    now = time.time()
    cached = SCHEMA_CACHE.get(session_id)
    if not bypass_cache and cached and (now - cached["cached_at"]) < SCHEMA_CACHE_TTL:
        return cached["schema"]
    
    schema = _fetch_db_schema_sync(session_id)
    SCHEMA_CACHE[session_id] = {"schema": schema, "cached_at": now}
    return schema

# --- SQL Safety Check Rules ---

def validate_sql_safety(sql: str) -> tuple[bool, Optional[str]]:
    """Strict read-only safety checks."""
    clean_sql = re.sub(r'--.*$', '', sql, flags=re.MULTILINE)
    clean_sql = re.sub(r'/\*.*?\*/', '', clean_sql, flags=re.DOTALL)
    clean_sql = clean_sql.strip()

    if not clean_sql:
        return False, "Query is empty"

    # Check for multiple statements separated by semicolons first
    semicolon_split = [part.strip() for part in clean_sql.split(';') if part.strip()]
    if len(semicolon_split) > 1:
        return False, "Multiple statements separated by semicolons are blocked to prevent SQL Injection."

    first_word_match = re.match(r'^([a-zA-Z]+)', clean_sql)
    if not first_word_match:
        return False, "Invalid SQL syntax structure"
    
    first_word = first_word_match.group(1).upper()
    if first_word not in ("SELECT", "WITH", "SHOW", "DESCRIBE", "EXPLAIN"):
        return False, f"Unauthorized query type: {first_word}. Only read-only operations (SELECT) are permitted."

    forbidden_keywords = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "REPLACE", 
        "CREATE", "RENAME", "GRANT", "REVOKE", "ATTACH", "DETACH", "MERGE",
        "EXEC", "EXECUTE", "INTO OUTFILE", "LOAD DATA", "HANDLER"
    ]

    for keyword in forbidden_keywords:
        pattern = r'\b' + re.escape(keyword) + r'\b'
        if re.search(pattern, clean_sql, re.IGNORECASE):
            return False, f"Destructive operation keyword detected: '{keyword}' is blocked for security reasons."

    return True, None

def log_query(question: str, sql: str, status: str, execution_time_ms: float, error_message: Optional[str] = None):
    """Log queries dynamically to audit trails."""
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "question": question,
        "sql": sql,
        "status": status,
        "execution_time_ms": round(execution_time_ms, 2),
        "error": error_message
    }
    
    logs = []
    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        except Exception:
            logs = []
            
    logs.insert(0, log_entry)
    logs = logs[:100]
    
    try:
        with open(LOG_FILE, 'w', encoding='utf-8') as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print(f"Failed to write logs to {LOG_FILE}: {e}")

# --- OpenRouter API Call ---

def call_openrouter(messages: List[Dict[str, str]], expect_json: bool = True) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured.")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "Dynamic AI SQL Assistant",
    }
    
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
    }
    
    if expect_json:
        payload["response_format"] = {"type": "json_object"}

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=35
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        detail = str(e)
        if 'response' in locals() and response is not None:
            try:
                detail = response.json().get('error', {}).get('message', response.text)
            except Exception:
                detail = response.text
        raise HTTPException(status_code=502, detail=f"OpenRouter API error: {detail}")

# --- SQL generation using dynamic schema ---

def generate_sql_query(question: str, history: List[Dict[str, str]], schema: Dict[str, List[Dict[str, Any]]], db_name: str) -> Dict[str, Any]:
    # Formulate schema text representation dynamically for the prompt
    schema_text = ""
    for table_name, columns in schema.items():
        schema_text += f"Table: {table_name}\nColumns:\n"
        for col in columns:
            pk = " (PK)" if col["is_primary"] else ""
            schema_text += f"  - {col['name']}: {col['type'].upper()}{pk}\n"
        schema_text += "\n"

    system_message = {
        "role": "system",
        "content": f"""You are a Senior MySQL Database Engineer and Analytics Assistant. Convert natural language questions into precise MySQL queries.

Database: {db_name}
{schema_text}
### Rules
- Generate ONLY valid MySQL SQL matching the schema above.
- Use explicit table aliases when joining.
- Treat the baseline local date as June 10, 2026.
- Return a JSON object with this exact structure:
{{
  "sql": "SELECT ...",
  "sql_explanation": "Concise technical explanation of the query logic.",
  "explanation": "A friendly 2-3 sentence business-oriented summary of what the results would show. Bold key insights with **bold**.",
  "chart_recommendation": {{
    "type": "bar" | "line" | "pie" | "none",
    "xAxisColumn": "column_name",
    "yAxisColumn": "column_name"
  }}
}}
- If the question cannot be answered, set "sql" to empty string and explain why.
"""
    }

    messages = [system_message]
    for msg in history[-6:]:
        messages.append(msg)
        
    messages.append({
        "role": "user",
        "content": f"Question: {question}\n\nReturn ONLY a valid JSON object. No markdown wraps."
    })

    response_text = call_openrouter(messages, expect_json=True)
    
    try:
        clean_text = re.sub(r'^```json\s*', '', response_text)
        clean_text = re.sub(r'\s*```$', '', clean_text)
        return json.loads(clean_text)
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to parse SQL generator response as JSON: {response_text}. Error: {str(e)}"
        )

def generate_results_explanation(question: str, sql: str, results: List[Dict[str, Any]]) -> str:
    """Generate a post-execution explanation enriched with actual result data.
    This is only called as a fallback when the initial LLM response didn't include an explanation."""
    system_message = {
        "role": "system",
        "content": "You are a Business Intelligence Analyst. Explain query results in clear, friendly plain English for business users. Keep it concise (2-3 sentences). Bold key numbers."
    }
    
    prompt = f"""Question: "{question}"
SQL: {sql}
Results (first 10): {json.dumps(results[:10], default=str)}
Summarize the results. Bold key insights."""

    messages = [
        system_message,
        {"role": "user", "content": prompt}
    ]
    
    return call_openrouter(messages, expect_json=False)

# --- Endpoints ---

@app.post("/connect")
async def connect_database(req: ConnectRequest):
    """POST /connect: Save connection credentials for this session and return schema."""
    session_id = req.session_id or "default"
    
    # Store credentials
    db_credentials[session_id] = {
        "host": req.host,
        "port": req.port,
        "user": req.user,
        "password": req.password,
        "database": req.database
    }
    
    # Invalidate schema cache for this session
    SCHEMA_CACHE.pop(session_id, None)
    
    # Try connecting to verify credentials (offload to thread)
    try:
        def _verify():
            connection = get_session_db_connection(session_id)
            with connection:
                pass
        await asyncio.to_thread(_verify)
    except Exception as e:
        if session_id in db_credentials:
            del db_credentials[session_id]
        raise HTTPException(status_code=400, detail=f"Database connection failed: {str(e)}")
        
    # Fetch live schema (offload to thread)
    schema = await asyncio.to_thread(fetch_db_schema, session_id, True)
    return {
        "status": "success",
        "message": f"Successfully connected to database '{req.database}' on '{req.host}'.",
        "schema": schema,
        "database": req.database
    }

@app.post("/disconnect")
async def disconnect_database(session_id: Optional[str] = Body(default="default")):
    """POST /disconnect: Clear custom connection and fall back to local demo DB."""
    sess_id = session_id or "default"
    if sess_id in db_credentials:
        del db_credentials[sess_id]
    SCHEMA_CACHE.pop(sess_id, None)
    return {
        "status": "success",
        "message": "Disconnected. Reverted to default demo database.",
        "database": DB_NAME
    }

@app.get("/schema")
async def get_schema(session_id: Optional[str] = "default"):
    """GET /schema: Returns current database schema metadata tree."""
    sess_id = session_id or "default"
    creds = db_credentials.get(sess_id, {"database": DB_NAME})
    try:
        schema = await asyncio.to_thread(fetch_db_schema, sess_id)
    except Exception:
        schema = {}
    return {
        "database": creds["database"],
        "schema": schema
    }

@app.post("/query", response_model=QueryResponse)
async def process_query(request: QueryRequest):
    start_time = time.time()
    question = request.question.strip()
    session_id = request.session_id or "default"

    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    if session_id not in sessions_db:
        sessions_db[session_id] = []

    # Get active schema (cached, offloaded to thread)
    schema = await asyncio.to_thread(fetch_db_schema, session_id)
    creds = db_credentials.get(session_id, {"database": DB_NAME})
    active_db_name = creds["database"]

    # Step 1: Generate SQL + explanation in a SINGLE LLM call (offloaded to thread)
    try:
        generation = await asyncio.to_thread(
            generate_sql_query, question, sessions_db[session_id], schema, active_db_name
        )
    except Exception as e:
        log_query(question, "", "failed", 0.0, f"SQL generation error: {str(e)}")
        raise

    generated_sql = generation.get("sql", "").strip()
    sql_explanation = generation.get("sql_explanation", "No technical explanation provided.")
    explanation = generation.get("explanation", sql_explanation)
    chart_recommendation = generation.get("chart_recommendation", {"type": "none", "xAxisColumn": "", "yAxisColumn": ""})

    if not generated_sql:
        log_query(question, "", "failed", 0.0, sql_explanation)
        return QueryResponse(
            sql="",
            results=[],
            explanation=sql_explanation,
            chart_recommendation={"type": "none", "xAxisColumn": "", "yAxisColumn": ""},
            sql_explanation="Could not construct query.",
            safety_passed=True,
            execution_time_ms=0.0
        )

    # Step 2: Validate SQL safety (CPU-bound, runs inline)
    is_safe, safety_error = validate_sql_safety(generated_sql)
    if not is_safe:
        log_query(question, generated_sql, "rejected", 0.0, safety_error)
        raise HTTPException(status_code=400, detail=f"SQL Safety Check Failed: {safety_error}")

    # Step 3: Execute SQL query against target MySQL database (offloaded to thread)
    results = []
    try:
        def _execute_sql():
            connection = get_session_db_connection(session_id)
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(generated_sql)
                    return cursor.fetchall()
        results = await asyncio.to_thread(_execute_sql)
    except Exception as db_err:
        execution_time = (time.time() - start_time) * 1000
        log_query(question, generated_sql, "failed", execution_time, str(db_err))
        raise HTTPException(
            status_code=400,
            detail=f"SQL Execution Error: {str(db_err)}. Query was: {generated_sql}"
        )

    # Step 4: Use the explanation from the single LLM call (no second API call!)
    # The explanation was already generated in Step 1 alongside the SQL.

    execution_time_ms = (time.time() - start_time) * 1000

    # Step 5: Save to conversation history
    sessions_db[session_id].append({"role": "user", "content": question})
    sessions_db[session_id].append({
        "role": "assistant",
        "content": f"Generated SQL:\n{generated_sql}\n\nExplanation:\n{explanation}"
    })

    # Step 6: Log query audit
    log_query(question, generated_sql, "success", execution_time_ms)

    return QueryResponse(
        sql=generated_sql,
        results=results,
        explanation=explanation,
        chart_recommendation=chart_recommendation,
        sql_explanation=sql_explanation,
        safety_passed=True,
        execution_time_ms=execution_time_ms
    )

@app.get("/history")
async def get_history():
    if not os.path.exists(LOG_FILE):
        return []
    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read audit logs: {str(e)}")

@app.post("/clear-history")
async def clear_history(session_id: Optional[str] = Body(default="default")):
    sess_id = session_id or "default"
    if sess_id in sessions_db:
        sessions_db[sess_id] = []
    return {"status": "success", "message": f"Session '{sess_id}' conversation history cleared."}

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def get_index():
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return f.read()
    return HTMLResponse(
        content="<h3>Frontend static/index.html not found yet. Please wait.</h3>", 
        status_code=404
    )
