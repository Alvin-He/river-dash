use std::str::FromStr;

use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow, SqlitePool,
};

#[derive(Debug, Serialize, FromRow)]
pub struct Config {
    pub name: String,
    pub components: String
}

// Initial connection, call from main
pub async fn connect() -> Result<SqlitePool, sqlx::Error> {
    std::fs::create_dir_all("database").ok();

    let options = SqliteConnectOptions::from_str("sqlite:database/configurations.db")?
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

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

pub async fn get_all_configs(pool: &SqlitePool) -> Result<Vec<Config>, sqlx::Error> {
    sqlx::query_as::<_, Config>(
        "SELECT name, components FROM configs",
    )
    .fetch_all(pool)
    .await
}

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
