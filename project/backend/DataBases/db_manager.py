import pymysql
from dotenv import load_dotenv

import os

load_dotenv()

def get_connection():
    return pymysql.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        ssl={"ssl": {}},
        cursorclass=pymysql.cursors.DictCursor
    )

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS registered_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        names VARCHAR(50) UNIQUE NOT NULL,
        avatar VARCHAR(255) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES registered_users(id)
            ON DELETE CASCADE
    );
    """)
    
    conn.commit()
    cursor.close()
    conn.close()
