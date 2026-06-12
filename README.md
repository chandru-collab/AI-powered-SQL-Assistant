# AI SQL Analytics Assistant 🧠📊

A premium, production-grade AI-powered SQL Assistant that converts natural language business questions into valid MySQL queries, executes them safely, and renders data visualizations (Bar, Line, Pie charts) alongside plain-English business insights.

Built using **FastAPI**, **MySQL**, **OpenRouter API (`nex-agi/nex-n2-pro:free`)**, and **Vanilla HTML5/CSS3/JS** with a high-fidelity glassmorphic dark interface.

---

## 🚀 Key Features

* **Natural Language to MySQL**: Translates questions like *"How many orders were placed last month?"* or *"List top 5 products by quantity sold"* into precise MySQL code.
* **Double-Layered SQL Safety Validation**: Hardened validation rule blocks any non-read-only commands (`DELETE`, `UPDATE`, `DROP`, etc.) or multi-statement injections before reaching the database.
* **Auto-Visualizations**: Evaluates query columns and automatically renders the results into interactive Chart.js graphs (Bar, Line, or Pie charts).
* **Multi-Turn Conversational Memory**: Remembers past context in a session, allowing business users to ask follow-up questions (e.g. *"Show products under 100 dollars"*, followed by *"Which of them has the category Kitchen?"*).
* **CSV Export & Code Copier**: Business users can export raw records to CSV immediately, and developers can copy the generated SQL with a click.
* **Audit Trail Drawer**: Persistent JSON audit logger (`query_logs.json`) tracks queries, execution times, timestamps, and safety badges for auditing.

---

## 🛠️ Technology Stack

* **Backend**: Python 3.10+, FastAPI, PyMySQL, Pydantic, requests, python-dotenv.
* **Database**: MySQL 8.0
* **Frontend**: HTML5, Vanilla CSS3 (Custom Glassmorphism, CSS Variables, Animations), Vanilla JS (Fetch API, Chart.js, FontAwesome).
* **AI Engine**: OpenRouter API invoking `nex-agi/nex-n2-pro:free`.
* **Packaging**: Docker, Docker Compose.

---

## 📋 Database Schema

The database consists of three relational tables:
1. **`customers`**: `id` (INT, PK), `name` (VARCHAR), `email` (VARCHAR), `city` (VARCHAR), `created_at` (DATE)
2. **`products`**: `id` (INT, PK), `name` (VARCHAR), `category` (VARCHAR), `price` (DECIMAL)
3. **`orders`**: `id` (INT, PK), `customer_id` (FK -> customers), `product_id` (FK -> products), `quantity` (INT), `order_date` (DATE)

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory (this is already created for you locally, and added to `.gitignore` to protect credentials):

```ini
# OpenRouter API configurations
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=nex-agi/nex-n2-pro:free

# MySQL Connection Details
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=ai_sql_assistant
```

---

## 🏁 How to Run

There are two ways to launch the application:

### Option A: Using Docker Compose (Recommended)
This is the easiest approach as it automatically spins up the MySQL container, runs the schema migrations, seeds realistic dummy data, and boots the FastAPI backend.

1. Ensure **Docker Desktop** is running.
2. In the project directory, run:
   ```bash
   docker compose up --build
   ```
3. Once the database healthcheck completes, access the dashboard at:
   👉 **`http://localhost:8000`**

---

### Option B: Local Setup (Using python virtual environments)
If you prefer running the components directly on your machine:

1. **Prerequisite**: Ensure a local **MySQL server** is running, create a database named `ai_sql_assistant`, and execute [schema.sql](file:///c:/Users/chand/OneDrive/Documents/Desktop/sql/schema.sql) on it to initialize tables and insert seed data.
2. Update your `.env` credentials to match your local database instance.
3. Install the `uv` tool to manage python environments (or use standard `venv`):
   ```bash
   pip install uv
   ```
4. Create and activate a virtual environment:
   ```bash
   # Create venv
   uv venv
   
   # Activate venv (Windows PowerShell)
   .venv\Scripts\Activate.ps1
   # (Or macOS/Linux)
   source .venv/bin/activate
   ```
5. Install packages:
   ```bash
   uv pip install -r requirements.txt
   ```
6. Run the server:
   ```bash
   uvicorn app:app --reload --port 8000
   ```
7. Visit the dashboard at **`http://localhost:8000`**.

---

## 🧪 Running Unit Tests

To run the automated validation tests checking the query safety rules:
```bash
python test_app.py
```

---

## 📡 API Usage & Examples

### `POST /query`
Submits a natural language query for processing.

**Request:**
* Headers: `Content-Type: application/json`
* Body:
```json
{
  "question": "Show top 5 customers by number of orders",
  "session_id": "test_session_123"
}
```

**Response (200 OK):**
```json
{
  "sql": "SELECT c.id, c.name, COUNT(o.id) as order_count FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.id, c.name ORDER BY order_count DESC LIMIT 5",
  "results": [
    { "id": 1, "name": "Alice Johnson", "order_count": 4 },
    { "id": 2, "name": "Bob Smith", "order_count": 3 }
  ],
  "explanation": "Here are the top customers. **Alice Johnson** is in first place with **4 orders**, followed closely by **Bob Smith** who has **3 orders**.",
  "chart_recommendation": {
    "type": "bar",
    "xAxisColumn": "name",
    "yAxisColumn": "order_count"
  },
  "sql_explanation": "This query joins the customers and orders tables on the customer_id, groups the results by customer name and ID to aggregate the orders, and sorts them in descending order to output the top 5.",
  "safety_passed": true,
  "execution_time_ms": 142.5
}
```

### `GET /history`
Returns audit logs for the last 100 query executions.

---

## 🏛️ Architectural Decisions

1. **Separation of SQL Generation and Business Explanation**: The LLM is first asked to act as a SQL Engineer to translate English to SQL. The SQL is executed locally by Python, and the raw dataset is then supplied to the LLM (acting as a BI Analyst) to generate a conversational, accurate explanation. This avoids "AI hallucinations" of numbers since the analysis is grounded in real database outputs.
2. **Regex Word Boundary Safety Parser**: Using `re.search(r'\bKEYWORD\b', ...)` prevents simple bypasses (e.g. `DROPtable` vs `DROP table`) and blocks command concatenation via semicolons while preserving normal text fields that might match parts of the keywords.
3. **Seeding Seperation**: Seeding is handled via the Docker database initialisation folder `/docker-entrypoint-initdb.d/`, isolating seeding logic from application runtime.
4. **Mock Timeline Baseline**: Set baseline date to **June 10, 2026** inside the system prompts to ensure relative datetime references (like *"last month"*) evaluate correctly against the dummy dataset (which has orders in March, April, May, and June 2026).

---

## ⚠️ Assumptions and Limitations

* **Read-Only Enforcements**: Modifying queries are blocked. If a user asks *"Change my email to bob@gmail.com"*, the safety validator will intercept the SQL query and return a safety exception without sending it to the MySQL server.
* **Schema Bounds**: The AI model will only output SQL matching the tables defined in `schema.sql`. It will return a friendly error message if asked about tables that don't exist (e.g., *"Show current shipping carriers"*).
