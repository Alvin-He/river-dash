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
pub mod users;


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


/// Test suite
#[cfg(test)]
mod tests {
    
    /// connect() isn't tested because it makes a real connection to the database

    use super::*;

    /// New in-memory database, makes 'configs'
    /// max_connections(1) to not create a second DB
    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("failed to open in-memory sqlite");

        sqlx::query(
            "CREATE TABLE configs (
                name TEXT PRIMARY KEY,
                components TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("failed to create configs table");

        pool
    }

    async fn setup_db() -> Database {
        Database::new(setup_pool().await)
    }

    /// A database whose pool is closed, so every query fails.
    async fn broken_db() -> Database {
        let pool = setup_pool().await;
        pool.close().await;
        Database::new(pool)
    }

    fn cfg(name: &str, components: &str) -> configs::Config {
        configs::Config {
            name: name.to_string(),
            components: components.to_string(),
        }
    }

    // ---------- Database::new ----------

    #[tokio::test]
    async fn new_wraps_the_given_pool() {
        let pool = setup_pool().await;
        let db = Database::new(pool.clone());

        configs::upsert_config(&pool, &cfg("shared", "[]")).await.unwrap();
        let Json(found) = Database::get_config(State(db), Path("shared".into()))
            .await
            .unwrap();
        assert_eq!(found.name, "shared");
    }

    // ---------- get_configs ----------

    #[tokio::test]
    async fn get_configs_empty_returns_empty_list() {
        let db = setup_db().await;
        let Json(all) = Database::get_configs(State(db)).await.unwrap();
        assert!(all.is_empty());
    }

    #[tokio::test]
    async fn get_configs_returns_all_posted_configs() {
        let db = setup_db().await;
        Database::post_config(State(db.clone()), Json(cfg("a", "1"))).await.unwrap();
        Database::post_config(State(db.clone()), Json(cfg("b", "2"))).await.unwrap();

        let Json(mut all) = Database::get_configs(State(db)).await.unwrap();
        all.sort_by(|x, y| x.name.cmp(&y.name));

        assert_eq!(all.len(), 2);
        assert_eq!(all[0].name, "a");
        assert_eq!(all[1].components, "2");
    }

    #[tokio::test]
    async fn get_configs_returns_500_on_db_error() {
        let db = broken_db().await;
        let result = Database::get_configs(State(db)).await;
        assert_eq!(result.unwrap_err(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // ---------- get_config ----------

    #[tokio::test]
    async fn get_config_returns_existing_config() {
        let db = setup_db().await;
        Database::post_config(State(db.clone()), Json(cfg("main", r#"{"x":1}"#)))
            .await
            .unwrap();

        let Json(found) = Database::get_config(State(db), Path("main".to_string()))
            .await
            .unwrap();
        assert_eq!(found.name, "main");
        assert_eq!(found.components, r#"{"x":1}"#);
    }

    #[tokio::test]
    async fn get_config_returns_404_when_missing() {
        let db = setup_db().await;
        let result = Database::get_config(State(db), Path("missing".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn get_config_returns_500_on_db_error() {
        let db = broken_db().await;
        let result = Database::get_config(State(db), Path("x".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // ---------- post_config ----------

    #[tokio::test]
    async fn post_config_echoes_the_config_back() {
        let db = setup_db().await;
        let Json(returned) = Database::post_config(State(db), Json(cfg("new", "[1,2]")))
            .await
            .unwrap();
        assert_eq!(returned.name, "new");
        assert_eq!(returned.components, "[1,2]");
    }

    #[tokio::test]
    async fn post_config_persists_to_database() {
        let db = setup_db().await;
        Database::post_config(State(db.clone()), Json(cfg("saved", "data")))
            .await
            .unwrap();

        let stored = configs::get_config(&db.sql_pool, "saved").await.unwrap();
        assert_eq!(stored.expect("row should exist").components, "data");
    }

    #[tokio::test]
    async fn post_config_with_existing_name_overwrites() {
        let db = setup_db().await;
        Database::post_config(State(db.clone()), Json(cfg("dup", "old"))).await.unwrap();
        Database::post_config(State(db.clone()), Json(cfg("dup", "new"))).await.unwrap();

        let Json(all) = Database::get_configs(State(db)).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].components, "new");
    }

    #[tokio::test]
    async fn post_config_returns_500_on_db_error() {
        let db = broken_db().await;
        let result = Database::post_config(State(db), Json(cfg("x", "y"))).await;
        assert_eq!(result.unwrap_err(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // ---------- delete_config ----------

    #[tokio::test]
    async fn delete_config_returns_204_and_removes_row() {
        let db = setup_db().await;
        Database::post_config(State(db.clone()), Json(cfg("gone", "x"))).await.unwrap();

        let status = Database::delete_config(State(db.clone()), Path("gone".to_string())).await;
        assert_eq!(status, StatusCode::NO_CONTENT);

        let after = Database::get_config(State(db), Path("gone".to_string())).await;
        assert_eq!(after.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn delete_config_returns_404_when_missing() {
        let db = setup_db().await;
        let status = Database::delete_config(State(db), Path("nope".to_string())).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn delete_config_second_delete_is_404() {
        let db = setup_db().await;
        Database::post_config(State(db.clone()), Json(cfg("once", "x"))).await.unwrap();

        assert_eq!(
            Database::delete_config(State(db.clone()), Path("once".to_string())).await,
            StatusCode::NO_CONTENT
        );
        assert_eq!(
            Database::delete_config(State(db), Path("once".to_string())).await,
            StatusCode::NOT_FOUND
        );
    }

    #[tokio::test]
    async fn delete_config_returns_500_on_db_error() {
        let db = broken_db().await;
        let status = Database::delete_config(State(db), Path("x".to_string())).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    }

    // ---------- full flow ----------

    #[tokio::test]
    async fn handler_lifecycle_post_get_update_delete() {
        let db = setup_db().await;

        Database::post_config(State(db.clone()), Json(cfg("life", "v1"))).await.unwrap();
        let Json(c) = Database::get_config(State(db.clone()), Path("life".into())).await.unwrap();
        assert_eq!(c.components, "v1");

        Database::post_config(State(db.clone()), Json(cfg("life", "v2"))).await.unwrap();
        let Json(c) = Database::get_config(State(db.clone()), Path("life".into())).await.unwrap();
        assert_eq!(c.components, "v2");

        assert_eq!(
            Database::delete_config(State(db.clone()), Path("life".into())).await,
            StatusCode::NO_CONTENT
        );
        let Json(all) = Database::get_configs(State(db)).await.unwrap();
        assert!(all.is_empty());
    }
}
