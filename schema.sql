-- Create Database if it doesn't exist
CREATE DATABASE IF NOT EXISTS ai_sql_assistant;
USE ai_sql_assistant;

-- Drop existing tables to start fresh
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS products;

-- Create customers table
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    city VARCHAR(50) NOT NULL,
    created_at DATE NOT NULL
);

-- Create products table
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL
);

-- Create orders table
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    order_date DATE NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Insert dummy data for customers
INSERT INTO customers (name, email, city, created_at) VALUES
('Alice Johnson', 'alice.johnson@example.com', 'New York', '2026-01-15'),
('Bob Smith', 'bob.smith@example.com', 'Los Angeles', '2026-01-20'),
('Charlie Brown', 'charlie.brown@example.com', 'Chicago', '2026-02-10'),
('Diana Prince', 'diana.prince@example.com', 'New York', '2026-02-15'),
('Evan Wright', 'evan.wright@example.com', 'San Francisco', '2026-03-01'),
('Fiona Gallagher', 'fiona.g@example.com', 'Chicago', '2026-03-12'),
('George Green', 'george.green@example.com', 'Boston', '2026-04-05'),
('Hannah Abbott', 'hannah.a@example.com', 'Los Angeles', '2026-04-18'),
('Ian Malcolm', 'ian.dino@example.com', 'San Francisco', '2026-05-02'),
('Julia Roberts', 'julia.r@example.com', 'Boston', '2026-05-15');

-- Insert dummy data for products
INSERT INTO products (name, category, price) VALUES
('Quantum Laptop', 'Electronics', 1299.99),
('Velo Pro Keyboard', 'Electronics', 89.50),
('Sleek Wireless Mouse', 'Electronics', 45.00),
('Ergonomic Office Chair', 'Furniture', 249.99),
('Standing Desk', 'Furniture', 399.00),
('Ceramic Coffee Mug', 'Kitchen', 15.99),
('Insulated Water Bottle', 'Kitchen', 29.95),
('UltraBass Headphones', 'Electronics', 150.00),
('Leather Journal Planner', 'Office Supplies', 24.50),
('Gel Pen Set (12 Pack)', 'Office Supplies', 12.99);

-- Insert dummy data for orders (spread across recent months including last month, relative to current date 2026-06-10)
-- 'Last month' relative to June 2026 is May 2026.
INSERT INTO orders (customer_id, product_id, quantity, order_date) VALUES
(1, 1, 1, '2026-03-10'),
(2, 3, 2, '2026-03-12'),
(3, 4, 1, '2026-03-15'),
(1, 2, 1, '2026-04-02'),
(4, 7, 3, '2026-04-05'),
(5, 5, 1, '2026-04-10'),
(6, 6, 4, '2026-04-15'),
(2, 8, 1, '2026-04-20'),
(7, 9, 2, '2026-04-25'),
(3, 10, 5, '2026-04-28'),
-- Orders placed in May 2026 (Last Month)
(8, 2, 1, '2026-05-01'),
(9, 1, 1, '2026-05-03'),
(10, 8, 2, '2026-05-05'),
(1, 6, 2, '2026-05-10'),
(4, 3, 1, '2026-05-12'),
(5, 4, 1, '2026-05-15'),
(2, 7, 2, '2026-05-18'),
(6, 9, 1, '2026-05-20'),
(7, 10, 3, '2026-05-24'),
(3, 2, 1, '2026-05-28'),
(9, 5, 1, '2026-05-29'),
(8, 3, 1, '2026-05-30'),
-- Orders placed in June 2026 (Current Month)
(10, 1, 1, '2026-06-01'),
(1, 8, 1, '2026-06-03'),
(4, 4, 1, '2026-06-05'),
(5, 2, 2, '2026-06-08');
