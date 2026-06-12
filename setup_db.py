import os
import pymysql
from dotenv import load_dotenv

# Load configurations
load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "ai_sql_assistant")

print("--------------------------------------------------")
print("🚀 SQL.AI MySQL Database Auto-Setup Script")
print("--------------------------------------------------")
print(f"Targeting host: {DB_HOST}:{DB_PORT}")
print(f"User:           {DB_USER}")
print(f"Target DB:      {DB_NAME}")
print("--------------------------------------------------")

# Step 1: Connect to MySQL server (without specifying DB name) to create database
try:
    print("🔄 Connecting to MySQL server...")
    connection = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD
    )
    print("✅ Connected to MySQL successfully!")
except Exception as e:
    print(f"❌ Connection failed: {str(e)}")
    print("\n💡 Troubleshooting Tips:")
    print("1. Make sure your local MySQL server is running.")
    print("2. Check if host/port match your settings.")
    print("3. Check if your password is correct. (If you don't have a password, set DB_PASSWORD= in your .env file).")
    exit(1)

try:
    with connection.cursor() as cursor:
        print(f"🔄 Creating database '{DB_NAME}' if it does not exist...")
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME};")
        print(f"✅ Database '{DB_NAME}' is ready!")
finally:
    connection.close()

# Step 2: Connect directly to the database and read schema.sql
try:
    print(f"🔄 Connecting to '{DB_NAME}' database...")
    db_connection = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )
    print(f"✅ Connected to '{DB_NAME}' successfully!")
except Exception as e:
    print(f"❌ Failed to connect to database '{DB_NAME}': {str(e)}")
    exit(1)

try:
    print("🔄 Reading schema.sql script...")
    if not os.path.exists("schema.sql"):
        print("❌ Error: schema.sql file not found in current directory.")
        exit(1)
        
    with open("schema.sql", "r", encoding="utf-8") as f:
        schema_sql = f.read()

    # Split SQL commands by semicolon (handling standard queries)
    # MySQL statements can be executed sequentially
    statements = []
    # Simple parser to split on semicolons not in strings
    current_stmt = []
    in_string = False
    string_char = None
    
    lines = schema_sql.split("\n")
    for line in lines:
        # Ignore comments and database creation lines (since we already did it)
        clean_line = line.strip()
        if not clean_line or clean_line.startswith("--") or clean_line.startswith("CREATE DATABASE") or clean_line.startswith("USE"):
            continue
            
        current_stmt.append(line)
        if ";" in line:
            statements.append("\n".join(current_stmt))
            current_stmt = []
            
    # Add any remaining statement
    if current_stmt:
        stmt = "\n".join(current_stmt).strip()
        if stmt:
            statements.append(stmt)

    print(f"🔄 Executing {len(statements)} SQL statements to build tables and seed dummy data...")
    with db_connection.cursor() as cursor:
        for index, stmt in enumerate(statements, 1):
            stmt = stmt.strip()
            if not stmt:
                continue
            try:
                cursor.execute(stmt)
            except Exception as stmt_err:
                print(f"⚠️ Statement #{index} warning/error: {str(stmt_err)}")
                print(f"Query was: {stmt}")
                
        db_connection.commit()
    print("--------------------------------------------------")
    print("🎉 Success! MySQL Database seeded and configured!")
    print("--------------------------------------------------")
    print("You can now refresh the browser and query your tables.")

except Exception as e:
    print(f"❌ Seeding failed: {str(e)}")
finally:
    db_connection.close()
