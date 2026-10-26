use std::str::FromStr;

use serde::{Deserialize, Serialize};
use sqlx::{
	FromRow, SqlitePool,
	sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Config {
	pub name: String,
	pub components: String,
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

// get all
pub async fn get_all_configs(pool: &SqlitePool) -> Result<Vec<Config>, sqlx::Error> {
	sqlx::query_as::<_, Config>("SELECT name, components FROM configs")
		.fetch_all(pool)
		.await
}

// get one (names should be unique)
pub async fn get_config(pool: &SqlitePool, name: String) -> Result<Option<Config>, sqlx::Error> {
	sqlx::query_as::<_, Config>("SELECT name, components FROM configs WHERE name = ?")
		.bind(name)
		.fetch_optional(pool)
		.await
}

// update (or insert if new)
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

// removal
pub async fn delete_config(pool: &SqlitePool, name: &str) -> Result<bool, sqlx::Error> {
	let result = sqlx::query("DELETE FROM configs WHERE name = ?")
		.bind(name)
		.execute(pool)
		.await?;
	Ok(result.rows_affected() > 0)
}
