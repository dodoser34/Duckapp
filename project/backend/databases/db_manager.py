import os
import time

import pymysql
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    last_error = None
    for attempt in range(3):
        try:
            return pymysql.connect(
                host=os.getenv("DB_HOST"),
                port=int(os.getenv("DB_PORT")),  # type: ignore[arg-type]
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"),  # type: ignore[arg-type]
                database=os.getenv("DB_NAME"),
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=8,
                read_timeout=12,
                write_timeout=12,
                charset="utf8mb4",
                init_command="SET time_zone = '+00:00'",
                autocommit=False,
            )
        except pymysql.MySQLError as error:
            last_error = error
            if attempt < 2:
                time.sleep(0.6 * (attempt + 1))
                continue
            raise

    if last_error:
        raise last_error


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS registered_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user_profiles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            names VARCHAR(50),
            status VARCHAR(255),
            avatar VARCHAR(255),
            FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS friends (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            friend_id INT NOT NULL,
            status ENUM('pending','accepted') DEFAULT 'pending',
            FOREIGN KEY (user_id) REFERENCES registered_users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES registered_users(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute("SHOW INDEX FROM friends WHERE Key_name = 'uq_friends_direction'")
    if not cursor.fetchone():
        try:
            cursor.execute(
                "ALTER TABLE friends ADD CONSTRAINT uq_friends_direction UNIQUE (user_id, friend_id)"
            )
        except pymysql.MySQLError:
            cursor.execute(
                """
                DELETE f1
                FROM friends f1
                JOIN friends f2
                    ON f1.user_id = f2.user_id
                    AND f1.friend_id = f2.friend_id
                    AND f1.id > f2.id
                """
            )
            cursor.execute(
                "ALTER TABLE friends ADD CONSTRAINT uq_friends_direction UNIQUE (user_id, friend_id)"
            )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chat_type ENUM('dm','group') NOT NULL,
            chat_id INT NOT NULL,
            sender_id INT NOT NULL,
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES registered_users(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS direct_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sender_id INT NOT NULL,
            receiver_id INT NOT NULL,
            msg_type ENUM('text','gif') NOT NULL DEFAULT 'text',
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES registered_users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES registered_users(id) ON DELETE CASCADE,
            INDEX idx_dm_pair_time (sender_id, receiver_id, created_at)
        )
        """
    )

    conn.commit()
    cursor.close()
    conn.close()
