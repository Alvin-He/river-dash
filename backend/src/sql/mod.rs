//! Essential operations for interaction with the data table.
//! 
//! Includes a test suite

use std::str::FromStr;

use axum::{
    extract::{Path, State},
    Json,
    http::StatusCode,
};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};

pub mod configs;


 /// Connection to the app's persistent state (database)
 #[derive(Clone)]
pub struct Database {
    sql_pool : SqlitePool,    
}


// Initial connection to data.db
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



impl Database {

    // New Database object
    pub fn new(sql_pool: SqlitePool) -> Self {
        Self { sql_pool }
    }
    
    /// GET all Config objects from configs
    pub async fn get_configs(State(state): State<Database>) -> Result<Json<Vec<configs::Config>>, StatusCode> {
        return configs::get_all_configs(&state.sql_pool)
            .await
            .map(Json)
            .map_err(|e| {
                eprintln!("get_configs has failed: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            });
    }    

    /// GET a specific Config object from configs
    pub async fn get_config(
        State(state): State<Database>,
        Path(name): Path<String>,
    )-> Result<Json<configs::Config>, StatusCode> {
        match configs::get_config(&state.sql_pool, &name).await {
            Ok(Some(config)) => Ok(Json(config)),
            Ok(None) => Err(StatusCode::NOT_FOUND),
            Err(e) => {
                eprintln!("get_config has failed: {e}");
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }

    /// POST a new uniquely named configuration to configs
    pub async fn post_config(
        State(state): State<Database>,
        Json(config): Json<configs::Config>,
    ) -> Result<Json<configs::Config>, StatusCode> {
        configs::upsert_config(&state.sql_pool, &config)
            .await
            .map(|_| Json(config))
            .map_err(|e| {
                eprintln!("post_config has failed: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })
    }

    /// DELETE a configuration from configs by name
    pub async fn delete_config(
        State(state): State<Database>,
        Path(name): Path<String>,
    ) -> StatusCode {
        match configs::delete_config(&state.sql_pool, &name).await {
            Ok(true) => StatusCode::NO_CONTENT,
            Ok(false) => StatusCode::NOT_FOUND,
            Err(e) => {
                eprintln!("delete_config has failed: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

}




// Test suite
#[cfg(test)]
mod tests {

    #[test]
    fn test_post() {
    }
}