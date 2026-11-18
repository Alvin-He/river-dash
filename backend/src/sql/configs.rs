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


/// Tests of file methods
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// New in-memory database, makes 'configs'
    /// max_connections(1) to not create a second DB
    /// gets its own separate database, so a larger pool would see empty tables.
    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("failed to open in-memory sqlite");

        sqlx::query(
            "CREATE TABLE configs (
                name TEXT PRIMARY KEY NOT NULL,
                components TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("failed to create configs table");

        pool
    }

    fn cfg(name: &str, components: &str) -> Config {
        Config {
            name: name.to_string(),
            components: components.to_string(),
        }
    }

    // ---------- get_all_configs ----------

    #[tokio::test]
    async fn get_all_on_empty_table_returns_empty_vec() {
        let pool = setup_pool().await;
        let all = get_all_configs(&pool).await.unwrap();
        assert!(all.is_empty());
    }

    #[tokio::test]
    async fn get_all_returns_every_row() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("alpha", r#"["a"]"#)).await.unwrap();
        upsert_config(&pool, &cfg("beta", r#"["b"]"#)).await.unwrap();
        upsert_config(&pool, &cfg("gamma", r#"["c"]"#)).await.unwrap();

        let mut all = get_all_configs(&pool).await.unwrap();
        all.sort_by(|a, b| a.name.cmp(&b.name)); // row order isn't guaranteed

        assert_eq!(all.len(), 3);
        assert_eq!(all[0].name, "alpha");
        assert_eq!(all[0].components, r#"["a"]"#);
        assert_eq!(all[1].name, "beta");
        assert_eq!(all[2].name, "gamma");
    }

    // ---------- get_config ----------

    #[tokio::test]
    async fn get_config_returns_none_when_missing() {
        let pool = setup_pool().await;
        let result = get_config(&pool, "does-not-exist").await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn get_config_returns_matching_row() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("main", r#"{"x":1}"#)).await.unwrap();
        upsert_config(&pool, &cfg("other", r#"{"x":2}"#)).await.unwrap();

        let found = get_config(&pool, "main").await.unwrap().expect("should exist");
        assert_eq!(found.name, "main");
        assert_eq!(found.components, r#"{"x":1}"#);
    }

    #[tokio::test]
    async fn get_config_name_match_is_exact() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("Main", "[]")).await.unwrap();

        // '=' is case-sensitive by default
        assert!(get_config(&pool, "main").await.unwrap().is_none());
        assert!(get_config(&pool, "Mai").await.unwrap().is_none());
        assert!(get_config(&pool, "Main").await.unwrap().is_some());
    }

    // ---------- upsert_config ----------

    #[tokio::test]
    async fn upsert_inserts_new_row() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("new", "[1,2,3]")).await.unwrap();

        let found = get_config(&pool, "new").await.unwrap().unwrap();
        assert_eq!(found.components, "[1,2,3]");
    }

    #[tokio::test]
    async fn upsert_updates_existing_row_without_duplicating() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("dup", "old")).await.unwrap();
        upsert_config(&pool, &cfg("dup", "new")).await.unwrap();

        let all = get_all_configs(&pool).await.unwrap();
        assert_eq!(all.len(), 1, "upsert must not create a second row");
        assert_eq!(all[0].name, "dup");
        assert_eq!(all[0].components, "new");
    }

    #[tokio::test]
    async fn upsert_only_affects_the_targeted_row() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("a", "1")).await.unwrap();
        upsert_config(&pool, &cfg("b", "2")).await.unwrap();

        upsert_config(&pool, &cfg("a", "changed")).await.unwrap();

        let a = get_config(&pool, "a").await.unwrap().unwrap();
        let b = get_config(&pool, "b").await.unwrap().unwrap();
        assert_eq!(a.components, "changed");
        assert_eq!(b.components, "2");
    }

    #[tokio::test]
    async fn upsert_handles_empty_components() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("empty", "")).await.unwrap();

        let found = get_config(&pool, "empty").await.unwrap().unwrap();
        assert_eq!(found.components, "");
    }

    #[tokio::test]
    async fn upsert_handles_unicode_and_large_payloads() {
        let pool = setup_pool().await;
        let big = "x".repeat(100_000);
        upsert_config(&pool, &cfg("ロケット 🚀", &big)).await.unwrap();

        let found = get_config(&pool, "ロケット 🚀").await.unwrap().unwrap();
        assert_eq!(found.components.len(), 100_000);
    }

    #[tokio::test]
    async fn sql_metacharacters_are_treated_as_data() {
        let pool = setup_pool().await;
        let evil = "'; DROP TABLE configs; --";
        upsert_config(&pool, &cfg(evil, "payload")).await.unwrap();

        // Check table still exists
        let found = get_config(&pool, evil).await.unwrap().unwrap();
        assert_eq!(found.name, evil);
        assert_eq!(get_all_configs(&pool).await.unwrap().len(), 1);
    }

    // ---------- delete_config ----------

    #[tokio::test]
    async fn delete_existing_returns_true_and_removes_row() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("gone", "x")).await.unwrap();

        assert!(delete_config(&pool, "gone").await.unwrap());
        assert!(get_config(&pool, "gone").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn delete_missing_returns_false() {
        let pool = setup_pool().await;
        assert!(!delete_config(&pool, "nope").await.unwrap());
    }

    #[tokio::test]
    async fn delete_twice_returns_false_the_second_time() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("once", "x")).await.unwrap();

        assert!(delete_config(&pool, "once").await.unwrap());
        assert!(!delete_config(&pool, "once").await.unwrap());
    }

    #[tokio::test]
    async fn delete_only_removes_named_row() {
        let pool = setup_pool().await;
        upsert_config(&pool, &cfg("keep", "1")).await.unwrap();
        upsert_config(&pool, &cfg("remove", "2")).await.unwrap();

        delete_config(&pool, "remove").await.unwrap();

        let all = get_all_configs(&pool).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "keep");
    }

    // ---------- full lifecycle ----------

    #[tokio::test]
    async fn full_lifecycle() {
        let pool = setup_pool().await;

        upsert_config(&pool, &cfg("life", "v1")).await.unwrap();
        assert_eq!(get_config(&pool, "life").await.unwrap().unwrap().components, "v1");

        upsert_config(&pool, &cfg("life", "v2")).await.unwrap();
        assert_eq!(get_config(&pool, "life").await.unwrap().unwrap().components, "v2");

        assert!(delete_config(&pool, "life").await.unwrap());
        assert!(get_all_configs(&pool).await.unwrap().is_empty());
    }

    // ---------- error propagation ----------

    #[tokio::test]
    async fn queries_error_when_table_is_missing() {
        // Pool with no schema: every function should surface a sqlx::Error
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        assert!(get_all_configs(&pool).await.is_err());
        assert!(get_config(&pool, "x").await.is_err());
        assert!(upsert_config(&pool, &cfg("x", "y")).await.is_err());
        assert!(delete_config(&pool, "x").await.is_err());
    }

    // ---------- serde ----------

    #[test]
    fn config_serde_roundtrip() {
        let original = cfg("rocket", r#"[{"type":"gauge"}]"#);
        let json = serde_json::to_string(&original).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();

        assert_eq!(back.name, original.name);
        assert_eq!(back.components, original.components);
    }

    #[test]
    fn config_deserializes_from_expected_json_shape() {
        let json = r#"{"name":"layout1","components":"[]"}"#;
        let c: Config = serde_json::from_str(json).unwrap();
        assert_eq!(c.name, "layout1");
        assert_eq!(c.components, "[]");
    }

    #[test]
    fn config_deserialize_fails_on_missing_field() {
        let json = r#"{"name":"layout1"}"#;
        assert!(serde_json::from_str::<Config>(json).is_err());
    }
}