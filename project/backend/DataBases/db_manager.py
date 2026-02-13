import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return pymysql.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT")), # type: ignore
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"), # type: ignore
        database=os.getenv("DB_NAME"),
        cursorclass=pymysql.cursors.DictCursor
    ) # type: ignore

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Users
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS registered_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Profiles
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        names VARCHAR(50),
        status VARCHAR(255),
        avatar VARCHAR(255),
        FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE
    );
    """)

    # Friends
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        status ENUM('pending','accepted') DEFAULT 'pending',
        FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES registered_users(id) ON DELETE CASCADE
    )
    """)

    # Messages
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_type ENUM('dm','group') NOT NULL,
        chat_id INT NOT NULL,
        sender_id INT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES registered_users(id) ON DELETE CASCADE
    )
    """)

    conn.commit()
    cursor.close()
    conn.close()