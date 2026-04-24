-- Neuro Vista Database Setup
-- Run this in your MySQL Workbench or CLI

CREATE DATABASE IF NOT EXISTS neuro_vista_db;
USE neuro_vista_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Verify the table was created
DESCRIBE users;
