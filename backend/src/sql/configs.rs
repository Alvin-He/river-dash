//! Connects to backend/database/data.db
//! Structure of Config matches each row in configs


use serde::{Deserialize, Serialize};

use sqlx::{
    FromRow, 
    SqlitePool,
};


/// Struct of a visual configuration of components
/// These are what we expect to recieve data from
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Config {
    pub name: String,
    pub components: String
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
    name: &str,
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