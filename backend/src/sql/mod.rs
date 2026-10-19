use std::str::FromStr;

use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    FromRow, SqlitePool,
};

#[derive(Debug, Serialize, FromRow)]
pub struct Config {
    pub id: String,
    pub components: String
}

// Initial connection, call from main
pub async fn connect() -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str("sqlite:database/configurations.db")?
        .create_if_missing(true);

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
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
        "SELECT id, name, email FROM users WHERE name = ?",
    )
    .bind(name)
    .fetch_optional(pool)
    .await
}
