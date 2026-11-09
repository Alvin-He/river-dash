#!/usr/bin/env python3
"""Initialize a LOCAL River Dash SQLite database. Does not edit Rust source.

Run with the Rust server stopped. Preserves existing rows when tables exist.
Does not create users or store credentials. No external dependencies.
"""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
path = root / "backend" / "database" / "data.db"
path.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(path) as connection:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS configs (
            name TEXT PRIMARY KEY,
            components TEXT NOT NULL
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            expires_at INTEGER NOT NULL
        )
    """)
    connection.commit()
print(f"Initialized local schema: {path}")
