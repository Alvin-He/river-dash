//! Essential operations for interaction with the data table.
//! 
//! Connects to backend/database/configurations.db
//! Structure of Config matches each row in configs.db
//! Includes a test suite

use std::str::FromStr;

use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow, SqlitePool,
};

/// Connection to the app's persistent state
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Config {
    pub name: String,
    pub components: String
}

// Initial connection to configurations.db
pub async fn connect() -> Result<SqlitePool, sqlx::Error> {
    std::fs::create_dir_all("database").ok();

    let options = SqliteConnectOptions::from_str("sqlite:database/data.db")?
        .create_if_missing(true);

    // Try to get calues from the configs table
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

      // Ensure we don't try to load a nonexistent table
      sqlx::query(
      "CREATE TABLE IF NOT EXISTS configs (
          name TEXT PRIMARY KEY,
          components TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

    Ok(pool)
}

// Get all objects of the database
pub async fn get_all_configs(pool: &SqlitePool) -> Result<Vec<Config>, sqlx::Error> {
    sqlx::query_as::<_, Config>(
        "SELECT name, components FROM configs",
    )
    .fetch_all(pool)
    .await
}

// get a single object (its name should be unique)
pub async fn get_config(
    pool: &SqlitePool,
    name: String,
) -> Result<Option<Config>, sqlx::Error> {
    sqlx::query_as::<_, Config>(
        "SELECT name, components FROM configs WHERE name = ?",
    )
    .bind(name)
    .fetch_optional(pool)
    .await
}

// Insert a new object into configs. If an object of this name already exists, update it.
pub async fn upsert_config(pool: &SqlitePool, config: &Config) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO configs (name, components) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET components = excluded.components",
    )
    .bind(&config.name)
    .bind(&config.components)
    .execute(pool)
    .await?;
    Ok(())
}

// Remove a sinlge entry in the database by name
pub async fn delete_config(pool: &SqlitePool, name: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM configs WHERE name = ?")
        .bind(name)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}


// Test suite
#[cfg(test)]
mod tests {

    #[test]
    fn test_post() {
    }
}