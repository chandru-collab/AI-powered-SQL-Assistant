import unittest
from app import validate_sql_safety

class TestSQLSafetyValidator(unittest.TestCase):
    
    def test_safe_queries(self):
        """Test that standard read-only and permitted modification queries pass validation."""
        safe_queries = [
            "SELECT * FROM customers;",
            "SELECT id, name FROM customers WHERE city = 'New York';",
            "SELECT COUNT(*) FROM orders WHERE order_date >= '2026-05-01';",
            "SELECT name, SUM(price * quantity) as spend FROM customers c JOIN orders o ON c.id = o.customer_id JOIN products p ON o.product_id = p.id GROUP BY name ORDER BY spend DESC LIMIT 5",
            "WITH monthly_sales AS (SELECT category, SUM(quantity) as qty FROM orders o JOIN products p ON o.product_id = p.id WHERE MONTH(order_date) = 5 GROUP BY category) SELECT * FROM monthly_sales;"
        ]
        for query in safe_queries:
            is_safe, error = validate_sql_safety(query)
            self.assertTrue(is_safe, f"Query should be safe: {query}. Error was: {error}")

    def test_unsafe_operations(self):
        """Test that destructive command executions and administrative queries are blocked."""
        unsafe_queries = [
            "GRANT ALL PRIVILEGES ON *.* TO 'malicious';",
            "REVOKE SELECT ON customers FROM 'public';",
            "EXEC xp_cmdshell 'dir';",
            "EXECUTE IMMEDIATE 'DROP DATABASE';",
            "LOAD DATA INFILE 'data.txt' INTO TABLE customers;",
            "SELECT * FROM customers INTO OUTFILE '/tmp/cust.txt';",
            "HANDLER customers OPEN;",
            "DROP TABLE temp_customers;",
            "DELETE FROM orders WHERE id = 1;",
            "INSERT INTO products (name, category, price) VALUES ('Fake', 'Category', 10.0);",
            "UPDATE customers SET city = 'Miami' WHERE id = 3;",
            "TRUNCATE TABLE orders;",
            "ALTER TABLE customers ADD COLUMN age INT;",
            "CREATE TABLE temp_table (id INT);"
        ]
        for query in unsafe_queries:
            is_safe, error = validate_sql_safety(query)
            self.assertFalse(is_safe, f"Query should be blocked: {query}")
            self.assertTrue(any(word in error.lower() for word in ["blocked", "unauthorized", "destructive", "unpermitted", "keyword"]), f"Unexpected error: {error}")

    def test_sql_injection_multiple_statements(self):
        """Test that multiple statements separated by semicolons are blocked."""
        injections = [
            "SELECT * FROM customers; DROP TABLE orders;",
            "SELECT id FROM products; DELETE FROM customers WHERE id = 1",
            "SELECT * FROM orders; UPDATE products SET price = 0;"
        ]
        for query in injections:
            is_safe, error = validate_sql_safety(query)
            self.assertFalse(is_safe, f"Query should be blocked (SQL injection): {query}")
            self.assertTrue(any(word in error.lower() for word in ["semicolon", "injection"]), f"Unexpected error: {error}")

    def test_empty_query(self):
        """Test that empty query strings fail validation."""
        is_safe, error = validate_sql_safety("   \n  -- comment only \n  ")
        self.assertFalse(is_safe)
        self.assertIn("empty", error.lower())

if __name__ == '__main__':
    unittest.main()
