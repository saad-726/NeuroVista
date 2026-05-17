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

CREATE TABLE IF NOT EXISTS scans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prediction VARCHAR(50) NOT NULL,
    confidence FLOAT NOT NULL,
    prob_non_demented FLOAT DEFAULT 0.0,
    prob_very_mild FLOAT DEFAULT 0.0,
    prob_mild_demented FLOAT DEFAULT 0.0,
    prob_moderate_demented FLOAT DEFAULT 0.0,
    scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    image_path VARCHAR(255),
    heatmap_path VARCHAR(255),
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_resets (
    email VARCHAR(100) PRIMARY KEY,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

-- Optional: Verify the tables
DESCRIBE users;
DESCRIBE scans;
DESCRIBE password_resets;

